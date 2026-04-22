import { ReactNode, useEffect, useMemo } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import NotificationMenu from "./NotificationMenu";
import { disconnectSocket } from "../services/socket";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useUiStore } from "../store/uiStore";

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

const WorkspaceLayout = ({ pageLabel, title, children, actions }: WorkspaceLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = useUiStore((state) => state.searchTerm);
  const setSearchTerm = useUiStore((state) => state.setSearchTerm);
  
  const { signOut } = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const initials = useMemo(() => email.slice(0, 1).toUpperCase() || "U", [email]);

  useEffect(() => {
    setSearchTerm(searchParams.get("q") || "");
  }, [searchParams]);

  const handleLogout = async () => {
    disconnectSocket();
    await signOut();
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
      <header className="sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-white/5 bg-surface px-6 text-sm font-medium tracking-tight">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="h-8 object-contain" />
            <span className="text-xl font-bold uppercase tracking-tighter text-white">Editorial</span>
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

        <div className="flex items-center gap-4">
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
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded border border-white/10 bg-surface-container-high text-xs font-bold uppercase text-white cursor-default"
            title={email}
          >
            {initials}
          </button>
          
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-8 items-center justify-center gap-2 rounded px-3 text-sm font-semibold text-[#a3a3a3] transition-colors duration-200 hover:bg-[#201f1f] hover:text-white"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex">
        <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-white/5 bg-[#0e0e0e] pb-4 pt-16 md:flex">
          <div className="mb-8 flex items-center gap-3 px-6">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary-container">
              <span
                className="material-symbols-outlined text-lg text-on-primary-container"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                architecture
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight text-white">Main Lab</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary-container">
                Pro Plan
              </p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3">
            {navItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-widest transition-all duration-150 ${
                    isActive
                      ? "border-r-2 border-primary-container bg-[#1c1b1b] text-primary-container"
                      : "text-[#a3a3a3] hover:translate-x-1 hover:bg-[#1c1b1b] hover:text-white"
                  }`
                }
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>


        </aside>

        <main className="min-h-screen flex-1 bg-surface-container-lowest p-6 md:ml-64 md:p-10">
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                {pageLabel}
              </p>
              <h1 className="text-4xl font-extrabold tracking-tighter text-white md:text-5xl">
                {title}
              </h1>
              <p className="mt-3 text-sm text-[#a3a3a3]">
                Signed in as <span className="text-white">{email}</span>
              </p>
            </div>
            {actions}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
};

export default WorkspaceLayout;
