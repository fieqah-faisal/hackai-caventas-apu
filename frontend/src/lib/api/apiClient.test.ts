import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiGet } from "./apiClient";
import { PLAN_ACTIONS_UNAVAILABLE, RealProvider } from "./realProvider";
import type { AuditEventDTO, DecisionResponseDTO, StoredActionDTO } from "./dto";
import {
  ACTION_RESULTS,
  CASE_AT_STATE_3,
  EVIDENCE_IN_DOC_ID_ORDER,
  PLANS_IN_DOC_ID_ORDER,
  STORED_ACTIONS,
  reportBody,
} from "@/test/realBackendBodies";

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

  it("getCases maps persisted cases with stages from their latest plans", async () => {
    const older = { ...CASE_AT_STATE_3, case_id: "CASE-OLDER", title: "Older case", updated_at: "2026-10-11T02:00:00Z" };
    globalThis.fetch = routeFetch({
      "GET /api/cases": { status: 200, body: [CASE_AT_STATE_3, older] },
      "GET /api/cases/CASE-TEST0001/plans": { status: 200, body: PLANS_IN_DOC_ID_ORDER },
      "GET /api/cases/CASE-OLDER/plans": { status: 200, body: [] },
    });

    const out = await new RealProvider().getCases();

    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.data.map((item) => [item.caseId, item.stage, item.stateVersion])).toEqual([
      ["CASE-TEST0001", "eradication", 3],
      ["CASE-OLDER", null, 3],
    ]);
  });

  it("case activity is derived from the persisted case list", async () => {
    const closed = { ...CASE_AT_STATE_3, case_id: "CASE-CLOSED", status: "closed" as const };
    const fetchMock = routeFetch({
      "GET /api/cases": { status: 200, body: [CASE_AT_STATE_3, closed] },
    });
    globalThis.fetch = fetchMock;

    const out = await new RealProvider().getCaseActivity();

    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.data.openCases).toBe(1);
    expect(out.value.data.attentionCases).toBe(1);
    expect(out.value.data.buckets).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("getPlans numbers versions by created_at, not by the backend list order", async () => {
    globalThis.fetch = routeFetch({
      "GET /api/cases/CASE-TEST0001/plans": { status: 200, body: PLANS_IN_DOC_ID_ORDER },
      "GET /api/cases/CASE-TEST0001/actions": { status: 200, body: STORED_ACTIONS },
      "GET /api/cases/CASE-TEST0001/state": { status: 404, body: { detail: "no incident state" } },
    });
    const out = await new RealProvider().getPlans("CASE-TEST0001");
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.data.map((p) => [p.version, p.planId, p.stage])).toEqual([
      [1, "PLAN-f10000000001", "assessment"],
      [2, "PLAN-730000000002", "containment"],
      [3, "PLAN-4e0000000003", "eradication"],
    ]);
  });

  it("getPlans resolves stored actions and marks only missing references unavailable", async () => {
    const withEmpty = [...PLANS_IN_DOC_ID_ORDER, { ...PLANS_IN_DOC_ID_ORDER[0], plan_id: "PLAN-ee0000000004", action_ids: [], created_at: "2026-10-12T02:50:00.000000+00:00" }];
    globalThis.fetch = routeFetch({
      "GET /api/cases/CASE-TEST0001/plans": { status: 200, body: withEmpty },
      "GET /api/cases/CASE-TEST0001/actions": { status: 200, body: STORED_ACTIONS },
      "GET /api/cases/CASE-TEST0001/state": { status: 404, body: { detail: "no incident state" } },
    });
    const out = await new RealProvider().getPlans("CASE-TEST0001");
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    const [v1, , , v4] = out.value.data;
    expect(v1.actions.map((action) => action.actionId)).toEqual(["ACT-000000000001"]);
    expect(v1.actionsUnavailable).toBeUndefined();
    expect(v4.planId).toBe("PLAN-ee0000000004");
    expect(v4.actionsUnavailable).toBeUndefined();
    for (const p of out.value.data) expect(p.replanExplanation).toBeUndefined();
  });

  it("getPlans reports an unresolved stored action reference without hiding resolved actions", async () => {
    const plans = [{ ...PLANS_IN_DOC_ID_ORDER[0], action_ids: ["ACT-000000000003", "ACT-MISSING"] }];
    globalThis.fetch = routeFetch({
      "GET /api/cases/CASE-TEST0001/plans": { status: 200, body: plans },
      "GET /api/cases/CASE-TEST0001/actions": { status: 200, body: STORED_ACTIONS },
      "GET /api/cases/CASE-TEST0001/state": { status: 404, body: { detail: "no incident state" } },
    });
    const out = await new RealProvider().getPlans("CASE-TEST0001");
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.data[0].actions.map((action) => action.actionId)).toEqual(["ACT-000000000003"]);
    expect(out.value.data[0].actionsUnavailable).toEqual({ count: 1, reason: PLAN_ACTIONS_UNAVAILABLE });
  });

  it("getEvidence returns upload order with event_type titles, whatever the backend list order", async () => {
    globalThis.fetch = mockFetch(200, EVIDENCE_IN_DOC_ID_ORDER);
    const out = await new RealProvider().getEvidence("CASE-TEST0001");
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.source).toBe("real");
    expect(out.value.data.map((e) => [e.evidenceId, e.title])).toEqual([
      ["EV-d8000000000d", "login"],
      ["EV-23000000000b", "login_failed"],
      ["EV-7b000000000c", "dns_query"],
      ["EV-04000000000a", "process_start"],
    ]);
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

  // ---- Approvals queue + results: read-only GET /actions, /action-results (BL-027) ----

  const QUEUE_ROUTES = {
    "GET /api/cases/CASE-TEST0001": { status: 200, body: CASE_AT_STATE_3 },
    "GET /api/cases/CASE-TEST0001/actions": { status: 200, body: STORED_ACTIONS },
    "GET /api/cases/CASE-TEST0001/plans": { status: 200, body: PLANS_IN_DOC_ID_ORDER },
  };

  it("getApprovals lists awaiting and approved actions from GET /actions, with plan stage and stale pre-warning", async () => {
    const fetchMock = routeFetch(QUEUE_ROUTES);
    globalThis.fetch = fetchMock;

    const out = await new RealProvider().getApprovals("CASE-TEST0001");

    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.value.source).toBe("real");
    // Rejected (…2) and executed (…3, "failed") actions have left the queue.
    expect(out.value.data.map((a) => [a.actionId, a.state, a.stage, a.stalePrewarn])).toEqual([
      ["ACT-000000000001", "proposed", "assessment", true], // bound to v2; case is at v3
      ["ACT-000000000004", "approved", "eradication", false],
    ]);
    expect(out.value.data[0]).toMatchObject({
      caseId: "CASE-TEST0001",
      caseTitle: "Synthetic login anomaly",
      tool: "isolate_host",
      target: "HOST::SYNTH-LT-01",
      actionVersion: 1,
      basedOnStateVersion: 2,
      supportingEvidence: ["EV-04000000000a", "EV-7b000000000c"],
      policyRef: null,
    });
    // Reads only: nothing is decided or executed by loading the queue.
    for (const [, init] of fetchMock.mock.calls) expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
  });

  it("getApprovals returns an empty queue without reading plans when nothing awaits a decision", async () => {
    const fetchMock = routeFetch({
      ...QUEUE_ROUTES,
      "GET /api/cases/CASE-TEST0001/actions": { status: 200, body: STORED_ACTIONS.filter((a) => a.status === "rejected") },
    });
    globalThis.fetch = fetchMock;
    const out = await new RealProvider().getApprovals("CASE-TEST0001");
    expect(out).toEqual({ kind: "ok", value: { data: [], source: "real" } });
    expect(fetchMock.mock.calls.map((c) => c[0])).not.toContain("/api/cases/CASE-TEST0001/plans");
  });

  it("getApprovals surfaces a failed actions read as http_error, never fixture data", async () => {
    globalThis.fetch = routeFetch({
      ...QUEUE_ROUTES,
      "GET /api/cases/CASE-TEST0001/actions": { status: 404, body: { detail: "Not Found" } },
    });
    const out = await new RealProvider().getApprovals("CASE-TEST0001");
    expect(out).toEqual({ kind: "http_error", status: 404, detail: "Not Found" });
  });

  it("getApprovals refuses to guess a stage when an action's plan is missing", async () => {
    globalThis.fetch = routeFetch({
      ...QUEUE_ROUTES,
      "GET /api/cases/CASE-TEST0001/plans": { status: 200, body: PLANS_IN_DOC_ID_ORDER.slice(0, 1) },
    });
    const out = await new RealProvider().getApprovals("CASE-TEST0001");
    expect(out.kind).toBe("unsupported");
    if (out.kind === "unsupported") expect(out.reason).toContain("PLAN-f10000000001");
  });

  it("getExecutionResults reads GET /action-results and keeps execution and validation separate", async () => {
    const fetchMock = mockFetch(200, ACTION_RESULTS);
    globalThis.fetch = fetchMock;
    const out = await new RealProvider().getExecutionResults("CASE-TEST0001");
    expect(fetchMock).toHaveBeenCalledWith("/api/cases/CASE-TEST0001/action-results", expect.anything());
    expect((fetchMock.mock.calls[0][1] as RequestInit).method ?? "GET").toBe("GET");
    expect(out).toEqual({
      kind: "ok",
      value: {
        source: "real",
        data: [
          {
            executionId: "EXEC-000000000001",
            actionId: "ACT-000000000003",
            tool: "isolate_host",
            target: "HOST::SYNTH-LT-01",
            executionStatus: "completed",
            validationStatus: "ineffective",
            observedEffect: "Suspicious outbound communication continued.",
            resultSource: "simulator",
            createdAt: "2026-10-12T02:45:53.499034+00:00",
          },
        ],
      },
    });
  });

  it("getExecutionResults surfaces a backend 404 as http_error", async () => {
    globalThis.fetch = mockFetch(404, { detail: "case not found: CASE-NOPE" });
    const out = await new RealProvider().getExecutionResults("CASE-NOPE");
    expect(out).toEqual({ kind: "http_error", status: 404, detail: "case not found: CASE-NOPE" });
  });

  // ---- Report: POST /reports only on an explicit generate ----

  it("getReport reads the persisted latest report and treats 404 as empty", async () => {
    const fetchMock = mockFetch(404, { detail: "no reports found" });
    globalThis.fetch = fetchMock;
    const out = await new RealProvider().getReport("CASE-TEST0001");
    expect(out).toEqual({ kind: "ok", value: { data: null, source: "real" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/cases/CASE-TEST0001/reports/latest", expect.anything());
  });

  it("generateReport POSTs once; getReport then reads the persisted report", async () => {
    const fetchMock = routeFetch({
      "POST /api/cases/CASE-TEST0001/reports": { status: 200, body: reportBody("RPT-000000000001") },
      "GET /api/cases/CASE-TEST0001/reports/latest": { status: 200, body: reportBody("RPT-000000000001") },
      "GET /api/cases/CASE-OTHER/reports/latest": { status: 404, body: { detail: "no reports found" } },
    });
    globalThis.fetch = fetchMock;
    const provider = new RealProvider();

    const gen = await provider.generateReport("CASE-TEST0001");
    expect(gen.kind).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/cases/CASE-TEST0001/reports");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");

    const again = await provider.getReport("CASE-TEST0001");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(again.kind).toBe("ok");
    if (again.kind === "ok") expect(again.value.data?.reportId).toBe("RPT-000000000001");
    // Cached per case only.
    const other = await provider.getReport("CASE-OTHER");
    if (other.kind === "ok") expect(other.value.data).toBeNull();
  });

  it("a failed generation is reported as an error and the persisted read stays empty", async () => {
    globalThis.fetch = routeFetch({
      "POST /api/cases/CASE-TEST0001/reports": { status: 500, body: { detail: "Internal Server Error" } },
      "GET /api/cases/CASE-TEST0001/reports/latest": { status: 404, body: { detail: "no reports found" } },
    });
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

  it("reads immutable state/history endpoints without fixture fallback", async () => {
    const fetchMock = routeFetch({
      "GET /api/cases/CASE-TEST0001/states": { status: 200, body: [{ version: 1, parent_version: null, created_from: "evidence_upload", change_reason: null, created_at: null, entity_count: 1, relationship_count: 0, timeline_count: 1 }] },
      "GET /api/cases/CASE-TEST0001/states/1": { status: 404, body: { detail: "version not found" } },
    });
    globalThis.fetch = fetchMock;
    const provider = new RealProvider();
    const history = await provider.getStateHistory("CASE-TEST0001");
    expect(history.kind).toBe("ok");
    if (history.kind === "ok") expect(history.value.data[0].entityCount).toBe(1);
    expect(await provider.getStateVersion("CASE-TEST0001", 1)).toEqual({ kind: "http_error", status: 404, detail: "version not found" });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/cases/CASE-TEST0001/states", "/api/cases/CASE-TEST0001/states/1"]);
  });

  it("reads the typed timeline endpoint without fixture fallback", async () => {
    const fetchMock = mockFetch(200, {
      case_id: "CASE-TEST0001",
      state_version: 3,
      events: [{
        event_id: "TL-000000000001",
        occurred_at: "2026-10-04T21:38:00+08:00",
        event_type: "dns_query",
        source: "dns_log",
        actor: "HOST::SYNTH-LT-01",
        subject: "DOMAIN::suspicious.example",
        action: "queried",
        result: "resolved",
        summary: "Synthetic host queried a synthetic domain.",
        details: { query: "suspicious.example" },
        evidence_ids: ["EV-7b000000000c"],
        entity_ids: ["HOST::SYNTH-LT-01", "DOMAIN::suspicious.example"],
        relationship_status: "observed",
        relevance: "attack",
        severity: "medium",
        raw_description: "dns_query host=SYNTH-LT-01 query=suspicious.example",
      }],
    });
    globalThis.fetch = fetchMock;

    const result = await new RealProvider().getTimeline("CASE-TEST0001");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/cases/CASE-TEST0001/timeline", expect.anything());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.value).toMatchObject({
      source: "real",
      data: [{
        id: "TL-000000000001",
        eventType: "dns_query",
        source: "dns_log",
        relationshipStatus: "observed",
        evidenceIds: ["EV-7b000000000c"],
        relevance: "attack",
      }],
    });
  });

  it("recovers the persisted active run after a duplicate create conflict", async () => {
    const run = { run_id: "RUN-EXISTING", case_id: "CASE-TEST0001", status: "running", stage: "running_planner",
      message: "Planner is processing the incident state.", based_on_state_version: 2, plan_id: null,
      created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:01Z", completed_at: null, error: null };
    const fetchMock = routeFetch({
      "POST /api/cases/CASE-TEST0001/analysis-runs": { status: 409, body: { detail: { message: "analysis already in progress", run_id: run.run_id } } },
      "GET /api/cases/CASE-TEST0001/analysis-runs/active": { status: 200, body: run },
    });
    globalThis.fetch = fetchMock;
    const result = await new RealProvider().createAnalysisRun("CASE-TEST0001");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.value.data.runId).toBe("RUN-EXISTING");
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/cases/CASE-TEST0001/analysis-runs",
      "/api/cases/CASE-TEST0001/analysis-runs/active",
    ]);
  });
});
