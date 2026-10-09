/**
 * Typed fetch wrapper over the FastAPI backend (proxied at /api).
 *
 * Every call returns a discriminated ApiResult so callers handle each honest
 * outcome explicitly: ok, http_error (incl. 4xx precondition failures the
 * backend uses, e.g. 409 conflict/stale), not_implemented (501), network_error,
 * or offline. It never throws for an expected backend response and never
 * fabricates a success.
 */

export type ApiResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "http_error"; status: number; detail: string }
  | { kind: "not_implemented"; detail: string }
  | { kind: "network_error"; detail: string }
  | { kind: "offline" };

const BASE = "/api";

async function parseDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.detail === "string") return body.detail;
    return JSON.stringify(body);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

async function toResult<T>(res: Response): Promise<ApiResult<T>> {
  if (res.status === 501) {
    return { kind: "not_implemented", detail: await parseDetail(res) };
  }
  if (!res.ok) {
    return { kind: "http_error", status: res.status, detail: await parseDetail(res) };
  }
  // 204 or empty body tolerated
  const text = await res.text();
  const data = (text ? JSON.parse(text) : undefined) as T;
  return { kind: "ok", data };
}

function offlineGuard<T>(): ApiResult<T> | null {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { kind: "offline" };
  }
  return null;
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const off = offlineGuard<T>();
  if (off) return off;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
    });
    return await toResult<T>(res);
  } catch (e) {
    return { kind: "network_error", detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const off = offlineGuard<T>();
  if (off) return off;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: body !== undefined
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return await toResult<T>(res);
  } catch (e) {
    return { kind: "network_error", detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function apiPostForm<T>(
  path: string,
  form: FormData,
): Promise<ApiResult<T>> {
  const off = offlineGuard<T>();
  if (off) return off;
  try {
    const res = await fetch(`${BASE}${path}`, { method: "POST", body: form });
    return await toResult<T>(res);
  } catch (e) {
    return { kind: "network_error", detail: e instanceof Error ? e.message : String(e) };
  }
}