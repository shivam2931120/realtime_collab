import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { trackDocumentEvent } from "../utils/analytics";
import { isMissingTableError } from "../utils/dbErrors";
import { invalidateCachePrefix, publishEvent } from "../utils/redis";
import { emailFromUserId, isValidEmail, normalizeEmail, userIdFromEmail } from "../utils/userIdentity";
import { maybeCreateAutomaticVersion } from "../utils/documentVersions";
import { sendDocumentSharedEmail, sendMail } from "../utils/mailer";

// For notifications, we insert into Supabase directly instead of Mongoose.

type ShareInput = {
  email: string;
  role: CollaboratorRole;
};

type ShareTarget = {
  email: string;
  role: CollaboratorRole;
  userId?: string;
};

type ShareAccessUpdate = {
  user: string;
  role: CollaboratorRole;
  email: string;
  previousRole?: CollaboratorRole | null;
  reason: "granted" | "role_changed" | "reminder";
};

type CollaboratorRole = "editor" | "commenter" | "viewer";
type DocumentRole = "owner" | CollaboratorRole;
type InviteStatus = "pending" | "accepted" | "cancelled";
type BulkAction = "move" | "tag" | "delete" | "share";

const normalizeRole = (role: unknown): CollaboratorRole => {
  if (role === "viewer") return "viewer";
  if (role === "commenter") return "commenter";
  return "editor";
};

const canEditDocument = (role: DocumentRole | null) => role === "owner" || role === "editor";

const normalizeInviteStatus = (status: unknown): InviteStatus => {
  if (status === "accepted") return "accepted";
  if (status === "cancelled") return "cancelled";
  return "pending";
};

const getRoleForUser = (document: any, userId: string) => {
  if (document.owner_id === userId) {
    return "owner" as const;
  }
  const collaborator = document.document_collaborators?.find(
    (item: any) => item.user_id === userId && normalizeInviteStatus(item.invitation_status) !== "cancelled",
  );
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
      invitationStatus: normalizeInviteStatus(item.invitation_status),
      lastInviteSentAt: item.last_invite_sent_at || null,
      inviteEmailStatus: item.invite_email_status || null,
    })),
    role: getRoleForUser(document, userId),
    folderId: document.folder_id,
    tags: document.tags || [],
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    deletedAt: document.deleted_at || null,
  };
};

const attachTagsToDocuments = async (documents: any[]) => {
  const documentIds = documents.map((doc) => doc.id).filter(Boolean);
  if (!documentIds.length) return documents;

  try {
    const { data, error } = await supabase
      .from("document_tags")
      .select("document_id, tag")
      .in("document_id", documentIds);

    if (error) throw error;

    const tagsByDocument = new Map<string, string[]>();
    (data || []).forEach((row: any) => {
      const existing = tagsByDocument.get(row.document_id) || [];
      existing.push(String(row.tag));
      tagsByDocument.set(row.document_id, existing);
    });

    return documents.map((doc) => ({
      ...doc,
      tags: tagsByDocument.get(doc.id) || [],
    }));
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error("Attach document tags failed", error);
    }
    return documents.map((doc) => ({ ...doc, tags: [] }));
  }
};

const enrichWithUserEmails = async (documents: any[]) => {
  return documents.map((doc) => {
    doc.owner_email = emailFromUserId(doc.owner_id);
    if (doc.document_collaborators) {
      doc.document_collaborators = doc.document_collaborators.map((c: any) => ({
        ...c,
        user_email: emailFromUserId(c.user_id),
      }));
    }
    return doc;
  });
};

const parseShareTargets = async (input: unknown, ownerId: string) => {
  if (!Array.isArray(input) || input.length === 0) {
    return [] as ShareTarget[];
  }

  const cleanedItems: Array<{ email: string; role: CollaboratorRole }> = input
    .filter(Boolean)
    .map((item) => item as Partial<ShareInput>)
    .filter((item) => item.email)
    .map((item) => ({
      email: normalizeEmail(item.email),
      role: normalizeRole(item.role),
    }))
    .filter((item) => isValidEmail(item.email));

  return [...new Map(cleanedItems.map((item) => [item.email, item])).values()]
    .map((item) => {
      const userId = userIdFromEmail(item.email);
      if (userId === ownerId) {
        return null;
      }
      return {
        email: item.email,
        role: item.role,
        userId,
      } as ShareTarget;
    })
    .filter(Boolean) as ShareTarget[];
};

const parseNotifyEmails = (input: unknown, ownerId: string) => {
  if (!Array.isArray(input)) return new Set<string>();

  return new Set(
    input
      .map((value) => normalizeEmail(value))
      .filter((email) => isValidEmail(email) && userIdFromEmail(email) !== ownerId),
  );
};

const parseDocumentIds = (input: unknown) =>
  Array.isArray(input)
    ? [...new Set(input.map((value) => String(value || "").trim()).filter(Boolean))]
    : [];

const normalizeTags = (raw: unknown) => {
  if (!Array.isArray(raw)) return [] as string[];

  return [
    ...new Set(
      raw
        .map((tag) => String(tag || "").trim().toLowerCase())
        .filter((tag) => Boolean(tag) && tag.length <= 40)
        .map((tag) => tag.replace(/\s+/g, "-")),
    ),
  ];
};

const syncDocumentTags = async (documentId: string, tags: string[]) => {
  await supabase.from("document_tags").delete().eq("document_id", documentId);
  if (!tags.length) return;

  const { error } = await supabase
    .from("document_tags")
    .insert(tags.map((tag) => ({ document_id: documentId, tag })));
  if (error) throw error;
};

const getClientUrl = () => String(process.env.CLIENT_URL || "").trim().replace(/\/+$/, "") || "http://localhost:5173";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
};

const describeMailResult = (result: Awaited<ReturnType<typeof sendMail>>) => {
  if (result.skipped) return "skipped";
  const accepted = result.accepted.length ? result.accepted.map(maskEmail).join(",") : "none";
  const rejected = result.rejected.length ? result.rejected.map(maskEmail).join(",") : "none";
  return `messageId=${result.messageId || "unknown"} accepted=${accepted} rejected=${rejected}`;
};

const getMailStatus = (result: Awaited<ReturnType<typeof sendMail>>) => {
  if (result.skipped) return "skipped";
  if (result.rejected.length && !result.accepted.length) return "failed";
  return "sent";
};

const updateInviteMailStatus = async (documentId: string, userId: string, status: string) => {
  const { error } = await supabase
    .from("document_collaborators")
    .update({
      last_invite_sent_at: new Date().toISOString(),
      invite_email_status: status,
      invitation_status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("document_id", documentId)
    .eq("user_id", userId);

  if (error && !isMissingTableError(error)) {
    console.error("Invite status update failed", error);
  }
};

const runInBackground = (label: string, task: () => Promise<void>) => {
  setImmediate(() => {
    void task().catch((error) => console.error(label, error));
  });
};

const deleteRowsForDocument = async (table: string, documentId: string) => {
  const { error } = await supabase.from(table).delete().eq("document_id", documentId);

  if (error) {
    if (isMissingTableError(error)) {
      return;
    }
    throw error;
  }
};

const deleteDocumentDependencies = async (documentId: string) => {
  const dependentTables = [
    "document_collaborators",
    "comments",
    "notifications",
    "document_versions",
    "document_tags",
    "document_events",
  ];

  for (const table of dependentTables) {
    await deleteRowsForDocument(table, documentId);
  }
};

const queueShareEmails = ({
  documentId,
  documentTitle,
  actorEmail,
  accessUpdates,
}: {
  documentId: string;
  documentTitle: string;
  actorEmail: string;
  accessUpdates: ShareAccessUpdate[];
}) => {
  if (!accessUpdates.length) return;

  const documentUrl = `${getClientUrl()}/editor/${documentId}`;
  const actorEmailKey = actorEmail.toLowerCase();
  const sentTo = new Set<string>();
  const targets = accessUpdates.filter((target) => {
    const emailKey = target.email.toLowerCase();
    if (!target.email || sentTo.has(emailKey) || emailKey === actorEmailKey) {
      return false;
    }
    sentTo.add(emailKey);
    return true;
  });

  if (!targets.length) return;

  runInBackground("Share email delivery failed", async () => {
    const deliveryTasks = targets.map((target) =>
      sendDocumentSharedEmail({
        to: target.email,
        actorEmail,
        documentTitle,
        documentUrl,
        role: target.role,
      })
        .then((result) => {
          void updateInviteMailStatus(documentId, target.user, getMailStatus(result));
          console.info(`Share email to ${maskEmail(target.email)} ${describeMailResult(result)}`);
        })
        .catch((error) => {
          void updateInviteMailStatus(documentId, target.user, "failed");
          console.error(`Failed to send share email to ${maskEmail(target.email)}`, error);
        }),
    );

    if (isValidEmail(actorEmail)) {
      const sharedListText = targets.map((target) => `- ${target.email} (${target.role})`).join("\n");
      const sharedListHtml = targets
        .map((target) => `<li>${escapeHtml(maskEmail(target.email))} (${target.role})</li>`)
        .join("");
      deliveryTasks.push(
        sendMail({
          to: actorEmail,
          subject: `Share confirmed: ${documentTitle}`,
          text: `Your share update for "${documentTitle}" was submitted.\n\nAccess granted or updated:\n${sharedListText}\n\nOpen: ${documentUrl}`,
          html: `<p>Your share update for <strong>${escapeHtml(documentTitle)}</strong> was submitted.</p><p>Access granted or updated:</p><ul>${sharedListHtml}</ul><p><a href="${escapeHtml(documentUrl)}">Open document</a></p>`,
        })
          .then((result) => {
            console.info(`Share confirmation to ${maskEmail(actorEmail)} ${describeMailResult(result)}`);
          })
          .catch((error) => console.error(`Failed to send share confirmation to ${maskEmail(actorEmail)}`, error)),
      );
    }

    await Promise.all(deliveryTasks);
  });
};

const createShareNotifications = async ({
  documentId,
  documentTitle,
  actorId,
  actorEmail,
  accessUpdates,
}: {
  documentId: string;
  documentTitle: string;
  actorId: string;
  actorEmail: string;
  accessUpdates: ShareAccessUpdate[];
}) => {
  if (!accessUpdates.length) return;

  const notifications = accessUpdates.flatMap((item) => {
    const recipientMessage = item.reason === "reminder"
      ? `${actorEmail} sent you an access reminder for "${documentTitle}" as ${item.role}.`
      : item.previousRole
      ? `${actorEmail} updated your access to "${documentTitle}" as ${item.role}.`
      : `${actorEmail} shared "${documentTitle}" with you as ${item.role}.`;
    const actorMessage = item.reason === "reminder"
      ? `You resent access to "${documentTitle}" for ${item.email} as ${item.role}.`
      : item.previousRole
      ? `You updated ${item.email}'s access to "${documentTitle}" from ${item.previousRole} to ${item.role}.`
      : `You shared "${documentTitle}" with ${item.email} as ${item.role}.`;

    return [
      {
        recipient_id: item.user,
        sender_id: actorId,
        document_id: documentId,
        type: "document_shared",
        message: recipientMessage,
      },
      {
        recipient_id: actorId,
        sender_id: actorId,
        document_id: documentId,
        type: "document_shared",
        message: actorMessage,
      },
    ];
  });

  const { error } = await supabase.from("notifications").insert(notifications);
  if (error) {
    console.error("Share notification insert failed", error);
  }

  queueShareEmails({
    documentId,
    documentTitle,
    actorEmail,
    accessUpdates,
  });
};

const queueShareNotifications = (payload: Parameters<typeof createShareNotifications>[0]) => {
  runInBackground("Share notification/email task failed", () => createShareNotifications(payload));
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
        invitation_status: "pending",
        last_invite_sent_at: new Date().toISOString(),
        invite_email_status: "queued",
      }));
      const { error: collaboratorInsertError } = await supabase.from("document_collaborators").insert(collabsToInsert);
      if (collaboratorInsertError) throw collaboratorInsertError;
    }

    // Load full doc
    const { data: fullDoc, error: fullDocError } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .eq("id", docData.id)
      .single();

    if (fullDocError || !fullDoc) throw fullDocError || new Error("Created document reload failed");

    const [enrichedDoc] = await attachTagsToDocuments(await enrichWithUserEmails([fullDoc]));

    const actorEmail = auth.email;

    queueShareNotifications({
      documentId: docData.id,
      documentTitle: docData.title,
      actorId: userId,
      actorEmail: actorEmail,
      accessUpdates: collaborators.map((item) => ({
        user: item.userId,
        role: item.role,
        email: item.email,
        previousRole: null,
        reason: "granted",
      })),
    });

    runInBackground("Document create side effects failed", async () => {
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
    });

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
    ownedDocs?.filter((d) => !d.deleted_at).forEach(d => allDocsMap.set(d.id, d));
    collabDocs?.filter((d) => !d.deleted_at).forEach(d => allDocsMap.set(d.id, d));
    
    const combinedDocs = Array.from(allDocsMap.values()).sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    const enrichedDocs = await attachTagsToDocuments(await enrichWithUserEmails(combinedDocs));

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

export const getTrashDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const { data: docs, error } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .eq("owner_id", auth.userId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) throw error;

    const enrichedDocs = await attachTagsToDocuments(await enrichWithUserEmails(docs || []));

    return res.json({
      documents: enrichedDocs.map((document) => shapeDocument(document, auth.userId)),
    });
  } catch (error) {
    console.error("Fetch trash failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using trash.",
      });
    }
    return res.status(500).json({ message: "Trash load nahi hua" });
  }
};

export const getAccessOverview = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const { data: ownedDocs } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false });

    const { data: collabRecords } = await supabase
      .from("document_collaborators")
      .select("document_id")
      .eq("user_id", userId);

    const collabDocIds = collabRecords?.map((record) => record.document_id) || [];
    let collabDocs: any[] = [];
    if (collabDocIds.length > 0) {
      const { data } = await supabase
        .from("documents")
        .select("*, document_collaborators(*)")
        .in("id", collabDocIds)
        .order("updated_at", { ascending: false });
      if (data) collabDocs = data;
    }

    const allDocsMap = new Map<string, any>();
    ownedDocs?.filter((doc) => !doc.deleted_at).forEach((doc) => allDocsMap.set(doc.id, doc));
    collabDocs?.filter((doc) => !doc.deleted_at).forEach((doc) => allDocsMap.set(doc.id, doc));

    const docs = await attachTagsToDocuments(await enrichWithUserEmails(Array.from(allDocsMap.values())));
    const permissions = docs.flatMap((doc: any) => {
      const ownerPermission = {
        documentId: doc.id,
        title: doc.title,
        userId: doc.owner_id,
        email: doc.owner_email || emailFromUserId(doc.owner_id),
        role: "owner" as const,
        canEdit: true,
        canShare: true,
        grantedAt: doc.created_at,
      };

      const collaboratorPermissions = (doc.document_collaborators || []).map((collaborator: any) => ({
        documentId: doc.id,
        title: doc.title,
        userId: collaborator.user_id,
        email: collaborator.user_email || emailFromUserId(collaborator.user_id),
        role: normalizeRole(collaborator.role),
        canEdit: normalizeRole(collaborator.role) === "editor",
        canShare: false,
        grantedAt: collaborator.created_at || doc.created_at,
        invitationStatus: normalizeInviteStatus(collaborator.invitation_status),
        lastInviteSentAt: collaborator.last_invite_sent_at || null,
        inviteEmailStatus: collaborator.invite_email_status || null,
      }));

      return [ownerPermission, ...collaboratorPermissions];
    });

    const usersById = new Map<string, {
      id: string;
      email: string;
      ownedDocuments: number;
      sharedDocuments: number;
      roles: Set<string>;
    }>();

    permissions.forEach((permission) => {
      const existing = usersById.get(permission.userId) || {
        id: permission.userId,
        email: permission.email,
        ownedDocuments: 0,
        sharedDocuments: 0,
        roles: new Set<string>(),
      };

      if (permission.role === "owner") {
        existing.ownedDocuments += 1;
      } else {
        existing.sharedDocuments += 1;
      }
      existing.roles.add(permission.role);
      usersById.set(permission.userId, existing);
    });

    const users = Array.from(usersById.values()).map((user) => ({
      ...user,
      roles: Array.from(user.roles),
    }));

    return res.json({
      summary: {
        documents: docs.length,
        users: users.length,
        permissions: permissions.length,
        owners: permissions.filter((permission) => permission.role === "owner").length,
        editors: permissions.filter((permission) => permission.role === "editor").length,
        viewers: permissions.filter((permission) => permission.role === "viewer").length,
        commenters: permissions.filter((permission) => permission.role === "commenter").length,
      },
      documents: docs.map((document: any) => shapeDocument(document, userId)),
      users,
      permissions,
    });
  } catch (error) {
    console.error("Access overview failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using access overview.",
      });
    }
    return res.status(500).json({ message: "Access overview load nahi hua" });
  }
};

export const getWorkspaceActivityOverview = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const docsResponse = await new Promise<any[]>((resolve, reject) => {
      void (async () => {
        try {
          const { data: ownedDocs, error: ownedError } = await supabase
            .from("documents")
            .select("*, document_collaborators(*)")
            .eq("owner_id", userId)
            .is("deleted_at", null)
            .order("updated_at", { ascending: false });
          if (ownedError) throw ownedError;

          const { data: collabRecords, error: collabError } = await supabase
            .from("document_collaborators")
            .select("document_id")
            .eq("user_id", userId)
            .neq("invitation_status", "cancelled");
          if (collabError) throw collabError;

          const collabDocIds = [...new Set((collabRecords || []).map((record: any) => record.document_id))];
          let collabDocs: any[] = [];
          if (collabDocIds.length > 0) {
            const { data, error } = await supabase
              .from("documents")
              .select("*, document_collaborators(*)")
              .in("id", collabDocIds)
              .is("deleted_at", null)
              .order("updated_at", { ascending: false });
            if (error) throw error;
            collabDocs = data || [];
          }

          const map = new Map<string, any>();
          (ownedDocs || []).forEach((doc: any) => map.set(doc.id, doc));
          collabDocs.forEach((doc) => map.set(doc.id, doc));
          resolve(Array.from(map.values()));
        } catch (error) {
          reject(error);
        }
      })();
    });

    const docs = await attachTagsToDocuments(await enrichWithUserEmails(docsResponse));
    const documentIds = docs.map((doc: any) => doc.id);
    const docsById = new Map(docs.map((doc: any) => [doc.id, doc]));
    const ownedDocumentIds = docs.filter((doc: any) => doc.owner_id === userId).map((doc: any) => doc.id);

    let openComments: any[] = [];
    if (documentIds.length) {
      const { data, error } = await supabase
        .from("comments")
        .select("id, document_id, user_id, content, created_at")
        .in("document_id", documentIds)
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      openComments = data || [];
    }

    let sharedEvents: any[] = [];
    if (documentIds.length) {
      const { data, error } = await supabase
        .from("document_events")
        .select("*")
        .in("document_id", documentIds)
        .eq("event_type", "document_shared")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      sharedEvents = data || [];
    }

    let pendingInvites: any[] = [];
    if (ownedDocumentIds.length) {
      const { data, error } = await supabase
        .from("document_collaborators")
        .select("document_id, user_id, role, invitation_status, last_invite_sent_at, invite_email_status, created_at")
        .in("document_id", ownedDocumentIds)
        .eq("invitation_status", "pending")
        .order("last_invite_sent_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      pendingInvites = data || [];
    }

    return res.json({
      recentlyEdited: docs.slice(0, 8).map((doc: any) => shapeDocument(doc, userId)),
      recentlyShared: sharedEvents.map((event) => {
        const doc = docsById.get(event.document_id) as any;
        return {
          id: event.id,
          documentId: event.document_id,
          title: doc?.title || "Untitled document",
          actor: { id: event.actor_id, email: emailFromUserId(event.actor_id) },
          createdAt: event.created_at,
        };
      }),
      openComments: openComments.map((comment) => {
        const doc = docsById.get(comment.document_id) as any;
        return {
          id: comment.id,
          documentId: comment.document_id,
          title: doc?.title || "Untitled document",
          body: comment.content,
          author: { id: comment.user_id, email: emailFromUserId(comment.user_id) },
          createdAt: comment.created_at,
        };
      }),
      pendingInvites: pendingInvites.map((invite) => {
        const doc = docsById.get(invite.document_id) as any;
        return {
          documentId: invite.document_id,
          title: doc?.title || "Untitled document",
          userId: invite.user_id,
          email: emailFromUserId(invite.user_id),
          role: normalizeRole(invite.role),
          invitationStatus: normalizeInviteStatus(invite.invitation_status),
          lastInviteSentAt: invite.last_invite_sent_at || null,
          inviteEmailStatus: invite.invite_email_status || null,
          createdAt: invite.created_at,
        };
      }),
    });
  } catch (error) {
    console.error("Workspace activity overview failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using activity overview.",
      });
    }
    return res.status(500).json({ message: "Activity overview load nahi hua" });
  }
};

export const getInviteManagement = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id, title, deleted_at")
      .eq("owner_id", auth.userId)
      .is("deleted_at", null);
    if (docsError) throw docsError;

    const ownedIds = (docs || []).map((doc: any) => doc.id);
    if (!ownedIds.length) {
      return res.json({ invites: [] });
    }

    const docsById = new Map((docs || []).map((doc: any) => [doc.id, doc]));
    const { data: rows, error } = await supabase
      .from("document_collaborators")
      .select("document_id, user_id, role, invitation_status, last_invite_sent_at, invite_email_status, created_at, updated_at")
      .in("document_id", ownedIds)
      .neq("invitation_status", "cancelled")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    return res.json({
      invites: (rows || []).map((row: any) => {
        const doc = docsById.get(row.document_id) as any;
        return {
          documentId: row.document_id,
          title: doc?.title || "Untitled document",
          userId: row.user_id,
          email: emailFromUserId(row.user_id),
          role: normalizeRole(row.role),
          invitationStatus: normalizeInviteStatus(row.invitation_status),
          lastInviteSentAt: row.last_invite_sent_at || null,
          inviteEmailStatus: row.invite_email_status || null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
    });
  } catch (error) {
    console.error("Invite management failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using invites.",
      });
    }
    return res.status(500).json({ message: "Invites load nahi hue" });
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

    if (!doc || doc.deleted_at) return res.status(404).json({ message: "Document nahi mila" });

    const role = getRoleForUser(doc, userId);
    if (!role) return res.status(403).json({ message: "Forbidden" });

    if (role !== "owner") {
      void supabase
        .from("document_collaborators")
        .update({ invitation_status: "accepted", updated_at: new Date().toISOString() })
        .eq("document_id", documentId)
        .eq("user_id", userId)
        .eq("invitation_status", "pending");
    }

    const [enrichedDoc] = await attachTagsToDocuments(await enrichWithUserEmails([doc]));

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

export const bulkUpdateDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;
    const documentIds = parseDocumentIds(req.body.documentIds);
    const action = String(req.body.action || "") as BulkAction;

    if (!documentIds.length) return res.status(400).json({ message: "Select at least one document" });
    if (!["move", "tag", "delete", "share"].includes(action)) {
      return res.status(400).json({ message: "Unsupported bulk action" });
    }

    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .in("id", documentIds)
      .is("deleted_at", null);
    if (docsError) throw docsError;

    const targetDocs = (docs || []).filter((doc: any) => documentIds.includes(doc.id));
    if (!targetDocs.length) return res.status(404).json({ message: "Documents not found" });

    const permittedDocs = targetDocs.filter((doc: any) => {
      const role = getRoleForUser(doc, userId);
      if (action === "delete" || action === "share") return role === "owner";
      return canEditDocument(role);
    });

    if (!permittedDocs.length) {
      return res.status(403).json({ message: "No selected documents allow this action" });
    }

    const now = new Date().toISOString();

    if (action === "move") {
      const folderId = req.body.folderId || null;
      if (folderId) {
        const { data: folder } = await supabase
          .from("folders")
          .select("id, owner_id")
          .eq("id", folderId)
          .single();
        if (!folder || folder.owner_id !== userId) {
          return res.status(400).json({ message: "Target folder not found" });
        }
      }

      const { error } = await supabase
        .from("documents")
        .update({ folder_id: folderId, updated_at: now })
        .in("id", permittedDocs.map((doc: any) => doc.id));
      if (error) throw error;
    }

    if (action === "tag") {
      const tags = normalizeTags(req.body.tags);
      await Promise.all(permittedDocs.map((doc: any) => syncDocumentTags(doc.id, tags)));
      const { error } = await supabase
        .from("documents")
        .update({ updated_at: now })
        .in("id", permittedDocs.map((doc: any) => doc.id));
      if (error) throw error;
    }

    if (action === "delete") {
      const { error } = await supabase
        .from("documents")
        .update({ deleted_at: now, updated_at: now })
        .in("id", permittedDocs.map((doc: any) => doc.id))
        .eq("owner_id", userId);
      if (error) throw error;
    }

    if (action === "share") {
      for (const doc of permittedDocs) {
        const parsedShareTargets = await parseShareTargets(req.body.collaborators, userId);
        const parsedCollaborators = parsedShareTargets.filter((item) => item.userId) as Array<
          ShareTarget & { userId: string }
        >;
        if (!parsedCollaborators.length) continue;

        const existingRoleById = new Map<string, CollaboratorRole>(
          (doc.document_collaborators || []).map((c: any) => [c.user_id, normalizeRole(c.role)]),
        );
        const collabsToUpsert = parsedCollaborators.map((c) => ({
          document_id: doc.id,
          user_id: c.userId,
          role: c.role,
          invitation_status: "pending",
          last_invite_sent_at: now,
          invite_email_status: "queued",
          updated_at: now,
        }));

        const { error } = await supabase
          .from("document_collaborators")
          .upsert(collabsToUpsert, { onConflict: "document_id,user_id" });
        if (error) throw error;

        queueShareNotifications({
          documentId: doc.id,
          documentTitle: doc.title,
          actorId: userId,
          actorEmail: auth.email,
          accessUpdates: parsedCollaborators.map((collaborator) => ({
            user: collaborator.userId,
            role: collaborator.role,
            email: collaborator.email,
            previousRole: existingRoleById.get(collaborator.userId) ?? null,
            reason: existingRoleById.has(collaborator.userId) ? "reminder" : "granted",
          })),
        });
      }
    }

    await Promise.all(
      permittedDocs.map((doc: any) =>
        trackDocumentEvent({
          documentId: doc.id,
          actorId: userId,
          eventType: "document_bulk_action",
          metadata: { action },
        }),
      ),
    );
    await publishEvent("docs:mutations", {
      action: `bulk_${action}`,
      documentIds: permittedDocs.map((doc: any) => doc.id),
      actorId: userId,
    });
    await invalidateCachePrefix("search:");
    await invalidateCachePrefix("popular-tags:");

    const { data: updatedDocs } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .in("id", permittedDocs.map((doc: any) => doc.id));
    const visibleDocs = action === "delete" ? [] : await attachTagsToDocuments(await enrichWithUserEmails(updatedDocs || []));

    return res.json({
      action,
      processed: permittedDocs.length,
      processedIds: permittedDocs.map((doc: any) => doc.id),
      skipped: documentIds.length - permittedDocs.length,
      documents: visibleDocs.map((doc: any) => shapeDocument(doc, userId)),
    });
  } catch (error) {
    console.error("Bulk update failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using bulk actions.",
      });
    }
    return res.status(500).json({ message: "Bulk action failed" });
  }
};

export const resendInvite = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const documentId = req.params.id;
    const userId = req.params.userId;
    const { data: doc } = await supabase
      .from("documents")
      .select("id, title, owner_id, deleted_at, document_collaborators(*)")
      .eq("id", documentId)
      .single();

    if (!doc || doc.deleted_at) return res.status(404).json({ message: "Document nahi mila" });
    if (doc.owner_id !== auth.userId) return res.status(403).json({ message: "Sirf owner invite resend kar sakta hai" });

    const collaborator = (doc.document_collaborators || []).find((item: any) => item.user_id === userId);
    if (!collaborator || normalizeInviteStatus(collaborator.invitation_status) === "cancelled") {
      return res.status(404).json({ message: "Invite nahi mila" });
    }

    await updateInviteMailStatus(documentId, userId, "queued");
    queueShareNotifications({
      documentId,
      documentTitle: doc.title,
      actorId: auth.userId,
      actorEmail: auth.email,
      accessUpdates: [{
        user: userId,
        role: normalizeRole(collaborator.role),
        email: emailFromUserId(userId),
        previousRole: normalizeRole(collaborator.role),
        reason: "reminder",
      }],
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Resend invite failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using invites.",
      });
    }
    return res.status(500).json({ message: "Invite resend nahi hua" });
  }
};

export const cancelInvite = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const documentId = req.params.id;
    const userId = req.params.userId;
    const { data: doc } = await supabase
      .from("documents")
      .select("id, title, owner_id, deleted_at")
      .eq("id", documentId)
      .single();

    if (!doc || doc.deleted_at) return res.status(404).json({ message: "Document nahi mila" });
    if (doc.owner_id !== auth.userId) return res.status(403).json({ message: "Sirf owner invite cancel kar sakta hai" });

    const { error } = await supabase
      .from("document_collaborators")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", userId);
    if (error) throw error;

    await trackDocumentEvent({
      documentId,
      actorId: auth.userId,
      eventType: "document_invite_cancelled",
      metadata: { userId, email: emailFromUserId(userId) },
    });
    await publishEvent("docs:mutations", { action: "invite_cancelled", documentId, actorId: auth.userId, userId });
    await invalidateCachePrefix("search:");

    return res.json({ success: true });
  } catch (error) {
    console.error("Cancel invite failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using invites.",
      });
    }
    return res.status(500).json({ message: "Invite cancel nahi hua" });
  }
};

export const getDocumentActivity = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const documentId = req.params.id;
    const { data: doc } = await supabase
      .from("documents")
      .select("owner_id, deleted_at, document_collaborators(user_id, role)")
      .eq("id", documentId)
      .single();

    if (!doc) return res.status(404).json({ message: "Document nahi mila" });
    const role = getRoleForUser(doc, auth.userId);
    if (!role) return res.status(403).json({ message: "Forbidden" });

    const { data: events, error } = await supabase
      .from("document_events")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) throw error;

    return res.json({
      activity: (events || []).map((event: any) => ({
        id: event.id,
        type: event.event_type,
        actor: {
          id: event.actor_id,
          email: emailFromUserId(event.actor_id),
        },
        metadata: event.metadata || {},
        createdAt: event.created_at,
      })),
    });
  } catch (error) {
    console.error("Fetch document activity failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using activity.",
      });
    }
    return res.status(500).json({ message: "Activity load nahi hui" });
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

    if (!doc || doc.deleted_at) return res.status(404).json({ message: "Document nahi mila" });

    const currentRole = getRoleForUser(doc, userId);
    if (!currentRole) return res.status(403).json({ message: "Forbidden" });

    const wantsContentUpdate = typeof req.body.content === "string";
    const wantsTitleUpdate = typeof req.body.title === "string";
    const wantsFolderUpdate = req.body.folder_id !== undefined;
    const wantsShareUpdate = Array.isArray(req.body.collaborators);

    if ((wantsContentUpdate || wantsTitleUpdate) && !canEditDocument(currentRole)) {
      return res.status(403).json({ message: "Only owners and editors can edit documents" });
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
      await maybeCreateAutomaticVersion({
        documentId,
        content: doc.content || "",
        userId,
      }).catch((versionError) => console.error("Automatic version snapshot failed", versionError));
      updates.content = req.body.content;
    }
    if (wantsFolderUpdate) {
      updates.folder_id = req.body.folder_id || null;
    }

    let nextCollaborators = doc.document_collaborators || [];

    if (wantsShareUpdate) {
      const parsedShareTargets = await parseShareTargets(req.body.collaborators, userId);
      const notifyEmails = parseNotifyEmails(req.body.notifyEmails, userId);
      const parsedCollaborators = parsedShareTargets.filter((item) => item.userId) as Array<
        ShareTarget & { userId: string }
      >;
      
      const existingCollaborators = doc.document_collaborators || [];
      const existingRoleById = new Map<string, CollaboratorRole>(
        existingCollaborators.map((c: any) => [c.user_id, normalizeRole(c.role)]),
      );
      const nextCollaboratorIds = new Set(parsedCollaborators.map((c) => c.userId));

      if (parsedCollaborators.length > 0) {
        const collabsToUpsert = parsedCollaborators.map((c) => {
          const shouldQueueInvite =
            notifyEmails.has(c.email) ||
            !existingRoleById.has(c.userId) ||
            existingRoleById.get(c.userId) !== c.role;
          return {
            document_id: documentId,
            user_id: c.userId,
            role: c.role,
            updated_at: new Date().toISOString(),
            ...(shouldQueueInvite
              ? {
                  invitation_status: "pending",
                  last_invite_sent_at: new Date().toISOString(),
                  invite_email_status: "queued",
                }
              : {}),
          };
        });
        const { error: collaboratorUpsertError } = await supabase
          .from("document_collaborators")
          .upsert(collabsToUpsert, { onConflict: "document_id,user_id" });
        if (collaboratorUpsertError) throw collaboratorUpsertError;
      }

      const removedCollaboratorIds = existingCollaborators
        .map((c: any) => c.user_id)
        .filter((existingId: string) => !nextCollaboratorIds.has(existingId));

      if (removedCollaboratorIds.length > 0) {
        const { error: collaboratorDeleteError } = await supabase
          .from("document_collaborators")
          .delete()
          .eq("document_id", documentId)
          .in("user_id", removedCollaboratorIds);
        if (collaboratorDeleteError) throw collaboratorDeleteError;
      }

      nextCollaborators = parsedCollaborators.map((c) => ({ user_id: c.userId, role: c.role }));

      const accessUpdates = parsedCollaborators.flatMap((collaborator) => {
        const previousRole = existingRoleById.get(collaborator.userId) ?? null;
        const explicitInvite = notifyEmails.has(collaborator.email);
        const roleChanged = previousRole !== collaborator.role;

        if (!roleChanged && !explicitInvite) {
          return [];
        }

        return [
          {
            user: collaborator.userId,
            role: collaborator.role,
            email: collaborator.email,
            previousRole,
            reason: !previousRole ? "granted" : roleChanged ? "role_changed" : "reminder",
          } satisfies ShareAccessUpdate,
        ];
      });

      const actorEmail = auth.email;

      queueShareNotifications({
        documentId,
        documentTitle: updates.title || doc.title,
        actorId: userId,
        actorEmail: actorEmail,
        accessUpdates,
      });

      runInBackground("Document share analytics failed", async () => {
        await trackDocumentEvent({
          documentId,
          actorId: userId,
          eventType: "document_shared",
          metadata: { accessUpdates: accessUpdates.length, totalCollaborators: parsedCollaborators.length },
        });
      });
    }

    if (Object.keys(updates).length > 1 || wantsShareUpdate) {
      const { error: documentUpdateError } = await supabase.from("documents").update(updates).eq("id", documentId);
      if (documentUpdateError) throw documentUpdateError;

      const mutationFields = {
        title: wantsTitleUpdate,
        content: wantsContentUpdate,
        folder: wantsFolderUpdate,
        collaborators: wantsShareUpdate,
      };

      runInBackground("Document update side effects failed", async () => {
        await trackDocumentEvent({
          documentId,
          actorId: userId,
          eventType: "document_updated",
          metadata: {
            fields: mutationFields,
          },
        });

        await publishEvent("docs:mutations", {
          action: "update",
          documentId,
          actorId: userId,
          fields: {
            ...mutationFields,
          },
        });
        await invalidateCachePrefix("search:");
        await invalidateCachePrefix("popular-tags:");
      });
    }

    doc.title = updates.title || doc.title;
    if (wantsContentUpdate) {
      doc.content = updates.content;
    }
    if (wantsFolderUpdate) doc.folder_id = updates.folder_id;
    doc.updated_at = updates.updated_at;
    doc.document_collaborators = nextCollaborators;

    const [enrichedDoc] = await attachTagsToDocuments(await enrichWithUserEmails([doc]));

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
      .select("owner_id, deleted_at")
      .eq("id", documentId)
      .single();

    if (!doc || doc.deleted_at) return res.status(404).json({ message: "Document nahi mila" });
    if (doc.owner_id !== userId) return res.status(403).json({ message: "Sirf owner delete kar sakta hai" });

    const deletedAt = new Date().toISOString();
    const { error: softDeleteError } = await supabase
      .from("documents")
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .eq("id", documentId)
      .eq("owner_id", userId);
    if (softDeleteError) throw softDeleteError;

    await publishEvent("docs:mutations", {
      action: "delete",
      documentId,
      actorId: userId,
    });
    await invalidateCachePrefix("search:");
    await invalidateCachePrefix("popular-tags:");

    await trackDocumentEvent({
      documentId,
      actorId: userId,
      eventType: "document_deleted",
      metadata: { mode: "trash" },
    });

    return res.json({ message: "Document moved to trash", deletedAt });
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

export const restoreDocument = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const documentId = req.params.id;
    const restoredAt = new Date().toISOString();
    const { data: doc, error } = await supabase
      .from("documents")
      .update({ deleted_at: null, updated_at: restoredAt })
      .eq("id", documentId)
      .eq("owner_id", auth.userId)
      .not("deleted_at", "is", null)
      .select("*, document_collaborators(*)")
      .single();

    if (error || !doc) {
      return res.status(404).json({ message: "Trash document nahi mila" });
    }

    await trackDocumentEvent({
      documentId,
      actorId: auth.userId,
      eventType: "document_restored",
      metadata: { restoredAt },
    });
    await publishEvent("docs:mutations", {
      action: "restore",
      documentId,
      actorId: auth.userId,
    });
    await invalidateCachePrefix("search:");

    const [enrichedDoc] = await attachTagsToDocuments(await enrichWithUserEmails([doc]));
    return res.json({ document: shapeDocument(enrichedDoc, auth.userId) });
  } catch (error) {
    console.error("Restore document failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using trash.",
      });
    }
    return res.status(500).json({ message: "Document restore nahi hua" });
  }
};

export const permanentlyDeleteDocument = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const documentId = req.params.id;
    const { data: doc } = await supabase
      .from("documents")
      .select("owner_id, deleted_at")
      .eq("id", documentId)
      .single();

    if (!doc) return res.status(404).json({ message: "Document nahi mila" });
    if (doc.owner_id !== auth.userId) {
      return res.status(403).json({ message: "Sirf owner permanent delete kar sakta hai" });
    }
    if (!doc.deleted_at) {
      return res.status(400).json({ message: "Permanent delete se pehle document trash mein hona chahiye" });
    }

    await deleteDocumentDependencies(documentId);
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("owner_id", auth.userId);

    if (error) throw error;

    await publishEvent("docs:mutations", {
      action: "permanent_delete",
      documentId,
      actorId: auth.userId,
    });
    await invalidateCachePrefix("search:");
    await invalidateCachePrefix("popular-tags:");

    return res.json({ success: true, id: documentId });
  } catch (error) {
    console.error("Permanent delete document failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using trash.",
      });
    }
    return res.status(500).json({ message: "Permanent delete nahi hua" });
  }
};

export const transferDocumentOwnership = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const documentId = req.params.id;
    const nextOwnerEmail = normalizeEmail(req.body.email);
    if (!isValidEmail(nextOwnerEmail)) {
      return res.status(400).json({ message: "Valid owner email required hai" });
    }

    const nextOwnerId = userIdFromEmail(nextOwnerEmail);
    if (nextOwnerId === auth.userId) {
      return res.status(400).json({ message: "Current owner ko transfer nahi kar sakte" });
    }

    const { data: doc } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .eq("id", documentId)
      .single();

    if (!doc || doc.deleted_at) return res.status(404).json({ message: "Document nahi mila" });
    if (doc.owner_id !== auth.userId) {
      return res.status(403).json({ message: "Sirf owner ownership transfer kar sakta hai" });
    }

    const updatedAt = new Date().toISOString();
    const { error: ownerUpdateError } = await supabase
      .from("documents")
      .update({ owner_id: nextOwnerId, updated_at: updatedAt })
      .eq("id", documentId)
      .eq("owner_id", auth.userId);
    if (ownerUpdateError) throw ownerUpdateError;

    await supabase
      .from("document_collaborators")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", nextOwnerId);

    const previousOwnerEmail = auth.email;
    await supabase
      .from("document_collaborators")
      .upsert({
        document_id: documentId,
        user_id: auth.userId,
        role: "editor",
        updated_at: updatedAt,
      }, { onConflict: "document_id,user_id" });

    const { error: transferNotificationError } = await supabase.from("notifications").insert([
      {
        recipient_id: nextOwnerId,
        sender_id: auth.userId,
        document_id: documentId,
        type: "document_shared",
        message: `${previousOwnerEmail} transferred ownership of "${doc.title}" to you.`,
      },
      {
        recipient_id: auth.userId,
        sender_id: auth.userId,
        document_id: documentId,
        type: "document_shared",
        message: `You transferred ownership of "${doc.title}" to ${nextOwnerEmail}.`,
      },
    ]);
    if (transferNotificationError) {
      console.error("Ownership transfer notification failed", transferNotificationError);
    }

    await trackDocumentEvent({
      documentId,
      actorId: auth.userId,
      eventType: "document_ownership_transferred",
      metadata: {
        previousOwner: auth.email,
        nextOwner: nextOwnerEmail,
      },
    });
    await publishEvent("docs:mutations", {
      action: "transfer_owner",
      documentId,
      actorId: auth.userId,
      nextOwnerId,
    });

    const { data: updatedDoc, error: reloadError } = await supabase
      .from("documents")
      .select("*, document_collaborators(*)")
      .eq("id", documentId)
      .single();
    if (reloadError || !updatedDoc) throw reloadError || new Error("Transferred document reload failed");

    const [enrichedDoc] = await attachTagsToDocuments(await enrichWithUserEmails([updatedDoc]));
    return res.json({ document: shapeDocument(enrichedDoc, auth.userId) });
  } catch (error) {
    console.error("Transfer ownership failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before transfer.",
      });
    }
    return res.status(500).json({ message: "Ownership transfer nahi hua" });
  }
};
