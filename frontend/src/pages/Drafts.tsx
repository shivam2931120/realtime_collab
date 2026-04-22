import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import api from "../services/api";
import { DocItem, useDocStore } from "../store/docStore";

const stripContent = (content: string) =>
  content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const DraftsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const docs = useDocStore((state) => state.docs);
  const setDocs = useDocStore((state) => state.setDocs);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ documents: DocItem[] }>("/docs")
      .then((response) => setDocs(response.data.documents))
      .finally(() => setLoading(false));
  }, []);

  const drafts = useMemo(() => {
    const query = searchParams.get("q")?.trim().toLowerCase() || "";
    return docs.filter((doc) => {
      const isDraft = stripContent(doc.content).length < 40;
      if (!isDraft) {
        return false;
      }

      if (!query) {
        return true;
      }

      return doc.title.toLowerCase().includes(query) || doc.owner.email.toLowerCase().includes(query);
    });
  }, [docs, searchParams]);

  return (
    <WorkspaceLayout pageLabel="Draft Workspace" title="Drafts">
      {loading ? (
        <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant">
          Loading drafts...
        </div>
      ) : drafts.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {drafts.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => navigate(`/editor/${doc.id}`)}
              className="rounded border border-white/5 bg-surface-container p-5 text-left transition hover:bg-surface-container-high"
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Draft</p>
              <h3 className="mt-3 text-xl font-bold text-white">{doc.title}</h3>
              <p className="mt-3 text-sm text-on-surface-variant">
                This draft is still light on content. Open it to continue writing.
              </p>
              <p className="mt-6 text-xs text-on-surface-variant">
                Updated {new Date(doc.updatedAt).toLocaleString()}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant">
          No drafts right now.
        </div>
      )}
    </WorkspaceLayout>
  );
};

export default DraftsPage;
