import axios from "axios";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { DocItem, useDocStore } from "../store/docStore";
import { SearchResultItem } from "../types";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

type PaletteAction = {
  id: string;
  label: string;
  icon: string;
  run: () => void | Promise<void>;
};

const quickActions = [
  { id: "workspace", label: "Workspace", icon: "grid_view", to: "/dashboard" },
  { id: "discover", label: "Discover", icon: "manage_search", to: "/discover" },
  { id: "library", label: "Library", icon: "library_books", to: "/library" },
  { id: "analytics", label: "Analytics", icon: "monitoring", to: "/analytics" },
  { id: "drafts", label: "Drafts", icon: "description", to: "/drafts" },
  { id: "collections", label: "Collections", icon: "folder_open", to: "/collections" },
  { id: "team", label: "Team", icon: "groups", to: "/teams" },
  { id: "trash", label: "Trash", icon: "delete", to: "/dashboard?trash=1" },
  { id: "settings", label: "Settings", icon: "settings", to: "/settings" },
];

const normalize = (value: string) => value.trim().toLowerCase();

const CommandPalette = ({ open, onClose }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const upsertDoc = useDocStore((state) => state.upsertDoc);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const createDocument = async () => {
    const title = query.trim() || "Untitled document";
    setCreating(true);
    setError("");
    try {
      const response = await api.post<{ document: DocItem }>("/docs", {
        title,
        collaborators: [],
      });
      upsertDoc(response.data.document);
      onClose();
      navigate(`/editor/${response.data.document.id}`);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Document create nahi hua");
      } else {
        setError("Document create nahi hua");
      }
    } finally {
      setCreating(false);
    }
  };

  const actions = useMemo<PaletteAction[]>(() => {
    const normalized = normalize(query);
    const visibleActions = quickActions.filter((action) => normalize(action.label).includes(normalized));

    return [
      {
        id: "new-document",
        label: query.trim() ? `New document: ${query.trim()}` : "New document",
        icon: "add",
        run: createDocument,
      },
      ...visibleActions.map((action) => ({
        id: action.id,
        label: action.label,
        icon: action.icon,
        run: () => {
          onClose();
          navigate(action.to);
        },
      })),
    ];
  }, [query, navigate, onClose]);

  const selectableCount = actions.length + results.length;

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setError("");
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await api.get<{ results: SearchResultItem[] }>("/docs/search", {
          params: { q: trimmed },
        });
        if (!cancelled) {
          setResults((response.data.results || []).slice(0, 6));
          setSelectedIndex(0);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError("Search failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open || selectedIndex < selectableCount) {
      return;
    }
    setSelectedIndex(Math.max(0, selectableCount - 1));
  }, [open, selectableCount, selectedIndex]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError("");
      setSelectedIndex(0);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const runSelected = () => {
    const selectedAction = actions[selectedIndex];
    if (selectedAction) {
      selectedAction.run();
      return;
    }

    const result = results[selectedIndex - actions.length];
    if (result) {
      onClose();
      navigate(`/editor/${result.id}`);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % Math.max(selectableCount, 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + Math.max(selectableCount, 1)) % Math.max(selectableCount, 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runSelected();
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/70 px-3 pt-16 sm:px-6 sm:pt-24" onMouseDown={onClose}>
      <div
        className="editorial-panel w-full max-w-2xl overflow-hidden rounded-lg border border-outline-variant/10 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="material-symbols-outlined text-on-surface-variant">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 border-0 bg-transparent text-base text-white outline-none placeholder:text-on-surface-variant focus:ring-0"
            placeholder="Search or run a command"
          />
          {loading || creating ? (
            <span className="material-symbols-outlined animate-spin text-base text-primary">progress_activity</span>
          ) : null}
        </div>

        {error ? <div className="border-b border-error/20 bg-error-container/20 px-4 py-2 text-sm text-error">{error}</div> : null}

        <div className="max-h-[62vh] overflow-y-auto p-2">
          <div className="mb-2">
            {actions.map((action, index) => (
              <button
                key={action.id}
                type="button"
                onClick={() => action.run()}
                onMouseEnter={() => setSelectedIndex(index)}
                disabled={creating && action.id === "new-document"}
                className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition ${
                  selectedIndex === index ? "bg-primary/15 text-primary" : "text-white hover:bg-white/5"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
              </button>
            ))}
          </div>

          {results.length ? (
            <div className="border-t border-white/10 pt-2">
              {results.map((result, index) => {
                const itemIndex = actions.length + index;
                return (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(`/editor/${result.id}`);
                    }}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    className={`w-full rounded px-3 py-3 text-left transition ${
                      selectedIndex === itemIndex ? "bg-primary/15" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined mt-0.5 text-[18px] text-primary">description</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{result.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-on-surface-variant">
                          {result.snippet || result.owner?.email || "No preview available"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {result.folder ? (
                            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-widest text-on-surface-variant">
                              {result.folder.name}
                            </span>
                          ) : null}
                          {(result.tags || []).slice(0, 3).map((tag) => (
                            <span key={`${result.id}-${tag}`} className="rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
