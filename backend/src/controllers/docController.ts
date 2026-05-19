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
  role: "editor" | "viewer";
};

type ShareTarget = {
  email: string;
  role: "editor" | "viewer";
  userId?: string;
};

type ShareAccessUpdate = {
  user: string;
  role: "editor" | "viewer";
  email: string;
  previousRole?: "editor" | "viewer" | null;
  reason: "granted" | "role_changed" | "reminder";
};

const normalizeRole = (role: unknown): "editor" | "viewer" =>
  role === "viewer" ? "viewer" : "editor";

const getRoleForUser = (document: any, userId: string) => {
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
    tags: document.tags || [],
    createdAt: document.created_at,
    updatedAt: document.updated_at,
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

  const cleanedItems: Array<{ email: string; role: "editor" | "viewer" }> = input
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

const runInBackground = (label: string, task: () => Promise<void>) => {
  setImmediate(() => {
    void task().catch((error) => console.error(label, error));
  });
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
          console.info(`Share email to ${maskEmail(target.email)} ${describeMailResult(result)}`);
        })
        .catch((error) => console.error(`Failed to send share email to ${maskEmail(target.email)}`, error)),
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
      const existingRoleById = new Map<string, "editor" | "viewer">(
        existingCollaborators.map((c: any) => [c.user_id, normalizeRole(c.role)]),
      );
      const nextCollaboratorIds = new Set(parsedCollaborators.map((c) => c.userId));

      if (parsedCollaborators.length > 0) {
        const collabsToUpsert = parsedCollaborators.map((c) => ({
          document_id: documentId,
          user_id: c.userId,
          role: c.role,
        }));
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
      .select("owner_id")
      .eq("id", documentId)
      .single();

    if (!doc) return res.status(404).json({ message: "Document nahi mila" });
    if (doc.owner_id !== userId) return res.status(403).json({ message: "Sirf owner delete kar sakta hai" });

    const { error } = await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", documentId);

    if (error) {
      const missingDeletedColumn = error.code === "42703" || /deleted_at/i.test(String(error.message || ""));
      if (!missingDeletedColumn) {
        throw error;
      }

      const { error: hardDeleteError } = await supabase.from("documents").delete().eq("id", documentId);
      if (hardDeleteError) throw hardDeleteError;
    }

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
