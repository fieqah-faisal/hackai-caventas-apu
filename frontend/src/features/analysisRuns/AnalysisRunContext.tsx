import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getProvider } from "@/lib/api";
import { outcomeMessage } from "@/lib/useOutcome";
import type { AnalysisRunVM } from "@/lib/types";

const provider = getProvider();
const WATCHED_CASES_KEY = "caventas.analysis-runs.watched-cases";

interface RunEntry {
  run: AnalysisRunVM | null;
  pending: boolean;
  error: string | null;
}

interface AnalysisRunContextValue {
  getEntry: (caseId: string) => RunEntry;
  start: (caseId: string) => Promise<AnalysisRunVM | null>;
  open: (caseId: string) => void;
}

const EMPTY_ENTRY: RunEntry = { run: null, pending: false, error: null };
const AnalysisRunContext = createContext<AnalysisRunContextValue | null>(null);

function isActive(run: AnalysisRunVM | null): boolean {
  return run?.status === "queued" || run?.status === "running";
}

function readWatchedCases(): string[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(WATCHED_CASES_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rememberCase(caseId: string) {
  try {
    sessionStorage.setItem(WATCHED_CASES_KEY, JSON.stringify([...new Set([...readWatchedCases(), caseId])]));
  } catch {
    // Storage can be disabled; route-based backend discovery still works.
  }
}

export function AnalysisRunProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [entries, setEntries] = useState<Record<string, RunEntry>>({});
  const [dialogCaseId, setDialogCaseId] = useState<string | null>(null);
  const [watchedCases] = useState(readWatchedCases);
  const starting = useRef(new Set<string>());
  const routeMatch = /^\/cases\/([^/]+)/.exec(location.pathname);
  const routeCaseId = routeMatch?.[1] !== "new" ? routeMatch?.[1] ?? null : null;

  useEffect(() => {
    const caseIds = [...new Set([...watchedCases, ...(routeCaseId ? [routeCaseId] : [])])];
    if (!caseIds.length) return;
    if (routeCaseId) rememberCase(routeCaseId);
    let alive = true;
    for (const caseId of caseIds) {
      void provider.getActiveAnalysisRun(caseId).then((result) => {
        if (!alive || result.kind !== "ok" || !result.value.data) return;
        setEntries((current) => ({
          ...current,
          [caseId]: { run: result.value.data, pending: false, error: null },
        }));
        setDialogCaseId((current) => current ?? caseId);
      });
    }
    return () => { alive = false; };
  }, [routeCaseId, watchedCases]);

  const activeRuns = Object.values(entries).flatMap((entry): AnalysisRunVM[] =>
    entry.run && isActive(entry.run) ? [entry.run] : []);
  const activeSignature = activeRuns.map((run) => `${run.caseId}:${run.runId}`).sort().join("|");

  useEffect(() => {
    if (!activeSignature) return;
    let alive = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const poll = async (caseId: string, runId: string) => {
      const result = await provider.getAnalysisRun(caseId, runId);
      if (!alive) return;
      if (result.kind !== "ok") {
        setEntries((current) => ({
          ...current,
          [caseId]: { ...(current[caseId] ?? EMPTY_ENTRY), pending: false, error: outcomeMessage(result) },
        }));
        return;
      }
      const next = result.value.data;
      setEntries((current) => ({ ...current, [caseId]: { run: next, pending: false, error: next.error } }));
      if (isActive(next)) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          void poll(caseId, runId);
        }, 1500);
        timers.add(timer);
      }
    };

    for (const run of activeRuns) void poll(run.caseId, run.runId);
    return () => {
      alive = false;
      for (const timer of timers) clearTimeout(timer);
    };
  }, [activeSignature]);

  async function start(caseId: string): Promise<AnalysisRunVM | null> {
    if (starting.current.has(caseId) || isActive(entries[caseId]?.run ?? null)) {
      setDialogCaseId(caseId);
      return entries[caseId]?.run ?? null;
    }
    rememberCase(caseId);
    starting.current.add(caseId);
    setEntries((current) => ({
      ...current,
      [caseId]: { ...(current[caseId] ?? EMPTY_ENTRY), pending: true, error: null },
    }));
    const result = await provider.createAnalysisRun(caseId);
    starting.current.delete(caseId);
    if (result.kind !== "ok") {
      setEntries((current) => ({
        ...current,
        [caseId]: { ...(current[caseId] ?? EMPTY_ENTRY), pending: false, error: outcomeMessage(result) },
      }));
      return null;
    }
    setEntries((current) => ({
      ...current,
      [caseId]: { run: result.value.data, pending: false, error: result.value.data.error },
    }));
    setDialogCaseId(caseId);
    return result.value.data;
  }

  const getEntry = (caseId: string) => entries[caseId] ?? EMPTY_ENTRY;
  const open = (caseId: string) => setDialogCaseId(caseId);
  const displayEntries = Object.values(entries).filter((entry) => entry.run);
  const indicatorEntry = displayEntries.find((entry) => isActive(entry.run)) ?? displayEntries[displayEntries.length - 1];
  const dialogRun = dialogCaseId ? entries[dialogCaseId]?.run ?? null : null;

  return (
    <AnalysisRunContext.Provider value={{ getEntry, start, open }}>
      {children}
      {indicatorEntry?.run && (
        <button
          type="button"
          className="analysis-run-indicator"
          onClick={() => setDialogCaseId(indicatorEntry.run!.caseId)}
          aria-label={`Open analysis run for ${indicatorEntry.run.caseId}`}
        >
          <span className={isActive(indicatorEntry.run) ? "analysis-run-pulse" : ""} aria-hidden />
          <span>
            <strong>{isActive(indicatorEntry.run) ? "Analysis running" : indicatorEntry.run.status === "completed" ? "Analysis ready" : "Analysis failed"}</strong>
            <small>{indicatorEntry.run.caseId} · {indicatorEntry.run.stage.replace(/_/g, " ")}</small>
          </span>
        </button>
      )}
      {dialogRun && dialogCaseId && (
        <AnalysisRunDialog run={dialogRun} error={entries[dialogCaseId]?.error ?? null} onMinimise={() => setDialogCaseId(null)} />
      )}
    </AnalysisRunContext.Provider>
  );
}

function AnalysisRunDialog({ run, error, onMinimise }: {
  run: AnalysisRunVM;
  error: string | null;
  onMinimise: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - Date.parse(run.createdAt)) / 1000)));

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onMinimise(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMinimise]);

  useEffect(() => {
    if (!isActive(run)) return;
    const timer = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(run.createdAt)) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [run.runId, run.status, run.createdAt]);

  return (
    <div className="analysis-run-backdrop" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="analysis-run-title" tabIndex={-1} className="analysis-run-dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mono text-eyebrow uppercase text-accent">Persisted agent run</p>
            <h2 id="analysis-run-title" className="mt-1 text-lg font-bold text-text-primary">Caventas analysis agent</h2>
          </div>
          <button type="button" onClick={onMinimise} className="rounded border border-border-subtle px-3 py-1 text-sm text-text-secondary hover:text-text-primary">
            Minimise
          </button>
        </div>
        <div className="analysis-robot" aria-hidden="true">
          <span className="analysis-robot-antenna" />
          <div className="analysis-robot-head">
            <span className="analysis-robot-eye" /><span className="analysis-robot-eye" />
            <span className="analysis-robot-mouth" />
          </div>
        </div>
        <p aria-live="polite" role="status" className="mt-4 text-center text-base text-text-primary">
          {run.stage.replace(/_/g, " ")}: {run.message}
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded border border-border-subtle bg-canvas p-3 text-sm">
          <dt className="text-text-muted">Case</dt><dd className="mono break-all text-text-secondary">{run.caseId}</dd>
          <dt className="text-text-muted">Run</dt><dd className="mono break-all text-text-secondary">{run.runId}</dd>
          <dt className="text-text-muted">State</dt><dd className="text-text-secondary">v{run.basedOnStateVersion}</dd>
          <dt className="text-text-muted">Elapsed</dt><dd className="tnum text-text-secondary">{elapsed}s</dd>
          {run.planId && <><dt className="text-text-muted">Plan</dt><dd className="mono break-all text-accent">{run.planId}</dd></>}
        </dl>
        {(error || run.error) && <p role="alert" className="mt-3 text-sm text-status-danger">{error ?? run.error}</p>}
      </div>
    </div>
  );
}

export function useAnalysisRuns(): AnalysisRunContextValue {
  const context = useContext(AnalysisRunContext);
  if (!context) throw new Error("useAnalysisRuns must be used within AnalysisRunProvider");
  return context;
}
