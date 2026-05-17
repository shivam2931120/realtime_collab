import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import { useAuthStore } from "../store/authStore";
import { usePreferencesStore } from "../store/preferencesStore";

const SettingsPage = () => {
  const [searchParams] = useSearchParams();
  const email = useAuthStore((state) => state.user?.email || "");
  const profile = usePreferencesStore((state) => state.profile);
  const updateProfile = usePreferencesStore((state) => state.updateProfile);
  const query = searchParams.get("q")?.trim().toLowerCase() || "";
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor);
  const [emailNotifications, setEmailNotifications] = useState(profile.emailNotifications);
  const [saved, setSaved] = useState(false);

  const handleProfileSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateProfile({
      displayName: displayName.trim(),
      avatarColor,
      emailNotifications,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const sections = useMemo(
    () =>
      [
        {
          key: "account",
          eyebrow: "Account",
          title: "Operator profile",
          body: (
            <form className="mt-6 space-y-4" onSubmit={handleProfileSave}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Email</p>
                <p className="mt-2 text-sm text-white">{email}</p>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant" htmlFor="display-name">
                  Display name
                </label>
                <input
                  id="display-name"
                  className="emerald-input mt-2"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Name shown in your workspace"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant" htmlFor="avatar-color">
                  Avatar color
                </label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    id="avatar-color"
                    type="color"
                    value={avatarColor}
                    onChange={(event) => setAvatarColor(event.target.value)}
                    className="h-10 w-14 rounded border border-white/10 bg-transparent p-1"
                  />
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold uppercase text-white"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {(displayName || email || "U").slice(0, 1)}
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-white/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Email Preferences</p>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(event) => setEmailNotifications(event.target.checked)}
                    className="form-checkbox bg-transparent border-white/20 text-primary rounded"
                  />
                  <span className="text-sm text-white">Email me when a document is shared with me</span>
                </label>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" className="emerald-primary-button">
                  Save profile
                </button>
                {saved ? <span className="text-xs font-semibold text-primary">Saved</span> : null}
              </div>
            </form>
          ),
          searchText: `account operator profile ${email ?? ""} ${displayName} email preferences notifications documents shared`,
        },
      ].filter((section) => !query || section.searchText.toLowerCase().includes(query)),
    [query, email, displayName, avatarColor, emailNotifications, saved],
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
