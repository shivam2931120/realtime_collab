import express from "express";
import {
  createDocument,
  deleteDocument,
  getDocumentById,
  getDocuments,
  updateDocument,
} from "../controllers/docController";
import { createComment, getComments } from "../controllers/commentController";
import { createFolder, getFolders, deleteFolder } from "../controllers/folderController";
import { createVersion, getVersions } from "../controllers/versionController";
import {
  applyTemplate,
  createTemplate,
  exportDocument,
  getAnalytics,
  getDocumentTags,
  getPopularTags,
  importDocument,
  listTemplates,
  searchDocuments,
  updateDocumentTags,
} from "../controllers/discoveryController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

router.post("/folders", protect, createFolder);
router.get("/folders", protect, getFolders);
router.delete("/folders/:folderId", protect, deleteFolder);

router.get("/search", protect, searchDocuments);
router.get("/tags", protect, getPopularTags);

router.get("/templates", protect, listTemplates);
router.post("/templates", protect, createTemplate);
router.post("/templates/:templateId/apply", protect, applyTemplate);

router.post("/import", protect, importDocument);
router.get("/analytics", protect, getAnalytics);

router.post("/", protect, createDocument);
router.get("/", protect, getDocuments);
router.get("/:id/export", protect, exportDocument);
router.get("/:id/tags", protect, getDocumentTags);
router.put("/:id/tags", protect, updateDocumentTags);
router.get("/:id", protect, getDocumentById);
router.put("/:id", protect, updateDocument);
router.delete("/:id", protect, deleteDocument);

router.get("/:id/comments", protect, getComments);
router.post("/:id/comments", protect, createComment);

router.post("/:id/versions", protect, createVersion);
router.get("/:id/versions", protect, getVersions);

export default router;
