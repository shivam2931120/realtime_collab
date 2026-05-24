import express from "express";
import {
  bulkUpdateDocuments,
  cancelInvite,
  createDocument,
  deleteDocument,
  getDocumentActivity,
  getDocumentById,
  getDocuments,
  getTrashDocuments,
  getInviteManagement,
  getWorkspaceActivityOverview,
  permanentlyDeleteDocument,
  resendInvite,
  restoreDocument,
  transferDocumentOwnership,
  updateDocument,
  getAccessOverview,
} from "../controllers/docController";
import { createComment, deleteComment, getComments, updateCommentResolution } from "../controllers/commentController";
import { createFolder, getFolders, deleteFolder, updateFolder } from "../controllers/folderController";
import { createVersion, getVersionDiff, getVersions, restoreVersion } from "../controllers/versionController";
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
router.put("/folders/:folderId", protect, updateFolder);
router.delete("/folders/:folderId", protect, deleteFolder);

router.get("/search", protect, searchDocuments);
router.get("/tags", protect, getPopularTags);

router.get("/templates", protect, listTemplates);
router.post("/templates", protect, createTemplate);
router.post("/templates/:templateId/apply", protect, applyTemplate);

router.post("/import", protect, importDocument);
router.get("/analytics", protect, getAnalytics);
router.get("/access/overview", protect, getAccessOverview);
router.get("/activity/overview", protect, getWorkspaceActivityOverview);
router.get("/invites", protect, getInviteManagement);
router.get("/trash", protect, getTrashDocuments);
router.post("/bulk", protect, bulkUpdateDocuments);

router.post("/", protect, createDocument);
router.get("/", protect, getDocuments);
router.get("/:id/export", protect, exportDocument);
router.get("/:id/tags", protect, getDocumentTags);
router.put("/:id/tags", protect, updateDocumentTags);
router.get("/:id/activity", protect, getDocumentActivity);
router.get("/:id", protect, getDocumentById);
router.put("/:id", protect, updateDocument);
router.delete("/:id", protect, deleteDocument);
router.post("/:id/restore", protect, restoreDocument);
router.delete("/:id/permanent", protect, permanentlyDeleteDocument);
router.post("/:id/transfer-owner", protect, transferDocumentOwnership);
router.post("/:id/invites/:userId/resend", protect, resendInvite);
router.delete("/:id/invites/:userId", protect, cancelInvite);

router.get("/:id/comments", protect, getComments);
router.post("/:id/comments", protect, createComment);
router.put("/:id/comments/:commentId", protect, updateCommentResolution);
router.delete("/:id/comments/:commentId", protect, deleteComment);

router.post("/:id/versions", protect, createVersion);
router.get("/:id/versions", protect, getVersions);
router.get("/:id/versions/:versionId/diff", protect, getVersionDiff);
router.post("/:id/versions/:versionId/restore", protect, restoreVersion);

export default router;
