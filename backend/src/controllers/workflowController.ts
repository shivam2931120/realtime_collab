import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { trackDocumentEvent } from "../utils/analytics";
import { emailFromUserId } from "../utils/userIdentity";

type Role = "owner" | "editor" | "commenter" | "viewer";
const getAccess = async (documentId: string, userId: string): Promise<{ role: Role; title: string } | null> => {
  const { data } = await supabase.from("documents").select("owner_id, title, deleted_at, document_collaborators(user_id, role)").eq("id", documentId).single();
  if (!data || data.deleted_at) return null;
  if (data.owner_id === userId) return { role: "owner", title: data.title };
  const member = data.document_collaborators?.find((item: any) => item.user_id === userId);
  return member ? { role: member.role as Role, title: data.title } : null;
};

const shapeDeadline = (row: any) => ({ id: row.id, documentId: row.document_id, title: row.title, description: row.description || "", dueAt: row.due_at, status: row.status, createdBy: { id: row.created_by, email: emailFromUserId(row.created_by) }, createdAt: row.created_at, updatedAt: row.updated_at });
const shapeSuggestion = (row: any) => ({ id: row.id, documentId: row.document_id, originalText: row.original_text, replacementText: row.replacement_text, position: row.position, status: row.status, createdBy: { id: row.created_by, email: emailFromUserId(row.created_by) }, decidedBy: row.decided_by ? { id: row.decided_by, email: emailFromUserId(row.decided_by) } : null, decidedAt: row.decided_at, createdAt: row.created_at });

export const listDeadlines = async (req: AuthRequest, res: Response) => {
  const access = await getAccess(req.params.id, req.auth!.userId);
  if (!access) return res.status(404).json({ message: "Document not found" });
  const { data, error } = await supabase.from("document_deadlines").select("*").eq("document_id", req.params.id).order("due_at");
  if (error) return res.status(500).json({ message: "Deadlines could not be loaded" });
  return res.json({ deadlines: (data || []).map(shapeDeadline) });
};

export const createDeadline = async (req: AuthRequest, res: Response) => {
  const access = await getAccess(req.params.id, req.auth!.userId);
  if (!access) return res.status(404).json({ message: "Document not found" });
  if (!['owner', 'editor'].includes(access.role)) return res.status(403).json({ message: "Only owners and editors can create deadlines" });
  const title = String(req.body.title || "").trim();
  const dueAt = new Date(String(req.body.dueAt || ""));
  if (!title || title.length > 120 || Number.isNaN(dueAt.getTime())) return res.status(400).json({ message: "A valid title and deadline are required" });
  const { data, error } = await supabase.from("document_deadlines").insert({ document_id: req.params.id, title, description: String(req.body.description || "").trim().slice(0, 1000), due_at: dueAt.toISOString(), created_by: req.auth!.userId }).select("*").single();
  if (error || !data) return res.status(500).json({ message: "Deadline could not be created" });
  await trackDocumentEvent({ documentId: req.params.id, actorId: req.auth!.userId, eventType: "document_deadline_created", metadata: { deadlineId: data.id, dueAt: data.due_at } });
  return res.status(201).json({ deadline: shapeDeadline(data) });
};

export const updateDeadline = async (req: AuthRequest, res: Response) => {
  const access = await getAccess(req.params.id, req.auth!.userId);
  if (!access) return res.status(404).json({ message: "Document not found" });
  if (!['owner', 'editor'].includes(access.role)) return res.status(403).json({ message: "Only owners and editors can update deadlines" });
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (req.body.status !== undefined) {
    const status = String(req.body.status);
    if (!['open', 'completed', 'cancelled'].includes(status)) return res.status(400).json({ message: "Invalid deadline status" });
    updates.status = status;
  }
  if (req.body.title !== undefined) updates.title = String(req.body.title).trim().slice(0, 120);
  if (req.body.description !== undefined) updates.description = String(req.body.description).trim().slice(0, 1000);
  if (req.body.dueAt !== undefined) {
    const date = new Date(String(req.body.dueAt));
    if (Number.isNaN(date.getTime())) return res.status(400).json({ message: "Invalid deadline date" });
    updates.due_at = date.toISOString();
  }
  const { data } = await supabase.from("document_deadlines").update(updates).eq("id", req.params.deadlineId).eq("document_id", req.params.id).select("*").single();
  if (!data) return res.status(404).json({ message: "Deadline not found" });
  await trackDocumentEvent({ documentId: req.params.id, actorId: req.auth!.userId, eventType: "document_deadline_updated", metadata: { deadlineId: data.id, status: data.status } });
  return res.json({ deadline: shapeDeadline(data) });
};

export const deleteDeadline = async (req: AuthRequest, res: Response) => {
  const access = await getAccess(req.params.id, req.auth!.userId);
  if (!access) return res.status(404).json({ message: "Document not found" });
  if (access.role !== "owner") return res.status(403).json({ message: "Only the owner can delete deadlines" });
  const { data } = await supabase.from("document_deadlines").delete().eq("id", req.params.deadlineId).eq("document_id", req.params.id).select("id").single();
  return data ? res.status(204).send() : res.status(404).json({ message: "Deadline not found" });
};

export const listSuggestions = async (req: AuthRequest, res: Response) => {
  const access = await getAccess(req.params.id, req.auth!.userId);
  if (!access) return res.status(404).json({ message: "Document not found" });
  const { data, error } = await supabase.from("document_suggestions").select("*").eq("document_id", req.params.id).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ message: "Suggestions could not be loaded" });
  return res.json({ suggestions: (data || []).map(shapeSuggestion) });
};

export const createSuggestion = async (req: AuthRequest, res: Response) => {
  const access = await getAccess(req.params.id, req.auth!.userId);
  if (!access) return res.status(404).json({ message: "Document not found" });
  if (!['owner', 'editor', 'commenter'].includes(access.role)) return res.status(403).json({ message: "Viewer cannot create suggestions" });
  const originalText = String(req.body.originalText || "");
  const replacementText = String(req.body.replacementText ?? "");
  const from = Number(req.body.position?.from); const to = Number(req.body.position?.to);
  if (!originalText || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to <= from || replacementText.length > 20000) return res.status(400).json({ message: "Select text and provide a valid replacement" });
  const { data, error } = await supabase.from("document_suggestions").insert({ document_id: req.params.id, created_by: req.auth!.userId, original_text: originalText, replacement_text: replacementText, position: { from, to } }).select("*").single();
  if (error || !data) return res.status(500).json({ message: "Suggestion could not be created" });
  await trackDocumentEvent({ documentId: req.params.id, actorId: req.auth!.userId, eventType: "document_suggestion_created", metadata: { suggestionId: data.id } });
  return res.status(201).json({ suggestion: shapeSuggestion(data) });
};

export const decideSuggestion = async (req: AuthRequest, res: Response) => {
  const access = await getAccess(req.params.id, req.auth!.userId);
  if (!access) return res.status(404).json({ message: "Document not found" });
  if (!['owner', 'editor'].includes(access.role)) return res.status(403).json({ message: "Only owners and editors can decide suggestions" });
  const status = String(req.body.status || "");
  if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ message: "Decision must be accepted or rejected" });
  const { data } = await supabase.from("document_suggestions").update({ status, decided_by: req.auth!.userId, decided_at: new Date().toISOString() }).eq("id", req.params.suggestionId).eq("document_id", req.params.id).eq("status", "open").select("*").single();
  if (!data) return res.status(409).json({ message: "Suggestion is missing or already decided" });
  await trackDocumentEvent({ documentId: req.params.id, actorId: req.auth!.userId, eventType: "document_suggestion_decided", metadata: { suggestionId: data.id, status } });
  return res.json({ suggestion: shapeSuggestion(data) });
};

const icsEscape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const icsDate = (value: string | Date) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
export const exportCalendar = async (req: AuthRequest, res: Response) => {
  const userId = req.auth!.userId;
  const { data: owned } = await supabase.from("documents").select("id, title").eq("owner_id", userId).is("deleted_at", null);
  const { data: shared } = await supabase.from("document_collaborators").select("documents(id, title, deleted_at)").eq("user_id", userId);
  const docs = new Map<string, string>();
  (owned || []).forEach((doc: any) => docs.set(doc.id, doc.title));
  (shared || []).forEach((row: any) => { const doc = row.documents; if (doc && !doc.deleted_at) docs.set(doc.id, doc.title); });
  const ids = [...docs.keys()];
  const { data: deadlines } = ids.length ? await supabase.from("document_deadlines").select("*").in("document_id", ids).eq("status", "open").order("due_at") : { data: [] as any[] };
  const base = String(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");
  const events = (deadlines || []).map((item: any) => ["BEGIN:VEVENT", `UID:${item.id}@editorial`, `DTSTAMP:${icsDate(item.updated_at)}`, `DTSTART:${icsDate(item.due_at)}`, `SUMMARY:${icsEscape(item.title)} — ${icsEscape(docs.get(item.document_id) || "Document")}`, `DESCRIPTION:${icsEscape(item.description || "")}`, `URL:${base}/editor/${item.document_id}`, "END:VEVENT"].join("\r\n"));
  const calendar = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Editorial//Deadlines//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...events, "END:VCALENDAR", ""].join("\r\n");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=editorial-deadlines.ics");
  return res.send(calendar);
};
