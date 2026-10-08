import { Loader2, Pause, Check, AlertTriangle } from "lucide-react";
import { EmptyState, Region } from "@/components/ui/Region";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { relativeTime, runStatusLabel, stageLabel } from "@/lib/format";
import type { AgentRun, RunPhase, RunStatus } from "@/lib/types";
import { agentRuns, NOW } from "@/lib/mock-data";

const phaseOrder: RunPhase[] = ["analyze", "sufficiency", "propose"];
const phaseLabel: Record<RunPhase, string> = {
  analyze: "Analyze",
  sufficiency: "Sufficiency",
  propose: "Propose",
};

function statusVisual(status: RunStatus) {
  switch (status) {
    case "running":
      return {
        tone: "info" as const,
        icon: <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden />,
      };
    case "complete":
      return { tone: "accent" as const, icon: <Check size={13} aria-hidden /> };
    case "blocked":
      return {
        tone: "warning" as const,
        icon: <AlertTriangle size={13} aria-hidden />,
      };
  }
}

function PhaseTrack({ run }: { run: AgentRun }) {
  const activeIdx = phaseOrder.indexOf(run.phase);
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {phaseOrder.map((p, i) => {
        const done = i < activeIdx || run.status === "complete";
        const active = i === activeIdx && run.status !== "complete";
        return (
          <span
            key={p}
            title={phaseLabel[p]}
            className={
              "h-1 w-6 rounded-full " +
              (done
                ? "bg-accent"
                : active
                  ? run.status === "blocked"
                    ? "bg-status-warning"
                    : "bg-status-info"
                  : "bg-border-strong")
            }
          />
        );
      })}
    </div>
  );
}

function RunRow({ run }: { run: AgentRun }) {
  const v = statusVisual(run.status);
  return (
    <div className="px-4 py-3 border-b border-border-subtle last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base text-text-primary">
            {run.caseTitle}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
            <span>{stageLabel[run.stage]}</span>
            <span aria-hidden>·</span>
            <span>{phaseLabel[run.phase]} phase</span>
            <span aria-hidden>·</span>
            <span>started {relativeTime(run.startedAt, NOW)}</span>
          </div>
        </div>
        <StatusBadge tone={v.tone} icon={v.icon}>
          {runStatusLabel[run.status]}
        </StatusBadge>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <PhaseTrack run={run} />
        {run.note && (
          <p className="truncate text-xs text-text-muted">{run.note}</p>
        )}
      </div>
    </div>
  );
}

export function AgentStatusRegion() {
  return (
    <Region title="Active agent workflow status" count={agentRuns.length}>
      {agentRuns.length === 0 ? (
        <EmptyState
          icon={<Pause size={22} aria-hidden />}
          title="No planning runs in progress"
          hint="Planning runs appear here while the agent works a case through analyze, sufficiency, and propose."
        />
      ) : (
        <div>
          {agentRuns.map((r) => (
            <RunRow key={r.runId} run={r} />
          ))}
        </div>
      )}
    </Region>
  );
}
