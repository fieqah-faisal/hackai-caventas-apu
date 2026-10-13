# BL-017 — Persist Planner Analysis + Fill Report Findings/ATT&CK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the planner's analysis (incident type, severity, confidence, findings, ATT&CK) into the stored plan and fill the structured report's classification/findings/ATT&CK sections, so the report shows real content instead of `"other"` / `"unknown"` / `[]` and the evaluation's "not yet produced" coverage list empties.

**Architecture:** The analyze step already produces `incident_type/scope/severity/confidence` but they are dropped. Plan: (1) `PlanProposal` gains a validated `analysis` block (`PlanAnalysis` + `ProposedFinding`) — the analyze prompt now also returns `findings` (each citing stored evidence ids) and `attack_techniques` (MITRE IDs); the adapter validates both (evidence ids must exist; IDs must match `T####`/`T####.###`). (2) `planning_service` persists `analysis` into the plan document (no new incident-state versions — state stays evidence-driven). (3) `reporting.py` reads the newest plan's `analysis` to fill `classification` and `findings` and adds a Findings section + ATT&CK line to the PDF; absent analysis keeps today's fallbacks (fake-planner runs).

**Tech Stack:** Python, Pydantic v2, LangGraph planner adapter, ReportLab, pytest (`cd backend && ../.venv/bin/python -m pytest -q`).

## Global Constraints

- Work only on branch `feat/bl-017-analysis-persistence`; never commit to `main`.
- Run tests from `backend/`: `cd backend && ../.venv/bin/python -m pytest -q`. Baseline on this branch: **147 passed**.
- No new dependencies; do not touch incident-state version semantics (`state_manager`), retrieval, or safety validation.
- The report may only contain facts supported by stored records: adapter validation must drop findings with no valid evidence id and malformed ATT&CK ids; **never** invent ids.
- Fallback behavior for absent analysis (FakePlannerAdapter) must stay intact — existing reporting/planning tests must pass unchanged.
- `attack_techniques` is a list of ID strings (frontend DTO `dto.ts:273` is `string[]`); report `findings` rows are `{finding_id, summary, evidence_ids, confidence}`.
- Synthetic data only; no secrets.

---

### Task 1: Analysis fields in the adapter contract + validation + tests

**Files:**
- Modify: `backend/app/schemas/plan.py`
- Modify: `backend/app/ai/langgraph_planner.py`
- Test: `backend/tests/test_planner_adapter.py`

**Interfaces:**
- Consumes: the analyze LLM JSON (`_analysis_messages`), `_collect_evidence_ids(incident)` for validation, existing `_str_list` helper.
- Produces: `ProposedFinding`, `PlanAnalysis`, `PlanProposal.analysis: PlanAnalysis | None`; `generate_plan` attaches a validated analysis on BOTH the sufficient and insufficient paths.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_planner_adapter.py`, append:

```python
def test_analysis_findings_and_techniques_are_captured_and_validated():
    llm = ScriptedLLM(
        [
            _analysis(
                findings=[
                    {
                        "summary": "Installer read the browser credential store.",
                        "evidence_ids": ["EV-1", "EV-999"],
                        "confidence": 0.8,
                    },
                    {"summary": "Unsupported claim.", "evidence_ids": ["EV-999"], "confidence": 0.4},
                ],
                attack_techniques=["T1555.003", "bogus", "T1204.002"],
            ),
            _proposal(),
        ]
    )
    plan = LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), GUIDANCE)

    assert plan.analysis is not None
    assert plan.analysis.incident_type == "infostealer_session_hijack"
    assert plan.analysis.severity == "high"
    assert plan.analysis.confidence == 0.7
    assert [f.summary for f in plan.analysis.findings] == [
        "Installer read the browser credential store."
    ]
    assert plan.analysis.findings[0].evidence_ids == ["EV-1"]
    assert plan.analysis.findings[0].confidence == 0.8
    assert plan.analysis.attack_techniques == ["T1555.003", "T1204.002"]


def test_analysis_is_kept_when_evidence_is_insufficient():
    llm = ScriptedLLM([_analysis(sufficient=False, stage="assessment")])
    plan = LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), GUIDANCE)

    assert plan.actions == []
    assert plan.analysis is not None
    assert plan.analysis.incident_type == "infostealer_session_hijack"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planner_adapter.py -q`
Expected: FAIL — `PlanProposal` has no `analysis` attribute.

- [ ] **Step 3: Add the schemas**

In `backend/app/schemas/plan.py`, insert before `class PlanProposal`:

```python
class ProposedFinding(BaseModel):
    """One analysis finding; summary + the stored evidence ids that support it."""

    summary: str
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = 0.0


class PlanAnalysis(BaseModel):
    """The planner's persisted analysis (BL-017); the report reads this."""

    incident_type: str = ""
    scope: str = ""
    severity: str = ""
    confidence: float = 0.0
    findings: list[ProposedFinding] = Field(default_factory=list)
    attack_techniques: list[str] = Field(default_factory=list)
```

and add to `PlanProposal` (after `missing_evidence`):

```python
    analysis: PlanAnalysis | None = None
```

- [ ] **Step 4: Extend the analyze prompt contract**

In `backend/app/ai/langgraph_planner.py`, in `_analysis_messages`, replace the tail of the system string (currently ending `"...Never invent entity ids or evidence ids. Return ONLY a JSON object with keys: incident_type, scope, severity (low|medium|high|critical), confidence, sufficient, missing_evidence, stage (assessment|preservation|containment|eradication|hardening|restoration)."`) so the string continues after `load_verification_first_skill()` exactly as:

```python
        + "\n\nList concrete findings, each citing the supporting evidence "
        "ids, and map only ATT&CK techniques the evidence directly supports. "
        "Never invent entity ids, evidence ids or ATT&CK technique ids. "
        "Return ONLY a JSON object with keys: incident_type, scope, severity "
        "(low|medium|high|critical), confidence, sufficient, missing_evidence, "
        "stage (assessment|preservation|containment|eradication|hardening|"
        "restoration), findings (list of {\"summary\": <string>, "
        "\"evidence_ids\": [<string>], \"confidence\": 0-1}), "
        "attack_techniques (list of MITRE ATT&CK technique ids, e.g. "
        "T1204.002, that the evidence directly supports)."
```

- [ ] **Step 5: Add validation helpers and attach the analysis in `generate_plan`**

At the top of `langgraph_planner.py` add `import re` (with the stdlib imports); after `_collect_evidence_ids`, add:

```python
ATTACK_TECHNIQUE_ID = re.compile(r"^T\d{4}(\.\d{3})?$")


def _confidence(raw: Any) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.0
    return min(max(value, 0.0), 1.0)


def _validated_findings(raw: Any, evidence_ids: set[str]) -> list[ProposedFinding]:
    if not isinstance(raw, list):
        return []
    findings: list[ProposedFinding] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        summary = str(item.get("summary", "")).strip()
        cited = [e for e in _str_list(item.get("evidence_ids")) if e in evidence_ids]
        if not summary or not cited:
            continue
        findings.append(
            ProposedFinding(
                summary=summary,
                evidence_ids=cited,
                confidence=_confidence(item.get("confidence")),
            )
        )
    return findings


def _validated_techniques(raw: Any) -> list[str]:
    return [t for t in _str_list(raw) if ATTACK_TECHNIQUE_ID.match(t)]
```

(Import `PlanAnalysis, ProposedFinding` from `app.schemas.plan` in the existing import line.)

In `generate_plan`, after `evidence_ids = _collect_evidence_ids(incident)`, build the analysis and pass it to the `PlanProposal`:

```python
        analysis_raw = final.get("analysis") or {}
        analysis = PlanAnalysis(
            incident_type=str(analysis_raw.get("incident_type", "")),
            scope=str(analysis_raw.get("scope", "")),
            severity=str(analysis_raw.get("severity", "")),
            confidence=_confidence(analysis_raw.get("confidence")),
            findings=_validated_findings(analysis_raw.get("findings"), evidence_ids),
            attack_techniques=_validated_techniques(analysis_raw.get("attack_techniques")),
        )
```

and in the `PlanProposal(...)` constructor add `analysis=analysis,`.

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planner_adapter.py -q`
Expected: all pass (previous 20 + 2 new).

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && ../.venv/bin/python -m pytest -q`
Expected: **149 passed** (147 prior + 2 new).

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/plan.py backend/app/ai/langgraph_planner.py backend/tests/test_planner_adapter.py
git commit -m "feat(planner): capture and validate analysis findings and ATT&CK techniques" \
  -m "PlanProposal gains a validated PlanAnalysis (incident type, severity,
confidence, findings with stored evidence ids, ATT&CK technique ids); the
analyze prompt now requests findings and technique mappings, and the adapter
drops findings without valid evidence and malformed technique ids. Present on
both the sufficient and insufficient paths. BL-017."
```

---

### Task 2: Persist `analysis` in the plan document + API test

**Files:**
- Modify: `backend/app/services/planning_service.py`
- Test: `backend/tests/test_planning_api.py`

**Interfaces:**
- Consumes: `PlanProposal.analysis` from Task 1.
- Produces: stored plan documents (and the POST `/runs` response) carry `analysis` when the adapter returned one; absent for the fake adapter.

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_planning_api.py`, extend imports (`from app.schemas.plan import PlanAnalysis, PlanProposal, ProposedAction, ProposedFinding, Stage` as needed) and append:

```python
def test_plan_analysis_is_persisted(client, monkeypatch):
    class AnalysisAdapter:
        def generate_plan(self, incident_state, approved_guidance=None):
            return PlanProposal(
                based_on_state_version=incident_state.version,
                stage=Stage.CONTAINMENT,
                actions=[],
                analysis=PlanAnalysis(
                    incident_type="infostealer_session_hijack",
                    scope="one laptop and the CRM session",
                    severity="high",
                    confidence=0.7,
                    findings=[
                        ProposedFinding(
                            summary="Unsigned installer ran on SALES-LT-07.",
                            evidence_ids=["EV-1"],
                            confidence=0.8,
                        )
                    ],
                    attack_techniques=["T1204.002"],
                ),
            )

    monkeypatch.setattr(ADAPTER_PATH, lambda: AnalysisAdapter())
    case_id = _create_case_with_evidence(client)

    resp = client.post(f"/cases/{case_id}/runs")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["analysis"]["severity"] == "high"
    assert body["analysis"]["attack_techniques"] == ["T1204.002"]
    assert body["analysis"]["findings"][0]["summary"] == "Unsigned installer ran on SALES-LT-07."

    listed = client.get(f"/cases/{case_id}/plans").json()
    assert listed[0]["analysis"]["incident_type"] == "infostealer_session_hijack"
```

Also add one assertion to the existing `test_run_planning_creates_plan_and_persists_actions` (fake adapter): after `assert plan["plan_id"].startswith("PLAN-")` add:

```python
    assert "analysis" not in plan  # the fake adapter produces no analysis
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planning_api.py::test_plan_analysis_is_persisted -q`
Expected: FAIL — response has no `analysis` key.

- [ ] **Step 3: Persist the analysis**

In `backend/app/services/planning_service.py`, in `run_planning`, after the `plan_doc = {...}` construction add:

```python
    if proposal.analysis is not None:
        plan_doc["analysis"] = proposal.analysis.model_dump(mode="json")
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planning_api.py -q`
Expected: all pass, including the new test and the fake-adapter assertion.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && ../.venv/bin/python -m pytest -q`
Expected: **150 passed** (149 + 1 new).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/planning_service.py backend/tests/test_planning_api.py
git commit -m "feat(planner): persist the planner analysis in the plan document" \
  -m "Stored plans and the POST /runs response carry the validated analysis
block; adapters without analysis (fake) keep the previous shape. BL-017."
```

---

### Task 3: Fill report classification/findings/ATT&CK + PDF section + tests

**Files:**
- Modify: `backend/app/services/reporting.py`
- Test: `backend/tests/test_reporting_api.py`

**Interfaces:**
- Consumes: the newest plan's `analysis` (Task 2).
- Produces: report JSON `classification` filled (`incident_type`, `severity`, `severity_reason`, `confidence`, `attack_techniques`), `findings` rows `{finding_id, summary, evidence_ids, confidence}`, PDF gains a Findings section and an ATT&CK line; absent analysis keeps today's fallbacks.

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_reporting_api.py`, extend imports (`from app.schemas.plan import PlanAnalysis, PlanProposal, ProposedFinding, Stage`) and append:

```python
def test_report_fills_classification_findings_and_attack(client, monkeypatch, tmp_path):
    class AnalysisPlanner:
        def generate_plan(self, incident_state, approved_guidance=None):
            return PlanProposal(
                based_on_state_version=incident_state.version,
                stage=Stage.CONTAINMENT,
                actions=[],
                analysis=PlanAnalysis(
                    incident_type="infostealer_session_hijack",
                    scope="one laptop",
                    severity="high",
                    confidence=0.7,
                    findings=[
                        ProposedFinding(
                            summary="Unsigned installer ran on the endpoint.",
                            evidence_ids=["EV-1"],
                            confidence=0.8,
                        )
                    ],
                    attack_techniques=["T1204.002", "T1555.003"],
                ),
            )

    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    monkeypatch.setattr(PLANNER_PATH, lambda: AnalysisPlanner())
    case_id = client.post("/cases", json={"title": "analysis report"}).json()["case_id"]
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", FIXTURE.read_bytes(), "application/json")},
    )
    assert resp.status_code == 200, resp.text
    assert client.post(f"/cases/{case_id}/runs").status_code == 200

    report = client.post(f"/cases/{case_id}/reports").json()

    assert report["classification"]["incident_type"] == "infostealer_session_hijack"
    assert report["classification"]["severity"] == "high"
    assert report["classification"]["confidence"] == 0.7
    assert report["classification"]["attack_techniques"] == ["T1204.002", "T1555.003"]
    assert report["classification"]["severity_reason"] == (
        "Assessed by the planner from stored evidence."
    )
    assert report["findings"][0]["finding_id"] == "FND-01"
    assert report["findings"][0]["summary"] == "Unsigned installer ran on the endpoint."
    assert report["findings"][0]["evidence_ids"] == ["EV-1"]
    assert report["findings"][0]["confidence"] == 0.8
    assert Path(report["pdf_path"]).exists()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_reporting_api.py::test_report_fills_classification_findings_and_attack -q`
Expected: FAIL — `incident_type` is `"other"`.

- [ ] **Step 3: Fill the report from the plan's analysis**

In `backend/app/services/reporting.py`, in `generate_report` after `phase = ...` / `gaps = ...` add:

```python
    analysis = (plan or {}).get("analysis") or {}
```

Replace the `"classification"` block with:

```python
        "classification": {
            "incident_type": analysis.get("incident_type") or "other",
            "status": "suspected",
            "closure_reason": None,
            "severity": analysis.get("severity") or "unknown",
            "severity_reason": (
                "Assessed by the planner from stored evidence."
                if analysis
                else "Not assessed by the prototype."
            ),
            "confidence": float(analysis.get("confidence") or 0.0),
            "current_phase": phase,
            "attack_techniques": list(analysis.get("attack_techniques") or []),
            "confirmed_by_analyst": False,
        },
```

Replace `"findings": []` with:

```python
        "findings": [
            {
                "finding_id": f"FND-{index:02d}",
                "summary": finding.get("summary", ""),
                "evidence_ids": list(finding.get("evidence_ids") or []),
                "confidence": float(finding.get("confidence") or 0.0),
            }
            for index, finding in enumerate(analysis.get("findings") or [], start=1)
        ],
```

In `_render_pdf`, replace the Classification section block with (adds the type/confidence/ATT&CK line and a Findings section):

```python
    classification = report["classification"]
    techniques = classification.get("attack_techniques") or []
    section(
        "Classification",
        [
            f"Phase: {classification['current_phase']} | Status: {classification['status']} "
            f"| Severity: {classification['severity']}",
            f"Type: {classification['incident_type']} | "
            f"Confidence: {classification['confidence']}"
            + (f" | ATT&CK: {', '.join(techniques)}" if techniques else ""),
        ],
    )
    section("Executive summary", [report["executive_summary"]["text"]])
    finding_lines = [
        f"{finding['finding_id']}: {finding['summary']}"
        + (f" (evidence: {', '.join(finding['evidence_ids'])})" if finding["evidence_ids"] else "")
        for finding in report["findings"]
    ]
    section("Findings", finding_lines or ["None recorded"])
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_reporting_api.py -q`
Expected: all pass — the new test plus the existing fake-adapter tests (fallbacks intact: `incident_type` `"other"`, `severity` `"unknown"`, empty findings).

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && ../.venv/bin/python -m pytest -q`
Expected: **151 passed** (150 + 1 new).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/reporting.py backend/tests/test_reporting_api.py
git commit -m "feat(reporting): fill classification, findings and ATT&CK from the plan analysis" \
  -m "The report reads the newest plan's analysis block (BL-017): classification
type/severity/confidence/techniques, findings rows with evidence ids, and a
PDF Findings section. Absent analysis keeps the previous unknown/empty
fallbacks for fake-planner runs."
```

---

### Task 4: Live verification — full run (coordinator)

- [ ] **Step 1:** Full live run: `cd backend && ../.venv/bin/python -m evaluation.run_eval --planner live` (~45-60 min; background + poll).
- [ ] **Step 2:** Acceptance: (a) 12/12 checkpoints / 5/5 scenarios still hold (analysis prompt changed — behavior must not regress; fix loop on any failure); (b) `report.not_produced_yet` shrinks — expect empty; if findings/ATT&CK are absent or malformed in live output, iterate the prompt and rerun.
- [ ] **Step 3:** Save evidence to `.agents/tasks/bl-017-analysis-persistence/full-eval.txt` (logs, before/after coverage, numbers).

### Task 5: Results, notebook, PR (coordinator)

- [ ] **Step 1:** Commit results: `backend/evaluation/results/{live.json,SUMMARY.md}` + evidence files.
- [ ] **Step 2:** Notebook: SessionLog entry; Backlog — remove BL-017, append closed note; Decisions — **DEC-015** (analysis persisted in plan documents, not state versions; validated findings/techniques; report fills from the newest plan; no scoring change); SessionContext + README refresh (report "not yet produced" cleared; BL-017 gone from Next).
- [ ] **Step 3:** Final whole-branch review (subagent) → push → PR to `main` (`feat(reporting): persist planner analysis and fill report findings/ATT&CK (BL-017)`).
