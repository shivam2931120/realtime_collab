import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { isMissingTableError } from "../utils/dbErrors";

export const createFolder = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Folder name required" });
    const parentId = req.body.parent_id || null;

    const { data: folder, error } = await supabase
      .from("folders")
      .insert({ name, owner_id: userId, parent_id: parentId })
      .select("*")
      .single();

    if (error || !folder) throw error;

    return res.status(201).json({ folder });
  } catch (error) {
    console.error("Create folder failed", error);
    return res.status(500).json({ message: "Folder create failed" });
  }
};

export const getFolders = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const { data: folders, error } = await supabase
      .from("folders")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ folders: folders || [] });
  } catch (error) {
    console.error("Fetch folders failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql in Supabase before using folders.",
      });
    }
    return res.status(500).json({ message: "Folders load failed" });
  }
};

export const deleteFolder = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const folderId = req.params.folderId;
    
    // Ensure ownership
    const { data: existing } = await supabase.from("folders").select("owner_id").eq("id", folderId).single();
    if (!existing || existing.owner_id !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { error } = await supabase.from("folders").delete().eq("id", folderId);
    if (error) throw error;

    return res.json({ message: "Folder deleted" });
  } catch (error) {
    console.error("Delete folder failed", error);
    return res.status(500).json({ message: "Folder delete failed" });
  }
};

export const updateFolder = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const folderId = req.params.folderId;
    const { data: existing } = await supabase
      .from("folders")
      .select("id, owner_id")
      .eq("id", folderId)
      .single();

    if (!existing || existing.owner_id !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof req.body.name === "string") {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ message: "Folder name required" });
      updates.name = name;
    }

    if (req.body.parent_id !== undefined) {
      const parentId = req.body.parent_id || null;
      if (parentId === folderId) {
        return res.status(400).json({ message: "Folder cannot be moved into itself" });
      }

      if (parentId) {
        const { data: parent } = await supabase
          .from("folders")
          .select("id, owner_id")
          .eq("id", parentId)
          .single();
        if (!parent || parent.owner_id !== userId) {
          return res.status(400).json({ message: "Target folder not found" });
        }
      }

      updates.parent_id = parentId;
    }

    const { data: folder, error } = await supabase
      .from("folders")
      .update(updates)
      .eq("id", folderId)
      .select("*")
      .single();

    if (error || !folder) throw error;

    return res.json({ folder });
  } catch (error) {
    console.error("Update folder failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql in Supabase before using folders.",
      });
    }
    return res.status(500).json({ message: "Folder update failed" });
  }
};
