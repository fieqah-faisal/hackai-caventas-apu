import { useState } from "react";
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
  const [target, setTarget] = useState<"case" | "plan">("case");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const planRows = plans.value?.data ?? [];
  const latestPlan = planRows.length ? planRows[planRows.length - 1] : null;

  async function submit() {
    if (!analyst.trim() || !role.trim() || !comment.trim()) return;
    if (target === "plan" && !latestPlan) return;
    setBusy(true);
    setError(null);
    const result = await p.createAnalystReview(caseId, {
      targetType: target,
      targetId: target === "plan" ? latestPlan!.planId : null,
      reviewType,
      analyst: analyst.trim(),
      analystRole: role.trim(),
      comment: comment.trim(),
      stateVersion,
      planVersion: target === "plan" ? latestPlan!.version : null,
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
    <section className="rounded-md border border-border-subtle bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Analyst reviews</h2>
          <p className="mt-1 text-meta text-text-muted">Persistent case or plan assessments. These do not approve response actions.</p>
        </div>
        <StatusBadge>{reviews.value?.data.length ?? 0} recorded</StatusBadge>
      </div>

      {reviews.state === "error" && <p role="alert" className="mt-3 text-meta text-status-danger">{reviews.failure ? outcomeMessage(reviews.failure) : "Could not load reviews."}</p>}
      {reviews.value && (
        <div className="mt-4 space-y-2">
          {reviews.value.data.length === 0 && <p className="text-meta text-text-muted">No analyst reviews recorded.</p>}
          {reviews.value.data.map((review) => (
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
      )}

      <div className="mt-4 grid gap-3 border-t border-border-subtle pt-4 md:grid-cols-2">
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
          <select value={target} onChange={(event) => setTarget(event.target.value as "case" | "plan")} className="mt-1 w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary">
            <option value="case">Case</option>
            <option value="plan" disabled={!latestPlan}>Latest plan{latestPlan ? ` v${latestPlan.version}` : " (none stored)"}</option>
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
  );
}
