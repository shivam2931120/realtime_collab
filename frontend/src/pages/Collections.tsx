import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import api from "../services/api";
import { DocItem, useDocStore } from "../store/docStore";

const CollectionsPage = () => {
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

  const query = searchParams.get("q")?.trim().toLowerCase() || "";

  const groups = useMemo(() => {
    const filtered = docs.filter((doc) => {
      if (!query) {
        return true;
      }

      return doc.title.toLowerCase().includes(query) || doc.owner.email.toLowerCase().includes(query);
    });

    return [
      { title: "Owned", docs: filtered.filter((doc) => doc.role === "owner") },
      { title: "Editor Access", docs: filtered.filter((doc) => doc.role === "editor") },
      { title: "Viewer Access", docs: filtered.filter((doc) => doc.role === "viewer") },
    ];
  }, [docs, query]);

  return (
    <WorkspaceLayout pageLabel="Workspace Collections" title="Collections">
      {loading ? (
        <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant">
          Loading collections...
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.title}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{group.title}</h2>
                <span className="text-xs uppercase tracking-widest text-on-surface-variant">
                  {group.docs.length} docs
                </span>
              </div>
              {group.docs.length ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.docs.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => navigate(`/editor/${doc.id}`)}
                      className="rounded border border-white/5 bg-surface-container p-5 text-left transition hover:bg-surface-container-high"
                    >
                      <h3 className="text-lg font-bold text-white">{doc.title}</h3>
                      <p className="mt-2 text-sm text-on-surface-variant">Owner: {doc.owner.email}</p>
                      <p className="mt-4 text-xs text-primary">{doc.role}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant">
                  No documents in this collection.
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </WorkspaceLayout>
  );
};

export default CollectionsPage;
