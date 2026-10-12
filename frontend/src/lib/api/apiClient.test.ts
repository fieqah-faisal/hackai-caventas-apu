import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiGet } from "./apiClient";
import { PLAN_ACTIONS_UNAVAILABLE, RealProvider } from "./realProvider";
import type { AuditEventDTO, DecisionResponseDTO, StoredActionDTO } from "./dto";
import { PLANS_IN_DOC_ID_ORDER, reportBody } from "@/test/realBackendBodies";

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

  // ---- Decision contract: backend DecisionRequest enum is approve|reject ----

  function storedAction(status: StoredActionDTO["status"]): StoredActionDTO {
    return {
      action_id: "ACT-000000000001",
      case_id: "CASE-TEST0001",
      plan_id: "PLAN-000000000001",
      version: 1,
      based_on_state_version: 2,
      proposal: {
        tool_name: "isolate_host",
        target_id: "HOST::SYNTH-LT-01",
        evidence_ids: ["EV-000000000001"],
        policy_refs: [],
        rationale: "Host shows suspicious activity in current state.",
        prerequisites: [],
        risk: "Temporary workstation connectivity loss.",
        expected_effect: "Prevent further outbound communication.",
        validation_checks: ["Verify suspicious outbound traffic stops."],
      },
      status,
      decided_by: "Analyst A",
      decided_at: "2026-10-12T02:45:53.479117+00:00",
      reason: "",
      created_at: "2026-10-12T02:45:53.458164Z",
    };
  }

  function decisionResponse(decision: "approved" | "rejected"): DecisionResponseDTO {
    return {
      action: storedAction(decision),
      approval: {
        approval_id: "APV-000000000001",
        case_id: "CASE-TEST0001",
        action_id: "ACT-000000000001",
        action_version: 1,
        state_version: 2,
        decision,
        analyst: "Analyst A",
        reason: "",
        created_at: "2026-10-12T02:45:53.480823Z",
      },
    };
  }

  function sentBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return JSON.parse(String(init.body));
  }

  it("submitDecision sends decision 'approve' (not 'approved') to the decision endpoint", async () => {
    const fetchMock = mockFetch(200, decisionResponse("approved"));
    globalThis.fetch = fetchMock;

    const out = await new RealProvider().submitDecision("CASE-TEST0001", "ACT-000000000001", "approve", "Analyst A", "");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/cases/CASE-TEST0001/actions/ACT-000000000001/decision");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(sentBody(fetchMock)).toEqual({ decision: "approve", analyst: "Analyst A", reason: "" });
    // The returned action status (not the request word) drives the state.
    expect(out).toEqual({ kind: "ok", value: { data: { state: "approved" }, source: "real" } });
  });

  it("submitDecision sends decision 'reject' with the analyst's reason", async () => {
    const fetchMock = mockFetch(200, decisionResponse("rejected"));
    globalThis.fetch = fetchMock;

    const out = await new RealProvider().submitDecision("CASE-TEST0001", "ACT-000000000001", "reject", "Analyst A", "Too disruptive");

    expect(sentBody(fetchMock)).toEqual({ decision: "reject", analyst: "Analyst A", reason: "Too disruptive" });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.value.data.state).toBe("superseded");
  });

  it("submitDecision reports a 409 precondition failure, not success", async () => {
    globalThis.fetch = mockFetch(409, { detail: "action ACT-000000000001 is already 'approved' and cannot be decided again" });
    const out = await new RealProvider().submitDecision("CASE-TEST0001", "ACT-000000000001", "approve", "Analyst A", "");
    expect(out.kind).toBe("http_error");
    if (out.kind === "http_error") expect(out.status).toBe(409);
  });

  it("request_more_investigation is unsupported and never reaches the backend", async () => {
    const fetchMock = mockFetch(200, {});
    globalThis.fetch = fetchMock;
    const out = await new RealProvider().submitDecision(
      "CASE-TEST0001", "ACT-000000000001", "request_more_investigation", "Analyst A", "need more",
    );
    expect(out.kind).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---- Plan order: GET /plans comes back in Firestore document-ID order ----

  /** Respond per "METHOD /api/path"; unknown routes are a test failure (404). */
  function routeFetch(routes: Record<string, { status: number; body: unknown }>) {
    return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url}`;
      const hit = routes[key] ?? { status: 404, body: { detail: `unrouted ${key}` } };
      return {
        ok: hit.status >= 200 && hit.status < 300,
        status: hit.status,
        statusText: `HTTP ${hit.status}`,
        json: async () => hit.body,
        text: async () => JSON.stringify(hit.body),
      } as unknown as Response;
    });
  }

  it("getPlans numbers versions by created_at, not by the backend list order", async () => {
    globalThis.fetch = mockFetch(200, PLANS_IN_DOC_ID_ORDER);
    const out = await new RealProvider().getPlans("CASE-TEST0001");
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.data.map((p) => [p.version, p.planId, p.stage])).toEqual([
      [1, "PLAN-f10000000001", "assessment"],
      [2, "PLAN-730000000002", "containment"],
      [3, "PLAN-4e0000000003", "eradication"],
    ]);
  });

  it("getPlans marks action detail unavailable (with the real count) and carries no re-plan copy", async () => {
    const withEmpty = [...PLANS_IN_DOC_ID_ORDER, { ...PLANS_IN_DOC_ID_ORDER[0], plan_id: "PLAN-ee0000000004", action_ids: [], created_at: "2026-10-12T02:50:00.000000+00:00" }];
    globalThis.fetch = mockFetch(200, withEmpty);
    const out = await new RealProvider().getPlans("CASE-TEST0001");
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    const [v1, , , v4] = out.value.data;
    expect(v1.actions).toEqual([]);
    expect(v1.actionsUnavailable).toEqual({ count: 1, reason: PLAN_ACTIONS_UNAVAILABLE });
    // A plan with no action IDs really has no actions: nothing is "unavailable".
    expect(v4.planId).toBe("PLAN-ee0000000004");
    expect(v4.actionsUnavailable).toBeUndefined();
    for (const p of out.value.data) expect(p.replanExplanation).toBeUndefined();
  });

  it("getPlanRefs uses the same created_at ordinals", async () => {
    globalThis.fetch = mockFetch(200, PLANS_IN_DOC_ID_ORDER);
    const out = await new RealProvider().getPlanRefs("CASE-TEST0001");
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.data.map((r) => [r.version, r.planId])).toEqual([
      [1, "PLAN-f10000000001"],
      [2, "PLAN-730000000002"],
      [3, "PLAN-4e0000000003"],
    ]);
  });

  it("getCaseHeader takes the stage from the newest plan", async () => {
    globalThis.fetch = routeFetch({
      "GET /api/cases/CASE-TEST0001": {
        status: 200,
        body: {
          case_id: "CASE-TEST0001",
          title: "Synthetic login anomaly",
          description: "",
          status: "investigating",
          current_state_version: 2,
          created_at: "2026-10-12T02:43:36.585974Z",
          updated_at: "2026-10-12T10:43:36.733154+08:00",
        },
      },
      "GET /api/cases/CASE-TEST0001/state": { status: 404, body: { detail: "no incident state" } },
      "GET /api/cases/CASE-TEST0001/plans": { status: 200, body: PLANS_IN_DOC_ID_ORDER },
    });
    const out = await new RealProvider().getCaseHeader("CASE-TEST0001");
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.data.stage).toBe("eradication");
    expect(out.value.data.agentState).toBe("Plan v3 ready");
  });

  // ---- Report: POST /reports only on an explicit generate ----

  it("getReport never calls the backend and is null before any generation", async () => {
    const fetchMock = mockFetch(200, reportBody("RPT-000000000001"));
    globalThis.fetch = fetchMock;
    const out = await new RealProvider().getReport("CASE-TEST0001");
    expect(out).toEqual({ kind: "ok", value: { data: null, source: "real" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("generateReport POSTs once; getReport then returns that report from memory", async () => {
    const fetchMock = mockFetch(200, reportBody("RPT-000000000001"));
    globalThis.fetch = fetchMock;
    const provider = new RealProvider();

    const gen = await provider.generateReport("CASE-TEST0001");
    expect(gen.kind).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/cases/CASE-TEST0001/reports");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");

    const again = await provider.getReport("CASE-TEST0001");
    expect(fetchMock).toHaveBeenCalledTimes(1); // no second POST
    expect(again.kind).toBe("ok");
    if (again.kind === "ok") expect(again.value.data?.reportId).toBe("RPT-000000000001");
    // Cached per case only.
    const other = await provider.getReport("CASE-OTHER");
    if (other.kind === "ok") expect(other.value.data).toBeNull();
  });

  it("a failed generation is reported as an error and nothing is cached", async () => {
    globalThis.fetch = mockFetch(500, { detail: "Internal Server Error" });
    const provider = new RealProvider();
    const gen = await provider.generateReport("CASE-TEST0001");
    expect(gen).toEqual({ kind: "http_error", status: 500, detail: "Internal Server Error" });
    const after = await provider.getReport("CASE-TEST0001");
    expect(after).toEqual({ kind: "ok", value: { data: null, source: "real" } });
  });

  it("the session report cache never touches localStorage", async () => {
    globalThis.fetch = mockFetch(200, reportBody("RPT-000000000001"));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const provider = new RealProvider();
    await provider.generateReport("CASE-TEST0001");
    await provider.getReport("CASE-TEST0001");
    expect(setItem).not.toHaveBeenCalled();
  });
});