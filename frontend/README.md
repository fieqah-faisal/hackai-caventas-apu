# Caventas Frontend

React + Vite + TypeScript + Tailwind analyst workspace for the Caventas IR
Planner. Talks to the FastAPI backend over HTTP only (never Firestore
directly). Durable product and design decisions live in the repo-root
`PRODUCT.md`; this README holds frontend implementation details.

## Scripts

- `npm install` — install dependencies
- `npm run dev` — local dev at http://localhost:5173 (proxies /api to :8000)
- `npm run build` — tsc strict + vite production build
- `npm run preview` — serve the production build

## Structure

- `src/app` — router, App, 404, placeholder pages
- `src/components/shell` — TopBar, Sidebar (+ mobile drawer), AppShell, ConnectionBanner
- `src/components/ui` — Button, StatusBadge, Region (+ states), Skeleton, Mono, Toast
- `src/features/dashboard` — DashboardPage + regions (summary, attention, workflow, approvals, status overview, activity)
- `src/lib` — types (mirror backend schemas), format helpers, mock-data (synthetic + derived selectors), data/title/online hooks
- `src/fonts.ts` — self-hosted IBM Plex Sans/Mono (Fontsource) imports

## Design tokens and typography

- Colour tokens are the authoritative palette from `PRODUCT.md`, defined once
  as CSS variables in `src/index.css` and mapped in `tailwind.config.js`.
- IBM Plex Sans (interface) + IBM Plex Mono (technical identifiers only),
  self-hosted via `@fontsource/*` in `src/fonts.ts` — no runtime Google
  Fonts request.

## Data and honesty rules

- The UI calls FastAPI only; FastAPI/Firestore is the source of truth.
- `localStorage` may hold only harmless UI preferences (e.g. sidebar state),
  never incidents, approvals or reports.
- Summary counts and the status overview are derived from records in
  `src/lib/mock-data.ts` (synthetic fixtures), never hardcoded.
- Approval / execution / reporting endpoints are backend stubs (BL-003); those
  surfaces render the real contract shape and state plainly that actions are
  not persisted. Never report success before backend confirmation.

## Branding assets (placeholders to replace)

| Asset | Path | Notes |
|-------|------|-------|
| Favicon | `public/favicon.svg` | Placeholder shield mark; replace with real brand favicon. Add `favicon.ico` and re-add its link in `index.html` if needed. |
| Open Graph image | `public/og-image.png` (absent) | Referenced in `index.html` og:image; add a 1200x630 image. |
| 404 illustration | `src/app/NotFoundPage.tsx` | Temporary Lucide Terminal icon; swap for a custom illustration (e.g. `public/404.svg`). |

## Metadata and crawling

- Route-specific document titles via `useDocumentTitle` ("<page> | Caventas").
- `index.html` carries a base meta description and Open Graph tags.
- `public/robots.txt` disallows all crawling (prototype). Relax before any
  public deployment. No `sitemap.xml` (authenticated-style app).

## Application states

Every data-driven region implements loading (skeleton), empty, error (with
retry) and respects a top-level offline banner (`ConnectionBanner`). Toasts
(`components/ui/Toast`) are `aria-live`, keyboard-dismissible, and used for
transient confirmations only.

## Out of scope (MVP)

Auth/registration/login, email verification, password reset, account deletion,
production RBAC, cookie banner, privacy/terms content, marketing landing,
public SEO sitemap. One fixed synthetic analyst identity is assumed; senior
approval is a workflow requirement, not an authenticated role.