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
  getPermissionAudit,
  createPublicDocumentLink,
  getPublicDocument,
  listPublicDocumentLinks,
  revokePublicDocumentLink,
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
import { writingAssistant } from "../controllers/aiController";
import { deleteAttachment, listAttachments, uploadAttachment } from "../controllers/attachmentController";
import { createDeadline, createSuggestion, decideSuggestion, deleteDeadline, listDeadlines, listSuggestions, updateDeadline } from "../controllers/workflowController";

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
router.get("/access/audit", protect, getPermissionAudit);
router.get("/activity/overview", protect, getWorkspaceActivityOverview);
router.get("/invites", protect, getInviteManagement);
router.get("/trash", protect, getTrashDocuments);
router.post("/bulk", protect, bulkUpdateDocuments);
router.get("/public/:token", getPublicDocument);

router.post("/", protect, createDocument);
router.get("/", protect, getDocuments);
router.get("/:id/export", protect, exportDocument);
router.get("/:id/attachments", protect, listAttachments);
router.post("/:id/attachments", protect, uploadAttachment);
router.delete("/:id/attachments/:attachmentId", protect, deleteAttachment);
router.get("/:id/deadlines", protect, listDeadlines);
router.post("/:id/deadlines", protect, createDeadline);
router.put("/:id/deadlines/:deadlineId", protect, updateDeadline);
router.delete("/:id/deadlines/:deadlineId", protect, deleteDeadline);
router.get("/:id/suggestions", protect, listSuggestions);
router.post("/:id/suggestions", protect, createSuggestion);
router.put("/:id/suggestions/:suggestionId/decision", protect, decideSuggestion);
router.get("/:id/tags", protect, getDocumentTags);
router.put("/:id/tags", protect, updateDocumentTags);
router.get("/:id/activity", protect, getDocumentActivity);
router.post("/:id/ai/write", protect, writingAssistant);
router.get("/:id", protect, getDocumentById);
router.put("/:id", protect, updateDocument);
router.delete("/:id", protect, deleteDocument);
router.post("/:id/restore", protect, restoreDocument);
router.delete("/:id/permanent", protect, permanentlyDeleteDocument);
router.post("/:id/transfer-owner", protect, transferDocumentOwnership);
router.post("/:id/invites/:userId/resend", protect, resendInvite);
router.delete("/:id/invites/:userId", protect, cancelInvite);
router.get("/:id/public-links", protect, listPublicDocumentLinks);
router.post("/:id/public-links", protect, createPublicDocumentLink);
router.delete("/:id/public-links/:linkId", protect, revokePublicDocumentLink);

router.get("/:id/comments", protect, getComments);
router.post("/:id/comments", protect, createComment);
router.put("/:id/comments/:commentId", protect, updateCommentResolution);
router.delete("/:id/comments/:commentId", protect, deleteComment);

router.post("/:id/versions", protect, createVersion);
router.get("/:id/versions", protect, getVersions);
router.get("/:id/versions/:versionId/diff", protect, getVersionDiff);
router.post("/:id/versions/:versionId/restore", protect, restoreVersion);

export default router;
