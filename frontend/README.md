# Caventas Frontend

React + Vite + TypeScript + Tailwind analyst workspace for the Caventas IR
Planner. Progressive-disclosure UI: a Dashboard, a Create Case flow, and a
Case Workspace with seven tabs (Overview, Evidence, Timeline, Analysis,
Response Plan, Approvals, Report).

The UI talks to the FastAPI backend over HTTP only, never Firestore directly.
Durable product and design decisions live in the repo-root `PRODUCT.md`; this
README holds frontend implementation details.

## Scripts

- `npm install` — install dependencies
- `npm run dev` — local dev at http://localhost:5173 (proxies `/api` to `:8000`)
- `npm run typecheck` — `tsc --noEmit` (strict)
- `npm run test` — Vitest unit/contract tests
- `npm run test:watch` — Vitest in watch mode
- `npm run build` — typecheck + Vite production build
- `npm run preview` — serve the production build (default port 4173)

## Data provider modes (VITE_DATA_MODE)

The app selects **exactly one** data provider per run, chosen once at startup
from `VITE_DATA_MODE` and never switched or mixed at runtime. Copy
`.env.example` to `.env` (or `.env.local`) and set the mode. Default is
`fixture`.

```
VITE_DATA_MODE=fixture   # deterministic synthetic demo data (default)
VITE_DATA_MODE=api       # the live FastAPI backend
```

### `fixture` — FixtureProvider

Deterministic synthetic data implementing the **complete intended product
contract**, so the full workflow is demonstrable without a running backend:

- Six-state action lifecycle (proposed, approved, simulated,
  validated_effective, validated_ineffective, superseded).
- Request-more-investigation decision in addition to approve/reject.
- Plan history (v1 and v2) with a re-plan diff.
- Separate simulation and validation steps.
- A structured, section-complete report (PDF marked unavailable).
- The Infostealer scenario with a presenter control
  ("Reveal next evidence (demo)") that reveals evidence batch 2 live and
  drives the v1 to v2 re-plan.

Every surface backed by this provider is visibly flagged **"Synthetic demo
data"**. It never claims to have come from the real backend or to have
modified real systems. No backend or network is required in this mode.

### `api` — RealProvider

Talks to the real FastAPI backend and maps real DTOs into view models. It
exposes **only** capabilities the backend actually implements and never
silently falls back to fixture data on failure — failures render as honest
loading/empty/error/offline states.

Known backend gaps are surfaced explicitly rather than faked:

- Approve / reject use the real `/actions/{id}/decision` endpoint.
- Request-more-investigation is disabled and labelled unavailable (no backend
  endpoint).
- `/execute` renders `execution_status` and `validation_status` separately;
  the UI never calls a non-existent `/validate` endpoint.
- `GET /plans` returns action IDs; API mode orders plans by `created_at` and
  resolves those IDs through `GET /actions`. Missing references are shown as
  unavailable rather than hidden. The Approvals queue uses the same action read:
  actions
  awaiting a decision, plus approved actions not yet simulated, with a
  stale pre-warning when the action's state version is older than the
  case's. Stored execution and validation history remains visible through
  `GET /action-results` after the approval queue refreshes.
- Audit events map the backend shape (`audit_id`, `event_type`,
  `timestamp`, `details`); evidence lists in upload order.
- The Report uses the actual backend report DTO. `GET /reports/latest` restores
  the newest persisted report after refresh, and the PDF is downloaded through
  the report API rather than exposing the server-local `pdf_path`.
- Opening the Report tab only reads. A report is generated only when the
  analyst clicks Generate / Regenerate. Each `POST /reports` stores a new
  report version, PDF and audit event.
- Persisted `GET /cases` backs the Cases page and API-mode dashboard. Planning
  and decision summaries are derived from stored plans/actions; active-run
  status remains explicitly unavailable because the backend has no run-status
  contract.

Point API mode at a backend by running the FastAPI app on `:8000`; the Vite
dev server proxies `/api` to it (see `vite.config.ts`). The two modes are a
hard boundary: fixture and API data are never combined within one case.

## Structure

- `src/app` — router (`App`), About/credits, 404, placeholder pages
- `src/components/shell` — TopBar, Sidebar (+ mobile drawer), AppShell, ConnectionBanner
- `src/components/icons` — CoreUI icon registry + inline `Icon` renderer
- `src/components/ui` — Button, StatusBadge, Region/states, Skeleton, Mono, Toast, SyntheticBadge, AsyncBoundary
- `src/features/dashboard` — DashboardPage
- `src/features/createCase` — CreateCasePage (stepper)
- `src/features/caseWorkspace` — CaseWorkspace shell, DetailPanel, context, and the seven `tabs/`
- `src/lib/api` — DataProvider boundary: `provider.ts` (interface + Outcome),
  `fixtureProvider.ts`, `realProvider.ts`, `apiClient.ts`, `dto.ts`, `index.ts`
- `src/lib/mapping` — maps backend DTOs to view models (DTOs kept separate from view models)
- `src/lib/types.ts` — view-model types (not backend DTOs)
- `src/lib/scenario` — scenario config, plan diff, false-alarm presentation logic
- `src/lib/fixtures` — the Infostealer synthetic dataset
- `src/lib/caseWorkspace/tabAvailability.ts` — pure tab-gating from case facts
- `src/lib/setup/stepMachine.ts` — Create Case step gating
- `src/fonts.ts` — self-hosted Barlow (Fontsource) imports

## Icons

CoreUI Icons Free (`cil-*`), imported as specific named exports so the bundler
tree-shakes the rest. Each export is a `["<w h>", "<path .../>"]` tuple; the
`Icon` component injects the sanitised inner SVG markup in a `0 0 512 512`
viewBox with `currentColor`. Attribution: "CoreUI Icons Free by the CoreUI
Team — licensed under CC BY 4.0" (shown on the About & credits page).

## Design tokens and typography

- Colour tokens are the authoritative palette from `PRODUCT.md`, defined once
  as CSS variables in `src/index.css` and mapped in `tailwind.config.js`.
  Lime is reserved for the primary action only.
- Barlow (interface) with a monospace family for technical identifiers only,
  self-hosted via `@fontsource/*` in `src/fonts.ts` — no runtime Google Fonts
  request.

## Human-control and honesty rules

- The UI calls FastAPI only; FastAPI/Firestore is the source of truth.
- The AI recommends; analysts approve; all execution is simulated. The UI
  never claims to have modified real infrastructure.
- Approved actions "run" only in the bounded simulator; execution and
  validation are presented as distinct outcomes.
- `localStorage` may hold only harmless UI preferences, never incidents,
  approvals or reports.
- Synthetic data is always visibly flagged; success is never reported before
  backend confirmation (API mode).

## Application states

Every data-driven region implements loading (skeleton), empty, error (with
retry) and respects a top-level offline banner (`ConnectionBanner`). Toasts
(`components/ui/Toast`) are `aria-live`, keyboard-dismissible, and used for
transient confirmations only.

## Tests

Vitest covers the critical contract seams: API-client result mapping, Create
Case step gating, tab-availability latch/fallback, the plan-diff MECE
categorisation, and the false-alarm presentation gate.

## Out of scope (MVP)

Auth/registration/login, email verification, password reset, account deletion,
production RBAC, cookie banner, privacy/terms content, marketing landing,
public SEO sitemap. One fixed synthetic analyst identity is assumed; senior
approval is a workflow requirement, not an authenticated role.
