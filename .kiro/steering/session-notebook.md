# Session Notebook

The team keeps a shared, committed session notebook at `docs/session/`.
It is the canonical cross-session memory for all teammates and agents.

## Mandatory

1. At the start of every session, read:
   - `docs/session/SessionContext.md`
   - the 3 most recent entries in `docs/session/SessionLog.md`
   - `docs/session/Backlog.md`
   - `docs/session/Decisions.md` when touching architecture, data model,
     APIs, or AI behavior.
2. Follow the full protocol in `docs/session/README.md`.
3. Update the notebook immediately after each completed task or decision —
   never batch updates to the end of the session.
4. Never commit to `main`; always work on a feature branch.

Kiro's built-in memory is per-user and is not visible to teammates. The
notebook is the shared source of truth; if it conflicts with the code, the
code wins — fix the notebook and log the fix.
