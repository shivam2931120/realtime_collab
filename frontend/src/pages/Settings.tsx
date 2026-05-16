import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import { useAuthStore } from "../store/authStore";

const SettingsPage = () => {
  const [searchParams] = useSearchParams();
  const email = useAuthStore((state) => state.user?.email || "");
  const query = searchParams.get("q")?.trim().toLowerCase() || "";

  const sections = useMemo(
    () =>
      [
        {
          key: "account",
          eyebrow: "Account",
          title: "Operator profile",
          body: (
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Email</p>
                <p className="mt-2 text-sm text-white">{email}</p>
              </div>
              <div className="pt-4 border-t border-white/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Email Preferences</p>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="form-checkbox bg-transparent border-white/20 text-primary rounded" />
                  <span className="text-sm text-white">Email me when a document is shared with me</span>
                </label>
              </div>
            </div>
          ),
          searchText: `account operator profile ${email ?? ""} email preferences notifications documents shared`,
        },
      ].filter((section) => !query || section.searchText.includes(query)),
    [query, email],
  );

  return (
    <WorkspaceLayout pageLabel="System Preferences" title="Settings">
      {sections.length ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {sections.map((section) => (
            <section key={section.key} className="rounded border border-white/5 bg-surface-container p-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{section.eyebrow}</p>
              <h2 className="mt-3 text-2xl font-bold text-white">{section.title}</h2>
              {section.body}
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant">
          No settings matched your search.
        </div>
      )}
    </WorkspaceLayout>
  );
};

export default SettingsPage;
