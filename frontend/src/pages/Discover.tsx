import axios from "axios";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import api from "../services/api";
import { SearchResultItem, TagCountItem } from "../types";

const tagHue = (tag: string) =>
  Array.from(tag).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;

const HighlightText = ({ value, query }: { value: string; query: string }) => {
  if (!query.trim()) return <>{value}</>;
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

const DiscoverPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    (searchParams.get("tags") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [popularTags, setPopularTags] = useState<TagCountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPopularTags = async () => {
    try {
      const response = await api.get<{ tags: TagCountItem[] }>("/docs/tags");
      setPopularTags(response.data.tags || []);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Tags load nahi hue");
      } else {
        setError("Tags load nahi hue");
      }
    }
  };

  const runSearch = async (nextQuery: string, nextTags: string[]) => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get<{ results: SearchResultItem[] }>("/docs/search", {
        params: {
          q: nextQuery,
          tags: nextTags.join(","),
        },
      });

      setResults(response.data.results || []);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Search failed");
      } else {
        setError("Search failed");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPopularTags().catch(console.error);
    runSearch(query, selectedTags).catch(console.error);
  }, []);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextParams = new URLSearchParams(searchParams);
    if (query.trim()) {
      nextParams.set("q", query.trim());
    } else {
      nextParams.delete("q");
    }

    if (selectedTags.length) {
      nextParams.set("tags", selectedTags.join(","));
    } else {
      nextParams.delete("tags");
    }

    setSearchParams(nextParams, { replace: true });
    runSearch(query.trim(), selectedTags).catch(console.error);
  };

  const toggleTag = (tag: string) => {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((item) => item !== tag)
      : [...selectedTags, tag];

    setSelectedTags(nextTags);
    runSearch(query.trim(), nextTags).catch(console.error);
  };

  const totalLabel = useMemo(() => {
    if (loading) {
      return "Searching...";
    }

    return `${results.length} result${results.length === 1 ? "" : "s"}`;
  }, [loading, results.length]);

  return (
    <WorkspaceLayout pageLabel="Search & Index" title="Discover">
      <div className="space-y-6">
        <section className="rounded border border-white/5 bg-surface-container p-5">
          <form className="space-y-4" onSubmit={handleSearchSubmit}>
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                className="emerald-input flex-1"
                placeholder="Search title, content, and tags"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" className="emerald-primary-button">
                Search
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {popularTags.map((tag) => (
                <button
                  key={tag.name}
                  type="button"
                  onClick={() => toggleTag(tag.name)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    selectedTags.includes(tag.name)
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-white/10 bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  #{tag.name} ({tag.count})
                </button>
              ))}
            </div>
          </form>
        </section>

        <section className="rounded border border-white/5 bg-surface-container p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Indexed documents</h2>
            <span className="text-xs uppercase tracking-widest text-on-surface-variant">{totalLabel}</span>
          </div>

          {error ? <p className="mb-4 text-sm text-error">{error}</p> : null}

          {loading ? (
            <div className="rounded border border-white/5 bg-surface-container-high p-4 text-sm text-on-surface-variant">
              Running index query...
            </div>
          ) : results.length ? (
            <div className="space-y-3">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/editor/${item.id}`)}
                  className="w-full rounded border border-white/10 bg-surface-container-high p-4 text-left transition hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-bold text-white">
                      <HighlightText value={item.title} query={query.trim()} />
                    </h3>
                    <span className="text-[10px] uppercase tracking-widest text-primary">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    <HighlightText value={item.snippet || "No preview available"} query={query.trim()} />
                  </p>
                  {(item.owner || item.folder || item.collaborators?.length) ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-on-surface-variant">
                      {item.owner ? <span>Owner: {item.owner.email}</span> : null}
                      {item.folder ? <span>Folder: {item.folder.name}</span> : null}
                      {item.collaborators?.length ? <span>{item.collaborators.length} collaborators</span> : null}
                    </div>
                  ) : null}
                  {item.matchedComments?.length ? (
                    <div className="mt-3 rounded border border-white/5 bg-surface-container p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Comment matches</p>
                      <div className="mt-2 space-y-1">
                        {item.matchedComments.slice(0, 2).map((comment) => (
                          <p key={comment.id} className="line-clamp-1 text-xs text-on-surface-variant">
                            <HighlightText value={`${comment.author}: ${comment.body}`} query={query.trim()} />
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span
                        key={`${item.id}-${tag}`}
                        className="rounded-full px-2 py-1 text-[11px]"
                        style={{
                          backgroundColor: `hsl(${tagHue(tag)} 70% 45% / 0.16)`,
                          color: `hsl(${tagHue(tag)} 75% 75%)`,
                        }}
                      >
                        #<HighlightText value={tag} query={query.trim()} />
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded border border-white/5 bg-surface-container-high p-4 text-sm text-on-surface-variant">
              No matching documents found.
            </div>
          )}
        </section>
      </div>
    </WorkspaceLayout>
  );
};

export default DiscoverPage;
