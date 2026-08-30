import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import api from "../services/api";
import { DocItem, useDocStore } from "../store/docStore";

type AccessOverview = {
  summary: {
    documents: number;
    users: number;
    permissions: number;
    owners: number;
    editors: number;
    commenters?: number;
    viewers: number;
  };
  users: Array<{
    id: string;
    email: string;
    ownedDocuments: number;
    sharedDocuments: number;
    roles: string[];
  }>;
  permissions: Array<{
    documentId: string;
    title: string;
    userId: string;
    email: string;
    role: "owner" | "editor" | "commenter" | "viewer";
    canEdit: boolean;
    canShare: boolean;
    grantedAt: string;
  }>;
};

type PermissionAuditEvent = {
  id: string;
  documentTitle: string;
  actorEmail: string;
  type: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const TeamsPage = () => {
  const [searchParams] = useSearchParams();
  const docs = useDocStore((state) => state.docs);
  const setDocs = useDocStore((state) => state.setDocs);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"owner" | "editor" | "commenter" | "viewer">("owner");
  const [accessOverview, setAccessOverview] = useState<AccessOverview | null>(null);
  const [auditEvents, setAuditEvents] = useState<PermissionAuditEvent[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<{ documents: DocItem[] }>("/docs"),
      api.get<AccessOverview>("/docs/access/overview"),
      api.get<{ events: PermissionAuditEvent[] }>("/docs/access/audit"),
    ])
      .then(([docsResponse, accessResponse, auditResponse]) => {
        setDocs(docsResponse.data.documents);
        setAccessOverview(accessResponse.data);
        setAuditEvents(auditResponse.data.events || []);
      })
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
  }, [docs, searchParams, activeTab]);

  const tabConfig: Array<{ key: "owner" | "editor" | "commenter" | "viewer"; label: string }> = [
    { key: "owner", label: "Owner Docs" },
    { key: "editor", label: "Editor Docs" },
    { key: "commenter", label: "Commenter Docs" },
    { key: "viewer", label: "Viewer Docs" },
  ];

  const avatarForEmail = (email: string) =>
    `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(email.toLowerCase())}`;

  const filteredPermissions = useMemo(() => {
    const query = searchParams.get("q")?.trim().toLowerCase() || "";
    const permissions = accessOverview?.permissions || [];
    if (!query) return permissions;

    return permissions.filter((permission) =>
      permission.title.toLowerCase().includes(query) ||
      permission.email.toLowerCase().includes(query) ||
      permission.role.toLowerCase().includes(query),
    );
  }, [accessOverview?.permissions, searchParams]);

  const membersForDoc = (doc: DocItem) => {
    const all = [
      { email: doc.owner.email, role: "owner" as const },
      ...doc.collaborators.map((item) => ({ email: item.email, role: item.role })),
    ];

    const unique = new Map<string, { email: string; role: "owner" | "editor" | "commenter" | "viewer" }>();
    all.forEach((member) => {
      if (!unique.has(member.email)) {
        unique.set(member.email, member);
      }
    });

    return [...unique.values()];
  };

  return (
    <WorkspaceLayout pageLabel="Collaboration Network" title="Team">
      {accessOverview ? (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              { label: "Docs", value: accessOverview.summary.documents },
              { label: "Users", value: accessOverview.summary.users },
              { label: "Permissions", value: accessOverview.summary.permissions },
              { label: "Owners", value: accessOverview.summary.owners },
              { label: "Editors", value: accessOverview.summary.editors },
              { label: "Commenters", value: accessOverview.summary.commenters || 0 },
              { label: "Viewers", value: accessOverview.summary.viewers },
            ].map((item) => (
              <div key={item.label} className="rounded border border-white/5 bg-surface-container p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{item.label}</p>
                <p className="mt-3 text-2xl font-extrabold tracking-tight text-white">{item.value}</p>
              </div>
            ))}
          </section>

          <section className="mb-8 rounded border border-white/5 bg-surface-container p-4">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Access Control</p>
                <h2 className="mt-1 text-xl font-bold text-white">Permissions overview</h2>
              </div>
              <span className="text-xs text-on-surface-variant">{filteredPermissions.length} visible grants</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                  <tr className="border-b border-white/5">
                    <th className="py-3 pr-4 font-bold">Document</th>
                    <th className="py-3 pr-4 font-bold">User</th>
                    <th className="py-3 pr-4 font-bold">Role</th>
                    <th className="py-3 pr-4 font-bold">Access</th>
                    <th className="py-3 pr-4 font-bold">Granted</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPermissions.slice(0, 40).map((permission) => (
                    <tr key={`${permission.documentId}-${permission.userId}-${permission.role}`} className="border-b border-white/5">
                      <td className="max-w-[220px] truncate py-3 pr-4 text-white">{permission.title}</td>
                      <td className="max-w-[260px] truncate py-3 pr-4 text-on-surface-variant">{permission.email}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded bg-primary/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
                          {permission.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-on-surface-variant">
                        {permission.canShare ? "edit, share" : permission.canEdit ? "edit" : "view"}
                      </td>
                      <td className="py-3 pr-4 text-xs text-on-surface-variant">
                        {new Date(permission.grantedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {auditEvents.length ? (
            <section className="mb-8 rounded border border-white/5 bg-surface-container p-4">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Audit trail</p>
                  <h2 className="mt-1 text-xl font-bold text-white">Permission activity</h2>
                </div>
                <span className="text-xs text-on-surface-variant">Latest {auditEvents.length}</span>
              </div>
              <div className="space-y-2">
                {auditEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="flex flex-col gap-1 border-b border-white/5 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-white">{event.type.replace(/^document_/, "").replace(/_/g, " ")} · {event.documentTitle}</span>
                    <span className="text-on-surface-variant">{event.actorEmail} · {new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

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
