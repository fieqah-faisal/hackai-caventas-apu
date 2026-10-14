# BL-041 — incident_type Schema Enum + v1.3 Doc Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit the planner's `incident_type` to the report-schema v1.3 enum (`infostealer_session_hijack | phishing_account_takeover | not_an_incident | other`) in both the analyze prompt and the adapter, and fix the two doc bugs found in the v1.3 PR.

**Architecture:** The analyze prompt requests the enum with a one-line meaning per value; the adapter coerces the model's answer (`strip().lower()`, exact match) and falls back to `other` for anything non-conforming — the report schema then always holds a valid value. Docs: `docs/report-schema/README.md` says report `status` "stays `final`" but the code writes `draft`; `SessionContext.md` has the v1.3 bullet spliced mid-sentence. Acceptance: scoped sc02+sc03 live runs show enum values (`phishing_account_takeover`, `not_an_incident`) with gates holding, then a full run for the record.

**Tech Stack:** Python, LangGraph planner adapter, pytest (`cd backend && ../.venv/bin/python -m pytest -q`), live OpenCode Go API.

## Global Constraints

- Work only on branch `feat/bl-041-incident-type-enum`; never commit to `main`.
- Run tests from `backend/`: `cd backend && ../.venv/bin/python -m pytest -q`. Baseline on this branch: **212 passed**.
- No new dependencies; do not touch retrieval, reporting, policy, or state code.
- The four enum values are the schema contract (`docs/report-schema/report_schema_v1.3.json`); non-conforming model output maps to `other` — never invent new values.
- Docs task 2 edits are verbatim rewrites; nothing else in those files changes.

---

### Task 1: Enum in the analyze prompt + adapter normalization + tests

**Files:**
- Modify: `backend/app/ai/langgraph_planner.py`
- Test: `backend/tests/test_planner_adapter.py`

**Interfaces:**
- Consumes: `generate_plan` building `PlanAnalysis` (current `incident_type=str(analysis_raw.get("incident_type", ""))`); `_confidence` helper pattern.
- Produces: `INCIDENT_TYPES` tuple; `_incident_type(raw: Any) -> str`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_planner_adapter.py`:

```python
def test_incident_type_is_limited_to_the_schema_enum():
    llm = ScriptedLLM([_analysis(incident_type="A novel rootkit drama"), _proposal()])
    plan = LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), GUIDANCE)

    assert plan.analysis.incident_type == "other"


def test_incident_type_matches_case_insensitively():
    llm = ScriptedLLM(
        [_analysis(incident_type="Phishing_Account_Takeover"), _proposal()]
    )
    plan = LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), GUIDANCE)

    assert plan.analysis.incident_type == "phishing_account_takeover"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planner_adapter.py -q`
Expected: both new tests FAIL (the raw value passes through today).

- [ ] **Step 3: Add the enum constant and coercion helper**

In `backend/app/ai/langgraph_planner.py`, next to `ATTACK_TECHNIQUE_ID` / `_confidence`:

```python
INCIDENT_TYPES = (
    "infostealer_session_hijack",
    "phishing_account_takeover",
    "not_an_incident",
    "other",
)


def _incident_type(raw: Any) -> str:
    """Coerce the model's incident type to the report-schema v1.3 enum."""
    text = str(raw).strip().lower() if raw is not None else ""
    return text if text in INCIDENT_TYPES else "other"
```

- [ ] **Step 4: Use the helper in `generate_plan`**

Replace

```python
            incident_type=str(analysis_raw.get("incident_type", "")),
```

with

```python
            incident_type=_incident_type(analysis_raw.get("incident_type")),
```

- [ ] **Step 5: Put the enum in the analyze prompt contract**

In `_analysis_messages`, replace the tail from `"entity ids, evidence ids or ATT&CK technique ids. "` onward with:

```python
        "entity ids, evidence ids or ATT&CK technique ids. Classify "
        "incident_type as exactly one of: infostealer_session_hijack "
        "(credential theft or stolen sessions), phishing_account_takeover "
        "(phishing that led to account access), not_an_incident (benign or "
        "planned activity, e.g. an approved change), other. Return ONLY a "
        "JSON object with keys: incident_type (infostealer_session_hijack|"
        "phishing_account_takeover|not_an_incident|other), scope, severity "
        "(low|medium|high|critical), confidence, sufficient, missing_evidence, "
        "stage (assessment|preservation|containment|eradication|hardening|"
        "restoration), findings (list of {\"summary\": <string>, "
        "\"evidence_ids\": [<string>], \"confidence\": 0-1}), "
        "attack_techniques (list of MITRE ATT&CK technique ids, e.g. "
        "T1204.002, that the evidence directly supports)."
```

(The preceding sentence about findings/techniques stays untouched; only the `incident_type` request and keys list change.)

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planner_adapter.py -q`
Expected: all pass (existing `infostealer_session_hijack` assertions untouched + 2 new).

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && ../.venv/bin/python -m pytest -q`
Expected: **214 passed** (212 prior + 2 new).

- [ ] **Step 8: Commit**

```bash
git add backend/app/ai/langgraph_planner.py backend/tests/test_planner_adapter.py
git commit -m "feat(planner): limit incident_type to the report-schema v1.3 enum" \
  -m "The analyze prompt now requests one of infostealer_session_hijack,
phishing_account_takeover, not_an_incident or other, and the adapter coerces
non-conforming model output to 'other' so the report always carries a valid
schema value. BL-041."
```

---

### Task 2: Two v1.3 doc fixes (coordinator — not a subagent task)

- [ ] **Step 1:** In `docs/report-schema/README.md`, replace:

```
And report `status` stays `final`, which is what the evaluation harness checks (`report_not_final_without_sign_off`); the incident state's report-status block calls the same step `finalized`.
```

with:

```
And report `status` stays `draft` while there is no sign-off endpoint; the evaluation harness checks this (`report_not_final_without_sign_off`); the incident state's report-status block calls the same step `finalized`.
```

- [ ] **Step 2:** In `docs/session/SessionContext.md`, repair the spliced bullet — replace:

```
  `backend/app/ai/skills/untrusted_evidence/SKILL.md` with full state
  - Report schema v1.3 (Aida, DEC-017) in `docs/report-schema/`: the
  contract for the report JSON. Code fill-ins: BL-033, BL-040–BL-042.
  descriptions and catalogue target-type validation (BL-020, DEC-016); the
  full live run is 12/12 with all gates holding.
```

with:

```
  `backend/app/ai/skills/untrusted_evidence/SKILL.md` with full state
  descriptions and catalogue target-type validation (BL-020, DEC-016); the
  full live run is 12/12 with all gates holding.
- Report schema v1.3 (Aida, DEC-017) in `docs/report-schema/`: the contract
  for the report JSON. Code fill-ins: BL-033, BL-040–BL-042.
```

- [ ] **Step 3:** Commit both: `docs(report): fix v1.3 status note and SessionContext bullet splice`.

- [ ] **Step 4 (added post-review):** Update the two stale enum-status claims in `docs/report-schema/README.md` (section-3 table cell; the incident-type open question becomes checked) and correct the SessionContext suite line to "214 on this branch (212 on main)"; pin the enum contract with one adapter test. Covered by the final-review fix wave commit.

### Task 3: Live verification + notebook + PR (coordinator)

- [ ] **Step 1: Scoped acceptance run** (the two semantics-interesting scenarios):

```bash
cd backend && ../.venv/bin/python -m evaluation.run_eval --planner live --scenario sc02_phishing_injection sc03_false_alarm
```

Expected: both PASS with gates holding; the generated reports' `classification.incident_type` are schema values (`phishing_account_takeover` for sc02; `not_an_incident` for sc03 is the target, `other` acceptable if the model disagrees — record what appears). Iterate the prompt wording only if a gate fails.

- [ ] **Step 2: Full run for the record** — `--planner live`; expect 12/12 · 5/5 with gates holding; note the mean (may wobble from 93.4).
- [ ] **Step 3:** Save evidence to `.agents/tasks/bl-041-incident-type-enum/full-eval.txt`; refresh README/SUMMARY numbers only if the full-run mean changes; notebook entry (SessionLog; Backlog — remove BL-041 + closed note; SessionContext clause).
- [ ] **Step 4:** Final whole-branch review (subagent) → push → PR to `main`.
