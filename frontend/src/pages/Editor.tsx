import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import Highlight from "@tiptap/extension-highlight";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Youtube from "@tiptap/extension-youtube";
import { SlashCommands } from "../components/editor/SlashCommands";
import suggestion from "../components/editor/suggestion";
import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import { connectSocket, disconnectSocket } from "../services/socket";
import { DocItem, useDocStore } from "../store/docStore";
import { DocComment } from "../types";
import { getAuthToken } from "../services/auth";
import { useAuthStore } from "../store/authStore";

type ShareRole = "editor" | "viewer";

type ActiveSession = {
  sessionId: string;
  userId: string;
  email?: string;
};

type RemoteCursor = {
  sessionId: string;
  userId: string;
  email?: string;
  pos: number;
};

type PositionedCursor = {
  sessionId: string;
  userId: string;
  email?: string;
  left: number;
  top: number;
  hue: number;
};

const CURSOR_EMIT_INTERVAL_MS = 70;
const CURSOR_COLUMN_BUCKET = 12;
const CURSOR_STACK_OFFSET = 22;

const buildAvatarUrl = (seedInput: string) =>
  `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(
    seedInput.toLowerCase(),
  )}`;

const stableHueFromId = (id: string) =>
  Array.from(id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;

const clampCursorPosition = (pos: number, maxPos: number) =>
  Math.max(1, Math.min(pos, maxPos));


const stripContent = (content: string) =>
  content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const menuButtonClass =
  "rounded px-3 py-1 transition-colors duration-200 hover:bg-[#201f1f]";

const EditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userEmail = useAuthStore((state) => state.user?.email);
  const activeDoc = useDocStore((state) => state.activeDoc);
  const setActiveDoc = useDocStore((state) => state.setActiveDoc);
  const upsertDoc = useDocStore((state) => state.upsertDoc);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("offline");
  const [comments, setComments] = useState<DocComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareEmails, setShareEmails] = useState("");
  const [shareRole, setShareRole] = useState<ShareRole>("editor");
  const [savingShare, setSavingShare] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [savingTags, setSavingTags] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [openMenu, setOpenMenu] = useState<null | "file" | "edit" | "view">(null);
  const [showComments, setShowComments] = useState(true);
  const [wideCanvas, setWideCanvas] = useState(false);
  const [activeUsers, setActiveUsers] = useState<ActiveSession[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [positionedCursors, setPositionedCursors] = useState<PositionedCursor[]>([]);
  const [scrollVersion, setScrollVersion] = useState(0);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const applyingRemoteRef = useRef(false);
  const docRef = useRef<DocItem | null>(null);
  const cursorEmitRef = useRef<number>(0);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Image,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Highlight,
      TextStyle,
      Color,
      Youtube.configure({
        controls: false,
      }),
      SlashCommands.configure({
        suggestion,
      }),
      Placeholder.configure({
        placeholder: "Start typing...",
      }),
    ],
    content: "<p></p>",
    editorProps: {
      attributes: {
        class: "editorial-editor bg-white px-16 py-16 md:px-24 md:py-24 text-[#131313]",
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    docRef.current = activeDoc;
  }, [activeDoc]);

  const loadDocument = async () => {
    if (!id) {
      return;
    }

    const [docResponse, commentsResponse] = await Promise.all([
      api.get<{ document: DocItem }>(`/docs/${id}`),
      api.get<{ comments: DocComment[] }>(`/docs/${id}/comments`),
    ]);

    const tagsResponse = await api
      .get<{ tags: string[] }>(`/docs/${id}/tags`)
      .catch(() => ({ data: { tags: [] } }));

    setActiveDoc(docResponse.data.document);
    upsertDoc(docResponse.data.document);
    setComments(commentsResponse.data.comments);
    setTitleInput(docResponse.data.document.title);
    setTags(tagsResponse.data.tags || []);
    setTagInput((tagsResponse.data.tags || []).join(", "));
  };

  useEffect(() => {
    if (!id) {
      setError("Document id missing hai");
      setLoading(false);
      return;
    }

    loadDocument()
      .catch((requestError) => {
        if (axios.isAxiosError(requestError)) {
          setError(requestError.response?.data?.message || "Document load nahi hua");
        } else {
          setError("Document load nahi hua");
        }
      })
      .finally(() => setLoading(false));

    return () => {
      setActiveDoc(null);
    };
  }, [id]);

  useEffect(() => {
    if (!editor || !activeDoc) {
      return;
    }

    editor.setEditable(activeDoc.role !== "viewer");

    if (editor.getHTML() !== activeDoc.content) {
      applyingRemoteRef.current = true;
      editor.commands.setContent(activeDoc.content || "<p></p>", false);
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 0);
    }
  }, [editor, activeDoc?.id, activeDoc?.content, activeDoc?.role]);

  useEffect(() => {
    const currentDoc = docRef.current;

    if (!id || !editor || !currentDoc) {
      return;
    }

    let socket: ReturnType<typeof connectSocket> | null = null;
    let isActive = true;

    const initializeSocket = async () => {
      const token = getAuthToken();
      if (!isActive || !token) {
        return;
      }

      socket = connectSocket(token);
      const canEdit = currentDoc.role !== "viewer";

      const handleConnect = () => setSocketState("connected");
      const handleDisconnect = () => setSocketState("offline");
      const handleConnectError = async (err: { message?: string }) => {
        const message = String(err?.message || "");
        if (message.includes("Unauthorized")) {
          disconnectSocket();
        }
        setSocketState("offline");
      };
      const handleReceiveChanges = (nextContent: string) => {
        if (!editor || nextContent === editor.getHTML()) {
          return;
        }

        applyingRemoteRef.current = true;
        editor.commands.setContent(nextContent || "<p></p>", false);
        window.setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 0);

        if (docRef.current) {
          const nextDoc = {
            ...docRef.current,
            content: nextContent,
            updatedAt: new Date().toISOString(),
          };
          setActiveDoc(nextDoc);
          upsertDoc(nextDoc);
        }
      };

      const handleActiveUsers = (users: ActiveSession[]) => setActiveUsers(users);
      const handleCursorMove = (cursor: RemoteCursor) => {
        setRemoteCursors((current) => {
          const next = current.filter((item) => item.sessionId !== cursor.sessionId);
          next.push(cursor);
          return next;
        });
      };
      const handleDocError = (payload: { message: string }) => setError(payload.message);
      const handleEditorUpdate = () => {
        const latestDoc = docRef.current;

        if (!latestDoc || !canEdit || applyingRemoteRef.current) {
          return;
        }

        const content = editor.getHTML();

        socket?.emit("send-changes", {
          documentId: id,
          content,
        });

        const nextDoc = {
          ...latestDoc,
          content,
          updatedAt: new Date().toISOString(),
        };
        setActiveDoc(nextDoc);
        upsertDoc(nextDoc);

        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(async () => {
          try {
            await api.put(`/docs/${id}`, { content });
          } catch (requestError) {
            console.error("Document save failed", requestError);
          }
        }, 700);
      };

      const emitCursorPosition = () => {
        if (!socket || !id || !editor || applyingRemoteRef.current) {
          return;
        }

        const now = Date.now();
        if (now - cursorEmitRef.current < CURSOR_EMIT_INTERVAL_MS) {
          return;
        }
        cursorEmitRef.current = now;

        socket.emit("cursor-move", {
          documentId: id,
          pos: editor.state.selection.from,
          email: userEmail,
        });
      };

      const handleSelectionUpdate = () => emitCursorPosition();
      const handleEditorTyping = () => emitCursorPosition();

      if (socket?.connected) {
        setSocketState("connected");
      }

      socket?.emit("join-doc", id, userEmail);
      socket?.on("connect", handleConnect);
      socket?.on("disconnect", handleDisconnect);
      socket?.on("receive-changes", handleReceiveChanges);
      socket?.on("active-users", handleActiveUsers);
      socket?.on("cursor-move", handleCursorMove);
      socket?.on("doc-error", handleDocError);
      socket?.on("connect_error", handleConnectError);
      editor.on("update", handleEditorUpdate);
      editor.on("selectionUpdate", handleSelectionUpdate);
      editor.on("transaction", handleEditorTyping);
    };

    initializeSocket().catch((requestError) => {
      console.error("Socket initialization failed", requestError);
    });

    return () => {
      isActive = false;
      if (socket) {
        socket.emit("leave-doc", id);
        socket.off("connect");
        socket.off("disconnect");
        socket.off("receive-changes");
        socket.off("active-users");
        socket.off("cursor-move");
        socket.off("doc-error");
        socket.off("connect_error");
      }
      editor.off("update");
      editor.off("selectionUpdate");
      editor.off("transaction");
      window.clearTimeout(saveTimerRef.current);
      setRemoteCursors([]);
    };
  }, [editor, id, activeDoc?.id, activeDoc?.role, userEmail]);

  useEffect(() => {
    if (!editor || !editorSurfaceRef.current || remoteCursors.length === 0) {
      setPositionedCursors([]);
      return;
    }

    const containerRect = editorSurfaceRef.current.getBoundingClientRect();
    const maxPos = Math.max(1, editor.state.doc.content.size);
    const placed: PositionedCursor[] = [];

    remoteCursors.forEach((cursor) => {
      try {
        const clamped = clampCursorPosition(cursor.pos, maxPos);
        const coords = editor.view.coordsAtPos(clamped);
        placed.push({
          sessionId: cursor.sessionId,
          userId: cursor.userId,
          email: cursor.email,
          left: coords.left - containerRect.left,
          top: coords.top - containerRect.top,
          hue: stableHueFromId(cursor.userId),
        });
      } catch {
        // Ignore invalid positions during rapid remote updates.
      }
    });

    const slotByColumn = new Map<number, number>();
    const slotted = placed.map((cursor) => {
      const bucket = Math.max(0, Math.round(cursor.left / CURSOR_COLUMN_BUCKET));
      const slot = slotByColumn.get(bucket) || 0;
      slotByColumn.set(bucket, slot + 1);
      return {
        ...cursor,
        top: cursor.top - slot * CURSOR_STACK_OFFSET,
      };
    });

    setPositionedCursors(slotted);
  }, [editor, remoteCursors, activeDoc?.content, scrollVersion]);

  useEffect(() => {
    if (!activeUsers.length) {
      setRemoteCursors([]);
      return;
    }

    const activeSet = new Set(activeUsers.map((userItem) => userItem.sessionId));
    setRemoteCursors((current) => current.filter((cursor) => activeSet.has(cursor.sessionId)));
  }, [activeUsers]);

  const applyLink = () => {
    if (!editor) {
      return;
    }

    const url = window.prompt("Enter link URL");

    if (!url) {
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addImage = () => {
    if (!editor) {
      return;
    }

    const imageUrl = window.prompt("Paste image URL");

    if (!imageUrl) {
      return;
    }

    editor.chain().focus().setImage({ src: imageUrl }).run();
  };

  const addComment = async () => {
    if (!id || !commentBody.trim()) {
      return;
    }

    const response = await api.post<{ comment: DocComment }>(`/docs/${id}/comments`, {
      body: commentBody.trim(),
    });

    setComments((current) => [response.data.comment, ...current]);
    setCommentBody("");
  };

  const handleShare = async () => {
    if (!id || !activeDoc) {
      return;
    }

    setSavingShare(true);

    try {
      const collaborators = [
        ...activeDoc.collaborators.map((item) => ({
          email: item.email,
          role: item.role,
        })),
        ...shareEmails
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean)
          .map((email) => ({ email, role: shareRole })),
      ];

      const response = await api.put<{ document: DocItem }>(`/docs/${id}`, {
        collaborators,
      });

      setActiveDoc(response.data.document);
      upsertDoc(response.data.document);
      setShareEmails("");
      setShareRole("editor");
      setShareModalOpen(false);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Share update nahi hua");
      } else {
        setError("Share update nahi hua");
      }
    } finally {
      setSavingShare(false);
    }
  };

  const handleRename = async () => {
    if (!id || !titleInput.trim()) {
      return;
    }

    setRenaming(true);

    try {
      const response = await api.put<{ document: DocItem }>(`/docs/${id}`, {
        title: titleInput.trim(),
      });
      setActiveDoc(response.data.document);
      upsertDoc(response.data.document);
      setOpenMenu(null);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Rename nahi hua");
      } else {
        setError("Rename nahi hua");
      }
    } finally {
      setRenaming(false);
    }
  };

  const loadVersions = async () => {
    if (!id) return;
    try {
      const response = await api.get<{ versions: any[] }>(`/docs/${id}/versions`);
      setVersions(response.data.versions);
    } catch (e) {
      console.error(e);
    }
  };

  const snapshotVersion = async () => {
    if (!id) return;
    setCreatingVersion(true);
    try {
      const response = await api.post(`/docs/${id}/versions`);
      setVersions([response.data.version, ...versions]);
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingVersion(false);
    }
  };

  const exportFromServer = async (format: "html" | "markdown" | "pdf" | "docx" | "txt") => {
    if (!id) {
      return;
    }

    try {
      const response = await api.get(`/docs/${id}/export`, {
        params: { format },
        responseType: "blob",
      });

      const contentDisposition = String(response.headers["content-disposition"] || "");
      const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fallbackName = `${activeDoc?.title || "document"}.${format === "markdown" ? "md" : format}`;
      const filename = filenameMatch?.[1] || fallbackName;

      const blobUrl = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Export failed");
      } else {
        setError("Export failed");
      }
    }
  };

  const saveTags = async () => {
    if (!id || !activeDoc || activeDoc.role === "viewer") {
      return;
    }

    setSavingTags(true);
    setError("");

    try {
      const nextTags = tagInput
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      const response = await api.put<{ tags: string[] }>(`/docs/${id}/tags`, {
        tags: nextTags,
      });

      setTags(response.data.tags || []);
      setTagInput((response.data.tags || []).join(", "));
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Tags save nahi hue");
      } else {
        setError("Tags save nahi hue");
      }
    } finally {
      setSavingTags(false);
    }
  };

  const importFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.html,.md";
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        const content = re.target?.result as string;
        editor?.commands.setContent(content);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const toolbarItems = [
    {
      icon: "format_bold",
      action: () => editor?.chain().focus().toggleBold().run(),
      active: editor?.isActive("bold"),
      label: "Bold",
    },
    {
      icon: "format_italic",
      action: () => editor?.chain().focus().toggleItalic().run(),
      active: editor?.isActive("italic"),
      label: "Italic",
    },
    {
      icon: "format_underlined",
      action: () => editor?.chain().focus().toggleUnderline().run(),
      active: editor?.isActive("underline"),
      label: "Underline",
    },
    {
      icon: "format_list_bulleted",
      action: () => editor?.chain().focus().toggleBulletList().run(),
      active: editor?.isActive("bulletList"),
      label: "Bullets",
    },
    {
      icon: "format_list_numbered",
      action: () => editor?.chain().focus().toggleOrderedList().run(),
      active: editor?.isActive("orderedList"),
      label: "Numbers",
    },
    {
      icon: "add_link",
      action: applyLink,
      active: editor?.isActive("link"),
      label: "Link",
    },
    {
      icon: "image",
      action: addImage,
      active: false,
      label: "Image",
    },
    {
      icon: "code",
      action: () => editor?.chain().focus().toggleCodeBlock().run(),
      active: editor?.isActive("codeBlock"),
      label: "Code",
    },
  ];

  const fileMenuItems = [
    { label: "Rename document", action: handleRename },
    { label: "Share document", action: () => setShareModalOpen(true) },
    { label: "Import file", action: importFile },
    { label: "Export as HTML", action: () => exportFromServer("html") },
    { label: "Export as Markdown", action: () => exportFromServer("markdown") },
    { label: "Export as PDF", action: () => exportFromServer("pdf") },
    { label: "Export as DOCX", action: () => exportFromServer("docx") },
    { label: "Export as TXT", action: () => exportFromServer("txt") },
    { label: "Open Template Library", action: () => navigate("/library") },
    {
      label: "Copy editor link",
      action: async () => {
        await navigator.clipboard.writeText(window.location.href);
        setOpenMenu(null);
      },
    },
  ];

  const editMenuItems = [
    { label: "Undo", action: () => editor?.chain().focus().undo().run() },
    { label: "Redo", action: () => editor?.chain().focus().redo().run() },
    { label: "Heading 1", action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: "Heading 2", action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Align center", action: () => editor?.chain().focus().setTextAlign("center").run() },
  ];

  const viewMenuItems = [
    { label: showComments ? "Hide comments" : "Show comments", action: () => setShowComments((current) => !current) },
    { label: showVersions ? "Hide versions" : "Show versions", action: () => {
        setShowVersions((c) => !c);
        if (!showVersions) loadVersions();
      }
    },
    { label: wideCanvas ? "Standard width" : "Wide canvas", action: () => setWideCanvas((current) => !current) },
    { label: "Back to dashboard", action: () => navigate("/dashboard") },
  ];

  const currentMenuItems =
    openMenu === "file" ? fileMenuItems : openMenu === "edit" ? editMenuItems : viewMenuItems;

  const handleHistoryClick = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/dashboard");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-on-surface-variant">
        Loading editor...
      </div>
    );
  }

  if (error && !activeDoc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-lg rounded border border-white/10 bg-surface-container p-8 text-center">
          <p className="text-lg font-semibold text-white">Editor unavailable</p>
          <p className="mt-3 text-sm text-error">{error}</p>
          <button type="button" onClick={() => navigate("/dashboard")} className="emerald-primary-button mt-6">
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface text-on-surface selection:bg-primary/30">
      <header className="sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-white/5 bg-[#131313] px-6 text-sm font-medium tracking-tight">
        <div className="flex items-center gap-6">
          <span className="text-xl font-bold uppercase tracking-tighter text-white">Editorial</span>
          <div className="relative hidden items-center gap-2 text-[#a3a3a3] md:flex">
            {(["file", "edit", "view"] as const).map((menu) => (
              <button
                key={menu}
                type="button"
                onClick={() => setOpenMenu((current) => (current === menu ? null : menu))}
                className={`${menuButtonClass} ${openMenu === menu ? "border border-white/20 text-white" : ""}`}
              >
                {menu[0].toUpperCase() + menu.slice(1)}
              </button>
            ))}

            {openMenu ? (
              <div className="absolute left-0 top-11 z-[90] min-w-[220px] rounded border border-white/10 bg-surface-container p-2 shadow-2xl">
                {openMenu === "file" ? (
                  <div className="border-b border-white/5 p-2">
                    <input
                      className="emerald-input"
                      value={titleInput}
                      onChange={(event) => setTitleInput(event.target.value)}
                      placeholder="Rename document"
                    />
                  </div>
                ) : null}
                {currentMenuItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      item.action();
                      if (openMenu !== "file" || item.label !== "Rename document") {
                        setOpenMenu(null);
                      }
                    }}
                    className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-white transition hover:bg-surface-container-high"
                  >
                    <span>{item.label}</span>
                    {item.label === "Rename document" && renaming ? <span className="text-xs text-primary">Saving…</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${socketState === "connected" ? "text-primary" : "text-on-surface-variant"}`}>
            {socketState}
          </span>
          <button
            type="button"
            onClick={handleHistoryClick}
            title="Go back"
            className="material-symbols-outlined text-[#a3a3a3] hover:text-white"
          >
            history
          </button>
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-surface-container-high text-xs font-bold text-white">
            {activeDoc?.owner.email.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)]">
        <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-white/5 bg-[#0e0e0e] pb-4 pt-16 lg:flex">
          <div className="mb-8 flex items-center gap-3 px-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container">
              <span className="material-symbols-outlined text-sm text-primary">grid_view</span>
            </div>
            <div>
              <div className="text-lg font-bold leading-none text-white">Arena</div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-4">
            {[
              { icon: "grid_view", label: "Workspace", to: "/dashboard" },
              { icon: "description", label: "Drafts", to: "/drafts" },
              { icon: "folder_open", label: "Collections", to: "/collections" },
              { icon: "groups", label: "Team", to: "/teams" },
              { icon: "settings", label: "Settings", to: "/settings" },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.to)}
                className={`flex w-full items-center gap-3 rounded px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest transition-all duration-150 ${
                  item.to === "/dashboard"
                    ? "border-r-2 border-primary-container bg-[#1c1b1b] text-[#10b981]"
                    : "text-[#a3a3a3] hover:translate-x-1 hover:bg-[#1c1b1b] hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="relative flex flex-1 flex-col overflow-hidden bg-surface-container-lowest lg:ml-64">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/5 bg-surface-container-lowest px-8">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-lg font-bold tracking-tight text-on-surface">{activeDoc?.title}</h1>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a3a3a3]">
                  Doc ID: {id}
                </p>
                {tags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2 rounded border border-white/5 bg-surface-container-high px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#a3a3a3]">Saved</span>
              </div>
              {activeUsers.length > 0 && (
                <div className="ml-4 flex -space-x-2 overflow-hidden">
                  {activeUsers.map((u) => (
                    <div
                      key={u.sessionId}
                      title={u.email || "Anonymous"}
                      className="inline-block h-6 w-6 rounded-full ring-2 ring-surface-container-lowest bg-surface-container-highest flex items-center justify-center text-[10px] font-bold text-white uppercase"
                    >
                      {(u.email || "A")[0]}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setShareModalOpen(true)} className="emerald-primary-button">
                Share
              </button>
              <button
                type="button"
                onClick={loadDocument}
                className="rounded p-2 text-[#a3a3a3] transition hover:bg-[#201f1f] hover:text-white"
              >
                <span className="material-symbols-outlined">refresh</span>
              </button>
            </div>
          </header>

          <div
            className="flex flex-1 overflow-y-auto px-4 pb-32 pt-8 md:px-8"
            onScroll={() => setScrollVersion((current) => current + 1)}
          >
            <div className={`mx-auto flex-1 ${wideCanvas ? "max-w-[1080px]" : "max-w-[800px]"}`}>
              <div className="sticky top-4 z-40 mx-auto mb-12 flex items-center justify-center">
                <div className="editorial-editor-toolbar flex flex-wrap items-center gap-1 rounded border border-white/10 bg-surface-container-highest/90 px-4 py-2 shadow-2xl backdrop-blur-xl">
                  {toolbarItems.map((item, index) => (
                    <div key={item.label} className="flex items-center">
                      <button
                        type="button"
                        title={item.label}
                        disabled={!editor || activeDoc?.role === "viewer"}
                        onClick={item.action}
                        className={item.active ? "active" : ""}
                      >
                        <span className="material-symbols-outlined text-lg">{item.icon}</span>
                      </button>
                      {index === 2 || index === 4 ? <div className="mx-2 h-4 w-px bg-white/10" /> : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                    className={editor?.isActive("blockquote") ? "active rounded p-1.5 text-primary" : "rounded p-1.5 text-white"}
                  >
                    <span className="material-symbols-outlined text-lg">format_quote</span>
                  </button>
                </div>
              </div>

              <div ref={editorSurfaceRef} className="relative overflow-visible rounded-lg bg-white shadow-2xl">
                <div className="border-b border-black/5 bg-white px-16 py-5 text-xs font-bold uppercase tracking-[0.2em] text-[#737373] md:px-24">
                  Editorial Canvas · Precision Mode
                </div>

                {!editor ? (
                  <div className="flex min-h-[1200px] items-center justify-center bg-white p-16 text-sm text-[#404040]">
                    Loading editor...
                  </div>
                ) : (
                  <EditorContent editor={editor} />
                )}

                {positionedCursors.length > 0 ? (
                  <div className="pointer-events-none absolute inset-0 z-20">
                    {positionedCursors.map((cursor) => {
                      const label = cursor.email || "Anonymous";
                      const avatarSeed = cursor.email || cursor.userId || cursor.sessionId;
                      const avatarSrc = buildAvatarUrl(avatarSeed);
                      return (
                        <div
                          key={cursor.sessionId}
                          className="absolute"
                          style={{ left: `${cursor.left}px`, top: `${cursor.top}px` }}
                        >
                          <div
                            className="h-5 w-[2px]"
                            style={{ backgroundColor: `hsl(${cursor.hue} 85% 55%)` }}
                          />
                          <div
                            className="absolute -top-8 left-0 flex max-w-[220px] items-center gap-1.5 rounded-full border border-white/25 px-2 py-1 text-[10px] font-semibold text-white shadow-lg"
                            style={{ backgroundColor: `hsl(${cursor.hue} 70% 35% / 0.95)` }}
                          >
                            <img src={avatarSrc} alt={label} className="h-4 w-4 rounded-full border border-white/30 bg-black/25" />
                            <span className="truncate">{label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </main>

        {showComments ? (
          <aside className="hidden w-80 flex-col gap-6 overflow-y-auto border-l border-white/5 bg-surface p-6 xl:flex">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a3a3a3]">Comments</h4>
              <span className="text-[10px] font-bold text-primary">{comments.length} Active</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded border border-white/5 bg-surface-container-high p-3">
                <span className="material-symbols-outlined text-sm text-[#a3a3a3]">chat_bubble</span>
                <input
                  className="flex-1 border-none bg-transparent text-xs text-white placeholder-[#a3a3a3] focus:ring-0"
                  placeholder="Type a comment..."
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  type="text"
                />
              </div>
              <button type="button" onClick={() => addComment().catch(console.error)} className="emerald-primary-button w-full">
                Add Comment
              </button>
            </div>

            {comments.length ? (
              comments.map((comment) => (
                <div key={comment.id} className="space-y-3 rounded-lg border-l-2 border-primary bg-surface-container p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-container-highest text-[10px] uppercase text-white">
                      {comment.author.email.slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-white">{comment.author.email}</div>
                      <div className="text-[9px] text-[#a3a3a3]">{new Date(comment.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-[#bbcabf]">{comment.body}</p>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-surface-container/50 p-4 text-sm text-on-surface-variant">
                No comments yet for this document.
              </div>
            )}

          </aside>
        ) : null}

        {showVersions ? (
          <aside className="hidden w-80 flex-col gap-6 overflow-y-auto border-l border-white/5 bg-surface p-6 xl:flex">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a3a3a3]">Version History</h4>
              <span className="text-[10px] font-bold text-primary">{versions.length} Snapshots</span>
            </div>

            <button
              type="button"
              onClick={snapshotVersion}
              disabled={creatingVersion}
              className="emerald-primary-button w-full"
            >
              {creatingVersion ? "Saving..." : "Create Snapshot"}
            </button>

            {versions.length ? (
              <div className="space-y-3">
                {versions.map((version) => (
                  <div key={version.id} className="cursor-pointer space-y-2 rounded-lg border border-white/5 bg-surface-container p-4 transition-colors hover:border-primary/50" onClick={() => {
                      if (window.confirm("Restore this version? This will replace your current content.")) {
                        editor?.commands.setContent(version.content);
                      }
                    }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white">Snapshot</span>
                      <span className="text-[9px] text-[#a3a3a3]">{new Date(version.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-surface-container/50 p-4 text-sm text-on-surface-variant">
                No saved versions yet.
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {shareModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
          <div className="editorial-panel w-full max-w-lg rounded-lg border border-outline-variant/10 p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Share</p>
                <h2 className="mt-2 text-2xl font-bold text-white">Share document</h2>
              </div>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="rounded p-2 text-[#a3a3a3] transition hover:bg-surface-container-high hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="block px-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant" htmlFor="share-emails">
                  Collaborator Emails
                </label>
                <textarea
                  id="share-emails"
                  className="emerald-input min-h-[112px] resize-none"
                  value={shareEmails}
                  onChange={(event) => setShareEmails(event.target.value)}
                  placeholder="Existing users: alice@lab.io, bob@lab.io"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block px-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant" htmlFor="share-role">
                  Access
                </label>
                <select
                  id="share-role"
                  className="emerald-input"
                  value={shareRole}
                  onChange={(event) => setShareRole(event.target.value as ShareRole)}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block px-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant" htmlFor="doc-tags">
                  Tags (comma separated)
                </label>
                <input
                  id="doc-tags"
                  className="emerald-input"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  placeholder="product, roadmap, q2"
                  disabled={activeDoc?.role === "viewer"}
                />
              </div>
              <div className="rounded border border-white/5 bg-surface p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Current collaborators</p>
                <div className="mt-3 space-y-2">
                  {activeDoc?.collaborators.length ? (
                    activeDoc.collaborators.map((item) => (
                      <div key={`${item.id}-${item.email}`} className="flex items-center justify-between rounded bg-surface-container-high p-3 text-sm text-white">
                        <span>{item.email}</span>
                        <span className="text-xs uppercase tracking-widest text-primary">{item.role}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-on-surface-variant">No collaborators added yet.</div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => saveTags().catch(console.error)}
                  disabled={savingTags || activeDoc?.role === "viewer"}
                  className="emerald-muted-button"
                >
                  {savingTags ? "Saving tags..." : "Save tags"}
                </button>
                <button type="button" onClick={() => setShareModalOpen(false)} className="emerald-muted-button">
                  Cancel
                </button>
                <button type="button" onClick={() => handleShare().catch(console.error)} disabled={savingShare} className="emerald-primary-button">
                  {savingShare ? "Saving..." : "Share"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default EditorPage;
