import { useCallback, useEffect, useState } from "react";
import type { Outcome, Sourced } from "./api/provider";

export type LoadState = "loading" | "ready" | "error";

export interface AsyncOutcome<T> {
  state: LoadState;
  value: Sourced<T> | null;
  /** The non-ok outcome, when state === "error". */
  failure: Exclude<Outcome<T>, { kind: "ok" }> | null;
  retry: () => void;
}

/**
 * Load a provider Outcome into render-ready state. Any non-ok outcome
 * (unsupported / http_error / not_implemented / network_error / offline) lands
 * in `failure` with state "error" — the UI decides how to render each honestly.
 */
export function useOutcome<T>(
  load: () => Promise<Outcome<T>>,
  deps: unknown[] = [],
): AsyncOutcome<T> {
  const [state, setState] = useState<LoadState>("loading");
  const [value, setValue] = useState<Sourced<T> | null>(null);
  const [failure, setFailure] = useState<AsyncOutcome<T>["failure"]>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    setState("loading");
    setFailure(null);
    load()
      .then((outcome) => {
        if (!alive) return;
        if (outcome.kind === "ok") {
          setValue(outcome.value);
          setState("ready");
        } else {
          setFailure(outcome);
          setState("error");
        }
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setFailure({ kind: "network_error", detail: e instanceof Error ? e.message : String(e) });
        setState("error");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, ...deps]);

  return { state, value, failure, retry };
}

/** Human-readable message for a non-ok outcome. */
export function outcomeMessage(f: { kind: string; reason?: string; detail?: string; status?: number }): string {
  switch (f.kind) {
    case "unsupported":
      return f.reason ?? "Not available in this mode.";
    case "not_implemented":
      return "This capability is not implemented in the backend yet.";
    case "offline":
      return "You appear to be offline.";
    case "network_error":
      return "Could not reach the backend.";
    case "http_error":
      return f.detail ?? `Request failed (${f.status ?? "error"}).`;
    default:
      return "Something went wrong.";
  }
}