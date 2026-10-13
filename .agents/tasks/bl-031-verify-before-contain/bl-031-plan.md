# BL-031 — Verification-First Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the planner's disruptive over-containment on the two false-alarm checkpoints (isolating FS-01 / acting on `svc_backup` before verifying the signed, scheduled backup) by grounding both planner prompts in verification-first reasoning, with contract tests pinning the directives and a live scoped rerun as acceptance evidence.

**Architecture:** The scenario's gates (`no_forbidden_actions`, `evaluation/scorer.py:174-181`) fail when the plan proposes `isolate_host`/`reimage_host` on `HOST::FS-01` or `disable_account`/`reset_password`/`revoke_sessions` on `ACCOUNT::svc_backup` / `ACCOUNT::ravi.adm` at CP1 (`scenarios/sc03_false_alarm/evaluator_only/scenario.json:271-311`). CP1's preferred stage is `assessment` (acceptable `preservation`) and its gate question is "Was there an approved change for FS-01 last night?" (`scenario.json:327-343`). Fix = sharpen `_analysis_messages` (stage choice + verification questions for planned-operation signals) and `_proposal_messages` (disruptive-action guard on unverified suspicion) in `backend/app/ai/langgraph_planner.py`. The policy-pack alternative was rejected: the pack is versioned/owned (DEC-012) and a stage-phased rule can be filtered out by the BL-037 retrieval, while prompt grounding also steers the analysis-stage choice.

**Prompt form (writing-skills guidance):** the baseline failure is a wrong-shape output (the model produces a confident containment plan where verification is expected), so the fix uses conditional branches keyed to observable predicates (signed binary / administrator-created scheduled task / service or backup account / organization-plausible destination) rather than blanket prohibitions; the user-endpoint containment case is its own conditional, not an exemption clause. Acceptance is behavioral: the live scoped eval (red before = CP1 gates fail; green after = both false-alarm CP1s pass).

**Tech Stack:** Python, LangGraph planner adapter, pytest (`cd backend && ../.venv/bin/python -m pytest -q`), live OpenCode Go API for the scoped acceptance run.

## Global Constraints

- Work only on branch `feat/bl-031-verify-before-contain`; never commit to `main`.
- Run tests from `backend/`: `cd backend && ../.venv/bin/python -m pytest -q`.
- No new dependencies; no changes to `approved_tools` / `assets` / retrieval logic.
- Keep existing safety rules intact: tool allowlist, entity/evidence id validation, stage normalization, `policy_refs` filtering.
- Do not weaken the guard into "never contain": user endpoints with independent evidence of compromise (unsigned execution, credential theft) must remain containable — this protects the currently-passing sc01/sc02 scenarios.
- Synthetic data only; no secrets.
- The two prompt strings below replace the current ones **verbatim**; contract tests pin the exact phrases named in Task 1.

---

### Task 1: Verification-first prompt grounding + contract tests

**Files:**
- Modify: `backend/app/ai/langgraph_planner.py` (the `system = (...)` block in `_analysis_messages` and in `_proposal_messages`)
- Test: `backend/tests/test_planner_adapter.py`

**Interfaces:**
- Consumes: current prompt text at `langgraph_planner.py:136-157` (`_analysis_messages`) and `:160-193` (`_proposal_messages`).
- Produces: no signature changes; `_analysis_messages` / `_proposal_messages` keep `(…)-> list[dict[str, Any]]`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_planner_adapter.py`, extend the import from `app.ai.langgraph_planner` with `_analysis_messages` and `_proposal_messages`, then append:

```python
def test_analysis_prompt_requires_verification_for_planned_operations():
    system = _analysis_messages({"case_id": "CASE-001"})[0]["content"]

    assert "check the verification branch" in system
    assert "the stage is assessment" in system
    assert "change verification" in system


def test_proposal_prompt_guards_disruptive_actions_on_suspicion():
    system = _proposal_messages({}, {}, {}, set(), set())[0]["content"]

    assert "Match actions to the analysis stage and the verification state" in system
    assert "keep the plan non-disruptive" in system
    assert "contained as usual" in system
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planner_adapter.py -q`
Expected: the two new tests FAIL (phrases absent from the current prompts).

- [ ] **Step 3: Replace the `_analysis_messages` system prompt**

In `backend/app/ai/langgraph_planner.py`, replace the `system = (...)` block inside `_analysis_messages` with **exactly**:

```python
    system = (
        "You are an incident-response analysis assistant. Given a versioned "
        "incident state (entities, relationships, timeline, findings) "
        "derived from current evidence, determine the likely incident type, "
        "scope, severity, confidence (0-1), and the recommended IR stage. "
        "\"sufficient\" means: is there enough evidence to recommend an "
        "initial response focus? Indicators of active compromise (malicious "
        "execution, credential access, exfiltration, unauthorized sessions) "
        "warrant an initial plan: set sufficient=true and still list any "
        "remaining gaps in missing_evidence. Set sufficient=false only when "
        "no defensible action can be recommended yet, e.g. events look "
        "ambiguous or benign without corroboration. Before choosing the "
        "stage, check the verification branch: if the main signals are "
        "explainable as planned administration (a signed binary, a scheduled "
        "task created by an administrator, a service or backup account using "
        "a batch logon, or a first-seen but organization-plausible "
        "destination) and no independent compromise indicator is present "
        "(malicious or unsigned execution, credential theft, interactive "
        "logon by a person, known-bad indicators), then the stage is "
        "assessment and missing_evidence asks for change verification (an "
        "approved change or ticket covering the activity) and destination "
        "ownership. If independent compromise indicators are present, "
        "containment is the expected stage. Never invent entity ids or "
        "evidence ids. "
        "Return ONLY a JSON object with keys: incident_type, scope, "
        "severity (low|medium|high|critical), confidence, sufficient, "
        "missing_evidence, stage (assessment|preservation|containment|"
        "eradication|hardening|restoration)."
    )
```

- [ ] **Step 4: Replace the `_proposal_messages` system prompt**

Replace the `system = (...)` block inside `_proposal_messages` with **exactly**:

```python
    system = (
        "You are an incident-response planner. Propose the next response "
        "actions for the analyst to approve. Rules: use ONLY tools from the "
        "approved tool list in the guidance; target_id must be one of the "
        "valid entity ids; evidence_ids must come only from the valid "
        "evidence ids; reference policy rule ids in policy_refs when "
        "relevant. Match actions to the analysis stage and the verification "
        "state. Unverified planned-operation signals (a signed binary, an "
        "administrator-created scheduled task, a backup or service account, "
        "an organization-approved provider destination): keep the plan "
        "non-disruptive: propose preserve_evidence and leave the change "
        "verification to missing_evidence; do not propose isolate_host, "
        "reimage_host, revoke_sessions, reset_password, disable_account or "
        "block_domain against servers, data stores, network devices, service "
        "or administrator accounts, or approved provider domains until the "
        "change is verified. User endpoints with independent evidence of "
        "compromise (unsigned or unknown execution, credential theft) are "
        "contained as usual. Every action needs rationale, risk, "
        "expected_effect and validation_checks. Never invent ids. Return "
        "ONLY a JSON object "
        "with exactly these keys: {\"stage\": <assessment|preservation|"
        "containment|eradication|hardening|restoration>, \"actions\": "
        "[{\"tool_name\": <string>, \"target_id\": <string>, "
        "\"evidence_ids\": [<string>], \"policy_refs\": [<string>], "
        "\"rationale\": <string>, \"prerequisites\": [<string>], "
        "\"risk\": <string>, \"expected_effect\": <string>, "
        "\"validation_checks\": [<string>]}]}."
    )
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planner_adapter.py -q`
Expected: all pass, including the two new tests.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && ../.venv/bin/python -m pytest -q`
Expected: **145 passed** (143 prior + 2 new).

- [ ] **Step 7: Commit**

```bash
git add backend/app/ai/langgraph_planner.py backend/tests/test_planner_adapter.py
git commit -m "feat(planner): verification-first grounding against disruptive over-containment" \
  -m "Both planner prompts now distinguish unverified planned operations (signed
binary, admin-created scheduled task, service/backup account, plausible
destination) from compromise: analysis prefers the assessment stage and asks
change-verification questions; proposals must stay non-disruptive on
unverified suspicion. Contract tests pin the directives. BL-031."
```

---

### Task 2: Live scoped verification, then full rerun (coordinator — not a subagent task)

- [ ] **Step 1: Scoped acceptance run** (both false-alarm scenarios):

```bash
cd backend && ../.venv/bin/python -m evaluation.run_eval --planner live --scenario sc03_false_alarm sc03_false_alarm_ticket_mismatch
```

Expected: both scenarios PASS (CP1 no longer fails `no_forbidden_actions`; stage assessment/preservation).
- If a CP1 still fails: enter the fix loop — resume the Task 1 implementer with the gate detail, adjust the prompt, rerun this command. Do not proceed to Step 2 until both scenarios pass or the loop caps.

- [ ] **Step 2: Full acceptance run** (all five scenarios; final numbers):

```bash
cd backend && ../.venv/bin/python -m evaluation.run_eval --planner live
```

Expected: no `no_forbidden_actions` failures anywhere; record the exact totals. If sc01/sc02 regress (new failures), treat as a fix-loop finding against Task 1's guard wording.

- [ ] **Step 3: Save raw evidence** to `.agents/tasks/bl-031-verify-before-contain/scoped-eval.txt` and `full-eval.txt` (commands, stderr lines, before/after table vs the BL-038 run 10/12 · 3/5 · 90.4).

### Task 3: Results, notebook, PR (coordinator — not a subagent task)

- [ ] **Step 1: Commit results** — `backend/evaluation/results/partial/live.json`, `backend/evaluation/results/live.json`, `backend/evaluation/results/SUMMARY.md`, `.agents/tasks/bl-031-verify-before-contain/*`:

```bash
git commit -m "chore(evaluation): record BL-031 verification-first live rerun"
```

- [ ] **Step 2: Notebook** (`docs/session/`):
- `SessionLog.md`: prepend the BL-031 entry (scoped + full results; exact counts).
- `Backlog.md`: remove BL-031 (done); append to the `**Closed (removed):**` block: `BL-031 done (verification-first grounding, PR on feat/bl-031-verify-before-contain).`
- `Decisions.md`: append **DEC-014**:

```markdown
## DEC-014: Verification-first grounding in planner prompts (2026-10-13)

**Context:** The two false-alarm checkpoints failed `no_forbidden_actions`:
the planner isolated FS-01 and acted on `svc_backup` before verifying a
signed, scheduled backup (BL-031; BL-038 evidence). The gates and the
scenario intent (CP1: "ask for change verification instead of disrupting")
define the acceptance criteria.

**Options considered:** (1) a policy-pack rule; (2) prompt grounding in the
analysis + proposal system messages. (2) chosen: the pack is versioned and
owned (DEC-012), and a stage-phased rule can be filtered out by the BL-037
retrieval at the wrong stage, while prompt grounding also steers stage
selection and is pinned by contract tests.

**Decision:** The analysis prompt distinguishes unverified planned
operations (signed binary, admin-created scheduled task, service/backup
account, plausible destination) from compromise and prefers the assessment
stage with change-verification questions; the proposal prompt forbids
disruptive actions against servers, service/admin accounts and approved
providers on unverified suspicion, while keeping user endpoints with
independent compromise evidence containable. Acceptance evidence: live
scoped + full evaluation reruns.

**Tradeoff:** prompt-level behavior is probabilistic — the acceptance
signal is the eval run, not a unit test; contract tests only pin the
directives. Revisit with the policy pack if enforcement must be
deterministic.

**Links:** `backend/app/ai/langgraph_planner.py`, `backend/tests/test_planner_adapter.py`, BL-031, DEC-013.
```

- `SessionContext.md`: update the BL-031 line inside the policy-pack paragraph (from "only the two false-alarm CP1s still fail…" to the new state) and refresh the simulator bullet's result line if the full-run totals change.
- `README.md`: if the full run changes the headline (10/12 · 3/5 · 90.4), update lines under **Evaluation** and **Status snapshot**; otherwise leave and note in the SessionLog.

- [ ] **Step 3: Commit notebook** — `docs(session): record BL-031 verification-first grounding; DEC-014`.
- [ ] **Step 4: Final whole-branch review** (subagent, diff = merge-base(main)..HEAD) before PR.
- [ ] **Step 5: Push + PR** to `main` (title: `feat(planner): verification-first grounding (BL-031)`; body carries the before/after eval evidence).
