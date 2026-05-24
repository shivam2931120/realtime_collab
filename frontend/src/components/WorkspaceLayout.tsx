import { ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import NotificationMenu from "./NotificationMenu";
import CommandPalette from "./CommandPalette";
import api from "../services/api";
import { disconnectSocket } from "../services/socket";
import { useUiStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { useDocStore } from "../store/docStore";
import { usePreferencesStore } from "../store/preferencesStore";

type WorkspaceLayoutProps = {
  pageLabel: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

const navItems = [
  { to: "/dashboard", icon: "grid_view", label: "Workspace" },
  { to: "/discover", icon: "manage_search", label: "Discover" },
  { to: "/library", icon: "library_books", label: "Library" },
  { to: "/analytics", icon: "monitoring", label: "Analytics" },
  { to: "/drafts", icon: "description", label: "Drafts" },
  { to: "/collections", icon: "folder_open", label: "Collections" },
  { to: "/teams", icon: "groups", label: "Team" },
  { to: "/settings", icon: "settings", label: "Settings" },
];

const mobileNavItems = navItems.filter((item) =>
  ["Workspace", "Discover", "Library", "Team", "Settings"].includes(item.label),
);

const WorkspaceLayout = ({ pageLabel, title, children, actions }: WorkspaceLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = useUiStore((state) => state.searchTerm);
  const setSearchTerm = useUiStore((state) => state.setSearchTerm);
  const [commandOpen, setCommandOpen] = useState(false);
  
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
    if (refreshToken) {
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

  return (
    <div className="min-h-screen bg-background text-on-background">
      <header className="fixed left-0 right-0 top-0 z-50 flex h-14 w-full items-center justify-between border-b border-white/5 bg-surface px-3 text-sm font-medium tracking-tight sm:px-4 md:px-6">
        <div className="flex items-center gap-3 md:gap-8">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Editorial logo" className="h-7 object-contain sm:h-8" />
            <span className="hidden text-base font-bold uppercase tracking-tighter text-white min-[360px]:inline sm:text-xl">
              Editorial
            </span>
          </div>
          <div className="hidden items-center rounded-lg border border-white/5 bg-surface-container-low px-3 py-1.5 md:flex">
            <span className="material-symbols-outlined text-sm text-on-surface-variant">search</span>
            <input
              className="w-64 border-none bg-transparent text-xs text-on-surface placeholder:text-on-surface-variant focus:ring-0"
              placeholder="Search workspace..."
              value={searchTerm}
              onChange={(event) => handleSearchChange(event.target.value)}
              type="text"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="rounded p-2 text-[#a3a3a3] transition-colors duration-200 hover:bg-[#201f1f] active:scale-90"
            title="Command palette"
          >
            <span className="material-symbols-outlined">bolt</span>
          </button>
          <NotificationMenu />
          <button
            type="button"
            onClick={handleHistoryClick}
            className="rounded p-2 text-[#a3a3a3] transition-colors duration-200 hover:bg-[#201f1f] active:scale-90"
            title="Go back"
          >
            <span className="material-symbols-outlined">history</span>
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded border border-white/10 text-xs font-bold uppercase text-white cursor-default"
            style={{ backgroundColor: profile.avatarColor }}
            title={profile.displayName ? `${profile.displayName} · ${email}` : email}
          >
            {initials}
          </button>
          
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-8 items-center justify-center gap-2 rounded px-2 text-sm font-semibold text-[#a3a3a3] transition-colors duration-200 hover:bg-[#201f1f] hover:text-white sm:px-3"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex pt-14">
        <aside
          className={`fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-white/5 bg-[#0e0e0e] pb-4 pt-16 transition-[width] duration-200 md:flex ${
            sidebarCollapsed ? "w-20" : "w-64"
          }`}
        >
          <div className={`mb-8 flex gap-3 px-4 ${sidebarCollapsed ? "flex-col items-center" : "items-center justify-between"}`}>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-primary-container">
                <span
                  className="material-symbols-outlined text-lg text-on-primary-container"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  architecture
                </span>
              </div>
              {!sidebarCollapsed ? (
                <div className="min-w-0">
                  <h2 className="text-lg font-bold leading-tight text-white">Editorial</h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary-container">
                    Pro Plan
                  </p>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="rounded p-1.5 text-on-surface-variant transition hover:bg-white/10 hover:text-white"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="material-symbols-outlined text-lg">
                {sidebarCollapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"}
              </span>
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-3">
            {navItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                title={sidebarCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center rounded px-3 py-2 text-xs font-semibold uppercase tracking-widest transition-all duration-150 ${
                    sidebarCollapsed ? "justify-center" : "gap-3"
                  } ${
                    isActive
                      ? "border-r-2 border-primary-container bg-[#1c1b1b] text-primary-container"
                      : `text-[#a3a3a3] hover:bg-[#1c1b1b] hover:text-white ${sidebarCollapsed ? "" : "hover:translate-x-1"}`
                  }`
                }
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                {!sidebarCollapsed ? <span>{item.label}</span> : null}
              </NavLink>
            ))}
          </nav>


        </aside>

        <main
          className={`min-h-screen flex-1 bg-surface-container-lowest px-4 pb-24 pt-6 transition-[margin] duration-200 sm:px-6 md:p-10 ${
            sidebarCollapsed ? "md:ml-20" : "md:ml-64"
          }`}
        >
          <div className="mb-8 flex flex-col justify-between gap-5 md:mb-12 md:flex-row md:items-end md:gap-6">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                {pageLabel}
              </p>
              <h1 className="text-3xl font-extrabold tracking-tighter text-white sm:text-4xl md:text-5xl">
                {title}
              </h1>
              <p className="mt-3 text-sm text-[#a3a3a3]">
                Signed in as <span className="break-all text-white sm:break-normal">{email}</span>
              </p>
            </div>
            {actions}
          </div>

          {children}
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-5 border-t border-white/10 bg-[#0e0e0e]/95 px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-2xl backdrop-blur md:hidden">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                `flex min-w-0 flex-col items-center gap-0.5 rounded px-0.5 py-2 text-[9px] font-bold uppercase tracking-normal transition ${
                  isActive ? "bg-primary/15 text-primary" : "text-[#a3a3a3] active:bg-white/10"
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
