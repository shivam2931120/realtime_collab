import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import api from "../services/api";
import { DocItem, useDocStore } from "../store/docStore";

const TeamsPage = () => {
  const [searchParams] = useSearchParams();
  const docs = useDocStore((state) => state.docs);
  const setDocs = useDocStore((state) => state.setDocs);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"owner" | "editor" | "viewer">("owner");

  useEffect(() => {
    api
      .get<{ documents: DocItem[] }>("/docs")
      .then((response) => setDocs(response.data.documents))
      .finally(() => setLoading(false));
  }, []);

  const documentsByRole = useMemo(() => {
    const query = searchParams.get("q")?.trim().toLowerCase() || "";

    const inScopeDocs = docs.filter((doc) => doc.role === activeTab);

    return inScopeDocs.filter((doc) => {
      if (!query) {
        return true;
      }

      const participantEmails = [doc.owner.email, ...doc.collaborators.map((item) => item.email)]
        .join(" ")
        .toLowerCase();

      return doc.title.toLowerCase().includes(query) || participantEmails.includes(query);
    });
  }, [docs, searchParams]);

  const tabConfig: Array<{ key: "owner" | "editor" | "viewer"; label: string }> = [
    { key: "owner", label: "Owner Docs" },
    { key: "editor", label: "Editor Docs" },
    { key: "viewer", label: "Viewer Docs" },
  ];

  const avatarForEmail = (email: string) =>
    `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(email.toLowerCase())}`;

  const membersForDoc = (doc: DocItem) => {
    const all = [
      { email: doc.owner.email, role: "owner" as const },
      ...doc.collaborators.map((item) => ({ email: item.email, role: item.role })),
    ];

    const unique = new Map<string, { email: string; role: "owner" | "editor" | "viewer" }>();
    all.forEach((member) => {
      if (!unique.has(member.email)) {
        unique.set(member.email, member);
      }
    });

    return [...unique.values()];
  };

  return (
    <WorkspaceLayout pageLabel="Collaboration Network" title="Team">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {tabConfig.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded px-3 py-2 text-xs font-bold uppercase tracking-widest transition ${
              activeTab === tab.key
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant">
          Loading team network...
        </div>
      ) : documentsByRole.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {documentsByRole.map((doc) => {
            const members = membersForDoc(doc);

            return (
              <div key={doc.id} className="rounded border border-white/5 bg-surface-container p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{doc.title}</h3>
                    <p className="mt-1 text-xs uppercase tracking-widest text-on-surface-variant">
                      {members.length} member{members.length === 1 ? "" : "s"} working on this doc
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-widest text-primary">{doc.role}</span>
                </div>

                <div className="mt-4 space-y-3">
                  {members.map((member) => (
                    <div
                      key={`${doc.id}-${member.email}`}
                      className="flex items-center justify-between rounded border border-white/10 bg-surface-container-high p-3"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={avatarForEmail(member.email)}
                          alt={member.email}
                          className="h-8 w-8 rounded-full border border-white/10 bg-surface object-cover"
                        />
                        <span className="text-sm text-white">{member.email}</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {members.slice(0, 6).map((member) => (
                    <img
                      key={`${doc.id}-${member.email}-chip`}
                      src={avatarForEmail(member.email)}
                      alt={member.email}
                      className="h-6 w-6 rounded-full border border-white/10 bg-surface object-cover"
                      title={member.email}
                    />
                  ))}
                  {members.length > 6 ? (
                    <span className="rounded bg-surface-container-high px-2 py-1 text-xs text-on-surface-variant">
                      +{members.length - 6} more
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant">
          No documents found in this view.
        </div>
      )}
    </WorkspaceLayout>
  );
};

export default TeamsPage;
