import { useNavigate } from "react-router-dom";
import { getProvider } from "@/lib/api";
import { useOutcome } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { FindingsTable } from "@/components/ui/FindingsTable";
import { Icon, type IconName } from "@/components/icons/Icon";
import { modelReportedConfidence, plannerLabel, readableValue, stageLabel } from "@/lib/format";
import type { AnalysisVM, EvidenceItemVM, PlanVM, IncidentSnapshotVM } from "@/lib/types";
import { isStale } from "@/lib/mapping/incidentState";
import { useWorkspace } from "../context";

const p = getProvider();

export function OverviewTab() {
  const { caseId, header, facts, reloadKey } = useWorkspace();
  const navigate = useNavigate();
  const analysis = useOutcome<AnalysisVM>(() => p.getAnalysis(caseId), [caseId, reloadKey]);
  const evidence = useOutcome<EvidenceItemVM[]>(() => p.getEvidence(caseId), [caseId, reloadKey]);
  const plans = useOutcome<PlanVM[]>(() => p.getPlans(caseId), [caseId, reloadKey]);
  const state = useOutcome<IncidentSnapshotVM>(() => p.getCurrentState(caseId), [caseId, reloadKey]);

  const entityCount = state.value?.data.entities.length ?? null;
  const evidenceCount = evidence.value?.data.length ?? null;
  const missing = analysis.value?.data.missingEvidence.length ?? null;
  const planList = plans.value?.data ?? [];
  const latestPlan = planList.length ? planList[planList.length - 1] : undefined;

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-border-subtle bg-surface p-5">
        <AsyncBoundary outcome={analysis}>
          {(a) => (
            <div>
              <h2 className="text-base font-semibold text-text-primary">Analysis summary</h2>
              <p className="mt-2 text-base leading-6 text-text-secondary">
                {a.unavailableReason ?? a.summary ?? "Analysis has not produced a summary yet."}
              </p>
            </div>
          )}
        </AsyncBoundary>
      </section>

      <section className="rounded-md border border-border-subtle bg-surface p-5 text-sm text-text-secondary">
        <h2 className="text-base font-semibold text-text-primary">Incident overview</h2>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {[
            ["Title", header.title], ["Case ID", caseId], ["State version", facts.stateVersion ? `v${facts.stateVersion}` : "Unavailable"],
            ["Plan version", latestPlan ? `v${latestPlan.version}` : "No plan"],
            ["Plan based on", latestPlan ? `State v${latestPlan.basedOnStateVersion}` : "—"],
            ["Plan status", latestPlan ? isStale(latestPlan.basedOnStateVersion, facts.stateVersion ?? 0) ? "Stale — review required" : "Current" : "No plan"],
            ["Recovery status", readableValue(header.recoveryStatus)], ["Lifecycle stage", header.stage ? stageLabel[header.stage] : "Not established"],
            ["Incident type", readableValue(analysis.value?.data.classification)], ["Severity", readableValue(analysis.value?.data.severity ?? header.severity)],
            ["Planner", analysis.value ? plannerLabel(analysis.value.data.planner.kind) : "Not established"],
            ["Planner model", analysis.value?.data.planner.model ?? "Not recorded"],
            ["Planner confidence (unvalidated)", modelReportedConfidence(analysis.value?.data.confidence.value ?? null)],
            ["ATT&CK mappings", analysis.value?.data.attackTechniques.join(", ") || "None mapped"],
            ["Last updated", header.updatedAt],
          ].map(([term, value]) => <div key={term}><dt className="text-text-muted">{term}</dt><dd className="break-words">{value}</dd></div>)}
        </dl>
        {latestPlan && isStale(latestPlan.basedOnStateVersion, facts.stateVersion ?? 0) && <p role="alert" className="mt-3 text-status-warning">New evidence changed the incident state. Plan v{latestPlan.version} is based on State v{latestPlan.basedOnStateVersion} and must be reviewed. <button className="underline" onClick={() => navigate(`/cases/${caseId}/analysis`)}>Analyze new evidence</button></p>}
        <button className="mt-3 text-status-info underline" onClick={() => navigate(`/cases/${caseId}/analysis`)}>Re-run analysis</button>
      </section>

      <section className="rounded-md border border-border-subtle bg-surface p-5">
        <h2 className="text-base font-semibold text-text-primary">Findings</h2>
        <p className="mt-1 text-meta text-text-muted">Confidence values are planner-reported, advisory, and not calibrated probabilities.</p>
        <div className="mt-3">
          <FindingsTable rows={(analysis.value?.data.findings ?? []).map((finding, index) => ({
            key: `overview-${index}`,
            summary: finding.summary,
            evidenceIds: finding.evidenceIds,
            confidence: finding.confidence,
          }))} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon="identity" value={entityCount} label="Affected entities" to={`/cases/${caseId}/analysis`} nav={navigate} />
        <Stat icon="evidence" value={evidenceCount} label="Evidence records" to={`/cases/${caseId}/evidence`} nav={navigate} />
        <Stat icon="warning" value={missing} label="Unresolved questions" to={`/cases/${caseId}/analysis`} nav={navigate} tone={missing != null && missing > 0 ? "warning" : "default"} />
        <Stat
          icon="responsePlan"
          value={latestPlan ? `v${latestPlan.version}` : "—"}
          label={latestPlan ? "Current plan" : "No plan yet"}
          to={`/cases/${caseId}/plan`}
          nav={navigate}
        />
      </div>
    </div>
  );
}

function Stat({
  icon, value, label, to, nav, tone = "default",
}: {
  icon: IconName; value: string | number | null; label: string; to: string;
  nav: (to: string) => void; tone?: "default" | "warning";
}) {
  return (
    <button
      onClick={() => nav(to)}
      className="flex flex-col items-start gap-2 rounded-md border border-border-subtle bg-surface p-4 text-left hover:bg-surface-hover hover:border-border-strong transition-colors duration-180"
    >
      <Icon name={icon} size={20} className={tone === "warning" ? "text-status-warning" : "text-text-muted"} />
      <span className={`tnum text-xl font-bold ${tone === "warning" ? "text-status-warning" : "text-text-primary"}`}>
        {value ?? "—"}
      </span>
      <span className="text-meta text-text-muted">{label}</span>
    </button>
  );
}
