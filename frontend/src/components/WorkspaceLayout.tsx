import { ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import WorkspaceSidebar, { workspaceNavItems } from "./WorkspaceSidebar";
import NotificationMenu from "./NotificationMenu";
import CommandPalette from "./CommandPalette";
import api from "../services/api";
import { disconnectSocket } from "../services/socket";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useDocStore } from "../store/docStore";
import { usePreferencesStore } from "../store/preferencesStore";
import { clerkEnabled, signOutClerk } from "../services/auth";

type WorkspaceLayoutProps = {
  pageLabel: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

const mobileNavItems = workspaceNavItems.filter((item) =>
  ["Workspace", "Discover", "Library", "Team", "Settings"].includes(item.label),
);

const WorkspaceLayout = ({ pageLabel, title, children, actions }: WorkspaceLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = useUiStore((state) => state.searchTerm);
  const setSearchTerm = useUiStore((state) => state.setSearchTerm);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  
  const clearSession = useAuthStore((state) => state.clearSession);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const email = useAuthStore((state) => state.user?.email ?? "");
  const profile = usePreferencesStore((state) => state.profile);
  const sidebarCollapsed = usePreferencesStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = usePreferencesStore((state) => state.setSidebarCollapsed);
  const clearDocs = useDocStore((state) => state.clearDocs);

  const initials = useMemo(() => (profile.displayName || email).slice(0, 1).toUpperCase() || "U", [email, profile.displayName]);

  useEffect(() => {
    setSearchTerm(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = async () => {
    if (clerkEnabled) {
      await signOutClerk();
    } else if (refreshToken) {
      await api.post("/auth/logout", { refreshToken }).catch(() => undefined);
    }
    disconnectSocket();
    clearSession();
    clearDocs();
    navigate("/login", { replace: true });
  };

  const handleHistoryClick = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/dashboard");
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);

    const nextParams = new URLSearchParams(searchParams);

    if (value.trim()) {
      nextParams.set("q", value);
    } else {
      nextParams.delete("q");
    }

    setSearchParams(nextParams, { replace: location.pathname !== "/editor" });
  };

  const submitGlobalSearch = () => {
    const query = searchTerm.trim();
    navigate(query ? `/discover?q=${encodeURIComponent(query)}` : "/discover");
  };

  return (
    <div className="workspace-desktop min-h-screen bg-background text-on-background">
      <header className="workspace-header fixed left-0 right-0 top-0 z-50 flex h-14 w-full items-center justify-between border-b border-outline bg-surface px-3 text-sm font-medium tracking-tight sm:px-4 md:px-6">
        <div className="flex items-center gap-3 md:gap-8">
          <div className="flex items-center gap-2">
            <button type="button" className="workspace-icon-button md:hidden" aria-label="Open navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}><span className="material-symbols-outlined">menu</span></button>
            <NavLink to="/dashboard" aria-label="Editorial workspace" className="workspace-brand"><img src="/logo.png" alt="" /><span>Editorial</span></NavLink>
          </div>
          <div className="workspace-search hidden md:flex">
            <span className="material-symbols-outlined text-sm text-on-surface-variant">search</span>
            <input
              aria-label="Search workspace"
              className="border-none bg-transparent text-on-surface placeholder:text-on-surface-variant"
              placeholder="Search workspace..."
              value={searchTerm}
              onChange={(event) => handleSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitGlobalSearch();
                }
              }}
              type="text"
            />
            <kbd>⌘ K</kbd>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="workspace-icon-button"
            aria-label="Command palette"
            title="Command palette"
          >
            <span className="material-symbols-outlined">bolt</span>
          </button>
          <NotificationMenu />
          <button
            type="button"
            onClick={handleHistoryClick}
            className="workspace-icon-button"
            aria-label="Go back"
            title="Go back"
          >
            <span className="material-symbols-outlined">history</span>
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-outline text-xs font-bold uppercase text-white cursor-default"
            style={{ backgroundColor: profile.avatarColor }}
            title={profile.displayName ? `${profile.displayName} · ${email}` : email}
          >
            {initials}
          </button>
          
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-8 items-center justify-center gap-2 rounded px-2 text-sm font-semibold text-on-surface-variant transition-colors duration-200 hover:bg-surface-container-high hover:text-white sm:px-3"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex pt-14">
        <WorkspaceSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

        <main
          className={`workspace-main min-h-screen flex-1 bg-surface-container-lowest px-4 pb-24 pt-6 transition-[margin] duration-200 sm:px-6 md:px-8 md:py-8 xl:px-10 ${
            sidebarCollapsed ? "md:ml-20" : "md:ml-64"
          }`}
        >
          <div className="workspace-heading flex flex-col justify-between gap-5 lg:flex-row lg:items-end lg:gap-6">
            <div>
              <p className="workspace-eyebrow">
                {pageLabel}
              </p>
              <h1 className="text-on-surface">
                {title}
              </h1>
              <p className="mt-3 text-sm text-on-surface-variant">
                {pageLabel === "Editor Workspace" ? "Pick up a draft, review with your team, or start something new." : "Everything you need, together in your workspace."}
              </p>
            </div>
            {actions}
          </div>

          {children}
        </main>

        <nav className="workspace-bottom-nav fixed bottom-0 left-0 right-0 z-50 grid grid-cols-5 border-t border-outline bg-surface-dim/95 px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-2xl backdrop-blur md:hidden">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                `flex min-w-0 flex-col items-center gap-0.5 rounded px-0.5 py-2 text-[10px] font-medium tracking-normal transition ${
                  isActive ? "bg-primary/15 text-accent" : "text-on-surface-variant active:bg-white/10"
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="max-w-full truncate max-[340px]:hidden">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
};

export default WorkspaceLayout;
