import { useAnalysisRuns } from "@/features/analysisRuns/AnalysisRunContext";
import { useWorkspace } from "./context";

export function AgentRunPanel({ label = "Re-run analysis" }: { label?: string }) {
  const { caseId } = useWorkspace();
  const { getEntry, start, open } = useAnalysisRuns();
  const { run, pending, error } = getEntry(caseId);
  const active = run?.status === "queued" || run?.status === "running";

  return <section aria-label="Agent progress" className="rounded border border-border-subtle bg-surface p-4">
    <div className="flex flex-wrap items-center gap-3">
      <svg className={active ? "agent-robot" : ""} width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <rect x="5" y="8" width="26" height="23" rx="4" fill="#263145" stroke="#9ded00" />
        <circle cx="12" cy="19" r="2" fill="#9ded00" /><circle cx="24" cy="19" r="2" fill="#9ded00" />
        <path d="M14 26h8M18 8V4" stroke="#9ded00" strokeWidth="2" />
      </svg>
      <div className="min-w-0 flex-1 text-sm text-text-secondary">
        <p className="font-semibold text-text-primary">Caventas agent</p>
        {run ? <p role="status">{run.stage.replace(/_/g, " ")}: {run.message} · State v{run.basedOnStateVersion}</p>
          : <p>No analysis run active.</p>}
        {run?.status === "completed" && run.planId && <p className="text-accent">Stored plan {run.planId} ready. Review its state binding.</p>}
      </div>
      {run && <button type="button" onClick={() => open(caseId)} className="rounded border border-border-subtle px-3 py-1 text-text-secondary">View agent</button>}
      {(!run || run.status === "failed" || run.status === "completed") &&
        <button disabled={pending} onClick={() => void start(caseId)} className="rounded border border-accent/60 px-3 py-1 text-accent disabled:opacity-50">{pending ? "Queuing…" : run?.status === "failed" ? "Retry analysis" : label}</button>}
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-status-danger">{error}</p>}
  </section>;
}
