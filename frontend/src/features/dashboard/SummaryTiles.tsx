import { useNavigate } from "react-router-dom";
import { FolderOpen, Clock, Activity, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/lib/format";
import type { DashboardSummary } from "@/lib/mock-data";

interface TileDef {
  key: keyof DashboardSummary;
  label: string;
  hint: string;
  to: string;
  icon: typeof FolderOpen;
  /** Draw attention (warning hue) when the value is non-zero. */
  warnWhenPositive?: boolean;
}

const tiles: TileDef[] = [
  {
    key: "openCases",
    label: "Open cases",
    hint: "Open, investigating or contained",
    to: "/cases",
    icon: FolderOpen,
  },
  {
    key: "awaitingApproval",
    label: "Awaiting approval",
    hint: "Recommendations pending a decision",
    to: "/approvals",
    icon: Clock,
    warnWhenPositive: true,
  },
  {
    key: "activeRuns",
    label: "Active planning runs",
    hint: "Agent currently working a case",
    to: "/activity",
    icon: Activity,
  },
  {
    key: "blockedOrMissing",
    label: "Blocked / missing evidence",
    hint: "Runs or cases stalled on evidence",
    to: "/cases",
    icon: AlertTriangle,
    warnWhenPositive: true,
  },
];

function Tile({ def, value }: { def: TileDef; value: number }) {
  const navigate = useNavigate();
  const Icon = def.icon;
  const warn = def.warnWhenPositive && value > 0;
  return (
    <button
      onClick={() => navigate(def.to)}
      className="group flex flex-col gap-3 rounded-md border border-border-subtle bg-surface p-5 text-left transition-colors duration-180 hover:bg-surface-hover hover:border-border-strong"
    >
      <div className="flex items-center justify-between">
        <span className="text-btn font-semibold text-text-secondary">
          {def.label}
        </span>
        <Icon
          size={16}
          strokeWidth={1.75}
          className={cx(warn ? "text-status-warning" : "text-text-muted")}
          aria-hidden
        />
      </div>
      <span
        className={cx(
          "tnum text-metric font-bold leading-none",
          warn ? "text-status-warning" : "text-text-primary",
        )}
      >
        {value}
      </span>
      <span className="text-xs text-text-muted">{def.hint}</span>
    </button>
  );
}

export function SummaryTiles({
  summary,
  loading,
}: {
  summary: DashboardSummary | null;
  loading: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {loading || !summary
        ? Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface p-5"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))
        : tiles.map((def) => (
            <Tile key={def.key} def={def} value={summary[def.key]} />
          ))}
    </div>
  );
}