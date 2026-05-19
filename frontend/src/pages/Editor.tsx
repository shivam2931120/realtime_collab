import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
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
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import { connectSocket, disconnectSocket } from "../services/socket";
import { DocItem, useDocStore } from "../store/docStore";
import { DocComment } from "../types";
import { getAuthToken } from "../services/auth";
import { useAuthStore } from "../store/authStore";
import { usePreferencesStore } from "../store/preferencesStore";

type ShareRole = "editor" | "viewer";

type ActiveSession = {
  sessionId: string;
  userId: string;
  email?: string;
  joinedAt?: string;
  lastSeen?: string;
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
const PRESENCE_IDLE_MS = 45_000;

type SaveStatus = "saved" | "saving" | "queued" | "error";
type ExportFormat = "html" | "markdown" | "pdf" | "docx" | "txt";
type SearchMatch = {
  from: number;
  to: number;
};

const textColorOptions = [
  { label: "Ink", value: "#131313" },
  { label: "Slate", value: "#475569" },
  { label: "Green", value: "#047857" },
  { label: "Blue", value: "#2563eb" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Rose", value: "#be123c" },
];

const highlightColorOptions = [
  { label: "Mint", value: "#bbf7d0" },
  { label: "Amber", value: "#fde68a" },
  { label: "Sky", value: "#bae6fd" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Lavender", value: "#ddd6fe" },
];

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

const tagHue = (tag: string) =>
  Array.from(tag).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;

const collectSearchMatches = (
  editor: TiptapEditor | null,
  query: string,
  matchCase: boolean,
): SearchMatch[] => {
  const needle = matchCase ? query : query.toLocaleLowerCase();

  if (!editor || !needle) {
    return [];
  }

  const matches: SearchMatch[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }

    const source = matchCase ? node.text : node.text.toLocaleLowerCase();
    let index = source.indexOf(needle);

    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + query.length });
      index = source.indexOf(needle, index + Math.max(needle.length, 1));
    }
  });

  return matches;
};

const toTitleCase = (value: string) =>
  value.replace(/\S+/g, (word) => `${word.charAt(0).toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}`);

const roleBadgeClass = (role: "owner" | "editor" | "viewer") =>
  role === "owner"
    ? "bg-primary-container text-on-primary-container"
    : role === "editor"
      ? "bg-blue-500/15 text-blue-200"
      : "bg-white/10 text-on-surface-variant";

const formatLastSeen = (value?: string) => {
  if (!value) return "active now";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "active now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
};

const menuButtonClass =
  "rounded px-3 py-1 transition-colors duration-200 hover:bg-[#201f1f]";

const EditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const userEmail = useAuthStore((state) => state.user?.email);
  const sidebarCollapsed = usePreferencesStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = usePreferencesStore((state) => state.setSidebarCollapsed);
  const activeDoc = useDocStore((state) => state.activeDoc);
  const setActiveDoc = useDocStore((state) => state.setActiveDoc);
  const upsertDoc = useDocStore((state) => state.upsertDoc);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("offline");
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [comments, setComments] = useState<DocComment[]>([]);
  const [commentFilter, setCommentFilter] = useState<"open" | "resolved" | "all">("open");
  const [commentBody, setCommentBody] = useState("");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareEmails, setShareEmails] = useState("");
  const [shareRole, setShareRole] = useState<ShareRole>("editor");
  const [savingShare, setSavingShare] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [removingCollaboratorEmail, setRemovingCollaboratorEmail] = useState("");
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
  const [mobilePanel, setMobilePanel] = useState<null | "comments" | "versions">(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [positionedCursors, setPositionedCursors] = useState<PositionedCursor[]>([]);
  const [scrollVersion, setScrollVersion] = useState(0);
  const [presenceClock, setPresenceClock] = useState(() => Date.now());
  const [exportPreviewFormat, setExportPreviewFormat] = useState<ExportFormat | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const [editorRevision, setEditorRevision] = useState(0);
  const [editorSelectionRevision, setEditorSelectionRevision] = useState(0);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const retryTimerRef = useRef<number | undefined>(undefined);
  const queuedSaveContentRef = useRef<string | null>(null);
  const savingContentRef = useRef(false);
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
      Highlight.configure({ multicolor: true }),
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
        class: "editorial-editor bg-white px-5 py-8 text-[#131313] sm:px-8 sm:py-10 md:px-24 md:py-24",
      },
      handleKeyDown: (_view, event) => {
        const isFindShortcut = (event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "f";

        if (isFindShortcut) {
          event.preventDefault();
          setFindOpen(true);
          return true;
        }

        return false;
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    docRef.current = activeDoc;
  }, [activeDoc]);

  const flushQueuedSave = async () => {
    if (!id || savingContentRef.current || !queuedSaveContentRef.current) {
      return;
    }

    if (!navigator.onLine) {
      setSaveStatus("queued");
      return;
    }

    const content = queuedSaveContentRef.current;
    queuedSaveContentRef.current = null;
    savingContentRef.current = true;
    setSaveStatus("saving");

    try {
      await api.put(`/docs/${id}`, { content });
      setSaveStatus(queuedSaveContentRef.current ? "queued" : "saved");
    } catch (requestError) {
      console.error("Document save failed", requestError);
      queuedSaveContentRef.current = content;
      setSaveStatus(navigator.onLine ? "error" : "queued");
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = window.setTimeout(() => {
        flushQueuedSave().catch(console.error);
      }, 3000);
    } finally {
      savingContentRef.current = false;
      if (queuedSaveContentRef.current && navigator.onLine) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          flushQueuedSave().catch(console.error);
        }, 250);
      }
    }
  };

  const queueSave = (content: string) => {
    queuedSaveContentRef.current = content;
    setSaveStatus(navigator.onLine ? "queued" : "queued");
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      flushQueuedSave().catch(console.error);
    }, 700);
  };

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      flushQueuedSave().catch(console.error);
    };
    const handleOffline = () => {
      setBrowserOnline(false);
      setSaveStatus((current) => (current === "saving" ? "queued" : current));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearTimeout(retryTimerRef.current);
    };
  }, [id]);

  useEffect(() => {
    const interval = window.setInterval(() => setPresenceClock(Date.now()), 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!queuedSaveContentRef.current || saveStatus === "saved") {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus]);

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
      setEditorRevision((current) => current + 1);
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
    let presenceInterval: number | undefined;
    let handleEditorUpdateRef: (() => void) | null = null;
    let handleSelectionUpdateRef: (() => void) | null = null;
    let handleEditorTypingRef: (() => void) | null = null;

    const initializeSocket = async () => {
      const token = getAuthToken();
      if (!isActive || !token) {
        return;
      }

      socket = connectSocket(token);
      const canEdit = currentDoc.role !== "viewer";

      const handleConnect = () => {
        setSocketState("connected");
        flushQueuedSave().catch(console.error);
      };
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
        setEditorRevision((current) => current + 1);
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
        setEditorRevision((current) => current + 1);
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

        queueSave(content);
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

      const handleSelectionUpdate = () => {
        setEditorSelectionRevision((current) => current + 1);
        emitCursorPosition();
      };
      const handleEditorTyping = () => {
        setEditorSelectionRevision((current) => current + 1);
        emitCursorPosition();
      };
      handleEditorUpdateRef = handleEditorUpdate;
      handleSelectionUpdateRef = handleSelectionUpdate;
      handleEditorTypingRef = handleEditorTyping;
      presenceInterval = window.setInterval(() => {
        socket?.emit("presence-ping", id);
      }, 15000);

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
      window.clearInterval(presenceInterval);
      if (handleEditorUpdateRef) editor.off("update", handleEditorUpdateRef);
      if (handleSelectionUpdateRef) editor.off("selectionUpdate", handleSelectionUpdateRef);
      if (handleEditorTypingRef) editor.off("transaction", handleEditorTypingRef);
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

  const addYoutubeVideo = () => {
    if (!editor) {
      return;
    }

    const videoUrl = window.prompt("Paste YouTube URL");

    if (!videoUrl) {
      return;
    }

    editor.chain().focus().setYoutubeVideo({ src: videoUrl }).run();
  };

  const insertTable = () => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const clearFormatting = () => {
    editor?.chain().focus().unsetAllMarks().clearNodes().run();
  };

  const applyBlockStyle = (value: string) => {
    if (!editor) {
      return;
    }

    const chain = editor.chain().focus();

    if (value === "paragraph") {
      chain.setParagraph().run();
      return;
    }

    const headingLevel = Number(value.replace("h", "")) as 1 | 2 | 3;
    chain.setHeading({ level: headingLevel }).run();
  };

  const findMatches = useMemo(
    () => collectSearchMatches(editor, findQuery, matchCase),
    [editor, findQuery, matchCase, editorRevision],
  );
  const selectedFindIndex = findMatches.length
    ? Math.min(activeFindIndex, findMatches.length - 1)
    : 0;

  const selectFindMatch = (index: number) => {
    if (!editor || !findMatches.length) {
      return;
    }

    const nextIndex = (index + findMatches.length) % findMatches.length;
    const match = findMatches[nextIndex];
    setActiveFindIndex(nextIndex);
    editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).scrollIntoView().run();
  };

  const replaceActiveMatch = () => {
    if (!editor || !findMatches.length) {
      return;
    }

    const match = findMatches[selectedFindIndex];
    editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).insertContent(replaceQuery).run();
    setActiveFindIndex(Math.min(selectedFindIndex, Math.max(findMatches.length - 2, 0)));
  };

  const replaceAllMatches = () => {
    if (!editor || !findMatches.length) {
      return;
    }

    const transaction = editor.state.tr;
    [...findMatches].reverse().forEach((match) => {
      transaction.insertText(replaceQuery, match.from, match.to);
    });
    editor.view.dispatch(transaction.scrollIntoView());
    setActiveFindIndex(0);
  };

  const transformSelectionText = (transformer: (value: string) => string) => {
    if (!editor || editor.state.selection.empty) {
      return;
    }

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, "\n");

    if (!selectedText) {
      return;
    }

    editor.chain().focus().insertContentAt({ from, to }, transformer(selectedText)).run();
  };

  const insertTimestamp = () => {
    const timestamp = new Date().toLocaleString();
    editor?.chain().focus().insertContent(timestamp).run();
  };

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
  };

  useEffect(() => {
    if (!findMatches.length && activeFindIndex !== 0) {
      setActiveFindIndex(0);
      return;
    }

    if (findMatches.length && activeFindIndex > findMatches.length - 1) {
      setActiveFindIndex(findMatches.length - 1);
    }
  }, [activeFindIndex, findMatches.length]);

  const addComment = async () => {
    if (!id || !commentBody.trim()) {
      return;
    }

    const selection = editor?.state.selection;
    const selectedText =
      editor && selection && !selection.empty
        ? editor.state.doc.textBetween(selection.from, selection.to, " ").slice(0, 180)
        : "";

    const response = await api.post<{ comment: DocComment }>(`/docs/${id}/comments`, {
      body: commentBody.trim(),
      position: selection
        ? {
            from: selection.from,
            to: selection.to,
            text: selectedText,
          }
        : null,
    });

    setComments((current) => [response.data.comment, ...current]);
    setCommentBody("");
  };

  const focusCommentPosition = (comment: DocComment) => {
    if (!editor || !comment.position?.from) {
      return;
    }

    const maxPos = Math.max(1, editor.state.doc.content.size);
    const from = clampCursorPosition(comment.position.from, maxPos);
    const to = clampCursorPosition(comment.position.to || comment.position.from, maxPos);
    editor.chain().focus().setTextSelection({ from: Math.min(from, to), to: Math.max(from, to) }).scrollIntoView().run();
  };

  const toggleCommentResolved = async (comment: DocComment) => {
    if (!id) return;

    const response = await api.put<{ comment: DocComment }>(`/docs/${id}/comments/${comment.id}`, {
      resolved: !comment.resolved,
    });

    setComments((current) =>
      current.map((item) => (item.id === comment.id ? response.data.comment : item)),
    );
  };

  const parseShareEmails = (value: string) =>
    value
      .split(/[\n,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

  const persistCollaborators = async (
    collaborators: Array<{ email: string; role: ShareRole }>,
    notifyEmails: string[] = [],
  ) => {
    if (!id) {
      throw new Error("Document id missing");
    }

    const response = await api.put<{ document: DocItem }>(`/docs/${id}`, {
      collaborators,
      notifyEmails,
    });

    setActiveDoc(response.data.document);
    upsertDoc(response.data.document);
    return response.data.document;
  };

  const handleShare = async () => {
    if (!id || !activeDoc) {
      return;
    }

    const emailsToShare = parseShareEmails(shareEmails);
    if (!emailsToShare.length) {
      setShareNotice("Enter at least one collaborator email.");
      return;
    }

    setSavingShare(true);
    setShareNotice("");
    setError("");

    try {
      const collaboratorsByEmail = new Map<string, { email: string; role: ShareRole }>();

      activeDoc.collaborators.forEach((item) => {
        collaboratorsByEmail.set(item.email.toLowerCase(), {
          email: item.email,
          role: item.role,
        });
      });

      emailsToShare.forEach((email) => {
        collaboratorsByEmail.set(email, { email, role: shareRole });
      });

      await persistCollaborators([...collaboratorsByEmail.values()], emailsToShare);
      setShareEmails("");
      setShareRole("editor");
      setShareNotice("Access updated. Invite emails are being sent in the background.");
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

  const removeCollaborator = async (email: string) => {
    if (!activeDoc || activeDoc.role !== "owner") {
      return;
    }

    setRemovingCollaboratorEmail(email);
    setShareNotice("");
    setError("");

    try {
      const collaborators = activeDoc.collaborators
        .filter((item) => item.email.toLowerCase() !== email.toLowerCase())
        .map((item) => ({ email: item.email, role: item.role }));

      await persistCollaborators(collaborators);
      setShareNotice(`${email} was removed from this document.`);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Collaborator remove nahi hua");
      } else {
        setError("Collaborator remove nahi hua");
      }
    } finally {
      setRemovingCollaboratorEmail("");
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

  const restoreVersion = async (version: any) => {
    if (!id || !editor) {
      return;
    }

    try {
      const response = await api.post<{ document: any }>(`/docs/${id}/versions/${version.id}/restore`);
      const restoredContent = response.data.document.content || version.content || "<p></p>";
      editor.commands.setContent(restoredContent, false);
      if (activeDoc) {
        const nextDoc = { ...activeDoc, content: restoredContent, updatedAt: new Date().toISOString() };
        setActiveDoc(nextDoc);
        upsertDoc(nextDoc);
      }
      await loadVersions();
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Version restore failed");
      } else {
        setError("Version restore failed");
      }
    }
  };

  const exportFromServer = async (format: ExportFormat) => {
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

  const editorDisabled = !editor || activeDoc?.role === "viewer";
  const isTableActive = editorSelectionRevision >= 0 && Boolean(editor?.isActive("table"));
  const canTransformSelection = Boolean(editor && !editor.state.selection.empty);
  const currentBlockStyle = editor?.isActive("heading", { level: 1 })
    ? "h1"
    : editor?.isActive("heading", { level: 2 })
      ? "h2"
      : editor?.isActive("heading", { level: 3 })
        ? "h3"
        : "paragraph";

  const toolbarItems = [
    {
      icon: "undo",
      action: () => editor?.chain().focus().undo().run(),
      active: false,
      label: "Undo",
      disabled: !editor?.can().undo(),
    },
    {
      icon: "redo",
      action: () => editor?.chain().focus().redo().run(),
      active: false,
      label: "Redo",
      disabled: !editor?.can().redo(),
    },
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
      icon: "strikethrough_s",
      action: () => editor?.chain().focus().toggleStrike().run(),
      active: editor?.isActive("strike"),
      label: "Strike",
    },
    {
      icon: "code",
      action: () => editor?.chain().focus().toggleCode().run(),
      active: editor?.isActive("code"),
      label: "Inline code",
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
      icon: "checklist",
      action: () => editor?.chain().focus().toggleTaskList().run(),
      active: editor?.isActive("taskList"),
      label: "Tasks",
    },
    {
      icon: "add_link",
      action: applyLink,
      active: editor?.isActive("link"),
      label: "Link",
    },
    {
      icon: "link_off",
      action: removeLink,
      active: false,
      label: "Unlink",
      disabled: !editor?.isActive("link"),
    },
    {
      icon: "image",
      action: addImage,
      active: false,
      label: "Image",
    },
    {
      icon: "smart_display",
      action: addYoutubeVideo,
      active: false,
      label: "YouTube",
    },
    {
      icon: "table",
      action: insertTable,
      active: editor?.isActive("table"),
      label: "Table",
    },
    {
      icon: "code_blocks",
      action: () => editor?.chain().focus().toggleCodeBlock().run(),
      active: editor?.isActive("codeBlock"),
      label: "Code block",
    },
    {
      icon: "horizontal_rule",
      action: () => editor?.chain().focus().setHorizontalRule().run(),
      active: false,
      label: "Horizontal rule",
    },
    {
      icon: "find_replace",
      action: () => setFindOpen((current) => !current),
      active: findOpen,
      label: "Find and replace",
      disabled: false,
    },
  ];
  const tableToolItems = [
    { icon: "keyboard_arrow_left", label: "Column before", action: () => editor?.chain().focus().addColumnBefore().run() },
    { icon: "keyboard_arrow_right", label: "Column after", action: () => editor?.chain().focus().addColumnAfter().run() },
    { icon: "view_week", label: "Delete column", action: () => editor?.chain().focus().deleteColumn().run() },
    { icon: "keyboard_arrow_up", label: "Row above", action: () => editor?.chain().focus().addRowBefore().run() },
    { icon: "keyboard_arrow_down", label: "Row below", action: () => editor?.chain().focus().addRowAfter().run() },
    { icon: "table_rows", label: "Delete row", action: () => editor?.chain().focus().deleteRow().run() },
    { icon: "merge", label: "Merge cells", action: () => editor?.chain().focus().mergeCells().run() },
    { icon: "call_split", label: "Split cell", action: () => editor?.chain().focus().splitCell().run() },
    { icon: "title", label: "Header row", action: () => editor?.chain().focus().toggleHeaderRow().run() },
    { icon: "view_column", label: "Header column", action: () => editor?.chain().focus().toggleHeaderColumn().run() },
    { icon: "delete", label: "Delete table", action: () => editor?.chain().focus().deleteTable().run() },
  ];

  const fileMenuItems = [
    { label: "Rename document", action: handleRename },
    { label: "Share document", action: () => setShareModalOpen(true) },
    { label: "Import file", action: importFile },
    { label: "Preview export", action: () => setExportPreviewFormat("markdown") },
    { label: "Export as HTML", action: () => setExportPreviewFormat("html") },
    { label: "Export as Markdown", action: () => setExportPreviewFormat("markdown") },
    { label: "Export as PDF", action: () => setExportPreviewFormat("pdf") },
    { label: "Export as DOCX", action: () => setExportPreviewFormat("docx") },
    { label: "Export as TXT", action: () => setExportPreviewFormat("txt") },
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
    { label: "Find and replace", action: () => setFindOpen(true) },
    { label: "Select all", action: () => editor?.chain().focus().selectAll().run() },
    { label: "Paragraph", action: () => editor?.chain().focus().setParagraph().run() },
    { label: "Heading 1", action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: "Heading 2", action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Heading 3", action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: "Bold", action: () => editor?.chain().focus().toggleBold().run() },
    { label: "Italic", action: () => editor?.chain().focus().toggleItalic().run() },
    { label: "Underline", action: () => editor?.chain().focus().toggleUnderline().run() },
    { label: "Strike", action: () => editor?.chain().focus().toggleStrike().run() },
    { label: "Inline code", action: () => editor?.chain().focus().toggleCode().run() },
    { label: "Remove link", action: removeLink },
    { label: "Task list", action: () => editor?.chain().focus().toggleTaskList().run() },
    { label: "Insert table", action: insertTable },
    { label: "Add row below", action: () => editor?.chain().focus().addRowAfter().run() },
    { label: "Add column right", action: () => editor?.chain().focus().addColumnAfter().run() },
    { label: "Delete row", action: () => editor?.chain().focus().deleteRow().run() },
    { label: "Delete column", action: () => editor?.chain().focus().deleteColumn().run() },
    { label: "Insert YouTube embed", action: addYoutubeVideo },
    { label: "Insert timestamp", action: insertTimestamp },
    { label: "Horizontal rule", action: () => editor?.chain().focus().setHorizontalRule().run() },
    { label: "Uppercase selection", action: () => transformSelectionText((value) => value.toLocaleUpperCase()) },
    { label: "Lowercase selection", action: () => transformSelectionText((value) => value.toLocaleLowerCase()) },
    { label: "Title Case selection", action: () => transformSelectionText(toTitleCase) },
    { label: "Clear formatting", action: clearFormatting },
    { label: "Align left", action: () => editor?.chain().focus().setTextAlign("left").run() },
    { label: "Align center", action: () => editor?.chain().focus().setTextAlign("center").run() },
    { label: "Align right", action: () => editor?.chain().focus().setTextAlign("right").run() },
    { label: "Justify", action: () => editor?.chain().focus().setTextAlign("justify").run() },
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

  const filteredComments = comments.filter((comment) => {
    if (commentFilter === "all") return true;
    if (commentFilter === "resolved") return comment.resolved;
    return !comment.resolved;
  });
  const openCommentCount = comments.filter((comment) => !comment.resolved).length;
  const resolvedCommentCount = comments.length - openCommentCount;
  const exportPreviewTitle =
    exportPreviewFormat === "html"
      ? "HTML export"
      : exportPreviewFormat === "pdf"
        ? "PDF export"
        : exportPreviewFormat === "docx"
          ? "DOCX export"
          : exportPreviewFormat === "txt"
            ? "Plain text export"
            : "Markdown export";
  const exportPreviewText = stripContent(activeDoc?.content || "");
  const wordCount = exportPreviewText.split(/\s+/).filter(Boolean).length;
  const characterCount = exportPreviewText.length;
  const activePresence = activeUsers.map((user) => {
    const lastSeen = user.lastSeen || new Date(presenceClock).toISOString();
    const idle = Date.now() - new Date(lastSeen).getTime() > PRESENCE_IDLE_MS;
    return { ...user, idle };
  });
  const idleCount = activePresence.filter((user) => user.idle).length;
  const onlineProblem = !browserOnline || socketState !== "connected";
  const saveStatusLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "queued"
        ? "Queued"
        : saveStatus === "error"
          ? "Retrying"
          : "Saved";

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
      <header className="sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-white/5 bg-[#131313] px-3 text-sm font-medium tracking-tight sm:px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3 md:gap-6">
          <span className="shrink-0 text-base font-bold uppercase tracking-tighter text-white sm:text-xl">Editorial</span>
          <div className="relative flex items-center gap-2 text-[#a3a3a3]">
            <button
              type="button"
              onClick={() => setOpenMenu((current) => (current ? null : "file"))}
              className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs font-semibold text-white transition hover:bg-[#201f1f] md:hidden"
            >
              <span className="material-symbols-outlined text-base">menu</span>
              Menu
            </button>
            {(["file", "edit", "view"] as const).map((menu) => (
              <button
                key={menu}
                type="button"
                onClick={() => setOpenMenu((current) => (current === menu ? null : menu))}
                className={`${menuButtonClass} hidden md:inline-flex ${openMenu === menu ? "border border-white/20 text-white" : ""}`}
              >
                {menu[0].toUpperCase() + menu.slice(1)}
              </button>
            ))}

            {openMenu ? (
              <div className="absolute right-0 top-11 z-[90] max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded border border-white/10 bg-surface-container p-2 shadow-2xl md:left-0 md:right-auto md:min-w-[220px]">
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

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <span className={`hidden text-[10px] font-bold uppercase tracking-[0.2em] sm:inline ${socketState === "connected" ? "text-primary" : "text-on-surface-variant"}`}>
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
        <aside
          className={`fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-white/5 bg-[#0e0e0e] pb-4 pt-16 transition-[width] duration-200 lg:flex ${
            sidebarCollapsed ? "w-20" : "w-64"
          }`}
        >
          <div className={`mb-8 flex gap-3 px-4 ${sidebarCollapsed ? "flex-col items-center" : "items-center justify-between"}`}>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container">
                <span className="material-symbols-outlined text-sm text-primary">grid_view</span>
              </div>
              {!sidebarCollapsed ? (
                <div className="min-w-0">
                  <div className="text-lg font-bold leading-none text-white">Arena</div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="rounded p-1.5 text-on-surface-variant transition hover:bg-white/10 hover:text-white"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="material-symbols-outlined text-lg">
                {sidebarCollapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"}
              </span>
            </button>
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
                title={sidebarCollapsed ? item.label : undefined}
                className={`flex w-full items-center rounded px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest transition-all duration-150 ${
                  sidebarCollapsed ? "justify-center" : "gap-3"
                } ${
                  location.pathname === item.to
                    ? "border-r-2 border-primary-container bg-[#1c1b1b] text-[#10b981]"
                    : `text-[#a3a3a3] hover:bg-[#1c1b1b] hover:text-white ${sidebarCollapsed ? "" : "hover:translate-x-1"}`
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                {!sidebarCollapsed ? <span>{item.label}</span> : null}
              </button>
            ))}
          </nav>
        </aside>

        <main
          className={`relative flex flex-1 flex-col overflow-hidden bg-surface-container-lowest transition-[margin] duration-200 ${
            sidebarCollapsed ? "lg:ml-20" : "lg:ml-64"
          }`}
        >
          <header className="sticky top-0 z-30 flex min-h-16 flex-col items-stretch justify-between gap-3 border-b border-white/5 bg-surface-container-lowest px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3 md:gap-4">
              <div className="min-w-0 flex-1 md:flex-none">
                <h1 className="truncate text-base font-bold tracking-tight text-on-surface sm:text-lg">{activeDoc?.title}</h1>
                <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-[#a3a3a3] sm:block">
                  Doc ID: {id}
                </p>
                {tags.length ? (
                  <div className="mt-2 flex max-w-full flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
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
              </div>
              <div className="flex items-center gap-2 rounded border border-white/5 bg-surface-container-high px-2 py-0.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    saveStatus === "saved"
                      ? "bg-primary shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                      : saveStatus === "error"
                        ? "bg-red-400"
                        : "bg-yellow-300"
                  }`}
                />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#a3a3a3]">{saveStatusLabel}</span>
              </div>
              {activePresence.length > 0 && (
                <div className="hidden items-center gap-3 sm:flex lg:ml-4">
                  <div className="flex -space-x-2 overflow-hidden">
                    {activePresence.map((u) => (
                      <div
                        key={u.sessionId}
                        title={`${u.email || "Anonymous"} · ${u.idle ? "idle" : "active"} · ${formatLastSeen(u.lastSeen)}`}
                        className={`inline-block h-6 w-6 rounded-full ring-2 ring-surface-container-lowest flex items-center justify-center text-[10px] font-bold text-white uppercase ${
                          u.idle ? "bg-surface-container-highest opacity-60" : "bg-primary/80"
                        }`}
                      >
                        {(u.email || "A")[0]}
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    {activePresence.length} online{idleCount ? ` · ${idleCount} idle` : ""}
                  </span>
                </div>
              )}
              {activeDoc?.role ? (
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${roleBadgeClass(activeDoc.role)}`}>
                  {activeDoc.role}
                </span>
              ) : null}
              <span className="hidden rounded border border-white/5 bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant md:inline-flex">
                {wordCount} words · {characterCount} chars
              </span>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:items-center sm:justify-end md:gap-3">
              <button
                type="button"
                onClick={() => setMobilePanel("comments")}
                className="emerald-muted-button flex-1 sm:flex-none xl:hidden"
              >
                <span className="material-symbols-outlined text-sm">chat_bubble</span>
                Comments
              </button>
              <button
                type="button"
                onClick={() => {
                  loadVersions();
                  setMobilePanel("versions");
                }}
                className="emerald-muted-button flex-1 sm:flex-none xl:hidden"
              >
                <span className="material-symbols-outlined text-sm">history</span>
                Versions
              </button>
              <button type="button" onClick={() => setShareModalOpen(true)} className="emerald-primary-button flex-1 sm:flex-none">
                Share
              </button>
              <button
                type="button"
                onClick={loadDocument}
                className="rounded p-2 text-[#a3a3a3] transition hover:bg-[#201f1f] hover:text-white"
                title="Refresh document"
              >
                <span className="material-symbols-outlined">refresh</span>
              </button>
            </div>
          </header>

          {onlineProblem ? (
            <div className="border-b border-yellow-400/20 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 md:px-8">
              {!browserOnline
                ? "You are offline. Edits are queued locally and will retry when your connection returns."
                : "Realtime connection is unavailable. Edits keep saving through the retry queue."}
            </div>
          ) : null}

          {activePresence.length ? (
            <div className="border-b border-white/5 bg-surface-container-lowest px-4 py-2 md:px-8">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
                <span className="font-bold uppercase tracking-widest text-primary">Collaborators</span>
                {activePresence.map((user) => (
                  <span
                    key={user.sessionId}
                    className={`rounded-full border px-2 py-1 ${
                      user.idle
                        ? "border-white/10 bg-white/5 text-on-surface-variant"
                        : "border-primary/30 bg-primary/10 text-primary"
                    }`}
                  >
                    {user.email || "Anonymous"} · {user.idle ? "idle" : "active"} · {formatLastSeen(user.lastSeen)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div
            className="flex flex-1 overflow-y-auto px-3 pb-24 pt-4 sm:px-4 md:px-8 md:pb-32 md:pt-8"
            onScroll={() => setScrollVersion((current) => current + 1)}
          >
            <div className={`mx-auto w-full min-w-0 flex-1 ${wideCanvas ? "max-w-[1080px]" : "max-w-[800px]"}`}>
              <div className="sticky top-2 z-40 mx-auto mb-6 flex flex-col items-center justify-center gap-2 md:top-4 md:mb-12">
                <div className="editorial-editor-toolbar flex w-full max-w-[calc(100vw-1.5rem)] flex-nowrap items-center justify-start gap-1 overflow-x-auto rounded border border-white/10 bg-surface-container-highest/90 px-2 py-2 shadow-2xl backdrop-blur-xl sm:max-w-full sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-4">
                  <select
                    value={currentBlockStyle}
                    disabled={editorDisabled}
                    onChange={(event) => applyBlockStyle(event.target.value)}
                    className="mr-1 h-8 shrink-0 rounded border border-white/10 bg-surface-container px-2 text-xs font-semibold text-white outline-none transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 md:mr-2"
                    title="Block style"
                  >
                    <option value="paragraph">Body</option>
                    <option value="h1">H1</option>
                    <option value="h2">H2</option>
                    <option value="h3">H3</option>
                  </select>
                  {toolbarItems.map((item, index) => (
                    <div key={item.label} className="flex items-center">
                      <button
                        type="button"
                        title={item.label}
                        disabled={editorDisabled || Boolean(item.disabled)}
                        onClick={item.action}
                        className={item.active ? "active" : ""}
                      >
                        <span className="material-symbols-outlined text-lg">{item.icon}</span>
                      </button>
                      {index === 1 || index === 6 || index === 9 || index === 11 || index === 14 ? (
                        <div className="mx-1 hidden h-4 w-px bg-white/10 sm:block md:mx-2" />
                      ) : null}
                    </div>
                  ))}
                  <div className="mx-1 hidden h-4 w-px bg-white/10 sm:block md:mx-2" />
                  {(["left", "center", "right", "justify"] as const).map((alignment) => (
                    <button
                      key={alignment}
                      type="button"
                      title={`Align ${alignment}`}
                      disabled={editorDisabled}
                      onClick={() => editor?.chain().focus().setTextAlign(alignment).run()}
                      className={editor?.isActive({ textAlign: alignment }) ? "active" : ""}
                    >
                      <span className="material-symbols-outlined text-lg">
                        {alignment === "left"
                          ? "format_align_left"
                          : alignment === "center"
                            ? "format_align_center"
                            : alignment === "right"
                              ? "format_align_right"
                              : "format_align_justify"}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    title="Quote"
                    disabled={editorDisabled}
                    onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                    className={editor?.isActive("blockquote") ? "active" : ""}
                  >
                    <span className="material-symbols-outlined text-lg">format_quote</span>
                  </button>
                  <button
                    type="button"
                    title="Clear formatting"
                    disabled={editorDisabled}
                    onClick={clearFormatting}
                  >
                    <span className="material-symbols-outlined text-lg">format_clear</span>
                  </button>
                  <div className="mx-1 hidden h-4 w-px bg-white/10 sm:block md:mx-2" />
                  <div className="flex shrink-0 items-center gap-1" title="Text color">
                    {textColorOptions.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        disabled={editorDisabled}
                        onClick={() => editor?.chain().focus().setColor(color.value).run()}
                        className={`h-6 w-6 rounded-full border !p-0 ${
                          editor?.isActive("textStyle", { color: color.value }) ? "border-white" : "border-white/20"
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={`${color.label} text`}
                      />
                    ))}
                    <button
                      type="button"
                      disabled={editorDisabled}
                      onClick={() => editor?.chain().focus().unsetColor().removeEmptyTextStyle().run()}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 !p-0 text-[10px] font-bold text-white"
                      title="Clear text color"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex shrink-0 items-center gap-1" title="Highlight color">
                    {highlightColorOptions.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        disabled={editorDisabled}
                        onClick={() => editor?.chain().focus().toggleHighlight({ color: color.value }).run()}
                        className={`h-6 w-6 rounded-full border !p-0 ${
                          editor?.isActive("highlight", { color: color.value }) ? "border-white" : "border-white/20"
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={`${color.label} highlight`}
                      />
                    ))}
                    <button
                      type="button"
                      disabled={editorDisabled}
                      onClick={() => editor?.chain().focus().unsetHighlight().run()}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 !p-0 text-[10px] font-bold text-white"
                      title="Clear highlight"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {isTableActive ? (
                  <div className="editorial-editor-toolbar flex w-full max-w-[calc(100vw-1.5rem)] flex-nowrap items-center justify-start gap-1 overflow-x-auto rounded border border-white/10 bg-surface-container-highest/90 px-3 py-2 shadow-xl backdrop-blur-xl sm:max-w-full sm:flex-wrap sm:justify-center sm:overflow-visible">
                    {tableToolItems.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        title={item.label}
                        disabled={editorDisabled}
                        onClick={item.action}
                      >
                        <span className="material-symbols-outlined text-lg">{item.icon}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {findOpen ? (
                  <div className="flex w-full max-w-[calc(100vw-1.5rem)] flex-col items-stretch gap-2 rounded border border-white/10 bg-surface-container-highest/95 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-xl sm:max-w-full sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
                    <div className="flex w-full items-center gap-2 rounded border border-white/10 bg-surface-container px-2 py-1 sm:w-auto">
                      <span className="material-symbols-outlined text-base text-on-surface-variant">search</span>
                      <input
                        value={findQuery}
                        onChange={(event) => setFindQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            selectFindMatch(selectedFindIndex + (event.shiftKey ? -1 : 1));
                          }
                        }}
                        className="w-full border-0 bg-transparent text-xs text-white outline-none placeholder:text-on-surface-variant sm:w-36"
                        placeholder="Find"
                      />
                    </div>
                    <div className="flex w-full items-center gap-2 rounded border border-white/10 bg-surface-container px-2 py-1 sm:w-auto">
                      <span className="material-symbols-outlined text-base text-on-surface-variant">edit</span>
                      <input
                        value={replaceQuery}
                        onChange={(event) => setReplaceQuery(event.target.value)}
                        className="w-full border-0 bg-transparent text-xs text-white outline-none placeholder:text-on-surface-variant sm:w-36"
                        placeholder="Replace"
                      />
                    </div>
                    <span className="min-w-[72px] text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {findQuery ? `${findMatches.length ? selectedFindIndex + 1 : 0}/${findMatches.length}` : "0/0"}
                    </span>
                    <button
                      type="button"
                      onClick={() => selectFindMatch(selectedFindIndex - 1)}
                      disabled={!findMatches.length}
                      className="rounded border border-white/10 px-2 py-1 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Previous match"
                    >
                      <span className="material-symbols-outlined text-base">keyboard_arrow_up</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => selectFindMatch(selectedFindIndex + 1)}
                      disabled={!findMatches.length}
                      className="rounded border border-white/10 px-2 py-1 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Next match"
                    >
                      <span className="material-symbols-outlined text-base">keyboard_arrow_down</span>
                    </button>
                    <label className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      <input
                        type="checkbox"
                        checked={matchCase}
                        onChange={(event) => setMatchCase(event.target.checked)}
                        className="h-3 w-3 accent-primary"
                      />
                      Aa
                    </label>
                    <button
                      type="button"
                      onClick={replaceActiveMatch}
                      disabled={editorDisabled || !findMatches.length}
                      className="rounded border border-white/10 px-2 py-1 font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={replaceAllMatches}
                      disabled={editorDisabled || !findMatches.length}
                      className="rounded border border-primary/40 bg-primary/10 px-2 py-1 font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Replace all
                    </button>
                    <button
                      type="button"
                      onClick={() => setFindOpen(false)}
                      className="rounded p-1 text-on-surface-variant transition hover:bg-white/10 hover:text-white"
                      title="Close find and replace"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                ) : null}

                {canTransformSelection ? (
                  <div className="flex w-full max-w-[calc(100vw-1.5rem)] flex-nowrap items-center justify-start gap-1 overflow-x-auto rounded border border-white/10 bg-surface-container-highest/90 px-2 py-1.5 text-xs shadow-xl backdrop-blur-xl sm:w-auto sm:max-w-full sm:flex-wrap sm:justify-center sm:overflow-visible">
                    <span className="shrink-0 px-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Selection</span>
                    <button
                      type="button"
                      disabled={editorDisabled}
                      onClick={() => transformSelectionText((value) => value.toLocaleUpperCase())}
                      className="rounded px-2 py-1 font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      AA
                    </button>
                    <button
                      type="button"
                      disabled={editorDisabled}
                      onClick={() => transformSelectionText((value) => value.toLocaleLowerCase())}
                      className="rounded px-2 py-1 font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      aa
                    </button>
                    <button
                      type="button"
                      disabled={editorDisabled}
                      onClick={() => transformSelectionText(toTitleCase)}
                      className="rounded px-2 py-1 font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Aa
                    </button>
                    <button
                      type="button"
                      disabled={editorDisabled}
                      onClick={insertTimestamp}
                      className="rounded px-2 py-1 font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Time
                    </button>
                  </div>
                ) : null}
              </div>

              <div ref={editorSurfaceRef} className="relative overflow-hidden rounded-md bg-white shadow-2xl sm:rounded-lg">
                <div className="border-b border-black/5 bg-white px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#737373] sm:px-8 md:px-24 md:py-5 md:text-xs">
                  Editorial Canvas · Precision Mode
                </div>

                {!editor ? (
                  <div className="flex min-h-[620px] items-center justify-center bg-white p-8 text-sm text-[#404040] md:min-h-[1200px] md:p-16">
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
              <span className="text-[10px] font-bold text-primary">{openCommentCount} Open</span>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded border border-white/5 bg-surface-container-low p-1">
              {(["open", "resolved", "all"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setCommentFilter(filter)}
                  className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                    commentFilter === filter ? "bg-primary/20 text-primary" : "text-on-surface-variant hover:text-white"
                  }`}
                >
                  {filter === "open" ? `Open ${openCommentCount}` : filter === "resolved" ? `Done ${resolvedCommentCount}` : "All"}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded border border-white/5 bg-surface-container-high p-3">
                <span className="material-symbols-outlined text-sm text-[#a3a3a3]">chat_bubble</span>
                <input
                  className="flex-1 border-none bg-transparent text-xs text-white placeholder-[#a3a3a3] focus:ring-0"
                  placeholder="Type a comment or @mention an email..."
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  type="text"
                />
              </div>
              <button type="button" onClick={() => addComment().catch(console.error)} className="emerald-primary-button w-full">
                Add Comment
              </button>
            </div>

            {filteredComments.length ? (
              filteredComments.map((comment) => (
                <div
                  key={comment.id}
                  className={`space-y-3 rounded-lg border-l-2 bg-surface-container p-4 shadow-sm ${
                    comment.resolved ? "border-white/10 opacity-75" : "border-primary"
                  }`}
                >
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
                  {comment.position?.text ? (
                    <button
                      type="button"
                      onClick={() => focusCommentPosition(comment)}
                      className="w-full rounded border border-white/10 bg-surface-container-high px-2 py-1 text-left text-[11px] text-on-surface-variant transition hover:border-primary/40 hover:text-primary"
                    >
                      Linked: "{comment.position.text}"
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleCommentResolved(comment).catch(console.error)}
                    className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant transition hover:border-primary/40 hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {comment.resolved ? "undo" : "task_alt"}
                    </span>
                    {comment.resolved ? "Reopen" : "Resolve"}
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-surface-container/50 p-4 text-sm text-on-surface-variant">
                No {commentFilter === "all" ? "" : commentFilter} comments for this document.
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
                        restoreVersion(version).catch(console.error);
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

        {mobilePanel === "comments" ? (
          <div
            className="fixed inset-0 z-[80] flex items-end bg-black/75 xl:hidden"
            onClick={() => setMobilePanel(null)}
          >
            <section
              className="max-h-[82vh] w-full overflow-y-auto rounded-t-lg border-t border-white/10 bg-surface p-4 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a3a3a3]">Comments</h4>
                  <p className="mt-1 text-xs text-primary">{openCommentCount} open</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobilePanel(null)}
                  className="rounded p-2 text-[#a3a3a3] transition hover:bg-surface-container-high hover:text-white"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-1 rounded border border-white/5 bg-surface-container-low p-1">
                {(["open", "resolved", "all"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setCommentFilter(filter)}
                    className={`rounded px-2 py-2 text-[10px] font-bold uppercase tracking-widest transition ${
                      commentFilter === filter ? "bg-primary/20 text-primary" : "text-on-surface-variant active:bg-white/10"
                    }`}
                  >
                    {filter === "open" ? `Open ${openCommentCount}` : filter === "resolved" ? `Done ${resolvedCommentCount}` : "All"}
                  </button>
                ))}
              </div>

              <div className="mb-5 space-y-3">
                <div className="flex items-center gap-3 rounded border border-white/5 bg-surface-container-high p-3">
                  <span className="material-symbols-outlined text-sm text-[#a3a3a3]">chat_bubble</span>
                  <input
                    className="min-w-0 flex-1 border-none bg-transparent text-xs text-white placeholder-[#a3a3a3] focus:ring-0"
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

              <div className="space-y-3">
                {filteredComments.length ? (
                  filteredComments.map((comment) => (
                    <div
                      key={`mobile-${comment.id}`}
                      className={`space-y-3 rounded-lg border-l-2 bg-surface-container p-4 shadow-sm ${
                        comment.resolved ? "border-white/10 opacity-75" : "border-primary"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-container-highest text-[10px] uppercase text-white">
                          {comment.author.email.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-bold text-white">{comment.author.email}</div>
                          <div className="text-[9px] text-[#a3a3a3]">{new Date(comment.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed text-[#bbcabf]">{comment.body}</p>
                      {comment.position?.text ? (
                        <button
                          type="button"
                          onClick={() => {
                            focusCommentPosition(comment);
                            setMobilePanel(null);
                          }}
                          className="w-full rounded border border-white/10 bg-surface-container-high px-2 py-2 text-left text-[11px] text-on-surface-variant transition active:border-primary/40 active:text-primary"
                        >
                          Linked: "{comment.position.text}"
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleCommentResolved(comment).catch(console.error)}
                        className="flex w-full items-center justify-center gap-1 rounded border border-white/10 px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant transition active:border-primary/40 active:text-primary"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {comment.resolved ? "undo" : "task_alt"}
                        </span>
                        {comment.resolved ? "Reopen" : "Resolve"}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg bg-surface-container/50 p-4 text-sm text-on-surface-variant">
                    No {commentFilter === "all" ? "" : commentFilter} comments for this document.
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {mobilePanel === "versions" ? (
          <div
            className="fixed inset-0 z-[80] flex items-end bg-black/75 xl:hidden"
            onClick={() => setMobilePanel(null)}
          >
            <section
              className="max-h-[82vh] w-full overflow-y-auto rounded-t-lg border-t border-white/10 bg-surface p-4 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a3a3a3]">Version History</h4>
                  <p className="mt-1 text-xs text-primary">{versions.length} snapshots</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobilePanel(null)}
                  className="rounded p-2 text-[#a3a3a3] transition hover:bg-surface-container-high hover:text-white"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <button
                type="button"
                onClick={snapshotVersion}
                disabled={creatingVersion}
                className="emerald-primary-button mb-4 w-full"
              >
                {creatingVersion ? "Saving..." : "Create Snapshot"}
              </button>

              {versions.length ? (
                <div className="space-y-3">
                  {versions.map((version) => (
                    <button
                      key={`mobile-version-${version.id}`}
                      type="button"
                      className="w-full space-y-2 rounded-lg border border-white/5 bg-surface-container p-4 text-left transition-colors active:border-primary/50"
                      onClick={() => {
                        if (window.confirm("Restore this version? This will replace your current content.")) {
                          restoreVersion(version).catch(console.error);
                          setMobilePanel(null);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-bold text-white">Snapshot</span>
                        <span className="text-right text-[9px] text-[#a3a3a3]">{new Date(version.created_at).toLocaleString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-surface-container/50 p-4 text-sm text-on-surface-variant">
                  No saved versions yet.
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>

      {shareModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 px-0 sm:items-center sm:px-4">
          <div className="editorial-panel max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-outline-variant/10 p-4 shadow-2xl sm:rounded-lg sm:p-6">
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
              {shareNotice ? (
                <div className="rounded border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                  {shareNotice}
                </div>
              ) : null}
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
	                      <div key={`${item.id}-${item.email}`} className="flex flex-col items-start justify-between gap-3 rounded bg-surface-container-high p-3 text-sm text-white sm:flex-row sm:items-center">
	                        <span className="max-w-full min-w-0 truncate">{item.email}</span>
	                        <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-start">
	                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${roleBadgeClass(item.role)}`}>
	                            {item.role}
	                          </span>
	                          {activeDoc?.role === "owner" ? (
	                            <button
	                              type="button"
	                              onClick={() => removeCollaborator(item.email).catch(console.error)}
	                              disabled={savingShare || removingCollaboratorEmail === item.email}
	                              title={`Remove ${item.email}`}
	                              className="flex h-8 w-8 items-center justify-center rounded border border-red-500/20 bg-red-500/10 text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
	                            >
	                              <span className="material-symbols-outlined text-[17px]">
	                                {removingCollaboratorEmail === item.email ? "hourglass_empty" : "person_remove"}
	                              </span>
	                            </button>
	                          ) : null}
	                        </div>
	                      </div>
	                    ))
	                  ) : (
                    <div className="text-sm text-on-surface-variant">No collaborators added yet.</div>
                  )}
                </div>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={() => saveTags().catch(console.error)}
                  disabled={savingTags || activeDoc?.role === "viewer"}
                  className="emerald-muted-button w-full sm:w-auto"
                >
                  {savingTags ? "Saving tags..." : "Save tags"}
                </button>
                <button type="button" onClick={() => setShareModalOpen(false)} className="emerald-muted-button w-full sm:w-auto">
                  Cancel
                </button>
                <button type="button" onClick={() => handleShare().catch(console.error)} disabled={savingShare} className="emerald-primary-button w-full sm:w-auto">
                  {savingShare ? "Saving..." : "Share"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {exportPreviewFormat ? (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/75 px-0 sm:items-center sm:px-4">
          <div className="editorial-panel flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-lg border border-outline-variant/10 p-4 shadow-2xl sm:max-h-[86vh] sm:rounded-lg sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Export preview</p>
                <h2 className="mt-2 text-2xl font-bold text-white">{exportPreviewTitle}</h2>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {activeDoc?.title || "Untitled"} · {wordCount} words
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportPreviewFormat(null)}
                className="rounded p-2 text-[#a3a3a3] transition hover:bg-surface-container-high hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {(["markdown", "html", "pdf", "docx", "txt"] as ExportFormat[]).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setExportPreviewFormat(format)}
                  className={`rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition ${
                    exportPreviewFormat === format
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-white/10 text-on-surface-variant hover:text-white"
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded border border-white/10 bg-white p-4 text-[#171717] sm:p-6">
              {exportPreviewFormat === "html" ? (
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: activeDoc?.content || "<p></p>" }}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
                  {exportPreviewText || "No content yet."}
                </pre>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button type="button" onClick={() => setExportPreviewFormat(null)} className="emerald-muted-button w-full sm:w-auto">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const format = exportPreviewFormat;
                  setExportPreviewFormat(null);
                  exportFromServer(format).catch(console.error);
                }}
                className="emerald-primary-button w-full sm:w-auto"
              >
                Download {exportPreviewFormat.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default EditorPage;
