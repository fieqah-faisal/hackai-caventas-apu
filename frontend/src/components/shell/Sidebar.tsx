import { NavLink } from "react-router-dom";
import {
  Activity,
  BookOpen,
  Building2,
  CheckSquare,
  FileText,
  FolderClosed,
  LayoutDashboard,
  LogOut,
  Settings,
} from "lucide-react";
import { cx } from "@/lib/format";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

const primaryNav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cases", label: "Cases", icon: FolderClosed },
  { to: "/approvals", label: "Approvals", icon: CheckSquare, badge: 3 },
  { to: "/guidance", label: "Guidance Library", icon: BookOpen },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/activity", label: "Activity Log", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          "group relative flex items-center gap-3 h-9 pl-4 pr-3 mx-2 rounded",
          "text-sm font-medium transition-colors duration-180",
          // Active = raised navy + white text + thin lime indicator bar.
          // NOT lime text.
          isActive
            ? "bg-surface-raised text-text-primary"
            : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden
            className={cx(
              "absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full",
              isActive ? "bg-accent" : "bg-transparent",
            )}
          />
          <Icon
            size={17}
            strokeWidth={1.75}
            className={cx(
              "shrink-0",
              isActive
                ? "text-text-primary"
                : "text-text-muted group-hover:text-text-secondary",
            )}
            aria-hidden
          />
          <span className="flex-1 truncate">{item.label}</span>
          {typeof item.badge === "number" && item.badge > 0 && (
            <span className="tnum rounded bg-surface px-1.5 py-0.5 text-2xs text-status-warning border border-status-warning/35">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <nav className="flex flex-col gap-0.5 py-3" aria-label="Primary">
        {primaryNav.map((item) => (
          <Item key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto border-t border-border-subtle p-3 space-y-1">
        <button className="flex w-full items-center gap-3 h-9 px-2 rounded text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-180">
          <Building2 size={17} strokeWidth={1.75} className="text-text-muted" aria-hidden />
          <span className="flex-1 text-left truncate">Northwind SOC</span>
        </button>
        <button className="flex w-full items-center gap-3 h-9 px-2 rounded text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-180">
          <LogOut size={17} strokeWidth={1.75} className="text-text-muted" aria-hidden />
          <span className="flex-1 text-left truncate">Sign out</span>
        </button>
      </div>
    </>
  );
}

/** Static sidebar — visible from the lg breakpoint up. */
export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-shell border-r border-border-subtle">
      <SidebarNav />
    </aside>
  );
}

/** Off-canvas drawer for below the lg breakpoint. */
export function SidebarDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={cx("lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")}
      aria-hidden={!open}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        className={cx(
          "fixed inset-0 z-40 bg-canvas/70 transition-opacity duration-180",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Panel */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-shell border-r border-border-strong",
          "transition-transform duration-180 will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Primary"
      >
        <SidebarNav onNavigate={onClose} />
      </aside>
    </div>
  );
}