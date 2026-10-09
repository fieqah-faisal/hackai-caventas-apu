import { useNavigate } from "react-router-dom";
import { getProvider } from "@/lib/api";
import { useOutcome } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Icon, type IconName } from "@/components/icons/Icon";
import { stageLabel } from "@/lib/format";
import type { AnalysisVM, EvidenceItemVM, PlanVM } from "@/lib/types";
import { useWorkspace } from "../context";

const p = getProvider();

export function OverviewTab() {
  const { caseId, header } = useWorkspace();
  const navigate = useNavigate();
  const analysis = useOutcome<AnalysisVM>(() => p.getAnalysis(caseId), [caseId]);
  const evidence = useOutcome<EvidenceItemVM[]>(() => p.getEvidence(caseId), [caseId]);
  const plans = useOutcome<PlanVM[]>(() => p.getPlans(caseId), [caseId]);

  const entityCount = analysis.value?.data.affectedEntities.length ?? null;
  const evidenceCount = evidence.value?.data.length ?? null;
  const missing = analysis.value?.data.missingEvidence.length ?? 0;
  const planList = plans.value?.data ?? [];
  const latestPlan = planList.length ? planList[planList.length - 1] : undefined;

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-border-subtle bg-surface p-5">
        <AsyncBoundary outcome={analysis}>
          {(a) => (
            <p className="text-base text-text-secondary">
              {a.classification
                ? `${a.classification}. ${header.stage ? stageLabel[header.stage] + " stage." : ""}`
                : "No analysis summary yet — start a planning run to generate one."}
            </p>
          )}
        </AsyncBoundary>
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon="identity" value={entityCount} label="Affected entities" to={`/cases/${caseId}/analysis`} nav={navigate} />
        <Stat icon="evidence" value={evidenceCount} label="Evidence records" to={`/cases/${caseId}/evidence`} nav={navigate} />
        <Stat icon="warning" value={missing} label="Unresolved questions" to={`/cases/${caseId}/analysis`} nav={navigate} tone={missing > 0 ? "warning" : "default"} />
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