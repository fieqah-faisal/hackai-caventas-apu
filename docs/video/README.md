# Caventas product film

[`caventas-product-film.mp4`](caventas-product-film.mp4) — about three
minutes, 1920×1080, 30 fps, H.264/AAC with burned-in captions.

The film follows one synthetic incident from start to finish:

> Suspicious installer on a sales laptop → browser credential and session
> theft → exfiltration → initial response plan → analyst approval,
> rejection and a partially failed revocation → new evidence (CRM session
> replay, 1,200 customer records exported) → stale plan → revised plan →
> policy-bound approval → analyst reviews → structured report and PDF.

| Act | What is on screen |
|-----|-------------------|
| Cold open | Motion graphics built from the scenario's own records (times, hosts, IPs, domains). |
| Introduction | The supplied Caventas logo, assembled from its own layers, and the human-in-the-loop flow. |
| 01–09 | The real Caventas workspace: create case, ingest evidence, timeline, incident graph, agent run and decision trace, plan, approval/rejection/simulation, replanning, policy guard, analyst reviews, report, PDF export. |
| Close | A montage of those same captures and the end card. |

## What is real, and what was arranged for the recording

Every product shot is a screenshot of the actual frontend in **API mode**,
talking to the actual FastAPI backend: case creation, evidence ingestion,
GAS-lite state versions, the LangGraph planner graph, allowlist/evidence/
policy-reference validation, the deterministic policy guard (the refused
SOC-analyst approval and the IT-manager approval are real 403/200
responses), the bounded simulator, analyst reviews, report assembly and the
ReportLab PDF. Overlays (highlights, labels, cursor) only point at elements
that are on screen.

To make the recording repeatable without credentials, `production/capture_backend.py`
substitutes two things:

- **Storage:** the in-memory Firestore stand-in used by the test suite.
- **The LLM HTTP call inside `LangGraphPlannerAdapter`:** a replay of the
  decisions the live planner made for this scenario in the committed
  evaluation run (`backend/evaluation/results/live.json`: tools, targets,
  cited records, policy references, missing evidence). Rationale and
  summary wording was written to match those decisions. Everything after
  the model call — graph routing, guidance retrieval, validation, trace
  steps and persistence — is the product's own code. The UI therefore shows
  the configured live model name.

The simulator runs the documented `demo` profile (CRM admin API in vendor
maintenance until 10:30), which is why the first session revocation is
*partially completed / ineffective* in the film. Off camera, the capture
script follows the scenario's documented demo path (re-plan, approve and
simulate one action at a time) so that later evidence matches what was
executed. The "Decision trace" panel in chapter 04 restyles the stored
trace steps of that run; the same steps appear in the report.

All data is synthetic: RFC 5737 documentation IPs, `.example` domains and
fictional people. Captions in the cold open describe the scenario's own
records. Nothing in the film touches a real system.

## Rebuilding

Sources live in [`production/`](production):

| File | Role |
|------|------|
| `capture_backend.py` | Real FastAPI app with in-memory storage and the replayed planner call. |
| `film_api.py` | Seeds background cases, splits evidence by source, runs off-camera demo-path steps, renders batch 2 from stored results. |
| `capture.mjs` | Drives the real UI with Playwright and records high-DPI frames plus an element index for callouts. |
| `narration.json`, `narrate.py` | Script and Kokoro TTS (voice `af_heart`). |
| `prepare_assets.py` | Logo layers from `frontend/src/assets/Caventas-logo.png`; dot-matrix world map. |
| `film/` | Frame-by-frame HTML compositor (cold open, product scenes, close). |
| `build.py`, `render.mjs` | Assemble the compositor build; render every frame in headless Chromium. |
| `audio.py` | Procedural score, UI foley, narration placement and ducking. |
| `make_film.sh` | The whole pipeline, end to end. |

See the header of `make_film.sh` for the required tools and environment
variables.

## Credits

- Narration: [Kokoro-82M](https://github.com/hexgrad/kokoro) (Apache-2.0) via `kokoro-onnx`.
- Fonts: Barlow and IBM Plex Mono (SIL Open Font License), from the frontend's `@fontsource` packages.
- World map: Natural Earth land polygons (public domain) via the `world-atlas` npm package.
- Music and sound design: synthesised in `production/audio.py`; no samples.
