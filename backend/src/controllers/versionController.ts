import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { isMissingTableError } from "../utils/dbErrors";

export const createVersion = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const documentId = req.params.id;
    
    // Get current doc content
    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (!doc) return res.status(404).json({ message: "Document not found" });

    // Ensure access to document
    if (doc.owner_id !== userId) {
      const { data: collab } = await supabase
        .from("document_collaborators")
        .select("role")
        .eq("document_id", documentId)
        .eq("user_id", userId)
        .single();
      
      if (!collab || collab.role === "viewer") {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const { data: version, error } = await supabase
      .from("document_versions")
      .insert({ document_id: documentId, content: doc.content, created_by: userId })
      .select("*")
      .single();

    if (error || !version) throw error;

    return res.status(201).json({ version });
  } catch (error) {
    console.error("Create version failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using versions.",
      });
    }
    return res.status(500).json({ message: "Version snapshot create failed" });
  }
};

export const getVersions = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const documentId = req.params.id;

    // Check access
    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (!doc) return res.status(404).json({ message: "Document not found" });

    if (doc.owner_id !== userId) {
      const { data: collab } = await supabase
        .from("document_collaborators")
        .select("role")
        .eq("document_id", documentId)
        .eq("user_id", userId)
        .single();

      if (!collab) return res.status(403).json({ message: "Forbidden" });
    }

    const { data: versions, error } = await supabase
      .from("document_versions")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ versions: versions || [] });
  } catch (error) {
    console.error("Fetch versions failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using versions.",
      });
    }
    return res.status(500).json({ message: "Versions load failed" });
  }
};
