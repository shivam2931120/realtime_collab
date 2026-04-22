import axios from "axios";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import api from "../services/api";
import { SearchResultItem, TagCountItem } from "../types";

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
                    <h3 className="text-base font-bold text-white">{item.title}</h3>
                    <span className="text-[10px] uppercase tracking-widest text-primary">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-on-surface-variant">{item.snippet || "No preview available"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span key={`${item.id}-${tag}`} className="rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary">
                        #{tag}
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
