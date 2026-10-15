import { useState } from "react";
import { getProvider } from "@/lib/api";
import { outcomeMessage, useOutcome } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Region";
import { Icon } from "@/components/icons/Icon";
import { readableValue, relativeTime } from "@/lib/format";
import { cx } from "@/lib/types";
import { FindingsTable } from "@/components/ui/FindingsTable";
import { TimelineTable } from "@/components/ui/TimelineTable";
import type { ReportVM, TimelineEventVM } from "@/lib/types";
import { useWorkspace } from "../context";

const p = getProvider();

export function ReportTab() {
  const { caseId } = useWorkspace();
  // Keyed by case so generation state never carries over between cases.
  return <ReportPanel key={caseId} caseId={caseId} />;
}

function ReportPanel({ caseId }: { caseId: string }) {
  // Loading the tab only READS. Generating is an explicit analyst action:
  // each generation stores a new report version, a PDF and an audit event.
  const report = useOutcome<ReportVM | null>(() => p.getReport(caseId), [caseId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const out = await p.generateReport(caseId);
    setBusy(false);
    // Show a report only once the backend has confirmed it.
    if (out.kind === "ok") report.retry();
    else setError(outcomeMessage(out));
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md border border-status-danger/45 bg-surface px-4 py-2 text-meta text-status-danger">
          Report not generated: {error}
        </p>
      )}
      <AsyncBoundary outcome={report}>
        {(r) =>
          r ? (
            <ReportView report={r} busy={busy} onGenerate={generate} />
          ) : (
            <section className="rounded-md border border-border-subtle bg-surface">
              <EmptyState
                icon={<Icon name="report" size={24} />}
                title="No report generated yet"
                hint="Generating builds a draft from the stored case records and stores it as a new report version with an audit event."
                action={
                  <Button variant="primary" size="sm" disabled={busy} onClick={generate} leadingIcon={<Icon name="report" size={18} />}>
                    {busy ? "Generating…" : "Generate report"}
                  </Button>
                }
              />
            </section>
          )
        }
      </AsyncBoundary>
    </div>
  );
}

function ReportView({ report, busy, onGenerate }: { report: ReportVM; busy: boolean; onGenerate: () => void }) {
  const entityGroups = [
    ["confirmed_affected", "Confirmed affected"],
    ["suspected_affected", "Suspected affected"],
    ["malicious_indicator", "Malicious indicators"],
    ["contextual", "Context only"],
  ] as const;
  const timelineEvents: TimelineEventVM[] = report.timeline.map((event) => ({
    id: event.id,
    time: event.timestamp,
    label: event.summary,
    kind: event.relevance === "context" ? "benign_decoy" : event.source === "analyst_note" ? "analyst_added" : "relevant",
    relationshipStatus: event.relationshipStatus,
    evidenceId: event.evidenceIds[0] ?? null,
    eventType: event.eventType,
    source: event.source,
    actor: event.actor,
    subject: event.subject,
    action: event.action,
    result: event.result,
    details: event.details,
    evidenceIds: event.evidenceIds,
    entityIds: event.entityIds,
    relevance: event.relevance,
    severity: event.severity,
    rawDescription: event.rawDetail,
  }));

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-md border border-border-subtle bg-surface">
        <div className="h-1 bg-accent" />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="mb-1 text-2xs font-semibold uppercase tracking-[0.16em] text-accent">Incident report</p>
          <h2 className="text-lg font-semibold text-text-primary">{report.title}</h2>
          <p className="mt-0.5 text-meta text-text-muted">
            {report.organisation} · report v{report.version} · status {report.status} · generated {relativeTime(report.generatedAt)}
          </p>
          <p className="mt-1 text-meta text-text-muted">
            State {report.stateVersion == null ? "not recorded" : `v${report.stateVersion}`}
            {report.recoveryStatus ? ` · recovery ${report.recoveryStatus}` : ""}
            {report.planId ? ` · plan ${report.planId}${report.planStateVersion == null ? "" : ` on state v${report.planStateVersion}`}` : " · no plan recorded"}
            {report.plannerModel ? ` · model ${report.plannerModel}` : ""}
          </p>
          <p className="mt-1 text-meta text-text-muted">
            Planner: {report.plannerKind === "live_ai" ? "Live AI planner" : report.plannerKind === "deterministic" ? "Deterministic planner" : "Planner identity unavailable"}
            {` · ${report.evidenceCount} evidence record${report.evidenceCount === 1 ? "" : "s"}`}
            {` · analyst confirmation: ${report.confirmedByAnalyst ? "confirmed for the current state" : "not established"}`}
          </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <div className="tnum text-base font-semibold text-text-primary">
              {report.completeness.present}/{report.completeness.total}
            </div>
            <div className="text-meta text-text-muted">sections populated</div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onGenerate}
            title="Builds a new report version from the current case records."
            leadingIcon={<Icon name="reload" size={18} />}
          >
            {busy ? "Generating…" : "Regenerate"}
          </Button>
          {report.pdfAvailable && (
            <a
              href={`/api/cases/${encodeURIComponent(report.caseId)}/reports/${encodeURIComponent(report.reportId)}/pdf`}
              download={`${report.reportId}.pdf`}
              className="inline-flex h-7 items-center justify-center gap-2 rounded border border-border-strong bg-surface-raised px-2.5 text-btn font-semibold text-text-primary transition-colors duration-180 hover:bg-surface-hover focus-visible:outline-none"
            >
              <Icon name="download" size={18} /> Download PDF
            </a>
          )}
          </div>
        </div>
      </section>

      {report.planIsStale && (
        <p role="status" className="rounded-md border border-status-warning/45 bg-surface px-4 py-2 text-meta text-text-secondary">
          The latest plan is stale for this incident state. Its narrative classification and open questions are retained as historical analysis bound to the earlier state; actions retain their own plan and state references.
        </p>
      )}

      <section aria-labelledby="report-overview" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="report-overview" eyebrow="Current posture" title="Incident overview" />
        <div className="mt-4 grid gap-px overflow-hidden rounded border border-border-subtle bg-border-subtle sm:grid-cols-2 xl:grid-cols-4">
          <OverviewFact label="Severity" value={report.overview.severity} emphasis />
          <OverviewFact label="Incident status" value={report.overview.incidentStatus} />
          <OverviewFact label="Current phase" value={report.overview.phase} />
          <OverviewFact label="Plan" value={report.overview.planStatus.replaceAll("_", " ")} />
          <OverviewFact label="Incident type" value={report.overview.incidentType} wide />
          <OverviewFact label="Primary assets" value={report.overview.primaryAssets.join(", ") || "None identified"} wide />
        </div>
      </section>

      <section aria-labelledby="executive-summary" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="executive-summary" eyebrow="Decision brief" title="Executive summary" />
        <p className="mt-3 max-w-5xl text-base leading-7 text-text-secondary">
          {report.executiveSummary.text || "No record-backed executive summary is available."}
        </p>
        <p className="mt-2 text-2xs uppercase tracking-wide text-text-muted">Source: {report.executiveSummary.source.replaceAll("_", " ")}</p>
      </section>

      <section aria-labelledby="analysis-summary" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="analysis-summary" eyebrow="Persisted analysis" title="Analysis summary" />
        <p className="mt-3 max-w-5xl text-base leading-7 text-text-secondary">{report.analysisSummary}</p>
        <p className="mt-2 text-2xs text-text-muted">Any confidence values are planner-reported, advisory, and not calibrated probabilities.</p>
      </section>

      <section aria-labelledby="key-findings" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="key-findings" eyebrow="Prioritized analysis" title="Key findings" count={report.findings.length} />
        <div className="mt-4">
          <FindingsTable
            rows={report.findings.map((finding) => ({
              key: finding.id,
              title: finding.title,
              summary: finding.summary,
              status: finding.status,
              severity: finding.severity,
              affectedEntityIds: finding.affectedEntityIds,
              evidenceIds: finding.evidenceIds,
              confidence: finding.confidence,
            }))}
          />
        </div>
      </section>

      <section aria-labelledby="key-timeline" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="key-timeline" eyebrow="Material sequence" title="Structured timeline" count={report.timeline.length} />
        <div className="mt-4 overflow-hidden rounded border border-border-subtle"><TimelineTable caseId={report.caseId} events={timelineEvents} /></div>
      </section>

      <section aria-labelledby="entities" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="entities" eyebrow="Scope" title="Entities and indicators" count={report.entities.length} />
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {entityGroups.map(([key, label]) => {
            const entities = report.entities.filter((entity) => entity.relevance === key);
            return (
              <div key={key} className="rounded border border-border-subtle bg-surface-raised">
                <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5"><h4 className="text-meta font-semibold text-text-primary">{label}</h4><span className="tnum text-2xs text-text-muted">{entities.length}</span></div>
                {entities.length ? entities.map((entity) => (
                  <div key={entity.id} className="border-b border-border-subtle px-4 py-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-meta font-semibold text-text-primary">{entity.displayName}</span><StatusBadge value={entity.condition} /></div>
                    <p className="mt-1 text-meta text-text-secondary">{entity.type} · {entity.role} · {entity.relevanceReason}</p>
                    <p className="mt-1 font-mono text-2xs text-text-muted">{entity.id} · {entity.evidenceCount} evidence reference{entity.evidenceCount === 1 ? "" : "s"}</p>
                  </div>
                )) : <p className="px-4 py-3 text-meta text-text-muted">None recorded.</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="response-actions" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="response-actions" eyebrow="Response ledger" title="Actions and outcomes" count={report.actions.length} />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-meta">
            <thead><tr className="border-b border-border-strong text-2xs uppercase tracking-wide text-text-muted"><th className="px-3 py-2">Action</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">Approval</th><th className="px-3 py-2">Execution</th><th className="px-3 py-2">Validation</th><th className="px-3 py-2">Outcome</th></tr></thead>
            <tbody>{report.actions.map((action) => (
              <tr key={action.id} className="border-b border-border-subtle align-top last:border-0">
                <td className="max-w-xs px-3 py-3"><span className="block font-semibold text-text-primary">{action.type.replaceAll("_", " ")}</span><span className="block text-text-secondary">{action.recommendation}</span><span className="mt-1 block font-mono text-2xs text-text-muted">{action.id}</span></td>
                <td className="px-3 py-3 font-mono text-2xs text-text-secondary">{action.target}</td>
                <td className="px-3 py-3"><StatusBadge value={action.approvalStatus} />{action.decidedBy && <span className="mt-1 block text-2xs text-text-muted">{action.decidedBy}</span>}</td>
                <td className="px-3 py-3"><StatusBadge value={action.executionStatus} /></td>
                <td className="px-3 py-3"><StatusBadge value={action.validationStatus} /><span className="mt-1 block text-2xs text-text-muted">{action.effectiveness}</span></td>
                <td className="max-w-xs px-3 py-3 text-text-secondary">{action.outcome}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!report.actions.length && <EmptyLine text="No response actions are recorded." />}
      </section>

      <details className="rounded-md border border-border-subtle bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
          <span><span className="block text-2xs font-semibold uppercase tracking-[0.14em] text-accent">Automated execution</span><span className="mt-0.5 block text-base font-semibold text-text-primary">Agent Decision Trace</span></span>
          <span className="tnum rounded bg-surface-raised px-2 py-1 text-2xs text-text-muted">{report.agentDecisionTrace.length} steps · expand</span>
        </summary>
        <div className="border-t border-border-subtle p-5">
          <p className="text-meta text-text-muted">Operational execution and decision trace only. This is not hidden chain-of-thought or private model reasoning.</p>
          {report.agentDecisionTrace.length ? <div className="mt-4 space-y-2">{report.agentDecisionTrace.map((step) => <article key={step.stepId} className="rounded border border-border-subtle bg-surface-raised p-3"><div className="flex flex-wrap items-center gap-2"><StatusBadge value={step.status} /><span className="font-semibold text-text-primary">{readableValue(step.step)}</span><span className="font-mono text-2xs text-text-muted">{step.runId} · State v{step.stateVersion} · {step.durationMs} ms</span></div><p className="mt-2 text-meta text-text-secondary">{step.decisionSummary || step.message}</p>{step.validationSummary && <p className="mt-1 text-meta text-text-muted">Validation: {step.validationSummary}</p>}<p className="mt-1 break-words font-mono text-2xs text-text-muted">Planner: {readableValue(step.plannerKind)}{step.plannerModel ? ` · ${step.plannerModel}` : ""}{step.evidenceIds.length ? ` · Evidence: ${step.evidenceIds.join(", ")}` : ""}{step.guidanceIds.length ? ` · Guidance: ${step.guidanceIds.join(", ")}` : ""}{step.outputRefs.length ? ` · Outputs: ${step.outputRefs.join(", ")}` : ""}</p></article>)}</div> : <EmptyLine text="No persisted Agent Decision Trace steps were available for this report snapshot." />}
        </div>
      </details>

      <section aria-labelledby="activity-log" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="activity-log" eyebrow="Human and system record" title="Analyst Activity and Approval Log" count={report.investigationActivity.length} />
        <div className="mt-4 space-y-2">
          {report.investigationActivity.map((event) => <article key={event.eventId} className="grid gap-2 rounded border border-border-subtle bg-surface-raised p-3 md:grid-cols-[10rem_12rem_1fr]"><div><StatusBadge value={event.actorType} /><p className="mt-1 text-meta font-medium text-text-primary">{event.actor || "Not recorded"}</p><p className="text-2xs text-text-muted">{event.role || "Role not recorded"}</p></div><div><p className="font-semibold text-text-primary">{readableValue(event.eventType)}</p><p className="mt-1 font-mono text-2xs text-text-muted">{event.actionId || event.targetId || "No target ID"}{event.stateVersion == null ? "" : ` · State v${event.stateVersion}`}{event.planId ? ` · ${event.planId}` : ""}</p></div><div><p className="text-meta text-text-secondary">{event.summary}</p>{event.reason && <p className="mt-1 text-meta text-text-primary">Reason: {event.reason}</p>}{event.outcome && <p className="mt-1 text-2xs text-text-muted">Outcome: {event.outcome}</p>}</div></article>)}
          {!report.investigationActivity.length && <EmptyLine text="No analyst activity or approval records were available for this report snapshot." />}
        </div>
      </section>

      <section aria-labelledby="analyst-reviews" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="analyst-reviews" eyebrow="Human oversight" title="Analyst reviews and sign-off" count={report.reviews.length} />
        <p className="mt-3 text-meta text-text-secondary">
          Sign-off: {report.signOff ? `${report.signOff.analyst} (${report.signOff.role})` : "No analyst sign-off recorded"}
        </p>
        {report.reviews.length ? (
          <ul className="mt-3 space-y-2">
            {report.reviews.map((review) => (
              <li key={review.reviewId} className="rounded border border-border-subtle bg-surface-raised px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-text-primary">{review.analyst}</span>
                  <span className="text-2xs text-text-muted">{review.analystRole}</span>
                  <StatusBadge value={review.reviewType} />
                </div>
                {review.comment && <p className="mt-1 text-meta text-text-secondary">{review.comment}</p>}
              </li>
            ))}
          </ul>
        ) : <EmptyLine text="No analyst reviews recorded for this report snapshot." />}
      </section>

      <section aria-labelledby="impact" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="impact" eyebrow="Assessment" title="Impact and remaining risk" />
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <ListPanel title="Confirmed" items={report.impact.confirmed} />
          <ListPanel title="Potential" items={report.impact.potential} />
          <ListPanel title="Remaining risk" items={report.impact.remainingRisk} />
        </div>
      </section>

      <section aria-labelledby="next-steps" className="rounded-md border border-border-subtle bg-surface p-5">
        <SectionHeading id="next-steps" eyebrow="Forward work" title="Prioritized next steps" count={report.nextSteps.length} />
        <div className="mt-4 space-y-2">
          {report.nextSteps.map((step, index) => (
            <div key={`${step.text}-${index}`} className="grid gap-2 rounded border border-border-subtle bg-surface-raised px-4 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <StatusBadge value={step.priority} />
              <div><p className="text-base text-text-primary">{step.text}</p><p className="mt-0.5 text-2xs text-text-muted">Owner: {step.owner}{step.relatedIds.length ? ` · ${step.relatedIds.join(", ")}` : ""}</p></div>
              <span className="text-2xs uppercase tracking-wide text-text-muted">{step.status}</span>
            </div>
          ))}
          {!report.nextSteps.length && <EmptyLine text="No record-backed next steps are available." />}
        </div>
      </section>

      <Appendices report={report} />

      <p className="text-meta text-text-muted">
        The completeness indicator counts record-backed sections present versus total; it is not an accuracy percentage.
      </p>
    </div>
  );
}

function SectionHeading({ id, eyebrow, title, count }: { id: string; eyebrow: string; title: string; count?: number }) {
  return <div><p className="text-2xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p><div className="mt-0.5 flex items-center gap-2"><h3 id={id} className="text-base font-semibold text-text-primary">{title}</h3>{count != null && <span className="tnum rounded bg-surface-raised px-1.5 py-0.5 text-2xs text-text-muted">{count}</span>}</div></div>;
}

function OverviewFact({ label, value, emphasis = false, wide = false }: { label: string; value: string; emphasis?: boolean; wide?: boolean }) {
  return <div className={cx("bg-surface-raised px-4 py-3", wide && "xl:col-span-2")}><p className="text-2xs uppercase tracking-wide text-text-muted">{label}</p><p className={cx("mt-1 text-base font-semibold capitalize text-text-primary", emphasis && "text-accent")}>{value.replaceAll("_", " ")}</p></div>;
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = /high|critical|failed|ineffective|rejected|stale|compromised/.test(normalized)
    ? "border-status-danger/40 text-status-danger"
    : /approved|completed|effective|confirmed|current|low/.test(normalized)
      ? "border-status-success/40 text-status-success"
      : /medium|pending|suspected|not_|unknown/.test(normalized)
        ? "border-status-warning/40 text-status-warning"
        : "border-border-strong text-text-secondary";
  return <span className={cx("inline-flex rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide", tone)}>{value.replaceAll("_", " ")}</span>;
}

function EmptyLine({ text }: { text: string }) {
  return <p className="mt-4 rounded border border-dashed border-border-subtle px-4 py-3 text-meta text-text-muted">{text}</p>;
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded border border-border-subtle bg-surface-raised p-4"><h4 className="text-meta font-semibold text-text-primary">{title}</h4>{items.length ? <ul className="mt-2 list-disc space-y-1.5 pl-4 text-meta leading-5 text-text-secondary">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="mt-2 text-meta text-text-muted">Not established from current records.</p>}</div>;
}

function Appendices({ report }: { report: ReportVM }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-md border border-border-subtle bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left"
      >
        <span><span className="block text-2xs font-semibold uppercase tracking-[0.14em] text-accent">Supporting record</span><span className="text-base font-semibold text-text-primary">Technical appendices</span></span>
        <Icon name="chevronRight" size={18} className={cx("text-text-muted transition-transform duration-180", open && "rotate-90")} />
      </button>
      {open && (
        <div className="grid gap-5 border-t border-border-subtle p-5 lg:grid-cols-2">
          <AppendixList title="Evidence index" items={report.appendices.evidence.map((item) => `${item.evidenceId} · ${item.sourceFile}${item.sourceLocation ? ` · ${item.sourceLocation}` : ""} · SHA-256 ${item.sha256}${item.untrusted ? " · untrusted input" : ""}`)} mono />
          <AppendixList title="ATT&CK mapping" items={report.appendices.attackMapping} mono />
          <AppendixList title="Provenance" items={report.appendices.provenance} mono />
          <AppendixList title="Technical findings" items={report.appendices.findings.map((finding) => `${finding.id} · ${finding.summary}`)} />
          <div className="lg:col-span-2"><AppendixList title="Raw chronology" items={report.appendices.chronology.map((event) => `${event.timestamp || "Not recorded"} · ${event.category} · ${event.rawDetail}`)} mono /></div>
        </div>
      )}
    </section>
  );
}

function AppendixList({ title, items, mono = false }: { title: string; items: string[]; mono?: boolean }) {
  return <div><h4 className="text-meta font-semibold text-text-primary">{title}</h4>{items.length ? <ul className={cx("mt-2 space-y-1.5 text-meta text-text-secondary", mono && "font-mono text-2xs")}>{items.map((item, index) => <li key={`${item}-${index}`} className="break-words rounded bg-surface-raised px-3 py-2">{item}</li>)}</ul> : <p className="mt-2 text-meta text-text-muted">No records.</p>}</div>;
}
