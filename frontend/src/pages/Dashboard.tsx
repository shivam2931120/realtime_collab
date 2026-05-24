import axios from "axios";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "@mui/material/Button";
import WorkspaceLayout from "../components/WorkspaceLayout";
import api from "../services/api";
import { DocItem, FolderItem, useDocStore } from "../store/docStore";
import { usePreferencesStore } from "../store/preferencesStore";

const stripContent = (content: string) =>
  content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const tagHue = (tag: string) =>
  Array.from(tag).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;

const HighlightText = ({ value, query }: { value: string; query: string }) => {
  if (!query.trim()) {
    return <>{value}</>;
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = value.split(new RegExp(`(${escaped})`, "ig"));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="rounded bg-primary/25 px-0.5 text-primary">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
};

const roleBadgeClass = (role: DocItem["role"]) =>
  role === "owner"
    ? "bg-primary-container text-on-primary-container"
    : role === "editor"
      ? "bg-primary/15 text-primary"
      : role === "commenter"
        ? "bg-secondary/15 text-secondary"
        : "bg-white/10 text-on-surface-variant";

const canOrganizeDocument = (role: DocItem["role"]) => role === "owner" || role === "editor";

type ConfirmState =
  | { type: "doc"; id: string; title: string }
  | { type: "folder"; id: string; name: string }
  | null;
type RoleFilter = "all" | DocItem["role"];
type QuickFilter = "all" | "starred" | "pinned";
type SortMode = "updated" | "oldest" | "title" | "owner";
type ViewMode = "grid" | "list";
type BulkAction = "move" | "tag" | "share" | "delete";

type ActivityOverview = {
  recentlyEdited: DocItem[];
  recentlyShared: Array<{
    id: string;
    documentId: string;
    title: string;
    actor: { id: string; email: string };
    createdAt: string;
  }>;
  openComments: Array<{
    id: string;
    documentId: string;
    title: string;
    body: string;
    author: { id: string; email: string };
    createdAt: string;
  }>;
  pendingInvites: InviteItem[];
};

type InviteItem = {
  documentId: string;
  title: string;
  userId: string;
  email: string;
  role: "editor" | "commenter" | "viewer";
  invitationStatus: "pending" | "accepted" | "cancelled";
  lastInviteSentAt?: string | null;
  inviteEmailStatus?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type FolderNode = FolderItem & {
  children: FolderNode[];
};

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : "Not sent");

const DashboardPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const docs = useDocStore((state) => state.docs);
  const setDocs = useDocStore((state) => state.setDocs);
  const upsertDoc = useDocStore((state) => state.upsertDoc);
  const removeDoc = useDocStore((state) => state.removeDoc);
  const folders = useDocStore((state) => state.folders);
  const setFolders = useDocStore((state) => state.setFolders);
  const upsertFolder = useDocStore((state) => state.upsertFolder);
  const removeFolder = useDocStore((state) => state.removeFolder);
  const documentPreferences = usePreferencesStore((state) => state.documentPreferences);
  const folderPreferences = usePreferencesStore((state) => state.folderPreferences);
  const toggleStarred = usePreferencesStore((state) => state.toggleStarred);
  const togglePinned = usePreferencesStore((state) => state.togglePinned);
  const toggleFolderFavorite = usePreferencesStore((state) => state.toggleFolderFavorite);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [shareEmails, setShareEmails] = useState("");
  const [shareRole, setShareRole] = useState<"editor" | "commenter" | "viewer">("editor");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState<ConfirmState>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashDocs, setTrashDocs] = useState<DocItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashBusyId, setTrashBusyId] = useState("");
  const [trashError, setTrashError] = useState("");
  const [activityOverview, setActivityOverview] = useState<ActivityOverview | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [inviteBusyKey, setInviteBusyKey] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("move");
  const [bulkFolderId, setBulkFolderId] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [bulkShareEmails, setBulkShareEmails] = useState("");
  const [bulkShareRole, setBulkShareRole] = useState<"editor" | "commenter" | "viewer">("viewer");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");

  const fetchData = async () => {
    try {
      setLoading(true);
      const [docsResponse, foldersResponse] = await Promise.all([
        api.get<{ documents: DocItem[] }>("/docs"),
        api.get<{ folders: FolderItem[] }>("/docs/folders"),
      ]);
      setDocs(docsResponse.data.documents);
      setFolders(foldersResponse.data.folders);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Data load nahi hue");
      } else {
        setError("Data load nahi hue");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadProductivity = async () => {
    setActivityLoading(true);

    try {
      const [activityResponse, invitesResponse] = await Promise.all([
        api.get<ActivityOverview>("/docs/activity/overview"),
        api.get<{ invites: InviteItem[] }>("/docs/invites"),
      ]);
      setActivityOverview(activityResponse.data);
      setInvites(invitesResponse.data.invites || []);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Productivity data load nahi hua");
      } else {
        setError("Productivity data load nahi hua");
      }
    } finally {
      setActivityLoading(false);
    }
  };

  const loadTrash = async () => {
    setTrashLoading(true);
    setTrashError("");

    try {
      const response = await api.get<{ documents: DocItem[] }>("/docs/trash");
      setTrashDocs(response.data.documents || []);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setTrashError(requestError.response?.data?.message || "Trash load nahi hua");
      } else {
        setTrashError("Trash load nahi hua");
      }
    } finally {
      setTrashLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    loadProductivity().catch(console.error);
  }, []);

  useEffect(() => {
    if (searchParams.get("trash") !== "1") {
      return;
    }

    setTrashOpen(true);
    loadTrash().catch(console.error);
  }, [searchParams]);

  const openTrash = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("trash", "1");
    setSearchParams(nextParams, { replace: true });
    setTrashOpen(true);
    loadTrash().catch(console.error);
  };

  const closeTrash = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("trash");
    setSearchParams(nextParams, { replace: true });
    setTrashOpen(false);
    setTrashError("");
  };

  const restoreTrashDocument = async (document: DocItem) => {
    setTrashBusyId(document.id);
    setTrashError("");

    try {
      const response = await api.post<{ document: DocItem }>(`/docs/${document.id}/restore`);
      upsertDoc(response.data.document);
      setTrashDocs((current) => current.filter((item) => item.id !== document.id));
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setTrashError(requestError.response?.data?.message || "Restore failed");
      } else {
        setTrashError("Restore failed");
      }
    } finally {
      setTrashBusyId("");
    }
  };

  const permanentlyDeleteTrashDocument = async (document: DocItem) => {
    if (!window.confirm(`Permanently delete "${document.title}"?`)) {
      return;
    }

    setTrashBusyId(document.id);
    setTrashError("");

    try {
      await api.delete(`/docs/${document.id}/permanent`);
      setTrashDocs((current) => current.filter((item) => item.id !== document.id));
      removeDoc(document.id);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setTrashError(requestError.response?.data?.message || "Permanent delete failed");
      } else {
        setTrashError("Permanent delete failed");
      }
    } finally {
      setTrashBusyId("");
    }
  };

  const filteredDocs = useMemo(() => {
    const query = searchParams.get("q")?.trim().toLowerCase() || "";
    let baseDocs = query ? docs : docs.filter((d) => (d.folderId || null) === currentFolderId);

    return baseDocs
      .filter((doc) => {
        const matchesQuery =
          !query ||
          doc.title.toLowerCase().includes(query) ||
          doc.owner.email.toLowerCase().includes(query) ||
          stripContent(doc.content).toLowerCase().includes(query) ||
          (doc.tags || []).some((tag) => tag.toLowerCase().includes(query));

        const matchesRole = roleFilter === "all" || doc.role === roleFilter;
        const matchesTag = tagFilter === "all" || (doc.tags || []).includes(tagFilter);
        const matchesQuick =
          quickFilter === "all" ||
          (quickFilter === "starred" && documentPreferences[doc.id]?.starred) ||
          (quickFilter === "pinned" && documentPreferences[doc.id]?.pinned);

        return matchesQuery && matchesRole && matchesTag && matchesQuick;
      })
      .sort((first, second) => {
        const firstPinned = documentPreferences[first.id]?.pinned ? 1 : 0;
        const secondPinned = documentPreferences[second.id]?.pinned ? 1 : 0;
        if (firstPinned !== secondPinned) return secondPinned - firstPinned;
        if (sortMode === "oldest") {
          return new Date(first.updatedAt).getTime() - new Date(second.updatedAt).getTime();
        }
        if (sortMode === "title") {
          return first.title.localeCompare(second.title);
        }
        if (sortMode === "owner") {
          return first.owner.email.localeCompare(second.owner.email);
        }
        return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
      });
  }, [currentFolderId, docs, documentPreferences, quickFilter, roleFilter, searchParams, sortMode, tagFilter]);

  const filteredFolders = useMemo(() => {
    const query = searchParams.get("q")?.trim().toLowerCase() || "";
    if (query) return [];
    return folders.filter((f) => f.parent_id === currentFolderId);
  }, [folders, searchParams, currentFolderId]);

  const currentFolder = folders.find((f) => f.id === currentFolderId);
  const folderBreadcrumbs = useMemo(() => {
    const chain: FolderItem[] = [];
    let cursor = currentFolder;
    const visited = new Set<string>();

    while (cursor && !visited.has(cursor.id)) {
      chain.unshift(cursor);
      visited.add(cursor.id);
      cursor = folders.find((folder) => folder.id === cursor?.parent_id);
    }

    return chain;
  }, [currentFolder, folders]);
  const folderTree = useMemo(() => {
    const nodes = new Map<string, FolderNode>();
    folders.forEach((folder) => nodes.set(folder.id, { ...folder, children: [] }));

    const roots: FolderNode[] = [];
    nodes.forEach((node) => {
      if (node.parent_id && nodes.has(node.parent_id)) {
        nodes.get(node.parent_id)?.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (items: FolderNode[]) => {
      items.sort((first, second) => first.name.localeCompare(second.name));
      items.forEach((item) => sortNodes(item.children));
      return items;
    };

    return sortNodes(roots);
  }, [folders]);
  const favoriteFolders = useMemo(
    () => folders.filter((folder) => folderPreferences[folder.id]?.favorite).sort((first, second) => first.name.localeCompare(second.name)),
    [folderPreferences, folders],
  );
  const isFolderDescendant = (folderId: string, possibleDescendantId: string | null) => {
    const visited = new Set<string>();
    let cursor = possibleDescendantId;

    while (cursor && !visited.has(cursor)) {
      if (cursor === folderId) return true;
      visited.add(cursor);
      cursor = folders.find((folder) => folder.id === cursor)?.parent_id || null;
    }

    return false;
  };
  const activeQuery = searchParams.get("q")?.trim() || "";
  const allTags = useMemo(
    () => Array.from(new Set(docs.flatMap((doc) => doc.tags || []))).sort((first, second) => first.localeCompare(second)),
    [docs],
  );
  const workspaceStats = useMemo(
    () => ({
      documents: docs.length,
      owned: docs.filter((doc) => doc.role === "owner").length,
      shared: docs.filter((doc) => doc.role !== "owner").length,
      collaborators: new Set(docs.flatMap((doc) => doc.collaborators.map((item) => item.email))).size,
    }),
    [docs],
  );
  const selectedDocs = useMemo(
    () => docs.filter((doc) => selectedDocIds.includes(doc.id)),
    [docs, selectedDocIds],
  );
  const selectedAllVisible = filteredDocs.length > 0 && filteredDocs.every((doc) => selectedDocIds.includes(doc.id));

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const collaborators = shareEmails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean)
        .map((email) => ({ email, role: shareRole }));

      const response = await api.post<{ document: DocItem }>("/docs", {
        title,
        collaborators,
        folder_id: currentFolderId,
      });

      upsertDoc(response.data.document);
      setTitle("");
      setShareEmails("");
      setIsCreateOpen(false);
      navigate(`/editor/${response.data.document.id}`);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Document create nahi hua");
      } else {
        setError("Document create nahi hua");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await api.post<{ folder: FolderItem }>("/docs/folders", {
        name: folderName,
        parent_id: currentFolderId,
      });
      upsertFolder(response.data.folder);
      setFolderName("");
      setIsCreateFolderOpen(false);
    } catch {
      setError("Folder create nahi hua");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError("");

    try {
      if (confirmDelete.type === "doc") {
        await api.delete(`/docs/${confirmDelete.id}`);
        removeDoc(confirmDelete.id);
      } else {
        await api.delete(`/docs/folders/${confirmDelete.id}`);
        removeFolder(confirmDelete.id);
      }
      setConfirmDelete(null);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setDeleteError(err.response?.data?.message || "Delete nahi hua");
      } else {
        setDeleteError("Delete nahi hua");
      }
    } finally {
      setDeleting(false);
    }
  };

  const moveDocumentToFolder = async (documentId: string, folderId: string | null) => {
    const document = docs.find((item) => item.id === documentId);
    if (!document || (document.folderId || null) === folderId || !canOrganizeDocument(document.role)) {
      return;
    }

    const response = await api.put<{ document: DocItem }>(`/docs/${documentId}`, {
      folder_id: folderId,
    });
    upsertDoc(response.data.document);
  };

  const moveFolderToFolder = async (folderId: string, parentId: string | null) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder || folder.id === parentId || folder.parent_id === parentId || isFolderDescendant(folderId, parentId)) {
      return;
    }

    const response = await api.put<{ folder: FolderItem }>(`/docs/folders/${folderId}`, {
      parent_id: parentId,
    });
    upsertFolder(response.data.folder);
  };

  const handleDropIntoFolder = async (folderId: string | null) => {
    try {
      if (draggingDocId) {
        await moveDocumentToFolder(draggingDocId, folderId);
      }
      if (draggingFolderId) {
        await moveFolderToFolder(draggingFolderId, folderId);
      }
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Move failed");
      } else {
        setError("Move failed");
      }
    } finally {
      setDraggingDocId(null);
      setDraggingFolderId(null);
      setDropTargetId(null);
    }
  };

  const toggleDocumentSelected = (documentId: string) => {
    setSelectedDocIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  };

  const toggleAllVisible = () => {
    setSelectedDocIds((current) => {
      const visibleIds = filteredDocs.map((doc) => doc.id);
      if (visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return [...new Set([...current, ...visibleIds])];
    });
  };

  const applyBulkAction = async () => {
    if (!selectedDocIds.length) return;

    if (bulkAction === "delete" && !window.confirm(`Move ${selectedDocIds.length} selected documents to trash?`)) {
      return;
    }

    setBulkBusy(true);
    setBulkNotice("");
    setError("");

    try {
      const payload: Record<string, unknown> = {
        action: bulkAction,
        documentIds: selectedDocIds,
      };

      if (bulkAction === "move") {
        payload.folderId = bulkFolderId || null;
      }
      if (bulkAction === "tag") {
        payload.tags = bulkTags.split(",").map((tag) => tag.trim()).filter(Boolean);
      }
      if (bulkAction === "share") {
        payload.collaborators = bulkShareEmails
          .split(/[\n,;]+/)
          .map((email) => email.trim())
          .filter(Boolean)
          .map((email) => ({ email, role: bulkShareRole }));
      }

      const response = await api.post<{ processed: number; processedIds: string[]; skipped: number; documents: DocItem[] }>("/docs/bulk", payload);
      if (bulkAction === "delete") {
        response.data.processedIds.forEach((id) => removeDoc(id));
      } else {
        response.data.documents.forEach((document) => upsertDoc(document));
      }
      setBulkNotice(`${response.data.processed} updated${response.data.skipped ? `, ${response.data.skipped} skipped` : ""}.`);
      setSelectedDocIds([]);
      loadProductivity().catch(console.error);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Bulk action failed");
      } else {
        setError("Bulk action failed");
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const exportSelectedDocuments = () => {
    if (!selectedDocs.length) return;

    const exportText = selectedDocs
      .map((document) => `# ${document.title}\n\nOwner: ${document.owner.email}\nUpdated: ${new Date(document.updatedAt).toLocaleString()}\nTags: ${(document.tags || []).join(", ") || "none"}\n\n${stripContent(document.content) || "No content."}`)
      .join("\n\n---\n\n");
    const blob = new Blob([exportText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `editorial-selection-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const resendInvite = async (invite: InviteItem) => {
    const key = `${invite.documentId}-${invite.userId}`;
    setInviteBusyKey(key);
    setError("");

    try {
      await api.post(`/docs/${invite.documentId}/invites/${invite.userId}/resend`);
      await loadProductivity();
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Invite resend failed");
      } else {
        setError("Invite resend failed");
      }
    } finally {
      setInviteBusyKey("");
    }
  };

  const cancelInvite = async (invite: InviteItem) => {
    if (!window.confirm(`Cancel invite for ${invite.email}?`)) return;

    const key = `${invite.documentId}-${invite.userId}`;
    setInviteBusyKey(key);
    setError("");

    try {
      await api.delete(`/docs/${invite.documentId}/invites/${invite.userId}`);
      setInvites((current) => current.filter((item) => `${item.documentId}-${item.userId}` !== key));
      setActivityOverview((current) =>
        current
          ? {
              ...current,
              pendingInvites: current.pendingInvites.filter((item) => `${item.documentId}-${item.userId}` !== key),
            }
          : current,
      );
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Invite cancel failed");
      } else {
        setError("Invite cancel failed");
      }
    } finally {
      setInviteBusyKey("");
    }
  };

  const renderFolderTree = (nodes: FolderNode[], level = 0) =>
    nodes.flatMap((node) => {
      const active = currentFolderId === node.id;
      return [
        <div key={node.id} className="space-y-1">
          <div
            className={`flex items-center gap-1 rounded px-2 py-1.5 transition ${
              active ? "bg-primary/15 text-primary" : "text-on-surface-variant hover:bg-white/5 hover:text-white"
            }`}
            style={{ paddingLeft: `${8 + level * 12}px` }}
            onDragOver={(event) => {
              event.preventDefault();
              if (draggingDocId || (draggingFolderId && !isFolderDescendant(draggingFolderId, node.id))) {
                setDropTargetId(node.id);
              } else {
                setDropTargetId(null);
              }
            }}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={() => handleDropIntoFolder(node.id)}
          >
            <button
              type="button"
              onClick={() => setCurrentFolderId(node.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">{node.children.length ? "folder_open" : "folder"}</span>
              <span className="truncate">{node.name}</span>
            </button>
            <button
              type="button"
              onClick={() => toggleFolderFavorite(node.id)}
              className={`flex h-7 w-7 items-center justify-center rounded transition hover:bg-white/10 ${
                folderPreferences[node.id]?.favorite ? "text-secondary" : "text-on-surface-variant"
              }`}
              title={folderPreferences[node.id]?.favorite ? "Remove favorite" : "Favorite folder"}
            >
              <span className="material-symbols-outlined text-[16px]">star</span>
            </button>
          </div>
          {node.children.length ? <div>{renderFolderTree(node.children, level + 1)}</div> : null}
        </div>,
      ];
    });

  return (
    <WorkspaceLayout
      pageLabel="Editor Workspace"
      title="Recent Documents"
      actions={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={() => {
              fetchData();
              loadProductivity().catch(console.error);
            }}
            variant="outlined"
            color="success"
            size="small"
            className="w-full sm:w-auto"
            startIcon={<span className="material-symbols-outlined text-sm">refresh</span>}
          >
            Refresh
          </Button>
          <button type="button" onClick={openTrash} className="emerald-muted-button w-full sm:w-auto">
            <span className="material-symbols-outlined text-sm">delete</span>
            Trash
          </button>
          <button type="button" onClick={() => setIsCreateFolderOpen(true)} className="emerald-muted-button w-full sm:w-auto">
            <span className="material-symbols-outlined text-sm">create_new_folder</span>
            New Folder
          </button>
          <button type="button" onClick={() => setIsCreateOpen(true)} className="emerald-primary-button w-full sm:w-auto">
            <span className="material-symbols-outlined text-sm">add</span>
            New Entry
          </button>
        </div>
      }
    >
      {error ? <div className="mb-6 text-sm text-error">{error}</div> : null}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Documents", value: workspaceStats.documents, icon: "description" },
          { label: "Owned", value: workspaceStats.owned, icon: "shield_person" },
          { label: "Shared", value: workspaceStats.shared, icon: "group" },
          { label: "People", value: workspaceStats.collaborators, icon: "badge" },
        ].map((item) => (
          <div key={item.label} className="rounded border border-white/5 bg-surface-container p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{item.label}</p>
              <span className="material-symbols-outlined text-lg text-primary">{item.icon}</span>
            </div>
            <p className="mt-3 text-2xl font-extrabold tracking-tight text-white">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="mb-6 rounded border border-white/5 bg-surface-container p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Productivity</p>
            <h2 className="mt-1 text-xl font-bold text-white">Recent activity</h2>
          </div>
          <button
            type="button"
            onClick={() => loadProductivity().catch(console.error)}
            className="emerald-muted-button w-full sm:w-auto"
          >
            <span className="material-symbols-outlined text-sm">{activityLoading ? "hourglass_empty" : "refresh"}</span>
            Update
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          <div className="rounded border border-white/5 bg-surface p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Recently edited</p>
              <span className="material-symbols-outlined text-sm text-primary">edit_document</span>
            </div>
            <div className="space-y-2">
              {(activityOverview?.recentlyEdited || []).slice(0, 4).map((document) => (
                <button
                  key={`edited-${document.id}`}
                  type="button"
                  onClick={() => navigate(`/editor/${document.id}`)}
                  className="w-full rounded bg-surface-container-high px-3 py-2 text-left transition hover:bg-surface-container-highest"
                >
                  <p className="truncate text-sm font-semibold text-white">{document.title}</p>
                  <p className="mt-1 text-[10px] text-on-surface-variant">{new Date(document.updatedAt).toLocaleString()}</p>
                </button>
              ))}
              {!activityOverview?.recentlyEdited?.length ? <p className="text-sm text-on-surface-variant">No recent edits.</p> : null}
            </div>
          </div>
          <div className="rounded border border-white/5 bg-surface p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Recently shared</p>
              <span className="material-symbols-outlined text-sm text-primary">ios_share</span>
            </div>
            <div className="space-y-2">
              {(activityOverview?.recentlyShared || []).slice(0, 4).map((item) => (
                <button
                  key={`shared-${item.id}`}
                  type="button"
                  onClick={() => navigate(`/editor/${item.documentId}`)}
                  className="w-full rounded bg-surface-container-high px-3 py-2 text-left transition hover:bg-surface-container-highest"
                >
                  <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 truncate text-[10px] text-on-surface-variant">{item.actor.email}</p>
                </button>
              ))}
              {!activityOverview?.recentlyShared?.length ? <p className="text-sm text-on-surface-variant">No share activity.</p> : null}
            </div>
          </div>
          <div className="rounded border border-white/5 bg-surface p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Open comments</p>
              <span className="material-symbols-outlined text-sm text-primary">chat_bubble</span>
            </div>
            <div className="space-y-2">
              {(activityOverview?.openComments || []).slice(0, 4).map((comment) => (
                <button
                  key={`comment-${comment.id}`}
                  type="button"
                  onClick={() => navigate(`/editor/${comment.documentId}`)}
                  className="w-full rounded bg-surface-container-high px-3 py-2 text-left transition hover:bg-surface-container-highest"
                >
                  <p className="truncate text-sm font-semibold text-white">{comment.title}</p>
                  <p className="mt-1 line-clamp-1 text-[10px] text-on-surface-variant">{comment.body}</p>
                </button>
              ))}
              {!activityOverview?.openComments?.length ? <p className="text-sm text-on-surface-variant">No open comments.</p> : null}
            </div>
          </div>
          <div className="rounded border border-white/5 bg-surface p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Pending invites</p>
              <span className="material-symbols-outlined text-sm text-primary">forward_to_inbox</span>
            </div>
            <div className="space-y-2">
              {(activityOverview?.pendingInvites || []).slice(0, 4).map((invite) => (
                <div key={`pending-${invite.documentId}-${invite.userId}`} className="rounded bg-surface-container-high px-3 py-2">
                  <p className="truncate text-sm font-semibold text-white">{invite.title}</p>
                  <p className="mt-1 truncate text-[10px] text-on-surface-variant">{invite.email}</p>
                </div>
              ))}
              {!activityOverview?.pendingInvites?.length ? <p className="text-sm text-on-surface-variant">No pending invites.</p> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded border border-white/5 bg-surface-container p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Role</span>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              className="emerald-input h-10 py-0"
            >
              <option value="all">All access</option>
              <option value="owner">Owner</option>
              <option value="editor">Editor</option>
              <option value="commenter">Commenter</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Saved</span>
            <select
              value={quickFilter}
              onChange={(event) => setQuickFilter(event.target.value as QuickFilter)}
              className="emerald-input h-10 py-0"
            >
              <option value="all">All documents</option>
              <option value="starred">Favorites</option>
              <option value="pinned">Pinned</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Tag</span>
            <select
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              className="emerald-input h-10 py-0"
            >
              <option value="all">All tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Sort</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="emerald-input h-10 py-0"
            >
              <option value="updated">Recently updated</option>
              <option value="oldest">Oldest updated</option>
              <option value="title">Title A-Z</option>
              <option value="owner">Owner email</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1 rounded border border-white/5 bg-surface-container-low p-1 sm:col-span-2 xl:col-span-1 xl:self-end">
            {(["grid", "list"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`flex items-center justify-center gap-1 rounded px-2 py-2 text-[10px] font-bold uppercase tracking-widest transition ${
                  viewMode === mode ? "bg-primary/20 text-primary" : "text-on-surface-variant hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-sm">{mode === "grid" ? "grid_view" : "view_list"}</span>
                {mode}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <div className="rounded border border-white/5 bg-surface-container p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Folders</p>
              <h2 className="mt-1 text-lg font-bold text-white">Workspace tree</h2>
            </div>
            <button
              type="button"
              onClick={() => setCurrentFolderId(null)}
              className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                currentFolderId ? "text-on-surface-variant hover:bg-white/10 hover:text-white" : "bg-primary/15 text-primary"
              }`}
            >
              Root
            </button>
          </div>
          {favoriteFolders.length ? (
            <div className="mb-4 rounded border border-white/5 bg-surface p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Favorite folders</p>
              <div className="flex flex-wrap gap-2">
                {favoriteFolders.map((folder) => (
                  <button
                    key={`fav-${folder.id}`}
                    type="button"
                    onClick={() => setCurrentFolderId(folder.id)}
                    className="rounded bg-secondary/10 px-2 py-1 text-xs font-semibold text-secondary transition hover:bg-secondary/15"
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="max-h-72 overflow-y-auto pr-1">
            {folderTree.length ? renderFolderTree(folderTree) : <p className="text-sm text-on-surface-variant">No folders yet.</p>}
          </div>
        </div>

        <div className="rounded border border-white/5 bg-surface-container p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Invite management</p>
              <h2 className="mt-1 text-lg font-bold text-white">Access invites</h2>
            </div>
            <span className="text-xs text-on-surface-variant">{invites.length} active invites</span>
          </div>
          <div className="grid gap-2">
            {invites.slice(0, 6).map((invite) => {
              const key = `${invite.documentId}-${invite.userId}`;
              return (
                <div key={key} className="rounded border border-white/5 bg-surface p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{invite.title}</p>
                      <p className="mt-1 truncate text-xs text-on-surface-variant">{invite.email} · {invite.role}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-widest text-on-surface-variant">
                        {invite.invitationStatus} · {invite.inviteEmailStatus || "queued"} · {formatDateTime(invite.lastInviteSentAt)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <button
                        type="button"
                        onClick={() => resendInvite(invite).catch(console.error)}
                        disabled={inviteBusyKey === key}
                        className="emerald-muted-button justify-center px-3 py-2 text-xs"
                      >
                        <span className="material-symbols-outlined text-sm">forward_to_inbox</span>
                        Resend
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelInvite(invite).catch(console.error)}
                        disabled={inviteBusyKey === key}
                        className="flex items-center justify-center gap-2 rounded border border-error/20 bg-error-container/20 px-3 py-2 text-xs font-semibold text-error transition hover:bg-error-container/30 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-sm">person_remove</span>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!invites.length ? <p className="rounded bg-surface p-4 text-sm text-on-surface-variant">No active invites.</p> : null}
          </div>
        </div>
      </section>

      <section className="mb-6 rounded border border-white/5 bg-surface-container p-4">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleAllVisible}
              className="emerald-muted-button px-3 py-2 text-xs"
              disabled={!filteredDocs.length}
            >
              <span className="material-symbols-outlined text-sm">{selectedAllVisible ? "check_box" : "check_box_outline_blank"}</span>
              Select visible
            </button>
            <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              {selectedDocIds.length} selected
            </span>
            {bulkNotice ? <span className="text-xs font-semibold text-primary">{bulkNotice}</span> : null}
          </div>
          <button
            type="button"
            onClick={() => setSelectedDocIds([])}
            className="text-xs font-bold uppercase tracking-widest text-on-surface-variant transition hover:text-white"
            disabled={!selectedDocIds.length}
          >
            Clear
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[160px_1fr_auto_auto]">
          <select
            value={bulkAction}
            onChange={(event) => setBulkAction(event.target.value as BulkAction)}
            className="emerald-input h-10 py-0"
          >
            <option value="move">Move</option>
            <option value="tag">Tag</option>
            <option value="share">Share</option>
            <option value="delete">Delete</option>
          </select>
          {bulkAction === "move" ? (
            <select value={bulkFolderId} onChange={(event) => setBulkFolderId(event.target.value)} className="emerald-input h-10 py-0">
              <option value="">Workspace root</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
          ) : null}
          {bulkAction === "tag" ? (
            <input
              value={bulkTags}
              onChange={(event) => setBulkTags(event.target.value)}
              className="emerald-input h-10 py-0"
              placeholder="product, review, sprint"
            />
          ) : null}
          {bulkAction === "share" ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px]">
              <input
                value={bulkShareEmails}
                onChange={(event) => setBulkShareEmails(event.target.value)}
                className="emerald-input h-10 py-0"
                placeholder="alice@example.com, bob@example.com"
              />
              <select value={bulkShareRole} onChange={(event) => setBulkShareRole(event.target.value as "editor" | "commenter" | "viewer")} className="emerald-input h-10 py-0">
                <option value="viewer">Viewer</option>
                <option value="commenter">Commenter</option>
                <option value="editor">Editor</option>
              </select>
            </div>
          ) : null}
          {bulkAction === "delete" ? (
            <div className="rounded border border-error/20 bg-error-container/20 px-3 py-2 text-sm text-error">
              Move selected owner documents to trash.
            </div>
          ) : null}
          <button type="button" onClick={exportSelectedDocuments} disabled={!selectedDocIds.length} className="emerald-muted-button justify-center">
            <span className="material-symbols-outlined text-sm">download</span>
            Export
          </button>
          <button type="button" onClick={() => applyBulkAction().catch(console.error)} disabled={!selectedDocIds.length || bulkBusy} className="emerald-primary-button justify-center">
            <span className="material-symbols-outlined text-sm">{bulkBusy ? "hourglass_empty" : "done_all"}</span>
            Apply
          </button>
        </div>
      </section>

      {currentFolderId && (
        <div className="mb-6 rounded border border-white/5 bg-surface-container p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setCurrentFolderId(null)}
              className="rounded px-2 py-1 font-semibold text-primary transition hover:bg-primary/10"
            >
              Workspace
            </button>
            {folderBreadcrumbs.map((folder) => (
              <div key={`crumb-${folder.id}`} className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-on-surface-variant">chevron_right</span>
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(folder.id)}
                  className={`rounded px-2 py-1 font-semibold transition ${
                    folder.id === currentFolderId ? "bg-primary/15 text-primary" : "text-on-surface-variant hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(draggingDocId || draggingFolderId) && (
        <button
          type="button"
          onDragOver={(event) => {
            event.preventDefault();
            setDropTargetId("root");
          }}
          onDragLeave={() => setDropTargetId(null)}
          onDrop={() => handleDropIntoFolder(null)}
          className={`mb-6 flex w-full items-center justify-center gap-2 rounded border border-dashed px-4 py-3 text-sm font-semibold transition ${
            dropTargetId === "root"
              ? "border-primary bg-primary/10 text-primary"
              : "border-white/10 bg-surface-container-low text-on-surface-variant"
          }`}
        >
          <span className="material-symbols-outlined text-base">drive_file_move</span>
          Drop here to move to workspace root
        </button>
      )}

      <div className={viewMode === "grid" ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-1 gap-3"}>
        {/* Create new document button */}
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className={`group flex flex-col items-center justify-center rounded border border-dashed border-white/10 bg-surface-container-low transition hover:border-primary/50 ${
            viewMode === "grid" ? "min-h-[170px] sm:min-h-[220px] md:min-h-[264px]" : "min-h-[110px]"
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 transition group-hover:scale-110">
            <span className="material-symbols-outlined text-3xl text-primary">add_circle</span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-tight text-white">Create New Document</p>
          <p className="mt-1 text-[10px] text-[#a3a3a3]">Start from a clean slate</p>
        </button>

        {loading ? (
          <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant">
            Loading...
          </div>
        ) : filteredDocs.length === 0 && filteredFolders.length === 0 ? (
          <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant md:col-span-2 xl:col-span-2">
            No contents found in this area.
          </div>
        ) : (
          <>
            {/* Folder cards */}
            {filteredFolders.map((folder) => (
              <div
                key={folder.id}
                className="group relative"
                draggable
                onDragStart={() => {
                  setDraggingFolderId(folder.id);
                  setDraggingDocId(null);
                }}
                onDragEnd={() => {
                  setDraggingFolderId(null);
                  setDropTargetId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggingDocId || (draggingFolderId && draggingFolderId !== folder.id)) {
                    setDropTargetId(folder.id);
                  }
                }}
                onDragLeave={() => setDropTargetId(null)}
                onDrop={() => handleDropIntoFolder(folder.id)}
              >
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(folder.id)}
                  className={`w-full flex flex-col items-center justify-center rounded border bg-surface-container-high transition ${
                    viewMode === "grid" ? "py-8" : "py-5"
                  } ${
                    dropTargetId === folder.id ? "border-primary shadow-[0_0_0_1px_rgba(16,185,129,0.6)]" : "border-white/5 hover:border-primary/50"
                  }`}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-highest transition group-hover:scale-110">
                    <span className="material-symbols-outlined text-4xl text-[#a3a3a3]">folder</span>
                  </div>
                  <p className="mt-4 max-w-full break-words px-4 text-center text-sm font-bold tracking-tight text-white">{folder.name}</p>
                  <span className="mt-2 rounded bg-surface-container-low px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#a3a3a3]">
                    Folder
                  </span>
                  <span className="mt-2 text-[10px] text-on-surface-variant">Drag files or folders here</span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFolderFavorite(folder.id);
                  }}
                  title={folderPreferences[folder.id]?.favorite ? "Remove favorite" : "Favorite folder"}
                  className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded border border-white/10 opacity-100 transition-opacity md:h-7 md:w-7 md:opacity-0 md:group-hover:opacity-100 ${
                    folderPreferences[folder.id]?.favorite ? "bg-secondary/15 text-secondary" : "bg-black/30 text-white"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">star</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete({ type: "folder", id: folder.id, name: folder.name });
                  }}
                  title="Delete folder"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded bg-error-container/25 text-error opacity-100 transition-opacity hover:bg-error-container/40 md:h-7 md:w-7 md:opacity-0 md:group-hover:opacity-100"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            ))}

            {/* Document cards */}
            {filteredDocs.map((document) => (
              <div
                key={document.id}
                className="group relative"
                draggable={canOrganizeDocument(document.role)}
                onDragStart={() => {
                  if (!canOrganizeDocument(document.role)) return;
                  setDraggingDocId(document.id);
                  setDraggingFolderId(null);
                }}
                onDragEnd={() => {
                  setDraggingDocId(null);
                  setDropTargetId(null);
                }}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/editor/${document.id}`)}
                  className="w-full overflow-hidden rounded border border-white/5 bg-surface-container text-left transition hover:bg-surface-container-high"
                >
                  <div className={`${viewMode === "grid" ? "h-32" : "h-2"} bg-gradient-to-br from-surface-container-high via-[#23322b] to-surface-container-low opacity-80`} />
                  <div className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h3 className="min-w-0 break-words pr-8 text-lg font-bold tracking-tight text-white md:pr-0">
                        <HighlightText value={document.title} query={activeQuery} />
                      </h3>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest shrink-0 ${roleBadgeClass(document.role)}`}>
                        {document.role}
                      </span>
                    </div>
                    <p className="min-h-[48px] break-words text-sm text-on-surface-variant line-clamp-2">
                      <HighlightText
                        value={stripContent(document.content) || "No content yet. Open the document to start writing."}
                        query={activeQuery}
                      />
                    </p>
                    {(document.tags || []).length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(document.tags || []).map((tag) => (
                          <span
                            key={`${document.id}-${tag}`}
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{
                              backgroundColor: `hsl(${tagHue(tag)} 70% 45% / 0.16)`,
                              color: `hsl(${tagHue(tag)} 75% 75%)`,
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-col items-start gap-1 text-xs text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0 max-w-full break-all">Owner: <HighlightText value={document.owner.email} query={activeQuery} /></span>
                      <span>{new Date(document.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </button>
                <div className="absolute left-2 top-2 flex gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleDocumentSelected(document.id);
                    }}
                    title={selectedDocIds.includes(document.id) ? "Unselect" : "Select"}
                    className={`flex h-8 w-8 items-center justify-center rounded border border-white/10 ${
                      selectedDocIds.includes(document.id) ? "bg-primary/20 text-primary" : "bg-black/30 text-white"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px]">
                      {selectedDocIds.includes(document.id) ? "check_box" : "check_box_outline_blank"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleStarred(document.id);
                    }}
                    title={documentPreferences[document.id]?.starred ? "Remove favorite" : "Favorite"}
                    className={`flex h-8 w-8 items-center justify-center rounded border border-white/10 ${
                      documentPreferences[document.id]?.starred ? "bg-secondary/15 text-secondary" : "bg-black/30 text-white"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px]">star</span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      togglePinned(document.id);
                    }}
                    title={documentPreferences[document.id]?.pinned ? "Unpin" : "Pin"}
                    className={`flex h-8 w-8 items-center justify-center rounded border border-white/10 ${
                      documentPreferences[document.id]?.pinned ? "bg-primary/20 text-primary" : "bg-black/30 text-white"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px]">push_pin</span>
                  </button>
                </div>
                {/* Delete doc button — only for owner, visible on hover */}
                {document.role === "owner" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete({ type: "doc", id: document.id, title: document.title });
                    }}
                    title="Delete document"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded bg-error-container/25 text-error opacity-100 transition-opacity hover:bg-error-container/40 md:h-7 md:w-7 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="mt-10 flex items-start gap-4 border-t border-white/5 py-6 md:mt-12 md:items-center">
        <div className="h-12 w-1 bg-primary" />
        <div>
          <h4 className="text-sm font-bold tracking-tight text-white">System Status: Operational</h4>
          <p className="text-xs text-on-surface-variant">
            All collaborators are synced. Last refresh pulls the latest workspace state.
          </p>
        </div>
      </div>

      {/* ── Create Document Modal ─────────────────────────────── */}
      {isCreateOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 px-0 sm:items-center sm:px-4">
          <div className="editorial-panel max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-outline-variant/10 p-4 shadow-2xl sm:rounded-lg sm:p-6">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">New Entry</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Create document</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded p-2 text-[#a3a3a3] transition hover:bg-surface-container-high hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form className="space-y-5" onSubmit={handleCreate}>
              <div className="space-y-1.5">
                <label className="block px-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant" htmlFor="doc-title">
                  Document Title
                </label>
                <input
                  id="doc-title"
                  className="emerald-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Q4 Project Strategy"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block px-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant" htmlFor="share-emails">
                  Share With (comma-separated emails)
                </label>
                <textarea
                  id="share-emails"
                  className="emerald-input min-h-[80px] resize-none"
                  value={shareEmails}
                  onChange={(event) => setShareEmails(event.target.value)}
                  placeholder="alice@lab.io, bob@lab.io"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block px-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant" htmlFor="share-role">
                  Default Access
                </label>
                <select
                  id="share-role"
                  className="emerald-input"
                  value={shareRole}
                  onChange={(event) => setShareRole(event.target.value as "editor" | "commenter" | "viewer")}
                >
                  <option value="editor">Editor</option>
                  <option value="commenter">Commenter</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="emerald-muted-button w-full sm:w-auto">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="emerald-primary-button w-full sm:w-auto">
                  {submitting ? "Creating..." : "Create Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ── Create Folder Modal ───────────────────────────────── */}
      {isCreateFolderOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 px-0 sm:items-center sm:px-4">
          <div className="editorial-panel max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-outline-variant/10 p-4 shadow-2xl sm:rounded-lg sm:p-6">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">New Folder</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Create folder</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateFolderOpen(false)}
                className="rounded p-2 text-[#a3a3a3] transition hover:bg-surface-container-high hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form className="space-y-5" onSubmit={handleCreateFolder}>
              <div className="space-y-1.5">
                <label className="block px-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Folder Name
                </label>
                <input
                  className="emerald-input"
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                  placeholder="Marketing Assets"
                  required
                />
              </div>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
                <button type="button" onClick={() => setIsCreateFolderOpen(false)} className="emerald-muted-button w-full sm:w-auto">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="emerald-primary-button w-full sm:w-auto">
                  {submitting ? "Creating..." : "Create Folder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ── Trash Modal ──────────────────────────────────────── */}
      {trashOpen ? (
        <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/75 px-0 sm:items-center sm:px-4">
          <div className="editorial-panel flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-lg border border-outline-variant/10 p-4 shadow-2xl sm:max-h-[86vh] sm:rounded-lg sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Trash</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Deleted documents</h2>
              </div>
              <button
                type="button"
                onClick={closeTrash}
                className="rounded p-2 text-[#a3a3a3] transition hover:bg-surface-container-high hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {trashError ? <p className="mb-4 text-sm text-error">{trashError}</p> : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {trashLoading ? (
                <div className="rounded border border-white/5 bg-surface-container-high p-4 text-sm text-on-surface-variant">
                  Loading...
                </div>
              ) : trashDocs.length ? (
                <div className="space-y-3">
                  {trashDocs.map((document) => (
                    <div key={document.id} className="rounded border border-white/10 bg-surface-container-high p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="break-words text-base font-bold text-white">{document.title}</h3>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            Deleted {document.deletedAt ? new Date(document.deletedAt).toLocaleString() : "recently"}
                          </p>
                          <p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">
                            {stripContent(document.content) || "No content preview available."}
                          </p>
                        </div>
                        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-col">
                          <button
                            type="button"
                            disabled={trashBusyId === document.id}
                            onClick={() => restoreTrashDocument(document).catch(console.error)}
                            className="emerald-primary-button justify-center px-3 py-2 text-xs"
                          >
                            <span className="material-symbols-outlined text-sm">restore</span>
                            Restore
                          </button>
                          <button
                            type="button"
                            disabled={trashBusyId === document.id}
                            onClick={() => permanentlyDeleteTrashDocument(document).catch(console.error)}
                            className="flex items-center justify-center gap-2 rounded bg-error-container/20 px-3 py-2 text-xs font-semibold text-error transition hover:bg-error-container/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-sm">delete_forever</span>
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded border border-white/5 bg-surface-container-high p-4 text-sm text-on-surface-variant">
                  Trash is empty.
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button type="button" onClick={() => loadTrash().catch(console.error)} className="emerald-muted-button w-full sm:w-auto">
                <span className="material-symbols-outlined text-sm">refresh</span>
                Refresh
              </button>
              <button type="button" onClick={closeTrash} className="emerald-primary-button w-full sm:w-auto">
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Delete Confirmation Modal ─────────────────────────── */}
      {confirmDelete ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 px-0 sm:items-center sm:px-4">
          <div className="editorial-panel max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-lg border border-error/20 p-4 shadow-2xl sm:rounded-lg sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error-container/25">
                <span className="material-symbols-outlined text-error">warning</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Delete {confirmDelete.type === "doc" ? "Document" : "Folder"}?
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {confirmDelete.type === "doc" ? "The document is soft-deleted and removed from active workspaces." : "This action cannot be undone."}
                </p>
              </div>
            </div>

            <p className="mb-6 rounded bg-surface-container-high px-4 py-3 text-sm text-white">
              {confirmDelete.type === "doc" ? (
                <>
                  <span className="font-semibold">"{confirmDelete.title}"</span> will be moved to trash and hidden from collaborators.
                </>
              ) : (
                <>
                  Folder <span className="font-semibold">"{confirmDelete.name}"</span> will be deleted. Documents inside will be moved to the root.
                </>
              )}
            </p>

            {deleteError && (
              <p className="mb-4 text-sm text-error">{deleteError}</p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => { setConfirmDelete(null); setDeleteError(""); }}
                className="emerald-muted-button w-full sm:w-auto"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex w-full items-center justify-center gap-2 rounded bg-error-container px-4 py-2 text-sm font-semibold text-on-error-container transition hover:brightness-110 disabled:opacity-50 sm:w-auto"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                {deleting ? "Deleting..." : `Delete ${confirmDelete.type === "doc" ? "Document" : "Folder"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </WorkspaceLayout>
  );
};

export default DashboardPage;
