import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { trackDocumentEvent } from "../utils/analytics";
import { isMissingTableError } from "../utils/dbErrors";
import { invalidateCachePrefix, publishEvent } from "../utils/redis";

// For notifications, we insert into Supabase directly instead of Mongoose
// We'll skip sending emails manually if Clerk/Supabase handles it, but let's just log them for now
// to simplify the migration without nodemailer.

type ShareInput = {
  email: string;
  role: "editor" | "viewer";
};

type ShareTarget = {
  email: string;
  role: "editor" | "viewer";
  userId?: string;
};

const normalizeRole = (role: unknown): "editor" | "viewer" =>
  role === "viewer" ? "viewer" : "editor";

const authDisabled = process.env.DISABLE_AUTH === "true";

const getRoleForUser = (document: any, userId: string) => {
  if (authDisabled) {
    return "owner" as const;
  }
  if (document.owner_id === userId) {
    return "owner" as const;
  }
  const collaborator = document.document_collaborators?.find((item: any) => item.user_id === userId);
  return collaborator?.role ?? null;
};

const shapeDocument = (document: any, userId: string) => {
  return {
    id: document.id,
    title: document.title,
    content: document.content,
    owner: {
      id: document.owner_id,
      email: document.owner_email || "", // we'll try to join or attach this
    },
    collaborators: (document.document_collaborators || []).map((item: any) => ({
      id: item.user_id,
      email: item.user_email || "",
      role: item.role,
    })),
    role: getRoleForUser(document, userId),
    folderId: document.folder_id,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
};

const enrichWithUserEmails = async (documents: any[]) => {
  if (authDisabled) {
    return documents.map((doc) => {
      doc.owner_email = doc.owner_email || "demo@local";
      if (doc.document_collaborators) {
        doc.document_collaborators = doc.document_collaborators.map((c: any) => ({
          ...c,
          user_email: c.user_email || "demo@local",
        }));
      }
      return doc;
    });
  }
  // Collect all unique user IDs
  const userIds = new Set<string>();
  documents.forEach((doc) => {
    userIds.add(doc.owner_id);
    doc.document_collaborators?.forEach((c: any) => userIds.add(c.user_id));
  });

  if (userIds.size === 0) return documents;

  try {
    const users = await clerkClient.users.getUserList({
      userId: Array.from(userIds),
    });
    
    const userMap = new Map();
    const userList: any[] = Array.isArray(users) ? users : (users as any).data || [];
    userList.forEach((u: any) => {
      const email = u.emailAddresses[0]?.emailAddress || "unknown@example.com";
      userMap.set(u.id, email);
    });

    return documents.map((doc) => {
      doc.owner_email = userMap.get(doc.owner_id);
      if (doc.document_collaborators) {
        doc.document_collaborators = doc.document_collaborators.map((c: any) => ({
          ...c,
          user_email: userMap.get(c.user_id),
        }));
      }
      return doc;
    });
  } catch (err) {
    console.error("Clerk fetch error", err);
    return documents;
  }
};

const parseShareTargets = async (input: unknown, ownerId: string) => {
  if (!Array.isArray(input) || input.length === 0) {
    return [] as ShareTarget[];
  }

  const cleanedItems: Array<{ email: string; role: "editor" | "viewer" }> = input
    .filter(Boolean)
    .map((item) => item as Partial<ShareInput>)
    .filter((item) => item.email)
    .map((item) => ({
      email: String(item.email).trim().toLowerCase(),
      role: normalizeRole(item.role),
    }))
    .filter((item) => Boolean(item.email));

  const uniqueEmails = [...new Set(cleanedItems.map((item) => item.email))];
  if (uniqueEmails.length === 0) return [] as ShareTarget[];

  const usersResponse = await clerkClient.users.getUserList({
    emailAddress: uniqueEmails,
  });

  const usersByEmail = new Map<string, any>();
  const rawUsers: any[] = Array.isArray(usersResponse) ? usersResponse : (usersResponse as any).data || [];
  rawUsers.forEach((u: any) => {
    const email = u.emailAddresses[0]?.emailAddress;
    if (email) usersByEmail.set(email.toLowerCase(), u);
  });

  const targets: ShareTarget[] = [];
  cleanedItems.forEach((item) => {
    const matchedUser = usersByEmail.get(item.email);
    if (matchedUser && matchedUser.id !== ownerId) {
      if (!targets.some((existing) => existing.userId === matchedUser.id)) {
        targets.push({
          email: matchedUser.emailAddresses[0]?.emailAddress || item.email,
          role: item.role,
          userId: matchedUser.id,
        });
      }
      return;
    }

    if (!targets.some((existing) => existing.email === item.email)) {
      targets.push({ email: item.email, role: item.role });
    }
  });

  return targets;
};

import { sendDocumentSharedEmail } from "../utils/mailer";

const createShareNotifications = async ({
  documentId,
  documentTitle,
  actorId,
  actorEmail,
  addedCollaborators,
  shareTargets,
}: {
  documentId: string;
  documentTitle: string;
  actorId: string;
  actorEmail: string;
  addedCollaborators: Array<{ user: string; role: "editor" | "viewer"; email?: string }>;
  shareTargets: ShareTarget[];
}) => {
  if (!addedCollaborators.length && !shareTargets.length) return;

  const notifications = addedCollaborators.flatMap((item) => [
    {
      recipient_id: item.user,
      sender_id: actorId,
      document_id: documentId,
      type: "document_shared",
      message: `${actorEmail} shared "${documentTitle}" with you as ${item.role}.`,
    },
    {
      recipient_id: actorId,
      sender_id: actorId,
      document_id: documentId,
      type: "document_shared",
      message: `You shared "${documentTitle}" with ${item.email ?? "a collaborator"} as ${item.role}.`,
    }
  ]);

  await supabase.from("notifications").insert(notifications);

  const documentUrl = `${process.env.CLIENT_URL}/editor/${documentId}`;
  const sentTo = new Set<string>();
  const actorEmailKey = actorEmail.toLowerCase();

  const allTargets: Array<{ email: string; role: "editor" | "viewer" }> = [
    ...shareTargets.map((target) => ({ email: target.email, role: target.role })),
  ];

  for (const target of allTargets) {
    const emailKey = target.email.toLowerCase();
    if (!target.email || sentTo.has(emailKey) || emailKey === actorEmailKey) {
      continue;
    }

    sentTo.add(emailKey);
    await sendDocumentSharedEmail({
      to: target.email,
      actorEmail,
      documentTitle,
      documentUrl,
      role: target.role,
    }).catch((err) => console.error("Failed to send share email", err));
  }
};

export const createDocument = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "Document title required hai" });

    const shareTargets = await parseShareTargets(req.body.collaborators, userId);
    const collaborators = shareTargets.filter((item) => item.userId) as Array<
      ShareTarget & { userId: string }
    >;
    const folderId = req.body.folder_id || null;

    const { data: docData, error: docError } = await supabase
      .from("documents")
      .insert({ title, content: "<p></p>", owner_id: userId, folder_id: folderId })
      .select("*")

      .single();

    if (docError || !docData) throw docError;

    if (collaborators.length > 0) {
      const collabsToInsert = collaborators.map((c) => ({
        document_id: docData.id,
        user_id: c.userId,
        role: c.role,
      }));
      await supabase.from("document_collaborators").insert(collabsToInsert);
    }

    // Load full doc
    const { data: fullDoc } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .eq("id", docData.id)
      .single();

    const [enrichedDoc] = await enrichWithUserEmails([fullDoc]);

    const actor = await clerkClient.users.getUser(userId);
    const actorEmail = actor.emailAddresses[0]?.emailAddress || "unknown@example.com";

    await createShareNotifications({
      documentId: docData.id,
      documentTitle: docData.title,
      actorId: userId,
      actorEmail: actorEmail,
      addedCollaborators: collaborators.map((item) => ({
        user: item.userId,
        role: item.role,
        email: item.email,
      })),
      shareTargets,
    });

    await trackDocumentEvent({
      documentId: docData.id,
      actorId: userId,
      eventType: "document_created",
      metadata: { collaborators: collaborators.length },
    });

    await publishEvent("docs:mutations", {
      action: "create",
      documentId: docData.id,
      actorId: userId,
    });
    await invalidateCachePrefix("search:");
    await invalidateCachePrefix("popular-tags:");

    return res.status(201).json({ document: shapeDocument(enrichedDoc, userId) });
  } catch (error) {
    console.error("Create document failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using documents.",
      });
    }
    return res.status(500).json({ message: "Document create nahi ho paaya", details: String(error) });
  }
};

export const getDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    // Fetch docs where user is owner OR user is a collaborator
    const { data: ownedDocs } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false });

    const { data: collabRecords } = await supabase
      .from("document_collaborators")
      .select("document_id")
      .eq("user_id", userId);

    const collabDocIds = collabRecords?.map(r => r.document_id) || [];
    
    let collabDocs: any[] = [];
    if (collabDocIds.length > 0) {
      const { data } = await supabase
        .from("documents")
        .select("*, document_collaborators(*)")
        .in("id", collabDocIds)
        .order("updated_at", { ascending: false });
      if (data) collabDocs = data;
    }

    // Merge and deduplicate
    const allDocsMap = new Map();
    ownedDocs?.forEach(d => allDocsMap.set(d.id, d));
    collabDocs?.forEach(d => allDocsMap.set(d.id, d));
    
    const combinedDocs = Array.from(allDocsMap.values()).sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    const enrichedDocs = await enrichWithUserEmails(combinedDocs);

    return res.json({
      documents: enrichedDocs.map((document) => shapeDocument(document, userId)),
    });
  } catch (error) {
    console.error("Fetch documents failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using documents.",
      });
    }
    return res.status(500).json({ message: "Documents load nahi ho paaye" });
  }
};

export const getDocumentById = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const documentId = req.params.id;
    
    const { data: doc } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .eq("id", documentId)
      .single();

    if (!doc) return res.status(404).json({ message: "Document nahi mila" });

    const role = getRoleForUser(doc, userId);
    if (!role) return res.status(403).json({ message: "Forbidden" });

    const [enrichedDoc] = await enrichWithUserEmails([doc]);

    await trackDocumentEvent({
      documentId,
      actorId: userId,
      eventType: "document_viewed",
    });

    return res.json({
      document: shapeDocument(enrichedDoc, userId),
    });
  } catch (error) {
    console.error("Fetch document failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using documents.",
      });
    }
    return res.status(500).json({ message: "Document open nahi ho paaya" });
  }
};

export const updateDocument = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const documentId = req.params.id;
    
    const { data: doc } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .eq("id", documentId)
      .single();

    if (!doc) return res.status(404).json({ message: "Document nahi mila" });

    const currentRole = getRoleForUser(doc, userId);
    if (!currentRole) return res.status(403).json({ message: "Forbidden" });

    const wantsContentUpdate = typeof req.body.content === "string";
    const wantsTitleUpdate = typeof req.body.title === "string";
    const wantsFolderUpdate = req.body.folder_id !== undefined;
    const wantsShareUpdate = Array.isArray(req.body.collaborators);

    if ((wantsContentUpdate || wantsTitleUpdate) && currentRole === "viewer") {
      return res.status(403).json({ message: "Viewer document edit nahi kar sakta" });
    }
    if (wantsShareUpdate && currentRole !== "owner") {
      return res.status(403).json({ message: "Sirf owner sharing update kar sakta hai" });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (wantsTitleUpdate) {
      if (!req.body.title.trim()) return res.status(400).json({ message: "Document title blank nahi ho sakta" });
      updates.title = req.body.title.trim();
    }
    if (wantsContentUpdate) {
      updates.content = req.body.content;
    }
    if (wantsFolderUpdate) {
      updates.folder_id = req.body.folder_id || null;
    }

    let nextCollaborators = doc.document_collaborators || [];

    if (wantsShareUpdate) {
      const parsedShareTargets = await parseShareTargets(req.body.collaborators, userId);
      const parsedCollaborators = parsedShareTargets.filter((item) => item.userId) as Array<
        ShareTarget & { userId: string }
      >;
      
      // Delete old ones and insert new ones
      await supabase.from("document_collaborators").delete().eq("document_id", documentId);
      if (parsedCollaborators.length > 0) {
        const collabsToInsert = parsedCollaborators.map((c) => ({
          document_id: documentId,
          user_id: c.userId,
          role: c.role,
        }));
        await supabase.from("document_collaborators").insert(collabsToInsert);
      }

      nextCollaborators = parsedCollaborators.map((c) => ({ user_id: c.userId, role: c.role }));

      const existingCollabIds = new Set(doc.document_collaborators?.map((c: any) => c.user_id));
      const addedCollaborators = parsedCollaborators.filter((c) => !existingCollabIds.has(c.userId));

      const actor = await clerkClient.users.getUser(userId);
      const actorEmail = actor.emailAddresses[0]?.emailAddress || "unknown@example.com";

      await createShareNotifications({
        documentId,
        documentTitle: updates.title || doc.title,
        actorId: userId,
        actorEmail: actorEmail,
        addedCollaborators: addedCollaborators.map((item) => ({
          user: item.userId,
          role: item.role,
          email: item.email,
        })),
        shareTargets: parsedShareTargets,
      });

      await trackDocumentEvent({
        documentId,
        actorId: userId,
        eventType: "document_shared",
        metadata: { addedCollaborators: addedCollaborators.length },
      });
    }

    if (Object.keys(updates).length > 1) { // >1 because updated_at is always there
      await supabase.from("documents").update(updates).eq("id", documentId);

      await trackDocumentEvent({
        documentId,
        actorId: userId,
        eventType: "document_updated",
        metadata: {
          fields: {
            title: wantsTitleUpdate,
            content: wantsContentUpdate,
            folder: wantsFolderUpdate,
            collaborators: wantsShareUpdate,
          },
        },
      });

      await publishEvent("docs:mutations", {
        action: "update",
        documentId,
        actorId: userId,
        fields: {
          title: wantsTitleUpdate,
          content: wantsContentUpdate,
          folder: wantsFolderUpdate,
          collaborators: wantsShareUpdate,
        },
      });
      await invalidateCachePrefix("search:");
      await invalidateCachePrefix("popular-tags:");
    }

    doc.title = updates.title || doc.title;
    if (wantsContentUpdate) {
      doc.content = updates.content;
    }
    if (wantsFolderUpdate) doc.folder_id = updates.folder_id;
    doc.updated_at = updates.updated_at;
    doc.document_collaborators = nextCollaborators;

    const [enrichedDoc] = await enrichWithUserEmails([doc]);

    return res.json({
      document: shapeDocument(enrichedDoc, userId),
    });
  } catch (error) {
    console.error("Update document failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using documents.",
      });
    }
    return res.status(500).json({ message: "Document update nahi ho paaya" });
  }
};

export const deleteDocument = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const documentId = req.params.id;

    const { data: doc } = await supabase
      .from("documents")
      .select("owner_id")
      .eq("id", documentId)
      .single();

    if (!doc) return res.status(404).json({ message: "Document nahi mila" });
    if (doc.owner_id !== userId) return res.status(403).json({ message: "Sirf owner delete kar sakta hai" });

    const { error } = await supabase.from("documents").delete().eq("id", documentId);
    if (error) throw error;

    await publishEvent("docs:mutations", {
      action: "delete",
      documentId,
      actorId: userId,
    });
    await invalidateCachePrefix("search:");
    await invalidateCachePrefix("popular-tags:");

    return res.json({ message: "Document deleted" });
  } catch (error) {
    console.error("Delete document failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using documents.",
      });
    }
    return res.status(500).json({ message: "Document delete nahi ho paaya" });
  }
};
