import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDot,
  Loader2,
  UserCheck,
} from "lucide-react";
import { Region } from "@/components/ui/Region";
import { Skeleton } from "@/components/ui/Skeleton";
import { Mono } from "@/components/ui/Mono";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cx } from "@/lib/format";
import type { AgentRun } from "@/lib/types";

/**
 * The agentic response pipeline as a compact vertical stage list. This is a
 * workflow visualization (where active runs currently sit), not a decorative
 * progress chart. Each run maps to one pipeline stage; status is shown with a
 * label + icon, never colour alone.
 */
type PipelineStage =
  | "evidence"
  | "state"
  | "analysis"
  | "proposal"
  | "decision"
  | "simulation"
  | "validation";

const pipeline: { id: PipelineStage; label: string }[] = [
  { id: "evidence", label: "Evidence received" },
  { id: "state", label: "State reconstructed" },
  { id: "analysis", label: "Analysis" },
  { id: "proposal", label: "Plan proposed" },
  { id: "decision", label: "Human decision" },
  { id: "simulation", label: "Simulated result" },
  { id: "validation", label: "Validation / replan" },
];

/** Map a planning run to the pipeline stage it currently occupies. */
function stageForRun(run: AgentRun): PipelineStage {
  if (run.status === "blocked") return "analysis";
  if (run.phase === "analyze" || run.phase === "sufficiency") return "analysis";
  if (run.phase === "propose")
    return run.status === "complete" ? "decision" : "proposal";
  return "analysis";
}

type Occupancy =
  | { kind: "running"; run: AgentRun }
  | { kind: "blocked"; run: AgentRun }
  | { kind: "awaiting"; run: AgentRun };

function occupancyByStage(runs: AgentRun[]): Map<PipelineStage, Occupancy> {
  const map = new Map<PipelineStage, Occupancy>();
  for (const run of runs) {
    const stage = stageForRun(run);
    if (run.status === "blocked") map.set(stage, { kind: "blocked", run });
    else if (stage === "decision") map.set(stage, { kind: "awaiting", run });
    else map.set(stage, { kind: "running", run });
  }
  return map;
}

function StageRow({
  label,
  occ,
  isLast,
}: {
  label: string;
  occ: Occupancy | undefined;
  isLast: boolean;
}) {
  let marker = (
    <CircleDot size={14} className="text-text-muted" aria-hidden />
  );
  let badge: React.ReactNode = null;

  if (occ?.kind === "running") {
    marker = (
      <Loader2
        size={14}
        className="text-status-info motion-safe:animate-spin"
        aria-hidden
      />
    );
    badge = (
      <StatusBadge tone="info" icon={<Loader2 size={12} aria-hidden />}>
        Running
      </StatusBadge>
    );
  } else if (occ?.kind === "blocked") {
    marker = <AlertTriangle size={14} className="text-status-warning" aria-hidden />;
    badge = (
      <StatusBadge tone="warning" icon={<AlertTriangle size={12} aria-hidden />}>
        Waiting for evidence
      </StatusBadge>
    );
  } else if (occ?.kind === "awaiting") {
    marker = <UserCheck size={14} className="text-accent" aria-hidden />;
    badge = (
      <StatusBadge tone="accent" icon={<UserCheck size={12} aria-hidden />}>
        Waiting for analyst
      </StatusBadge>
    );
  }

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="grid h-6 w-6 shrink-0 place-items-center">
          {marker}
        </span>
        {!isLast && <span className="w-px flex-1 bg-border-subtle" aria-hidden />}
      </div>
      <div className={cx("min-w-0 flex-1", isLast ? "pb-0" : "pb-4")}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cx(
              "text-base",
              occ ? "text-text-primary" : "text-text-secondary",
            )}
          >
            {label}
          </span>
          {badge}
        </div>
        {occ && (
          <p className="mt-0.5 truncate text-meta text-text-muted">
            {occ.run.caseTitle} · <Mono>{occ.run.caseId}</Mono>
          </p>
        )}
      </div>
    </li>
  );
}

export function WorkflowSnapshot({
  runs,
  loading,
}: {
  runs: AgentRun[] | null;
  loading: boolean;
}) {
  const occ = runs ? occupancyByStage(runs) : null;
  return (
    <Region
      title="Response workflow snapshot"
      busy={loading}
    >
      <div className="p-5">
        {loading || !occ ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <ul>
              {pipeline.map((p, i) => (
                <StageRow
                  key={p.id}
                  label={p.label}
                  occ={occ.get(p.id)}
                  isLast={i === pipeline.length - 1}
                />
              ))}
            </ul>
            <p className="mt-1 flex items-center gap-1.5 text-meta text-text-muted">
              <Check size={12} className="text-accent" aria-hidden />
              Stages without a marker have no active run right now.
            </p>
            <div className="mt-4 border-t border-border-subtle pt-3">
              <a
                href="/activity"
                className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
              >
                View workflow details
                <ArrowRight size={13} aria-hidden />
              </a>
            </div>
          </>
        )}
      </div>
    </Region>
  );
}