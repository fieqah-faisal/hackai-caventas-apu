# Agent Instructions — Caventas IR Planner

## Session notebook (mandatory)

This repo keeps a shared session notebook at `docs/session/`. Before any
work: read `docs/session/SessionContext.md`, the 3 most recent entries in
`docs/session/SessionLog.md`, and `docs/session/Backlog.md`. Follow the full
protocol in `docs/session/README.md`. Update the notebook immediately after
each completed task — never batch.

## Repo rules

- Never commit to `main`; always work on a feature branch.
- `.kiro/steering/*.md` are the current architecture, stack and security
  rules (`tech.md`, `structure.md`, `security.md`, `product.md`).
- Synthetic incident data only; no secrets or personal data anywhere.
- The product is human-in-the-loop: the AI recommends, analysts approve,
  and all execution is simulated.
