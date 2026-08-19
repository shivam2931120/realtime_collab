import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { isNvidiaConfigured, runWritingAssistant, type WritingAction } from "../utils/nvidiaAi";

const actions = new Set<WritingAction>(["summarize", "rewrite", "grammar", "tone", "outline", "actions"]);

export const writingAssistant = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isNvidiaConfigured()) return res.status(503).json({ message: "AI assistant is not configured" });

    const documentId = String(req.params.id || "");
    const { data: document } = await supabase
      .from("documents")
      .select("id,title,content,owner_id,deleted_at,document_collaborators(user_id,role)")
      .eq("id", documentId)
      .single();
    const allowed = document && !document.deleted_at && (
      document.owner_id === req.auth.userId ||
      document.document_collaborators?.some((item: any) => item.user_id === req.auth?.userId)
    );
    if (!allowed) return res.status(404).json({ message: "Document not found" });

    const action = String(req.body.action || "") as WritingAction;
    if (!actions.has(action)) return res.status(400).json({ message: "Unsupported writing action" });
    const text = String(req.body.text || "").trim();
    if (!text || text.length > 20_000) return res.status(400).json({ message: "Text must be between 1 and 20,000 characters" });

    const result = await runWritingAssistant({
      action,
      text,
      tone: String(req.body.tone || "").slice(0, 80),
      context: `${document.title}\n${String(document.content || "").replace(/<[^>]+>/g, " ")}`,
    });
    return res.json({ result: result.content, model: result.model, action });
  } catch (error) {
    console.error("Writing assistant failed", error instanceof Error ? error.message : error);
    return res.status(502).json({ message: "The writing assistant is temporarily unavailable" });
  }
};
