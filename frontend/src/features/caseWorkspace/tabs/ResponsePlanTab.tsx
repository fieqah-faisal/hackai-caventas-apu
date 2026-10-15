import { useMemo, useState } from "react";
import { getProvider } from "@/lib/api";
import { useOutcome } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Icon } from "@/components/icons/Icon";
import { ActionStateBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { Mono } from "@/components/ui/Mono";
import { DetailPanel } from "../DetailPanel";
import { computePlanDiff } from "@/lib/scenario/planDiff";
import { diffCategoryLabel, riskLabel, stageLabel } from "@/lib/format";
import { STAGE_ORDER, cx } from "@/lib/types";
import type { PlanVM, ResponsePlanActionVM, Stage } from "@/lib/types";
import { useWorkspace } from "../context";

const p = getProvider();

export function ResponsePlanTab() {
  const { caseId } = useWorkspace();
  const plans = useOutcome<PlanVM[]>(() => p.getPlans(caseId), [caseId]);

  return (
    <AsyncBoundary outcome={plans} emptyWhen={(d) => d.length === 0} emptyTitle="No response plan yet" emptyHint="A plan appears after a planning run proposes actions.">
      {(all) => <PlanView plans={all} />}
    </AsyncBoundary>
  );
}

function PlanView({ plans }: { plans: PlanVM[] }) {
  const latest = plans.length - 1;
  const [planIdx, setPlanIdx] = useState(latest);
  const [stage, setStage] = useState<Stage>(plans[latest].actions[0]?.stage ?? "containment");
  const [detail, setDetail] = useState<ResponsePlanActionVM | null>(null);

  // Re-plan copy, diff and "new evidence" badge only when the provider
  // recorded why the latest version replaced the previous one (the fixture
  // scenario). The backend stores no re-plan rationale, so API mode shows none.
  const latestPlan = plans[latest];
  const replanExplanation = plans.length > 1 ? latestPlan.replanExplanation ?? null : null;
  const diff = replanExplanation ? computePlanDiff(plans[latest - 1], latestPlan, replanExplanation) : null;
  const [showDiff, setShowDiff] = useState(diff !== null);

  const plan = plans[planIdx];
  const stagesWithActions = useMemo(
    () => STAGE_ORDER.filter((s) => plan.actions.some((a) => a.stage === s)),
    [plan],
  );
  const effectiveStage = stagesWithActions.includes(stage) ? stage : stagesWithActions[0] ?? plan.stage;
  const stageActions = plan.actions.filter((a) => a.stage === effectiveStage);

  return (
    <div className="space-y-4">
      {/* Plan version switcher + replan notice */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Plan versions">
          {plans.map((pl, i) => (
            <button
              key={pl.planId}
              role="tab"
              aria-selected={i === planIdx}
              onClick={() => setPlanIdx(i)}
              className={cx(
                "rounded border px-2.5 py-1 text-meta font-medium",
                i === planIdx ? "border-accent/40 text-accent" : "border-border-subtle text-text-secondary hover:text-text-primary",
              )}
            >
              Plan v{pl.version}
            </button>
          ))}
          {diff && (
            <button
              onClick={() => setShowDiff((d) => !d)}
              className={cx("ml-2 inline-flex items-center gap-1 rounded border px-2.5 py-1 text-meta font-medium", showDiff ? "border-accent/40 text-accent" : "border-border-subtle text-text-secondary")}
            >
              <Icon name="reload" size={18} /> {showDiff ? "Hide" : "Show"} re-plan diff
            </button>
          )}
        </div>
        {diff && planIdx === plans.length - 1 && (
          <StatusBadge tone="warning"><Icon name="warning" size={18} className="mr-1" />New evidence received</StatusBadge>
        )}
      </div>

      {showDiff && diff && planIdx === plans.length - 1 && (
        <section className="rounded-md border border-status-warning/30 bg-surface p-4">
          <p className="text-base text-text-primary">{diff.explanation}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["unchanged", "added", "replaced_or_insufficient", "policy_triggered"] as const).map((cat) => {
              const n = diff.entries.filter((e) => e.category === cat).length;
              return (
                <StatusBadge key={cat} tone={cat === "added" ? "info" : cat === "policy_triggered" ? "danger" : cat === "replaced_or_insufficient" ? "warning" : "neutral"}>
                  {n} {diffCategoryLabel[cat]}
                </StatusBadge>
              );
            })}
          </div>
        </section>
      )}

      {/* Stage navigation */}
      <div className="flex flex-wrap gap-1.5">
        {stagesWithActions.map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={cx("rounded border px-2.5 py-1 text-meta font-medium", s === effectiveStage ? "border-accent/40 text-accent" : "border-border-subtle text-text-secondary hover:text-text-primary")}
          >
            {stageLabel[s]}
          </button>
        ))}
      </div>

      {/* Actions for the selected stage */}
      <div className="rounded-md border border-border-subtle bg-surface overflow-hidden">
        {plan.actionsUnavailable && (
          <p className="px-4 py-6 text-center text-meta text-text-muted">
            Plan v{plan.version} has {plan.actionsUnavailable.count} unresolved action reference{plan.actionsUnavailable.count === 1 ? "" : "s"}.{" "}
            {plan.actionsUnavailable.reason}
          </p>
        )}
        {stageActions.length === 0 && !plan.actionsUnavailable ? (
          <p className="px-4 py-6 text-center text-meta text-text-muted">No actions in the {stageLabel[effectiveStage]} stage.</p>
        ) : (
          stageActions.length > 0 && <ul>
            {stageActions.map((a) => {
              const diffCat = diff?.entries.find((e) => e.action.actionId === a.actionId)?.category;
              return (
                <li key={a.actionId}>
                  <button
                    onClick={() => setDetail(a)}
                    className="group flex w-full items-start gap-3 border-b border-border-subtle px-4 py-3 text-left last:border-b-0 hover:bg-surface-hover transition-colors duration-180"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Mono className="rounded bg-canvas border border-border-subtle px-1.5 py-0.5 text-text-primary">{a.tool}</Mono>
                        <span className="text-base text-text-muted">on</span>
                        <span className="text-base text-text-secondary">{a.targetType ?? "target"}:<Mono>{a.target}</Mono></span>
                      </span>
                      <span className="mt-1 block text-meta text-text-muted">
                        v{a.version} · based on state v{a.basedOnStateVersion}
                        {showDiff && diffCat && planIdx === plans.length - 1 && <> · {diffCategoryLabel[diffCat]}</>}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <ActionStateBadge state={a.state} />
                      <StatusBadge tone={a.risk === "high" ? "danger" : a.risk === "moderate" ? "warning" : "neutral"}>{riskLabel[a.risk]}</StatusBadge>
                      {a.escalationRequired && <StatusBadge tone="danger">Senior approval</StatusBadge>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-meta text-text-muted">
        Caventas recommends actions and never claims to have modified real infrastructure. Approved actions run only in the bounded simulator.
      </p>

      <DetailPanel open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.tool} on ${detail.target}` : "Action"}>
        {detail && (
          <dl className="space-y-3 text-base">
            <div><dt className="text-meta text-text-muted">State</dt><dd className="mt-1"><ActionStateBadge state={detail.state} /></dd></div>
            <div><dt className="text-meta text-text-muted">Rationale</dt><dd className="mt-0.5 text-text-secondary">{detail.rationale || "—"}</dd></div>
            <div><dt className="text-meta text-text-muted">Expected effect</dt><dd className="mt-0.5 text-text-secondary">{detail.expectedEffect || "—"}</dd></div>
            <div><dt className="text-meta text-text-muted">Policy references</dt><dd className="mt-0.5 flex flex-wrap gap-1.5">{detail.policyRefs.length ? detail.policyRefs.map((r) => <Mono key={r} className="rounded border border-border-subtle px-1.5">{r}</Mono>) : "—"}</dd></div>
            <div><dt className="text-meta text-text-muted">Evidence</dt><dd className="mt-0.5 flex flex-wrap gap-1.5">{detail.evidenceIds.length ? detail.evidenceIds.map((r) => <Mono key={r}>{r}</Mono>) : "—"}</dd></div>
            <div><dt className="text-meta text-text-muted">Validation checks</dt><dd className="mt-0.5 text-text-secondary">{detail.validationChecks.length ? <ul className="list-disc pl-5">{detail.validationChecks.map((c, i) => <li key={i}>{c}</li>)}</ul> : "—"}</dd></div>
          </dl>
        )}
      </DetailPanel>
    </div>
  );
}
