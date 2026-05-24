import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { isMissingTableError } from "../utils/dbErrors";
import { restoreDocumentVersion } from "../utils/documentVersions";
import { emailFromUserId } from "../utils/userIdentity";

const stripContent = (content: string) =>
  String(content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const countWords = (value: string) => stripContent(value).split(/\s+/).filter(Boolean).length;

type CollaboratorRole = "editor" | "commenter" | "viewer";
type DocumentRole = "owner" | CollaboratorRole;

const normalizeRole = (role: unknown): CollaboratorRole => {
  if (role === "viewer") return "viewer";
  if (role === "commenter") return "commenter";
  return "editor";
};

const canMutateVersions = (role: DocumentRole | null) => role === "owner" || role === "editor";

const shapeVersion = (version: any) => {
  const plainText = stripContent(version.content || "");

  return {
    id: version.id,
    content: version.content || "",
    createdAt: version.created_at,
    created_at: version.created_at,
    createdBy: {
      id: version.created_by,
      email: emailFromUserId(version.created_by),
    },
    wordCount: countWords(version.content || ""),
    characterCount: plainText.length,
    preview: plainText.slice(0, 240),
  };
};

const getDocumentAccess = async (documentId: string, userId: string) => {
  const { data: doc } = await supabase
    .from("documents")
    .select("*, document_collaborators(*)")
    .eq("id", documentId)
    .single();

  if (!doc || doc.deleted_at) return { doc: null, role: null as null | DocumentRole };
  if (doc.owner_id === userId) return { doc, role: "owner" as const };

  const collaborator = doc.document_collaborators?.find((item: any) => item.user_id === userId);
  if (!collaborator) return { doc, role: null };

  return {
    doc,
    role: normalizeRole(collaborator.role),
  };
};

export const createVersion = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const documentId = req.params.id;
    
    const { doc, role } = await getDocumentAccess(documentId, userId);

    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (!canMutateVersions(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { data: version, error } = await supabase
      .from("document_versions")
      .insert({ document_id: documentId, content: doc.content, created_by: userId })
      .select("*")
      .single();

    if (error || !version) throw error;

    return res.status(201).json({ version: shapeVersion(version) });
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

    const { doc, role } = await getDocumentAccess(documentId, userId);

    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (!role) return res.status(403).json({ message: "Forbidden" });

    const { data: versions, error } = await supabase
      .from("document_versions")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ versions: (versions || []).map(shapeVersion) });
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

export const restoreVersion = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const documentId = req.params.id;
    const versionId = req.params.versionId;

    const { doc, role } = await getDocumentAccess(documentId, userId);

    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (!canMutateVersions(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { restored, error } = await restoreDocumentVersion({ documentId, versionId, userId });
    if (error || !restored) {
      return res.status(404).json({ message: "Version not found" });
    }

    return res.json({
      document: {
        ...doc,
        content: restored.content,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Restore version failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using versions.",
      });
    }
    return res.status(500).json({ message: "Version restore failed" });
  }
};

export const getVersionDiff = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const documentId = req.params.id;
    const versionId = req.params.versionId;
    const { doc, role } = await getDocumentAccess(documentId, auth.userId);

    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (!role) return res.status(403).json({ message: "Forbidden" });

    const { data: version, error } = await supabase
      .from("document_versions")
      .select("*")
      .eq("id", versionId)
      .eq("document_id", documentId)
      .single();

    if (error || !version) {
      return res.status(404).json({ message: "Version not found" });
    }

    const currentText = stripContent(doc.content || "");
    const versionText = stripContent(version.content || "");
    const currentWords = currentText.split(/\s+/).filter(Boolean);
    const versionWords = versionText.split(/\s+/).filter(Boolean);
    const currentSet = new Set(currentWords.map((word) => word.toLowerCase()));
    const versionSet = new Set(versionWords.map((word) => word.toLowerCase()));
    const addedWords = currentWords.filter((word) => !versionSet.has(word.toLowerCase())).slice(0, 80);
    const removedWords = versionWords.filter((word) => !currentSet.has(word.toLowerCase())).slice(0, 80);

    return res.json({
      versionId,
      version: shapeVersion(version),
      current: {
        wordCount: currentWords.length,
        characterCount: currentText.length,
        preview: currentText.slice(0, 240),
      },
      wordDelta: currentWords.length - versionWords.length,
      characterDelta: currentText.length - versionText.length,
      delta: {
        words: currentWords.length - versionWords.length,
        characters: currentText.length - versionText.length,
      },
      addedPreview: addedWords.join(" "),
      removedPreview: removedWords.join(" "),
    });
  } catch (error) {
    console.error("Version diff failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using versions.",
      });
    }
    return res.status(500).json({ message: "Version diff failed" });
  }
};
