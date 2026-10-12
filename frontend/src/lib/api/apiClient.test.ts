import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiGet } from "./apiClient";
import { RealProvider } from "./realProvider";
import type { AuditEventDTO } from "./dto";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

describe("apiClient result mapping", () => {
  const realFetch = globalThis.fetch;
  const realNavigator = globalThis.navigator;

  beforeEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
    });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    Object.defineProperty(globalThis, "navigator", { value: realNavigator, configurable: true });
    vi.restoreAllMocks();
  });

  it("maps 2xx to ok with data", async () => {
    globalThis.fetch = mockFetch(200, { hello: "world" });
    const r = await apiGet<{ hello: string }>("/x");
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.data.hello).toBe("world");
  });

  it("maps 501 to not_implemented", async () => {
    globalThis.fetch = mockFetch(501, { detail: "not implemented" });
    const r = await apiGet("/x");
    expect(r.kind).toBe("not_implemented");
  });

  it("maps 409 to http_error with detail (precondition failure)", async () => {
    globalThis.fetch = mockFetch(409, { detail: "approval_stale" });
    const r = await apiGet("/x");
    expect(r.kind).toBe("http_error");
    if (r.kind === "http_error") {
      expect(r.status).toBe(409);
      expect(r.detail).toContain("stale");
    }
  });

  it("maps a thrown fetch to network_error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("boom"));
    const r = await apiGet("/x");
    expect(r.kind).toBe("network_error");
  });

  it("returns offline when navigator reports offline", async () => {
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
    globalThis.fetch = mockFetch(200, {});
    const r = await apiGet("/x");
    expect(r.kind).toBe("offline");
  });
});

/**
 * RealProvider contract tests: the mocked bodies use the field names and
 * value shapes the real backend returned in the link API-mode run.
 */
describe("RealProvider contract (real backend bodies)", () => {
  const realFetch = globalThis.fetch;
  const realNavigator = globalThis.navigator;

  beforeEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
    });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    Object.defineProperty(globalThis, "navigator", { value: realNavigator, configurable: true });
    vi.restoreAllMocks();
  });

  it("getAudit maps the real {audit_id, event_type, timestamp, details} rows", async () => {
    const rows: AuditEventDTO[] = [
      {
        audit_id: "AUDIT-000000000001",
        case_id: "CASE-TEST0001",
        event_type: "evidence_uploaded",
        details: { item_count: 6, source_file: "planner_smoke_evidence.json" },
        timestamp: "2026-10-12T02:43:36.721134+00:00",
      },
      {
        audit_id: "AUDIT-000000000002",
        case_id: "CASE-TEST0001",
        event_type: "action_approved",
        details: { action_id: "ACT-000000000001", analyst: "Analyst A", reason: "" },
        timestamp: "2026-10-12T02:45:53.481664+00:00",
      },
    ];
    const fetchMock = mockFetch(200, rows);
    globalThis.fetch = fetchMock;

    const out = await new RealProvider().getAudit("CASE-TEST0001");

    expect(fetchMock).toHaveBeenCalledWith("/api/cases/CASE-TEST0001/audit", expect.anything());
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.source).toBe("real");
    expect(out.value.data).toEqual([
      {
        eventId: "AUDIT-000000000001",
        kind: "evidence_ingested",
        caseId: "CASE-TEST0001",
        summary: "evidence uploaded — source file: planner_smoke_evidence.json, item count: 6",
        at: "2026-10-12T02:43:36.721134+00:00",
        payload: rows[0].details,
      },
      {
        eventId: "AUDIT-000000000002",
        kind: "action_approved",
        caseId: "CASE-TEST0001",
        summary: "action approved — action id: ACT-000000000001, analyst: Analyst A",
        at: "2026-10-12T02:45:53.481664+00:00",
        payload: rows[1].details,
      },
    ]);
  });

  it("getAudit surfaces a backend 404 as http_error, never as fixture data", async () => {
    globalThis.fetch = mockFetch(404, { detail: "case not found: CASE-NOPE" });
    const out = await new RealProvider().getAudit("CASE-NOPE");
    expect(out).toEqual({ kind: "http_error", status: 404, detail: "case not found: CASE-NOPE" });
  });
});