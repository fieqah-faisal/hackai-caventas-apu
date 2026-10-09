import { Region } from "@/components/ui/Region";
import { Skeleton } from "@/components/ui/Skeleton";
import { caseStatusLabel, cx } from "@/lib/format";
import type { CaseStatus } from "@/lib/types";

/**
 * Compact, dependency-free status overview. A CSS segmented bar carries the
 * at-a-glance proportion; an explicit labelled legend with exact counts keeps
 * it accessible (never colour-alone, no invented percentages or trends).
 */
const order: CaseStatus[] = [
  "open",
  "investigating",
  "contained",
  "recovered",
  "closed",
];

// Each status gets a distinct, restrained swatch. Lime (accent) is reserved
// for "recovered" as the one confirmed-good outcome; others use neutral/navy
// and status hues already in the palette.
const swatch: Record<CaseStatus, string> = {
  open: "bg-status-info",
  investigating: "bg-status-warning",
  contained: "bg-text-muted",
  recovered: "bg-accent",
  closed: "bg-border-strong",
};

export function CaseStatusOverview({
  breakdown,
  loading,
}: {
  breakdown: Record<CaseStatus, number> | null;
  loading: boolean;
}) {
  return (
    <Region title="Case status overview" busy={loading}>
      <div className="p-5">
        {loading || !breakdown ? (
          <div className="space-y-4">
            <Skeleton className="h-3 w-full" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-28" />
              ))}
            </div>
          </div>
        ) : (
          <StatusContent breakdown={breakdown} />
        )}
      </div>
    </Region>
  );
}

function StatusContent({
  breakdown,
}: {
  breakdown: Record<CaseStatus, number>;
}) {
  const total = order.reduce((sum, s) => sum + breakdown[s], 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-meta text-text-muted">Across all cases</span>
        <span className="tnum text-meta text-text-secondary">{total} total</span>
      </div>

      {/* Segmented bar */}
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-canvas"
        role="img"
        aria-label={order
          .map((s) => `${caseStatusLabel[s]}: ${breakdown[s]}`)
          .join(", ")}
      >
        {order.map((s) =>
          breakdown[s] > 0 ? (
            <div
              key={s}
              className={cx(swatch[s])}
              style={{ width: `${(breakdown[s] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>

      {/* Labelled legend with exact counts */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
        {order.map((s) => (
          <li key={s} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-meta text-text-secondary">
              <span
                className={cx("h-2 w-2 shrink-0 rounded-sm", swatch[s])}
                aria-hidden
              />
              {caseStatusLabel[s]}
            </span>
            <span className="tnum text-meta text-text-primary">
              {breakdown[s]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}