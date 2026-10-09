import { cx } from "@/lib/format";

/** Loading placeholder. Uses a quiet pulse that reduced-motion disables. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "rounded bg-surface-raised motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

/** A few skeleton rows for list regions. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border-subtle" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 px-4 py-3.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}