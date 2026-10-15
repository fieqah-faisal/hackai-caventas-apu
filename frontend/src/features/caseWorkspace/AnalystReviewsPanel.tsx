import { useEffect, useState } from "react";
import { getProvider } from "@/lib/api";
import { outcomeMessage, useOutcome } from "@/lib/useOutcome";
import { readableValue, relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

const p = getProvider();

export function AnalystReviewsPanel({ caseId, stateVersion }: { caseId: string; stateVersion: number }) {
  const reviews = useOutcome(() => p.getAnalystReviews(caseId), [caseId]);
  const plans = useOutcome(() => p.getPlans(caseId), [caseId]);
  const [analyst, setAnalyst] = useState("");
  const [role, setRole] = useState("");
  const [comment, setComment] = useState("");
  const [reviewType, setReviewType] = useState<"note" | "confirm" | "dispute" | "request_more_evidence" | "sign_off">("note");
  const [targetPlanId, setTargetPlanId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const planRows = plans.value?.data ?? [];
  const selectedPlan = planRows.find((plan) => plan.planId === targetPlanId) ?? null;
  const hasStalePlans = planRows.some((plan) => plan.basedOnStateVersion !== stateVersion);
  const hasCurrentPlan = planRows.some((plan) => plan.basedOnStateVersion === stateVersion);
  const reviewRows = reviews.value?.data ?? [];
  const unresolvedRequest = reviewRows.some((review, index) => review.reviewType === "request_more_evidence" && !reviewRows.slice(index + 1).some((later) => later.targetType === review.targetType && later.targetId === review.targetId && ["confirm", "sign_off"].includes(later.reviewType)));

  useEffect(() => {
    if (selectedPlan && selectedPlan.basedOnStateVersion !== stateVersion) setTargetPlanId("");
  }, [selectedPlan, stateVersion]);

  async function submit() {
    if (!analyst.trim() || !role.trim() || !comment.trim()) return;
    if (selectedPlan && selectedPlan.basedOnStateVersion !== stateVersion) return;
    setBusy(true);
    setError(null);
    const result = await p.createAnalystReview(caseId, {
      targetType: selectedPlan ? "plan" : "case",
      targetId: selectedPlan?.planId ?? null,
      reviewType,
      analyst: analyst.trim(),
      analystRole: role.trim(),
      comment: comment.trim(),
      stateVersion,
      planVersion: selectedPlan?.version ?? null,
    });
    setBusy(false);
    if (result.kind !== "ok") {
      setError(outcomeMessage(result));
      return;
    }
    setComment("");
    reviews.retry();
  }

  return (
    <section className="rounded-md border border-border-subtle bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button type="button" aria-expanded={expanded} aria-controls="analyst-reviews-content" onClick={() => setExpanded((value) => !value)} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
          <span><span className="block text-base font-semibold text-text-primary">Analyst reviews</span><span className="mt-0.5 block text-meta text-text-muted">Persistent assessments, separate from action approvals.</span></span>
          <span className="text-meta font-medium text-text-secondary">{expanded ? "Collapse" : "Expand"}</span>
        </button>
        <div className="flex flex-wrap gap-2">
          <StatusBadge>{reviewRows.length} recorded</StatusBadge>
          {unresolvedRequest && <StatusBadge tone="warning">Evidence requested</StatusBadge>}
          {reviewRows.some((review) => review.reviewType === "dispute") && <StatusBadge tone="danger">Disputed</StatusBadge>}
          {reviewRows.some((review) => review.reviewType === "confirm") && <StatusBadge tone="info">Confirmed</StatusBadge>}
          {reviewRows.some((review) => review.reviewType === "sign_off") && <StatusBadge tone="accent">Signed off</StatusBadge>}
        </div>
      </div>

      {reviews.state === "error" && <p role="alert" className="mt-3 text-meta text-status-danger">{reviews.failure ? outcomeMessage(reviews.failure) : "Could not load reviews."}</p>}
      <div id="analyst-reviews-content" hidden={!expanded} className="border-t border-border-subtle p-4">
        <section aria-labelledby="review-history-heading">
          <h3 id="review-history-heading" className="text-sm font-semibold text-text-primary">Review history</h3>
          <div className="mt-3 space-y-2">
          {reviewRows.length === 0 && <p className="text-meta text-text-muted">No analyst reviews recorded.</p>}
          {reviewRows.map((review) => (
            <article key={review.reviewId} className="rounded border border-border-subtle bg-surface-raised px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-meta">
                <StatusBadge>{readableValue(review.reviewType)}</StatusBadge>
                <span className="font-medium text-text-primary">{review.analyst}</span>
                <span className="text-text-muted">{review.analystRole} · {readableValue(review.targetType)} · State v{review.stateVersion} · {relativeTime(review.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-text-secondary">{review.comment}</p>
            </article>
          ))}
          </div>
        </section>

      <section aria-labelledby="add-review-heading" className="mt-5 border-t border-border-subtle pt-4">
        <h3 id="add-review-heading" className="text-sm font-semibold text-text-primary">Add review</h3>
        {plans.state === "error" && <p role="alert" className="mt-2 text-meta text-status-danger">Plan targets could not be loaded. Case review remains available.</p>}
        {!hasCurrentPlan && hasStalePlans && <p className="mt-2 rounded border border-status-warning/40 px-3 py-2 text-meta text-text-secondary">The latest plan is based on an older incident state. Re-run analysis before reviewing that plan.</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-meta text-text-secondary">Analyst
          <input value={analyst} onChange={(event) => setAnalyst(event.target.value)} maxLength={200} className="mt-1 w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary" />
        </label>
        <label className="text-meta text-text-secondary">Role
          <input value={role} onChange={(event) => setRole(event.target.value)} maxLength={200} className="mt-1 w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary" />
        </label>
        <label className="text-meta text-text-secondary">Review type
          <select value={reviewType} onChange={(event) => setReviewType(event.target.value as typeof reviewType)} className="mt-1 w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary">
            <option value="note">Note</option><option value="confirm">Confirm</option><option value="dispute">Dispute</option><option value="request_more_evidence">Request more evidence</option><option value="sign_off">Sign off</option>
          </select>
        </label>
        <label className="text-meta text-text-secondary">Target
          <select value={targetPlanId} onChange={(event) => setTargetPlanId(event.target.value)} className="mt-1 w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary">
            <option value="">Case (State v{stateVersion})</option>
            {planRows.map((plan) => <option key={plan.planId} value={plan.planId} disabled={plan.basedOnStateVersion !== stateVersion}>Plan v{plan.version}{plan.basedOnStateVersion === stateVersion ? " — current" : ` — stale, based on State v${plan.basedOnStateVersion}`}</option>)}
          </select>
        </label>
        <label className="text-meta text-text-secondary md:col-span-2">Comment
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={5000} rows={3} className="mt-1 w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary" />
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-meta text-status-danger">{error}</p>}
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={submit} disabled={busy || !analyst.trim() || !role.trim() || !comment.trim()}>{busy ? "Recording…" : "Record review"}</Button>
      </div>
      </section>
      </div>
    </section>
  );
}
