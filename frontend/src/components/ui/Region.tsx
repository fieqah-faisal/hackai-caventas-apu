import type { ReactNode } from "react";
import { Icon } from "@/components/icons/Icon";
import { cx } from "@/lib/types";

/** A workspace region: flat surface, thin borders, header with title + action. */
export function Region({
  title,
  count,
  action,
  busy,
  children,
  className,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  busy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-busy={busy || undefined}
      className={cx(
        "flex flex-col border border-border-subtle rounded-md bg-surface overflow-hidden",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 h-12">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="truncate text-lg font-semibold text-text-primary">{title}</h2>
          {typeof count === "number" && (
            <span className="tnum shrink-0 text-meta text-text-muted">{count}</span>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-text-muted">{icon}</div>}
      <p className="text-base text-text-secondary">{title}</p>
      {hint && <p className="text-meta text-text-muted max-w-sm">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <Icon name="warning" size={24} className="text-status-danger" />
      <p className="text-base text-text-secondary max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded border border-border-strong bg-surface-raised px-3 h-8 text-sm text-text-primary hover:bg-surface-hover transition-colors duration-180"
        >
          <Icon name="reload" size={18} />
          Retry
        </button>
      )}
    </div>
  );
}

/** Honest "not available in this mode / not implemented" marker. */
export function PendingBackendNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-meta text-text-muted border-t border-border-subtle px-4 py-2">
      {children}
    </p>
  );
}