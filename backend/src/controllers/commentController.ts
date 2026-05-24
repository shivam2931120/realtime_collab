import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { trackDocumentEvent } from "../utils/analytics";
import { isMissingTableError } from "../utils/dbErrors";
import { emailFromUserId, isValidEmail, normalizeEmail, userIdFromEmail } from "../utils/userIdentity";
import { sendMail } from "../utils/mailer";

// Our SQL table for comments is:
// id, document_id, user_id, content, resolved, position, created_at
// And "body" in the old API maps to "content".

const shapeComment = (comment: any, authorEmail: string) => ({
  id: comment.id,
  body: comment.content,
  resolved: Boolean(comment.resolved),
  position: comment.position || null,
  createdAt: comment.created_at,
  author: {
    id: comment.user_id,
    email: authorEmail,
  },
});

type CollaboratorRole = "editor" | "commenter" | "viewer";
type DocumentRole = "owner" | CollaboratorRole;

const normalizeRole = (role: unknown): CollaboratorRole => {
  if (role === "viewer") return "viewer";
  if (role === "commenter") return "commenter";
  return "editor";
};

const canComment = (role: DocumentRole | null) =>
  role === "owner" || role === "editor" || role === "commenter";

const enrichWithUserEmails = async (comments: any[]) => {
  return comments.map((c) => shapeComment(c, emailFromUserId(c.user_id)));
};

const getDocumentAccess = async (documentId: string, userId: string) => {
  const { data: doc } = await supabase
    .from("documents")
    .select("owner_id, title, deleted_at, document_collaborators(user_id, role)")
    .eq("id", documentId)
    .single();

  if (!doc || doc.deleted_at) return null;
  if (doc.owner_id === userId) {
    return { role: "owner" as const, document: doc };
  }
  
  const collaborator = doc.document_collaborators?.find((c: any) => c.user_id === userId);
  if (!collaborator) return null;

  return {
    role: normalizeRole(collaborator.role),
    document: doc,
  };
};

const canAccessDocument = async (documentId: string, userId: string) => {
  const access = await getDocumentAccess(documentId, userId);
  return Boolean(access);
};

const extractMentionEmails = (body: string) => {
  const matches = body.match(/@([^\s@<>()[\],;:]+@[^\s@<>()[\],;:]+\.[^\s@<>()[\],;:]+)/g) || [];
  return [
    ...new Set(
      matches
        .map((value) => normalizeEmail(value.slice(1)))
        .filter((email) => isValidEmail(email)),
    ),
  ];
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getDocumentTitle = async (documentId: string) => {
  const { data: doc } = await supabase.from("documents").select("title").eq("id", documentId).single();
  return doc?.title || "Untitled document";
};

const createMentionNotifications = async ({
  documentId,
  documentTitle,
  commentBody,
  actorId,
  actorEmail,
}: {
  documentId: string;
  documentTitle: string;
  commentBody: string;
  actorId: string;
  actorEmail: string;
}) => {
  const mentionedEmails = extractMentionEmails(commentBody).filter(
    (email) => userIdFromEmail(email) !== actorId,
  );

  if (!mentionedEmails.length) {
    return;
  }

  const documentUrl = `${String(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "")}/editor/${documentId}`;
  const notifications = mentionedEmails.map((email) => ({
    recipient_id: userIdFromEmail(email),
    sender_id: actorId,
    document_id: documentId,
    type: "comment_mention",
    message: `${actorEmail} mentioned you in "${documentTitle}".`,
  }));

  await supabase.from("notifications").insert(notifications);

  await Promise.all(
    mentionedEmails.map((email) =>
      sendMail({
        to: email,
        subject: `Mentioned in ${documentTitle}`,
        text: `${actorEmail} mentioned you in "${documentTitle}".\n\nOpen: ${documentUrl}`,
        html: `<p><strong>${escapeHtml(actorEmail)}</strong> mentioned you in <strong>${escapeHtml(documentTitle)}</strong>.</p><p><a href="${escapeHtml(documentUrl)}">Open document</a></p>`,
      }).catch((error) => console.error("Mention email failed", error)),
    ),
  );
};

export const getComments = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const documentId = req.params.id;
    const access = await getDocumentAccess(documentId, userId);

    if (!access) {
      return res.status(404).json({ message: "Document nahi mila" });
    }
    if (!canComment(access.role)) {
      return res.status(403).json({ message: "Viewer comment create nahi kar sakta" });
    }

    const { data: comments } = await supabase
      .from("comments")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });

    if (!comments || comments.length === 0) {
      return res.json({ comments: [] });
    }

    const shapedComments = await enrichWithUserEmails(comments);

    return res.json({ comments: shapedComments });
  } catch (error) {
    console.error("Fetch comments failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using comments.",
      });
    }
    return res.status(500).json({ message: "Comments load nahi hui" });
  }
};

export const createComment = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const documentId = req.params.id;
    const hasAccess = await canAccessDocument(documentId, userId);

    if (!hasAccess) {
      return res.status(404).json({ message: "Document nahi mila" });
    }

    const body = String(req.body.body || "").trim();

    if (!body) {
      return res.status(400).json({ message: "Comment empty nahi ho sakta" });
    }

    const { data: comment } = await supabase
      .from("comments")
      .insert({
        document_id: documentId,
        user_id: userId,
        content: body,
        position: req.body.position || null,
      })
      .select("*")
      .single();

    if (!comment) throw new Error("Comment insert failed");

    const [shapedComment] = await enrichWithUserEmails([comment]);
    const documentTitle = await getDocumentTitle(documentId);

    await trackDocumentEvent({
      documentId,
      actorId: userId,
      eventType: "document_commented",
      metadata: { commentId: comment.id },
    });

    await createMentionNotifications({
      documentId,
      documentTitle,
      commentBody: body,
      actorId: userId,
      actorEmail: auth.email,
    }).catch((notificationError) => console.error("Mention notification failed", notificationError));

    return res.status(201).json({ comment: shapedComment });
  } catch (error) {
    console.error("Create comment failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using comments.",
      });
    }
    return res.status(500).json({ message: "Comment create nahi hua" });
  }
};

export const updateCommentResolution = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const documentId = req.params.id;
    const commentId = req.params.commentId;
    const access = await getDocumentAccess(documentId, auth.userId);

    if (!access) {
      return res.status(404).json({ message: "Document nahi mila" });
    }
    if (!canComment(access.role)) {
      return res.status(403).json({ message: "Viewer comment update nahi kar sakta" });
    }

    const { data: existingComment } = await supabase
      .from("comments")
      .select("*")
      .eq("id", commentId)
      .eq("document_id", documentId)
      .single();

    if (!existingComment) {
      return res.status(404).json({ message: "Comment nahi mila" });
    }

    const updates: Record<string, unknown> = {};

    if (typeof req.body.resolved === "boolean") {
      updates.resolved = Boolean(req.body.resolved);
    }

    const nextBody = String(req.body.body ?? req.body.content ?? "").trim();
    if (nextBody) {
      const canEditBody = existingComment.user_id === auth.userId || access.role === "owner";
      if (!canEditBody) {
        return res.status(403).json({ message: "Sirf comment author ya owner comment edit kar sakta hai" });
      }
      updates.content = nextBody;
    }

    if (!Object.keys(updates).length) {
      const [shapedComment] = await enrichWithUserEmails([existingComment]);
      return res.json({ comment: shapedComment });
    }

    const { data: comment, error } = await supabase
      .from("comments")
      .update(updates)
      .eq("id", commentId)
      .eq("document_id", documentId)
      .select("*")
      .single();

    if (error || !comment) {
      return res.status(404).json({ message: "Comment nahi mila" });
    }

    const [shapedComment] = await enrichWithUserEmails([comment]);

    if (nextBody && nextBody !== existingComment.content) {
      await createMentionNotifications({
        documentId,
        documentTitle: access.document.title || "Untitled document",
        commentBody: nextBody,
        actorId: auth.userId,
        actorEmail: auth.email,
      }).catch((notificationError) => console.error("Edited comment mention notification failed", notificationError));
    }

    return res.json({ comment: shapedComment });
  } catch (error) {
    console.error("Update comment failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using comments.",
      });
    }
    return res.status(500).json({ message: "Comment update nahi hua" });
  }
};

export const deleteComment = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const documentId = req.params.id;
    const commentId = req.params.commentId;
    const access = await getDocumentAccess(documentId, auth.userId);

    if (!access) {
      return res.status(404).json({ message: "Document nahi mila" });
    }
    if (!canComment(access.role)) {
      return res.status(403).json({ message: "Viewer comment delete nahi kar sakta" });
    }

    const { data: comment } = await supabase
      .from("comments")
      .select("*")
      .eq("id", commentId)
      .eq("document_id", documentId)
      .single();

    if (!comment) {
      return res.status(404).json({ message: "Comment nahi mila" });
    }

    if (comment.user_id !== auth.userId && access.role !== "owner") {
      return res.status(403).json({ message: "Sirf comment author ya owner comment delete kar sakta hai" });
    }

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("document_id", documentId);

    if (error) throw error;

    return res.json({ success: true, id: commentId });
  } catch (error) {
    console.error("Delete comment failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using comments.",
      });
    }
    return res.status(500).json({ message: "Comment delete nahi hua" });
  }
};
