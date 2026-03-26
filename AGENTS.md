# AGENTS

This policy applies globally to all future tasks in this repository.

## Shared Core

- Read local guidance before acting: `AGENTS.md`, `README.md`, and any repo-provided skill directories such as `.claude/skills/`.
- When the repo ships reusable skills, prefer following those skills over inventing a new workflow.

## Planning Workflow

- Always persist plans to disk.
- Store plan files at the repository top level.
- Use the filename prefix pattern: `PLAN_*` (for example, `PLAN_UKRAINE.md`).
- Delete temporary plan files when the related work is complete.

## Node Runtime

- Prefer Node's built-in env loading (`process.loadEnvFile()` or `--env-file`) over `dotenv` when the runtime supports it.
- Add `dotenv` only when older Node support makes it necessary.

## Quality and Testing

- Keep tests stable; do not disable failing tests as a workaround.
- When behavior changes, update tests, selectors, and docs appropriately instead of removing coverage or leaving docs stale.

## Change Management

- Keep changes minimal and aligned with the existing code style.
- After implementing and validating locally, commit and push changes unless explicitly instructed not to.
- Stop any processes started for testing or diagnostics when finished.
- Before final handoff, verify no repo-local dev/test processes you started are still running.
- If task-specific ports were used, verify they are no longer listening before final handoff.
- Capture reusable implementation lessons as local skills when they would help future work in this repo.
