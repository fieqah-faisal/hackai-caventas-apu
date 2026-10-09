import { useEffect, type ReactNode } from "react";
import { Icon } from "@/components/icons/Icon";
import { cx } from "@/lib/types";

/**
 * Right-side detail panel. Becomes a full-screen sheet on mobile. Closes on
 * Escape and on scrim click. Entrance transition 180-220ms (reduced-motion safe).
 */
export function DetailPanel({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={cx(open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cx(
          "fixed inset-0 z-40 bg-canvas/70 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "fixed z-50 flex flex-col bg-shell border-border-strong transition-transform duration-200 will-change-transform",
          "inset-0 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[28rem] sm:border-l",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 h-12 shrink-0">
          <h2 className="truncate text-base font-semibold text-text-primary">{title}</h2>
          <button onClick={onClose} aria-label="Close panel" className="rounded p-1 text-text-muted hover:text-text-primary">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}