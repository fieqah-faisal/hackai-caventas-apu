import { useState } from "react";
import { getProvider } from "@/lib/api";
import { useOutcome, outcomeMessage } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/icons/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Mono } from "@/components/ui/Mono";
import { useToast } from "@/components/ui/Toast";
import { useDataMode } from "@/lib/useDataMode";
import { riskLabel, stageLabel } from "@/lib/format";
import type { ApprovalItemVM, DecisionKind, ExecutionResultVM } from "@/lib/types";
import type { ApproverRoleDTO } from "@/lib/api/dto";
import { useWorkspace } from "../context";

const p = getProvider();

export function ApprovalsTab() {
  const { caseId, refresh } = useWorkspace();
  const approvals = useOutcome<ApprovalItemVM[]>(() => p.getApprovals(caseId), [caseId]);
  const results = useOutcome<ExecutionResultVM[]>(() => p.getExecutionResults(caseId), [caseId]);
  const reload = () => {
    approvals.retry();
    results.retry();
    refresh();
  };

  return (
    <div className="space-y-5">
      <AsyncBoundary
        outcome={approvals}
        emptyWhen={(d) => d.length === 0}
        emptyTitle="No recommendations awaiting approval"
        emptyHint="Approved actions move on to simulation; the AI never acts without an analyst decision."
      >
        {(items) => (
          <ul className="space-y-3">
            {items.map((a) => (
              <ApprovalCard key={`${a.actionId}-${a.actionVersion}`} item={a} caseId={caseId} onChanged={reload} />
            ))}
          </ul>
        )}
      </AsyncBoundary>
      <section aria-labelledby="execution-history-title">
        <h2 id="execution-history-title" className="mb-2 text-sm font-semibold text-text-primary">Execution history</h2>
        <AsyncBoundary
          outcome={results}
          emptyWhen={(d) => d.length === 0}
          emptyTitle="No bounded simulations recorded"
          emptyHint="Execution and validation results remain here after the approval queue refreshes."
        >
          {(items) => (
            <ul className="space-y-2">
              {items.map((result) => (
                <li key={result.executionId} className="rounded border border-border-subtle bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Mono>{result.tool}</Mono><span className="text-text-muted">on</span><Mono>{result.target}</Mono>
                    <StatusBadge tone={result.executionStatus === "completed" ? "info" : "danger"}>Execution: {result.executionStatus}</StatusBadge>
                    <StatusBadge tone={result.validationStatus === "effective" ? "accent" : result.validationStatus === "not_applicable" ? "neutral" : "danger"}>Validation: {result.validationStatus}</StatusBadge>
                  </div>
                  <p className="mt-1.5 text-meta text-text-secondary">{result.observedEffect}</p>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </section>
    </div>
  );
}

function ApprovalCard({ item, caseId, onChanged }: { item: ApprovalItemVM; caseId: string; onChanged: () => void }) {
  const { notify } = useToast();
  const mode = useDataMode();
  const [busy, setBusy] = useState(false);
  const [commentFor, setCommentFor] = useState<DecisionKind | null>(null);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<ExecutionResultVM | null>(null);
  const [localState, setLocalState] = useState(item.state);
  const [actingRole, setActingRole] = useState<ApproverRoleDTO>("soc_analyst");

  // Request-more-investigation is unavailable in API mode (backend supports
  // approve/reject only). Shown but disabled with an explanation there.
  const requestUnavailable = mode === "api";

  async function decide(decision: DecisionKind) {
    if ((decision === "reject" || decision === "request_more_investigation") && comment.trim().length === 0) {
      setCommentFor(decision);
      return;
    }
    setBusy(true);
    const out = await p.submitDecision(caseId, item.actionId, decision, "Caventas SOC Analyst", comment.trim(), actingRole);
    setBusy(false);
    if (out.kind === "ok") {
      setLocalState(out.value.data.state as typeof item.state);
      notify({ tone: decision === "approve" ? "success" : "info", title: `Action ${decision.replace(/_/g, " ")}`, detail: item.tool });
      setComment("");
      setCommentFor(null);
      onChanged();
    } else {
      notify({ tone: "error", title: "Decision not recorded", detail: outcomeMessage(out) });
    }
  }

  async function simulate() {
    setBusy(true);
    const out = await p.executeAction(caseId, item.actionId);
    setBusy(false);
    if (out.kind === "ok") {
      setResult(out.value.data);
      notify({ tone: "info", title: "Bounded simulation complete", detail: `${item.tool}: ${out.value.data.executionStatus} / ${out.value.data.validationStatus}` });
      onChanged();
    } else {
      notify({ tone: "error", title: "Simulation not run", detail: outcomeMessage(out) });
    }
  }

  const decided = localState !== "proposed";

  return (
    <li className="rounded-md border border-border-subtle bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Mono className="rounded bg-canvas border border-border-subtle px-1.5 py-0.5 text-text-primary">{item.tool}</Mono>
            <span className="text-base text-text-muted">on</span>
            <span className="text-base text-text-secondary"><Mono>{item.target}</Mono></span>
            <StatusBadge tone="info">{stageLabel[item.stage]}</StatusBadge>
          </div>
          <p className="mt-1.5 max-w-2xl text-base text-text-secondary">{item.rationale}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-meta text-text-muted">
            <span>Approver: {item.requiredApprover}</span>
            <span aria-hidden>·</span>
            <span>action v{item.actionVersion} · state v{item.basedOnStateVersion}</span>
            {item.policyRef && <><span aria-hidden>·</span><Mono>{item.policyRef}</Mono></>}
          </div>
          {item.supportingEvidence.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[...new Set(item.supportingEvidence)].map((e) => <Mono key={e} className="rounded border border-border-subtle px-1.5">{e}</Mono>)}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge tone={item.risk === "high" ? "danger" : item.risk === "moderate" ? "warning" : "neutral"}>{riskLabel[item.risk]}</StatusBadge>
          {item.escalationRequired && <StatusBadge tone="danger"><Icon name="shield" size={18} className="mr-1" />Senior approval</StatusBadge>}
          {item.stalePrewarn && <StatusBadge tone="warning">Approval may be stale</StatusBadge>}
        </div>
      </div>

      {/* Expected effect */}
      <p className="mt-2 text-meta text-text-muted">Expected effect: {item.expectedEffect || "—"}</p>

      {/* Comment field when required */}
      {commentFor && (
        <div className="mt-3">
          <label className="text-meta text-text-muted" htmlFor={`c-${item.actionId}`}>
            A comment is required to {commentFor.replace(/_/g, " ")}.
          </label>
          <textarea
            id={`c-${item.actionId}`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-border-subtle bg-canvas p-2 text-base text-text-primary placeholder:text-text-muted focus:border-border-strong focus-visible:outline-none"
            placeholder="Reason..."
          />
        </div>
      )}

      {/* Actions */}
      {!decided ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-meta text-text-muted">
            Acting as
            <select
              value={actingRole}
              onChange={(e) => setActingRole(e.target.value as ApproverRoleDTO)}
              disabled={busy}
              className="rounded border border-border-subtle bg-canvas px-1.5 py-0.5 text-base text-text-primary focus-visible:outline-none"
              aria-label="Acting approver role"
            >
              <option value="soc_analyst">SOC analyst</option>
              <option value="it_manager">IT manager</option>
              <option value="dpo">DPO</option>
            </select>
          </label>
          <span className="text-meta text-text-muted">Required: {item.requiredApprover}</span>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => decide("approve")} leadingIcon={<Icon name="success" size={18} />}>Approve</Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => decide("reject")} leadingIcon={<Icon name="blocked" size={18} />}>Reject</Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || requestUnavailable}
            title={requestUnavailable ? "The backend decision endpoint supports approve/reject only." : undefined}
            onClick={() => decide("request_more_investigation")}
            leadingIcon={<Icon name="search" size={18} />}
          >
            Request more investigation
          </Button>
          {requestUnavailable && <span className="text-meta text-text-muted">Request-more-investigation unavailable in API mode.</span>}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={localState === "approved" ? "info" : "neutral"}>Decision: {localState}</StatusBadge>
            {localState === "approved" && !result && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={simulate} leadingIcon={<Icon name="running" size={18} />}>Run bounded simulation</Button>
            )}
          </div>
          {result && (
            <div className="rounded border border-border-subtle bg-canvas p-3">
              <p className="text-meta text-text-muted">Simulation (bounded simulator — not real infrastructure)</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <StatusBadge tone={result.executionStatus === "completed" ? "info" : "danger"}>Execution: {result.executionStatus}</StatusBadge>
                <StatusBadge tone={result.validationStatus === "effective" ? "accent" : result.validationStatus === "not_applicable" ? "neutral" : "danger"}>Validation: {result.validationStatus}</StatusBadge>
              </div>
              <p className="mt-1.5 text-meta text-text-secondary">{result.observedEffect}</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
