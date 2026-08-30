import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { trackDocumentEvent } from "../utils/analytics";
import { isMissingTableError } from "../utils/dbErrors";

const BUCKET = "document-attachments";
const MAX_BYTES = 1.5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
]);

const safeName = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "attachment";

const getAccess = async (documentId: string, userId: string) => {
  const { data, error } = await supabase
    .from("documents")
    .select("id, owner_id, deleted_at, document_collaborators(user_id, role, invitation_status)")
    .eq("id", documentId)
    .single();
  if (error || !data || data.deleted_at) return null;
  if (data.owner_id === userId) return "owner";
  const collaborator = (data.document_collaborators || []).find(
    (row: any) => row.user_id === userId && row.invitation_status !== "cancelled",
  );
  return collaborator?.role || null;
};

const shapeAttachment = (row: any, url?: string) => ({
  id: row.id,
  documentId: row.document_id,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  createdAt: row.created_at,
  url,
});

export const listAttachments = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const role = await getAccess(req.params.id, req.auth.userId);
    if (!role) return res.status(403).json({ message: "Document access denied" });
    const { data, error } = await supabase
      .from("document_attachments")
      .select("id, document_id, file_name, mime_type, size_bytes, storage_path, created_at")
      .eq("document_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const attachments = await Promise.all((data || []).map(async (row: any) => {
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 3600);
      return shapeAttachment(row, signed.data?.signedUrl);
    }));
    return res.json({ attachments });
  } catch (error) {
    console.error("List attachments failed", error);
    if (isMissingTableError(error)) return res.status(503).json({ message: "Database not initialized. Run supabase_schema.sql." });
    return res.status(500).json({ message: "Attachments load nahi hue" });
  }
};

export const uploadAttachment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const role = await getAccess(req.params.id, req.auth.userId);
    if (role !== "owner" && role !== "editor") return res.status(403).json({ message: "Only owners and editors can upload files" });

    const fileName = String(req.body?.fileName || "attachment");
    const mimeType = String(req.body?.mimeType || "").toLowerCase();
    const dataUrl = String(req.body?.dataUrl || "");
    if (!ALLOWED_TYPES.has(mimeType) || !dataUrl.startsWith("data:")) {
      return res.status(400).json({ message: "Unsupported attachment type" });
    }
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) return res.status(400).json({ message: "Invalid attachment data" });
    const buffer = Buffer.from(match[1], "base64");
    if (!buffer.length || buffer.length > MAX_BYTES) return res.status(413).json({ message: "Attachment must be smaller than 1.5 MB" });

    const storagePath = `${req.params.id}/${req.auth.userId}/${Date.now()}-${safeName(fileName)}`;
    const upload = await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    if (upload.error) throw upload.error;
    const { data: row, error } = await supabase.from("document_attachments").insert({
      document_id: req.params.id,
      uploaded_by: req.auth.userId,
      storage_path: storagePath,
      file_name: safeName(fileName),
      mime_type: mimeType,
      size_bytes: buffer.length,
    }).select("id, document_id, file_name, mime_type, size_bytes, storage_path, created_at").single();
    if (error || !row) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw error || new Error("Attachment metadata was not saved");
    }
    const signed = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
    await trackDocumentEvent({ documentId: req.params.id, actorId: req.auth.userId, eventType: "document_attachment_uploaded", metadata: { fileName: row.file_name, mimeType, sizeBytes: buffer.length } });
    return res.status(201).json({ attachment: shapeAttachment(row, signed.data?.signedUrl) });
  } catch (error) {
    console.error("Upload attachment failed", error);
    if (isMissingTableError(error)) return res.status(503).json({ message: "Database not initialized. Run supabase_schema.sql." });
    return res.status(500).json({ message: "Attachment upload nahi hua" });
  }
};

export const deleteAttachment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const role = await getAccess(req.params.id, req.auth.userId);
    if (role !== "owner" && role !== "editor") return res.status(403).json({ message: "Only owners and editors can delete files" });
    const { data: row, error } = await supabase.from("document_attachments").select("id, storage_path").eq("id", req.params.attachmentId).eq("document_id", req.params.id).single();
    if (error || !row) return res.status(404).json({ message: "Attachment not found" });
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
    await supabase.from("document_attachments").delete().eq("id", row.id);
    await trackDocumentEvent({ documentId: req.params.id, actorId: req.auth.userId, eventType: "document_attachment_deleted", metadata: { attachmentId: row.id } });
    return res.json({ success: true, id: row.id });
  } catch (error) {
    console.error("Delete attachment failed", error);
    if (isMissingTableError(error)) return res.status(503).json({ message: "Database not initialized. Run supabase_schema.sql." });
    return res.status(500).json({ message: "Attachment delete nahi hua" });
  }
};
