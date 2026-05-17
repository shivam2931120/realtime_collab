import axios from "axios";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
      ? "bg-blue-500/15 text-blue-200"
      : "bg-white/10 text-on-surface-variant";

type ConfirmState =
  | { type: "doc"; id: string; title: string }
  | { type: "folder"; id: string; name: string }
  | null;

const DashboardPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const docs = useDocStore((state) => state.docs);
  const setDocs = useDocStore((state) => state.setDocs);
  const upsertDoc = useDocStore((state) => state.upsertDoc);
  const removeDoc = useDocStore((state) => state.removeDoc);
  const folders = useDocStore((state) => state.folders);
  const setFolders = useDocStore((state) => state.setFolders);
  const upsertFolder = useDocStore((state) => state.upsertFolder);
  const removeFolder = useDocStore((state) => state.removeFolder);
  const documentPreferences = usePreferencesStore((state) => state.documentPreferences);
  const toggleStarred = usePreferencesStore((state) => state.toggleStarred);
  const togglePinned = usePreferencesStore((state) => state.togglePinned);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [shareEmails, setShareEmails] = useState("");
  const [shareRole, setShareRole] = useState<"editor" | "viewer">("editor");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState<ConfirmState>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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

  useEffect(() => {
    fetchData();
  }, []);

  const filteredDocs = useMemo(() => {
    const query = searchParams.get("q")?.trim().toLowerCase() || "";
    let baseDocs = docs;

    if (!query) {
      baseDocs = docs.filter((d) => (d.folderId || null) === currentFolderId);
    }

    if (!query) {
      return [...baseDocs].sort((first, second) => {
        const firstPinned = documentPreferences[first.id]?.pinned ? 1 : 0;
        const secondPinned = documentPreferences[second.id]?.pinned ? 1 : 0;
        if (firstPinned !== secondPinned) return secondPinned - firstPinned;
        return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
      });
    }

    return docs
      .filter((doc) => {
        return (
          doc.title.toLowerCase().includes(query) ||
          doc.owner.email.toLowerCase().includes(query) ||
          stripContent(doc.content).toLowerCase().includes(query) ||
          (doc.tags || []).some((tag) => tag.toLowerCase().includes(query))
        );
      })
      .sort((first, second) => {
        const firstPinned = documentPreferences[first.id]?.pinned ? 1 : 0;
        const secondPinned = documentPreferences[second.id]?.pinned ? 1 : 0;
        if (firstPinned !== secondPinned) return secondPinned - firstPinned;
        return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
      });
  }, [docs, searchParams, currentFolderId, documentPreferences]);

  const filteredFolders = useMemo(() => {
    const query = searchParams.get("q")?.trim().toLowerCase() || "";
    if (query) return [];
    return folders.filter((f) => f.parent_id === currentFolderId);
  }, [folders, searchParams, currentFolderId]);

  const currentFolder = folders.find((f) => f.id === currentFolderId);
  const activeQuery = searchParams.get("q")?.trim() || "";

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
    if (!document || (document.folderId || null) === folderId || document.role === "viewer") {
      return;
    }

    const response = await api.put<{ document: DocItem }>(`/docs/${documentId}`, {
      folder_id: folderId,
    });
    upsertDoc(response.data.document);
  };

  const moveFolderToFolder = async (folderId: string, parentId: string | null) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder || folder.id === parentId || folder.parent_id === parentId) {
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

  return (
    <WorkspaceLayout
      pageLabel="Editor Workspace"
      title="Recent Documents"
      actions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={fetchData}
            variant="outlined"
            color="success"
            size="small"
            startIcon={<span className="material-symbols-outlined text-sm">refresh</span>}
          >
            Refresh
          </Button>
          <button type="button" onClick={() => setIsCreateFolderOpen(true)} className="emerald-muted-button">
            <span className="material-symbols-outlined text-sm">create_new_folder</span>
            New Folder
          </button>
          <button type="button" onClick={() => setIsCreateOpen(true)} className="emerald-primary-button">
            <span className="material-symbols-outlined text-sm">add</span>
            New Entry
          </button>
        </div>
      }
    >
      {error ? <div className="mb-6 text-sm text-error">{error}</div> : null}

      {currentFolderId && (
        <div className="mb-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setCurrentFolderId(currentFolder?.parent_id || null)}
            className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline flex-row"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to {currentFolder?.parent_id ? folders.find((f) => f.id === currentFolder.parent_id)?.name || "Folder" : "Root"}
          </button>
          <h2 className="text-xl font-bold text-white">{currentFolder?.name}</h2>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Create new document button */}
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="group flex min-h-[264px] flex-col items-center justify-center rounded border border-dashed border-white/10 bg-surface-container-low transition hover:border-primary/50"
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
                  className={`w-full flex flex-col items-center justify-center rounded border bg-surface-container-high transition py-8 ${
                    dropTargetId === folder.id ? "border-primary shadow-[0_0_0_1px_rgba(16,185,129,0.6)]" : "border-white/5 hover:border-primary/50"
                  }`}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-highest transition group-hover:scale-110">
                    <span className="material-symbols-outlined text-4xl text-[#a3a3a3]">folder</span>
                  </div>
                  <p className="mt-4 text-sm font-bold tracking-tight text-white">{folder.name}</p>
                  <span className="mt-2 rounded bg-surface-container-low px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#a3a3a3]">
                    Folder
                  </span>
                  <span className="mt-2 text-[10px] text-on-surface-variant">Drag files or folders here</span>
                </button>
                {/* Delete folder button — always visible on hover */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete({ type: "folder", id: folder.id, name: folder.name });
                  }}
                  title="Delete folder"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex h-7 w-7 items-center justify-center rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 hover:text-red-300"
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
                draggable={document.role !== "viewer"}
                onDragStart={() => {
                  if (document.role === "viewer") return;
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
                  <div className="h-32 bg-gradient-to-br from-surface-container-high via-[#23322b] to-surface-container-low opacity-80" />
                  <div className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h3 className="text-lg font-bold tracking-tight text-white">
                        <HighlightText value={document.title} query={activeQuery} />
                      </h3>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest shrink-0 ${roleBadgeClass(document.role)}`}>
                        {document.role}
                      </span>
                    </div>
                    <p className="min-h-[48px] text-sm text-on-surface-variant line-clamp-2">
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
                    <div className="mt-4 flex items-center justify-between text-xs text-on-surface-variant">
                      <span>Owner: <HighlightText value={document.owner.email} query={activeQuery} /></span>
                      <span>{new Date(document.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </button>
                <div className="absolute left-2 top-2 flex gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleStarred(document.id);
                    }}
                    title={documentPreferences[document.id]?.starred ? "Remove favorite" : "Favorite"}
                    className={`flex h-8 w-8 items-center justify-center rounded border border-white/10 ${
                      documentPreferences[document.id]?.starred ? "bg-yellow-400/20 text-yellow-300" : "bg-black/30 text-white"
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
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex h-7 w-7 items-center justify-center rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 hover:text-red-300"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="mt-12 flex items-center gap-4 border-t border-white/5 py-6">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="editorial-panel w-full max-w-lg rounded-lg border border-outline-variant/10 p-6 shadow-2xl">
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
                  onChange={(event) => setShareRole(event.target.value as "editor" | "viewer")}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="emerald-muted-button">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="emerald-primary-button">
                  {submitting ? "Creating..." : "Create Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ── Create Folder Modal ───────────────────────────────── */}
      {isCreateFolderOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="editorial-panel w-full max-w-lg rounded-lg border border-outline-variant/10 p-6 shadow-2xl">
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
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsCreateFolderOpen(false)} className="emerald-muted-button">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="emerald-primary-button">
                  {submitting ? "Creating..." : "Create Folder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ── Delete Confirmation Modal ─────────────────────────── */}
      {confirmDelete ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4">
          <div className="editorial-panel w-full max-w-md rounded-lg border border-red-500/20 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                <span className="material-symbols-outlined text-red-400">warning</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Delete {confirmDelete.type === "doc" ? "Document" : "Folder"}?
                </h2>
                <p className="text-sm text-on-surface-variant">This action cannot be undone.</p>
              </div>
            </div>

            <p className="mb-6 rounded bg-surface-container-high px-4 py-3 text-sm text-white">
              {confirmDelete.type === "doc" ? (
                <>
                  <span className="font-semibold">"{confirmDelete.title}"</span> and all its comments and version history will be permanently deleted.
                </>
              ) : (
                <>
                  Folder <span className="font-semibold">"{confirmDelete.name}"</span> will be deleted. Documents inside will be moved to the root.
                </>
              )}
            </p>

            {deleteError && (
              <p className="mb-4 text-sm text-red-400">{deleteError}</p>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => { setConfirmDelete(null); setDeleteError(""); }}
                className="emerald-muted-button"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded bg-red-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
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
