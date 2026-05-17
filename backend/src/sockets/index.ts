import { Server } from "socket.io";
import { supabase } from "../config/supabase";
import { verifyAuthToken } from "../utils/authToken";

type ActiveSocketUser = {
  id: string;
};

type ChangePayload = {
  documentId: string;
  content: string;
};

type CursorPayload = {
  documentId: string;
  pos: number;
  email?: string;
};

type PresenceEntry = {
  sessionId: string;
  userId: string;
  email?: string;
  joinedAt: string;
  lastSeen: string;
};

type DocumentRow = {
  owner_id: string;
  document_collaborators?: Array<{
    user_id: string;
    role: "owner" | "editor" | "viewer";
  }>;
};

const getRoleForUser = (document: DocumentRow, userId: string) => {
  if (document.owner_id === userId) {
    return "owner";
  }

  const collaborator = document.document_collaborators?.find(
    (item: any) => item.user_id === userId
  );

  return collaborator?.role ?? null;
};

const fetchDocumentForAccess = async (documentId: string) => {
  const { data } = await supabase
    .from("documents")
    .select("*, document_collaborators(*)")
    .eq("id", documentId)
    .single();

  return (data as DocumentRow | null) ?? null;
};

const isValidCursorPayload = (payload: CursorPayload | undefined) =>
  Boolean(payload?.documentId) && typeof payload?.pos === "number";

const ensureRoomMap = (
  roomUsers: Map<string, Map<string, PresenceEntry>>,
  documentId: string,
) => {
  if (!roomUsers.has(documentId)) {
    roomUsers.set(documentId, new Map());
  }
  return roomUsers.get(documentId)!;
};

export const setupSockets = (io: Server) => {
  const roomUsers = new Map<string, Map<string, PresenceEntry>>();

  const broadcastActiveUsers = (documentId: string) => {
    const usersMap = roomUsers.get(documentId);
    const activeUsers = usersMap ? Array.from(usersMap.values()) : [];
    io.to(documentId).emit("active-users", activeUsers);
  };

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Unauthorized: Token missing"));
      }

      const verifiedUser = verifyAuthToken(token);
      socket.data.user = { id: verifiedUser.id };
      return next();
    } catch (error) {
      console.error("Socket auth error", error);
      return next(new Error("Unauthorized: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join-doc", async (documentId: string, email?: string) => {
      try {
        const activeUser = socket.data.user as ActiveSocketUser | undefined;

        if (!documentId || !activeUser?.id) {
          socket.emit("doc-error", { message: "Invalid document request" });
          return;
        }

        const doc = await fetchDocumentForAccess(documentId);

        if (!doc) {
          socket.emit("doc-error", { message: "Document access denied" });
          return;
        }

        const role = getRoleForUser(doc, activeUser.id);
        if (!role) {
          socket.emit("doc-error", { message: "Document access denied" });
          return;
        }

        socket.join(documentId);

        // Track session-scoped presence so multiple tabs/devices of same user stay visible.
        const roomMap = ensureRoomMap(roomUsers, documentId);
        socket.data.documentId = documentId;
        const now = new Date().toISOString();
        roomMap.set(socket.id, {
          sessionId: socket.id,
          userId: activeUser.id,
          email,
          joinedAt: now,
          lastSeen: now,
        });
        
        broadcastActiveUsers(documentId);

      } catch (error) {
        socket.emit("doc-error", { message: "Document join failed" });
      }
    });

    socket.on("send-changes", async (payload: ChangePayload) => {
      try {
        const activeUser = socket.data.user as ActiveSocketUser | undefined;

        if (!payload?.documentId || typeof payload.content !== "string" || !activeUser?.id) {
          return;
        }

        const doc = await fetchDocumentForAccess(payload.documentId);

        if (!doc) return;

        const role = getRoleForUser(doc, activeUser.id);

        if (role === "viewer" || !role) {
          return;
        }

        await supabase
          .from("documents")
          .update({ content: payload.content, updated_at: new Date().toISOString() })
          .eq("id", payload.documentId);

        socket.to(payload.documentId).emit("receive-changes", payload.content);
      } catch (error) {
        socket.emit("doc-error", { message: "Realtime sync failed" });
      }
    });

    socket.on("cursor-move", async (payload: CursorPayload) => {
      try {
        const activeUser = socket.data.user as ActiveSocketUser | undefined;

        if (!isValidCursorPayload(payload) || !activeUser?.id) {
          return;
        }

        const doc = await fetchDocumentForAccess(payload.documentId);

        if (!doc) return;

        const role = getRoleForUser(doc, activeUser.id);
        if (!role) {
          return;
        }

        const usersMap = roomUsers.get(payload.documentId);
        const presence = usersMap?.get(socket.id);
        if (presence) {
          presence.lastSeen = new Date().toISOString();
          usersMap?.set(socket.id, presence);
        }

        socket.to(payload.documentId).emit("cursor-move", {
          sessionId: socket.id,
          userId: activeUser.id,
          email: payload.email,
          pos: payload.pos,
        });
      } catch {
        // Ignore cursor transport errors to avoid interrupting editing.
      }
    });

    socket.on("presence-ping", (documentId: string) => {
      const usersMap = roomUsers.get(documentId);
      const presence = usersMap?.get(socket.id);
      if (!presence) {
        return;
      }

      presence.lastSeen = new Date().toISOString();
      usersMap?.set(socket.id, presence);
      broadcastActiveUsers(documentId);
    });

    socket.on("leave-doc", (documentId: string) => {
      if (documentId) {
        socket.leave(documentId);
        const usersMap = roomUsers.get(documentId);
        if (usersMap) {
          usersMap.delete(socket.id);
          if (usersMap.size === 0) {
            roomUsers.delete(documentId);
          }
          broadcastActiveUsers(documentId);
        }
      }
    });

    socket.on("disconnect", () => {
      const documentId = socket.data.documentId;
      if (documentId) {
        const usersMap = roomUsers.get(documentId);
        if (usersMap) {
          usersMap.delete(socket.id);
          if (usersMap.size === 0) {
            roomUsers.delete(documentId);
          }
          broadcastActiveUsers(documentId);
        }
      }
    });
  });
};
