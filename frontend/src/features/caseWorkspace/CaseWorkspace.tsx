import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate, useParams, useLocation } from "react-router-dom";
import { getProvider } from "@/lib/api";
import { useOutcome } from "@/lib/useOutcome";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { caseStatusLabel, recoveryLabel, relativeTime, stageLabel } from "@/lib/format";
import { TAB_LABEL, TAB_ORDER, tabAvailability } from "@/lib/caseWorkspace/tabAvailability";
import { cx } from "@/lib/types";
import type { CaseFacts, CaseHeaderVM, TabId } from "@/lib/types";
import { Icon } from "@/components/icons/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SyntheticBadge } from "@/components/ui/SyntheticBadge";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/Region";
import { outcomeMessage } from "@/lib/useOutcome";
import { WorkspaceContext } from "./context";
import { useAnalysisRuns } from "@/features/analysisRuns/AnalysisRunContext";

const p = getProvider();

export function CaseWorkspace() {
  const { caseId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const { getEntry } = useAnalysisRuns();
  const completedRun = getEntry(caseId).run;
  const refreshedRun = useRef<string | null>(null);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (completedRun?.status !== "completed" || !completedRun.planId || refreshedRun.current === completedRun.runId) return;
    refreshedRun.current = completedRun.runId;
    refresh();
  }, [completedRun?.status, completedRun?.planId, completedRun?.runId, refresh]);

  // Presenter-only reveal control (fixture mode, Infostealer scenario).
  const canReveal = typeof p.revealNextEvidenceBatch === "function";
  const [revealBusy, setRevealBusy] = useState(false);
  const [revealExhausted, setRevealExhausted] = useState(false);
  const onReveal = useCallback(async () => {
    if (!p.revealNextEvidenceBatch) return;
    setRevealBusy(true);
    const res = await p.revealNextEvidenceBatch(caseId);
    setRevealBusy(false);
    if (res.kind === "ok" && !res.value.data.hasMore) setRevealExhausted(true);
    refresh();
  }, [caseId]);

  const header = useOutcome<CaseHeaderVM>(() => p.getCaseHeader(caseId), [caseId, reloadKey]);
  const facts = useOutcome<CaseFacts>(() => p.getCaseFacts(caseId), [caseId, reloadKey]);

  useDocumentTitle(header.value ? header.value.data.title : "Case");

  const currentTab: TabId = useMemo(() => {
    const seg = location.pathname.split("/").pop() ?? "overview";
    return (TAB_ORDER as string[]).includes(seg) ? (seg as TabId) : "overview";
  }, [location.pathname]);

  if (header.state === "loading" || facts.state === "loading") {
    return <SkeletonRows rows={5} />;
  }
  if (header.state === "error" || !header.value) {
    return <ErrorState message={header.failure ? outcomeMessage(header.failure) : "Could not load case."} onRetry={header.retry} />;
  }
  const h = header.value.data;
  const f: CaseFacts = facts.value?.data ?? {
    evidenceUploaded: false, timelineReconstructed: false, planningRunStarted: false,
    proposalExists: false, actionAwaitingDecision: false, reportEligible: false,
  };
  const statuses = tabAvailability(f);

  return (
    <WorkspaceContext.Provider value={{ caseId, header: h, facts: f, synthetic: p.synthetic, refresh, reloadKey }}>
      <div className="space-y-5">
        {/* Persistent header */}
        <header className="rounded-md border border-border-subtle bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <button onClick={() => navigate("/cases")} className="mb-1 inline-flex items-center gap-1 text-meta text-text-muted hover:text-text-secondary">
                <Icon name="chevronRight" size={18} className="rotate-180" /> Cases
              </button>
              <h1 className="text-xl font-bold text-text-primary">{h.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-text-secondary">
                <span className="mono">Case ID: {h.caseId}</span>
                <button className="rounded border border-border-subtle px-2 py-0.5 hover:text-text-primary" aria-label="Copy case ID"
                  onClick={async () => { try { await navigator.clipboard.writeText(h.caseId); setCopied(true); } catch { setCopied(false); } }}>
                  Copy ID
                </button>
                {copied && <span role="status">Case ID copied</span>}
                <span>State v{f.stateVersion ?? "—"}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge>{caseStatusLabel[h.status]}</StatusBadge>
                {h.severity && <StatusBadge tone={h.severity === "high" || h.severity === "critical" ? "danger" : "warning"}>{h.severity} severity</StatusBadge>}
                {h.stage && <StatusBadge tone="info">{stageLabel[h.stage]}</StatusBadge>}
                {h.recoveryStatus && <StatusBadge>{recoveryLabel[h.recoveryStatus]}</StatusBadge>}
                {h.agentState && <StatusBadge tone="accent"><Icon name="running" size={18} className="mr-1" />{h.agentState}</StatusBadge>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {p.synthetic && <SyntheticBadge />}
              <span className="text-meta text-text-muted">Updated {relativeTime(h.updatedAt)}</span>
              {p.synthetic && canReveal && !revealExhausted && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onReveal}
                  disabled={revealBusy}
                  leadingIcon={<Icon name="reload" size={18} />}
                  title="Presenter control: reveal synthetic evidence; re-analysis remains an explicit analyst action"
                >
                  {revealBusy ? "Revealing…" : "Reveal next evidence (demo)"}
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Underline tabs */}
        <div className="border-b border-border-subtle">
          <div
            role="tablist"
            aria-label="Case sections"
            className="flex gap-1 overflow-x-auto"
          >
            {TAB_ORDER.map((id) => {
              const st = statuses[id];
              const active = currentTab === id;
              const disabled = !st.available;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  aria-disabled={disabled || undefined}
                  tabIndex={disabled ? -1 : 0}
                  title={disabled ? st.reason : undefined}
                  onClick={() => {
                    if (disabled) return;
                    navigate(id === "overview" ? `/cases/${caseId}` : `/cases/${caseId}/${id}`);
                  }}
                  className={cx(
                    "relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors duration-180",
                    disabled
                      ? "cursor-not-allowed text-text-muted/60"
                      : active
                        ? "text-text-primary"
                        : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {TAB_LABEL[id]}
                  {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div>
          <Outlet />
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
