import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { trackDocumentEvent } from "../utils/analytics";
import { isMissingTableError } from "../utils/dbErrors";

// Our SQL table for comments is:
// id, document_id, user_id, content, resolved, position, created_at
// And "body" in the old API maps to "content".

const shapeComment = (comment: any, authorEmail: string) => ({
  id: comment.id,
  body: comment.content,
  createdAt: comment.created_at,
  author: {
    id: comment.user_id,
    email: authorEmail,
  },
});

const enrichWithUserEmails = async (comments: any[]) => {
  const userIds = [...new Set(comments.map(c => c.user_id).filter(Boolean))];
  const userMap = new Map();

  if (userIds.length > 0) {
    try {
      const usersResp = await clerkClient.users.getUserList({ userId: userIds });
      const userList: any[] = Array.isArray(usersResp) ? usersResp : (usersResp as any).data || [];
      userList.forEach((u: any) => {
        userMap.set(u.id, u.emailAddresses[0]?.emailAddress || "");
      });
    } catch (err) {
      console.error("Clerk fetch users error in comments", err);
    }
  }

  return comments.map(c => shapeComment(c, userMap.get(c.user_id) || "unknown"));
};

const canAccessDocument = async (documentId: string, userId: string) => {
  const { data: doc } = await supabase
    .from("documents")
    .select("owner_id, document_collaborators(user_id)")
    .eq("id", documentId)
    .single();

  if (!doc) return false;
  if (doc.owner_id === userId) return true;
  
  const isCollab = doc.document_collaborators?.some((c: any) => c.user_id === userId);
  return !!isCollab;
};

export const getComments = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const documentId = req.params.id;
    const hasAccess = await canAccessDocument(documentId, userId);

    if (!hasAccess) {
      return res.status(404).json({ message: "Document nahi mila" });
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
      })
      .select("*")
      .single();

    if (!comment) throw new Error("Comment insert failed");

    const [shapedComment] = await enrichWithUserEmails([comment]);

    await trackDocumentEvent({
      documentId,
      actorId: userId,
      eventType: "document_commented",
      metadata: { commentId: comment.id },
    });

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
