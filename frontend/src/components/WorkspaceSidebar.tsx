import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";

export const workspaceNavItems = [
  { to: "/dashboard", icon: "grid_view", label: "Workspace", group: "Workspace" },
  { to: "/drafts", icon: "description", label: "Drafts", group: "Workspace" },
  { to: "/collections", icon: "folder_open", label: "Collections", group: "Workspace" },
  { to: "/discover", icon: "manage_search", label: "Discover", group: "Workspace" },
  { to: "/library", icon: "library_books", label: "Library", group: "Workspace" },
  { to: "/teams", icon: "groups", label: "Team", group: "Collaborate" },
  { to: "/calendar", icon: "calendar_month", label: "Calendar", group: "Collaborate" },
  { to: "/analytics", icon: "monitoring", label: "Analytics", group: "Manage" },
  { to: "/integrations", icon: "webhook", label: "Integrations", group: "Manage" },
  { to: "/settings", icon: "settings", label: "Settings", group: "Manage" },
];

type Props = { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onClose: () => void };

export default function WorkspaceSidebar({ collapsed, onToggle, mobileOpen, onClose }: Props) {
  const { pathname } = useLocation();
  const sidebarRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => { closeRef.current(); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sidebar = sidebarRef.current;
    sidebar?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab") {
        const controls = sidebar?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
        if (!controls?.length) return;
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [mobileOpen]);
  const compact = collapsed && !mobileOpen;
  return <>
    {mobileOpen && <button type="button" className="workspace-mobile-backdrop" aria-label="Close navigation" onClick={onClose} />}
    <aside ref={sidebarRef} className={`workspace-sidebar ${compact ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`} aria-label="Workspace navigation" role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined}>
      <div className={`workspace-sidebar-head ${compact ? "flex-col" : ""}`}>
        {!compact && <div className="min-w-0"><span className="text-sm font-semibold text-on-surface">Your workspace</span><p>Write. Review. Publish.</p></div>}
        <button type="button" onClick={mobileOpen ? onClose : onToggle} className="workspace-icon-button" aria-label={mobileOpen ? "Close navigation" : compact ? "Expand sidebar" : "Collapse sidebar"} title={compact ? "Expand sidebar" : "Collapse sidebar"}>
          <span className="material-symbols-outlined">{mobileOpen ? "close" : compact ? "left_panel_open" : "left_panel_close"}</span>
        </button>
      </div>
      <nav aria-label="Main navigation">
        {["Workspace", "Collaborate", "Manage"].map(group => <div className="workspace-nav-group" key={group}>
          {!compact && <p className="workspace-nav-caption">{group}</p>}
          {workspaceNavItems.filter(item => item.group === group).map(item => <NavLink key={item.to} to={item.to} title={compact ? item.label : undefined} aria-label={compact ? item.label : undefined} className="workspace-nav-link" onClick={onClose}>
            <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>{!compact && <span>{item.label}</span>}
          </NavLink>)}
        </div>)}
      </nav>
      <div className="workspace-sidebar-footer">{compact ? <span className="material-symbols-outlined text-lg" title="Editorial">edit_note</span> : <>Editorial <span className="float-right">Made for writing</span></>}</div>
    </aside>
  </>;
}
