import { useCallback, useEffect, useState } from "react";
import {
  agentRuns,
  attentionCases,
  auditEvents,
  caseStatusBreakdown,
  dashboardSummary,
  pendingApprovals,
  recentlyUpdated,
} from "./mock-data";

/**
 * Dashboard data access. In the MVP this resolves synthetic fixtures after a
 * short delay to exercise the loading state; the shape matches what a FastAPI
 * aggregation endpoint would later return. Nothing here reads Firestore — the
 * UI calls the backend only, and this hook is where that call will live.
 */
export interface DashboardData {
  summary: ReturnType<typeof dashboardSummary>;
  statusBreakdown: ReturnType<typeof caseStatusBreakdown>;
  attention: typeof attentionCases;
  approvals: typeof pendingApprovals;
  runs: typeof agentRuns;
  recent: typeof recentlyUpdated;
  activity: typeof auditEvents;
}

export type LoadState = "loading" | "ready" | "error";

function loadDashboard(signal?: AbortSignal): Promise<DashboardData> {
  // Simulated latency so skeletons are observable; replace with a real
  // fetch("/api/dashboard") once the backend aggregation lands.
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      resolve({
        summary: dashboardSummary(),
        statusBreakdown: caseStatusBreakdown(),
        attention: attentionCases,
        approvals: pendingApprovals,
        runs: agentRuns,
        recent: recentlyUpdated,
        activity: auditEvents,
      });
    }, 450);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

export function useDashboardData() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<DashboardData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    loadDashboard(controller.signal)
      .then((d) => {
        setData(d); // keep previous data on a later error (handled below)
        setState("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  return { state, data, retry };
}

/** Browser online/offline, distinct from a backend request failure. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}