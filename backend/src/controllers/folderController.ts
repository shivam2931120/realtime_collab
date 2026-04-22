import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";

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
