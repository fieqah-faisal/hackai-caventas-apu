import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "@/components/icons/Icon";
import { cx } from "@/lib/types";
import caventasLogo from "@/assets/Caventas-logo.png";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const primaryNav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/cases", label: "Cases", icon: "cases" },
];

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          "group relative flex items-center gap-3 h-9 pl-4 pr-3 mx-2 rounded",
          "text-sm font-medium transition-colors duration-180",
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
            name={item.icon}
            size={20}
            className={cx(
              isActive ? "text-text-primary" : "text-text-muted group-hover:text-text-secondary",
            )}
          />
          <span className="flex-1 truncate">{item.label}</span>
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
          <img src={caventasLogo} alt="Caventas logo" className="h-7 w-7 shrink-0 object-contain" />
          <span className="flex-1 text-left truncate">Caventas SOC</span>
        </button>
        <NavLink
          to="/about"
          onClick={onNavigate}
          className="flex w-full items-center gap-3 h-9 px-2 rounded text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-180"
        >
          <Icon name="info" size={20} className="text-text-muted" />
          <span className="flex-1 text-left truncate">About &amp; credits</span>
        </NavLink>
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-shell border-r border-border-subtle">
      <SidebarNav />
    </aside>
  );
}

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
      <div
        onClick={onClose}
        className={cx(
          "fixed inset-0 z-40 bg-canvas/70 transition-opacity duration-180",
          open ? "opacity-100" : "opacity-0",
        )}
      />
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
