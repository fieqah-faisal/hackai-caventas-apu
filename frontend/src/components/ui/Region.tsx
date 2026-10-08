import type { ReactNode } from "react";
import { cx } from "@/lib/format";

/**
 * A dashboard region. Flat surface divided by thin borders — not a nested
 * card stack. Header row carries the title, an optional count, and an action.
 */
export function Region({
  title,
  count,
  action,
  children,
  className,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "border border-border-subtle rounded-md bg-surface overflow-hidden",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 h-11">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          {typeof count === "number" && (
            <span className="tnum text-xs text-text-muted">{count}</span>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-text-muted">{icon}</div>}
      <p className="text-base text-text-secondary">{title}</p>
      {hint && <p className="text-sm text-text-muted max-w-sm">{hint}</p>}
    </div>
  );
}

/** Honest "not wired yet" marker for backend stubs (BL-003). */
export function PendingBackendNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-text-muted border-t border-border-subtle px-4 py-2">
      {children}
    </p>
  );
}
