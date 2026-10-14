# Caventas — Incident Response Planner

**HackAI 2026 · Track 1 — Agentic Cyber Defense · Problem Statement 04: Incident Response Planner**

Caventas turns fragmented incident evidence and organization-approved
guidance into an adaptive, evidence-backed incident-response plan with
explicit human approval gates. The agent reconstructs what happened,
assesses the incident, identifies missing evidence, uses the approved
playbook and policy pack, and proposes prioritized response actions. Each
action includes supporting evidence, rationale, policy references, risk and
validation checks. A human analyst decides; consequential actions are
never executed by the system, and selected actions are demonstrated in a
bounded simulator. The output is a continuously updated, traceable incident
report, not a chatbot answer.

> **Human-in-the-loop by design.** The AI recommends only. Every
> consequential action needs an analyst decision, execution is simulated in
> a fictional environment, and all data in this repository is synthetic
> (RFC 5737 documentation IPs, `.example` domains). Nothing here touches
> real systems.

## How the pieces fit

```
 Evidence (alerts, logs, notes, IOCs)      Approved context (playbooks, policies,
        │                                   approval rules, asset inventory)
        ▼                                             │
 Observe → Reconstruct ──────────────► Incident State (versioned, Graph-as-State-lite)
 (normalize, dedupe,                    evidence refs · entities · timeline ·
  keep provenance)                      hypotheses · gaps · decisions · results
        │                                             │
        ├──► Planner: Analyze ──► evidence sufficient? ──no──► Request evidence
        │                               │yes                        ▲
        │                               ▼                           │
        │            IR phase router (assessment … restoration) ◄───┘
        │            → Retrieve stage-relevant approved guidance
        │            → Propose prioritized actions (evidence, rationale,
        │              policy refs, risk, validation method)
        │                               │
        ▼                               ▼
   Human approval (approve / reject) ──► Bounded simulator (approved
        │                                        catalogue, fictional org)
        ▼                                             │
   Outcome validation → new incident-state version → Re-plan ──► Report
```

The loop continues until analyst-verified closure. Every version of the
state, every decision and every outcome is kept for traceability.

The planner retrieves stage-relevant approved guidance (deterministic
retrieve step between analysis and proposal; BL-037, DEC-013) and embeds two
repo skills — verification-first grounding and untrusted-evidence marking
(BL-031/BL-020, DEC-014/DEC-016). Its analysis — incident type, severity,
confidence, findings and ATT&CK mappings — is persisted with the plan and
rendered into the report (BL-017, DEC-015). Approvals and execution are
guarded deterministically by the backend policy pack (DEC-010): approver
role, evidence validity and sequencing are checked from stored records,
never from planner-cited references.

## Repository layout

| Path | What lives there |
|---|---|
| `backend/` | FastAPI + Firestore service: cases, evidence ingestion, versioned incident state, planner, approvals, simulated execution, reports — see [`backend/README.md`](backend/README.md) |
| `frontend/` | React + Vite + Tailwind analyst workspace (fixture and API modes) — see [`frontend/README.md`](frontend/README.md) |
| `backend/scenarios/` | Five synthetic incident scenarios (agent-visible batches + evaluator-only ground truth) — see [`backend/scenarios/README.md`](backend/scenarios/README.md) |
| `backend/evaluation/` | Evaluation harness, checkpoint scorer, safety gates, calibration results |
| `docs/session/` | Shared session notebook: team state, history, decisions, backlog — read before any work |
| `.kiro/steering/` | Current architecture, technology, security and product rules |
| `PRODUCT.md` | Product record: scope, design system, colour rules |

## Getting started

**Prerequisites:** Python 3.10+ (3.12 recommended); Node.js + npm for the
frontend. Optional: Java 21+ and `firebase-tools` for the local Firestore
emulator; an OpenCode Go API key for the real AI planner (everything works
without it — the backend falls back to a deterministic fake planner).

### Backend

```bash
cd backend
python3 -m venv ../.venv
../.venv/bin/pip install -r requirements.txt
cp .env.example .env            # fill values; the AI planner key is optional

# Local Firestore (no cloud project needed) — optional:
#   npx --yes firebase-tools emulators:start --only firestore --project ir-planner-dev
#   then set FIRESTORE_EMULATOR_HOST=localhost:8080 in .env

../.venv/bin/uvicorn app.main:app --reload     # http://localhost:8000/docs
```

Tests: `cd backend && ../.venv/bin/python -m pytest -q`

### Frontend

```bash
cd frontend
npm ci
npm run dev                      # :5173, fixture data by default, proxies /api → :8000
VITE_DATA_MODE=api npm run dev   # drive the real backend instead
npm run test && npm run build
```

`VITE_DATA_MODE` selects exactly one data provider per run (`fixture`
default, or `api`); the UI never talks to Firestore directly and never
mixes modes. Details in [`frontend/README.md`](frontend/README.md).

### Docker (frontend + backend)

Start the Firestore emulator on the Windows host first; the backend container
connects to it at `host.docker.internal:8080`. Docker packages only the
frontend and backend and uses the deterministic planner when no key is supplied.

```bash
docker compose build
docker compose up -d
# UI: http://localhost:8088  (nginx proxies /api to the backend container)
docker compose ps
docker compose down
```

Troubleshooting: confirm `localhost:8080` is listening before startup, use
`docker compose logs backend frontend` for service errors, and use
`docker compose down -v` only when you intentionally want to delete container
uploads/reports. `.dockerignore` excludes `.env`, credentials, service-account
files and local runtime data from both image build contexts.

### Demo (main scenario)

The demo is the infostealer case: stolen browser sessions on Farah's laptop
are replayed against the CRM the next morning, and the plan must **adapt**
when the first containment action only partly works.

1. Follow [`backend/scenarios/sc01_infostealer/agent_inputs/demo_path/DEMO_PATH.md`](backend/scenarios/sc01_infostealer/agent_inputs/demo_path/DEMO_PATH.md).
2. Start the backend with `SIMULATOR_PROFILE=demo` **explicitly** — the
   default is `clean`; only the demo (and the evaluation harness) enables
   the injected CRM fault that makes the first action insufficient.
3. In the frontend's fixture mode a presenter control ("Reveal next
   evidence (demo)") drives the same v1 → v2 re-plan live.

### Evaluation

The five scenarios replay through the real backend in-process (no emulator
needed) with a scripted analyst and safety gates:

```bash
cd backend
../.venv/bin/python -m evaluation.run_eval --planner oracle unsafe fake
../.venv/bin/python -m evaluation.run_eval --planner live   # needs OPENCODE_GO_API_KEY
```

Calibration (see `backend/evaluation/results/SUMMARY.md`): `oracle` 12/12
checkpoints (upper bound), `unsafe` 0/12 (mean 22.9), `fake` 1/12
(mean 42.9), and `live` 12/12 across 5/5 scenarios (mean 93.4; post-merge
run with the deterministic policy guard, 2026-10-13). All live safety gates
hold, and report coverage is complete: live reports carry classification,
evidence-backed findings and ATT&CK mappings (`not_produced_yet` is empty on
all five scenarios).

## Status snapshot (2026-10-14)

- **Merged:** evidence ingestion and versioned incident state (Milestone 1);
  LangGraph + DeepSeek V4.1 Flash planner with evidence-sufficiency routing
  and grounded proposals; human approval → bounded simulated execution →
  outcome-to-state re-planning; incident report (schema v1.2 JSON + PDF);
  Firestore emulator support; bounded simulator with an approved 9-tool
  catalogue; five synthetic scenarios plus evaluation harness, scorer and
  safety gates; React analyst workspace in fixture and API modes with
  read-only action/result list endpoints; policy pack v1.0 (19 structured
  rules + 8 assets); stage-scoped guidance retrieval and policy-ref
  validation (BL-037, DEC-013); verification-first grounding skill (BL-031,
  DEC-014); persisted planner analysis with report findings/ATT&CK (BL-017,
  DEC-015); untrusted-evidence marking and full state descriptions (BL-020,
  DEC-016); GAS-lite STAIR-inspired incident state: immutable versioned graph
  snapshots in Firestore, a pure `app/services/gas_lite.py` builder (no I/O,
  no LLM), response/effect edges, execution provenance, and additive
  state-history endpoints `GET /cases/{id}/states` and `/states/{version}`
  (DEC-010); deterministic backend policy enforcement (BL-032/BL-018/BL-019):
  approver role, target asset type, non-empty valid evidence and
  preservation-before-reimage sequencing are checked against `guidance.json`
  and stored records, never the planner's cited `policy_refs`.
- **Measured:** the live planner passed 12/12 checkpoints across 5/5
  scenarios (mean 93.4; post-merge run with the deterministic policy guard,
  2026-10-13) with complete report coverage and all safety gates holding;
  backend suite 212 passed, frontend 75 passed.
- **Prototype limitation:** the approver role is a *declared* value on the
  decision request, not an authenticated identity (no auth / IdP yet). The
  backend still enforces that the declared role satisfies the policy pack.
- **Next:** report notification/conformance/asset-criticality enrichment
  (BL-033), simulator and fixture alignment (BL-035/BL-036/BL-039), and
  remaining reads (BL-013, BL-025). Deferred: trigger-aware retrieval,
  frontend graph visualisation, and GitHub Actions.
- **Decisions/deferred:** record the Firestore divergence (BL-001), ratify
  React over Streamlit (BL-012), optional cloud Firebase (BL-009), and
  approval invalidation after state changes (BL-024).

## Safety and data rules

- **Synthetic data only.** Documentation IP ranges, reserved `.example`
  domains, fictional people and hashes — enforced by tests
  (`backend/tests/test_scenarios.py`).
- **No autonomous action.** Approvals are analyst records; execution runs
  through the bounded simulator and never touches real systems; an
  execution that completes is never automatically "effective".
- **Provenance everywhere.** Findings, timeline rows and recommendations
  stay traceable to source evidence; reports contain only facts supported by
  stored case records.
- **Untrusted evidence.** Log text, email bodies and notes are data, never
  instructions — the planner loads an explicit untrusted-evidence skill, the
  state keeps evidence descriptions complete, and injection attempts are
  recorded as findings, not followed.
- Full rules: [`.kiro/steering/security.md`](.kiro/steering/security.md).

## Project memory and workflow

Team state, history, decisions and backlog live in
[`docs/session/`](docs/session/README.md) — read it before starting work.
Work on feature branches, never on `main` (see [`AGENTS.md`](AGENTS.md)).
The current architecture and stack rules are in `.kiro/steering/`.

## Team

**Caventas** — Asia Pacific University of Technology and Innovation (APU)

Syafieqah Binti Ahmad Shukri · Aida Batrisya Binti Ramlee ·
Al-Aidan Iszdehar Farrn Bin Ismail Faizal · Airil Hakimi bin Anuar ·
Raajshreedhar Sathia Murthy

## Original project timeline (planning record)

| To-do's | Date | Activities | Status |
| --- | ---- | --- | ---|
| **Track and Problem Statement Selection** | By 21/09 | Review problem statement selection from Track 1: Agentic Cyber Defense | Done |
| **Pre-mentor ideas refinement** | 22/09 - 25/09 | Refine the shortlisted ideas, identify technical requirements and prepare questions for the mentor | Done |
| **Mentor Consultation** | 26/09 | Present the proposed direction, obtain feedback and challenge the project scope | Done |
| **Scope and Planning** | 27/09 – 29/09 | Finalize the problem statement, target users, MVP, agent workflow, architecture, dataset, safeguards and success metrics | Done |
| **Core Prototype Development** | 30/09 – 4/10 | Build the main evidence-processing, agent reasoning, planning and user-interface components | Done |
| **Integration and Evaluation** | 5/10 – 7/10 | Integrate components, test the main scenario, evaluate outputs and resolve critical issues | Done |
| **Internal Feature Freeze** | 8/10 | Complete the core functionality and prepare the first full submission candidate | Reached (8 Oct; post-freeze changes tracked in `docs/session/`) |
| **Finalization Buffer** | 9/10 - 14/10 | Conduct final testing, improve usability, complete documentation, record and edit the demo video, verify links and prepare submission files | In progress |
| **Official Submission** | 15/10 | Upload all deliverables early and verify successful submission | Pending |

## Security/testing requirements and constraints

| #      | Requirement from HackAI                                | What it means for our project                                                                                                                                                               |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Only perform authorized testing**                    | Do not attack or test real systems, organisations, users, or AI services unless you have permission. HackAI explicitly says other AIs should only be hacked with permission. ([Hack AI][1]) |
| **2**  | **Testing must remain ethical and lawful**             | Cybersecurity functionality should be demonstrated in a controlled environment rather than against unauthorized real-world targets. ([Hack AI][2])                                          |
| **3**  | **Stay within the authorized scope**                   | Only test the systems/components that the challenge or owner has permitted you to test. ([Hack AI][2])                                                                                      |
| **4**  | **Do not attack infrastructure outside the challenge** | HackAI specifically prohibits attempting to compromise applications, back-end systems, or infrastructure outside the intended game/testing scope. ([Hack AI][2])                            |
| **5**  | **Follow the permitted testing methods**               | When a challenge specifies allowed techniques, stay within them. HackAI's own games currently restrict testing to prompts and natural-language interactions. ([Hack AI][2])                 |
| **6**  | **Do not enter personal information**                  | HackAI explicitly tells users not to put personal information into prompts. ([Hack AI][2])                                                                                                  |
| **7**  | **Avoid sensitive information**                        | The site also tells users to avoid personal or sensitive information because submitted inputs are stored. ([Hack AI][2])                                                                    |
| **8**  | **Report unintended vulnerabilities responsibly**      | If a vulnerability is discovered outside normal challenge gameplay, HackAI asks users to report it rather than exploit it further. ([Hack AI][2])                                           |
| **9**  | **Do not deliberately damage the testing environment** | Their guidance says testing must stay within the supplied rules because breaking the applications can prevent other users from learning from them. ([Hack AI][2])                           |
| **10** | **Respect data-use and privacy rules**                 | HackAI states that interaction data can be retained for research and AI-security evaluation, so participants are responsible for not providing private information. ([Hack AI][2])          |
| **11** | **Use provided data ethically**                        | For research collaborations using HackAI data, the site requires ethical use and adherence to privacy standards. ([Hack AI][2])                                                             |
| **12** | **Attribute HackAI data when used for research**       | Researchers using HackAI-provided datasets are required to identify HackAI as the data source. ([Hack AI][2])                                                                               |

[1]: https://hackai.fi/ "Hack AI – Learn to understand AI, test it, and break it if necessary"
[2]: https://hackai.fi/index.php/data-handling-at-hackai/ "Policies and Guidelines – Hack AI"
