# Claude Code Instructions

Read and follow [AGENTS.md](AGENTS.md) as the canonical engineering contract before making changes.

At session start, read `PROJECT_STATE.md`, inspect repository status and the relevant implementation, tests, package manifest, lockfile, and documentation. Do not trust stale state notes without verifying them.

Use the proportional verification hierarchy in `AGENTS.md`. Preserve existing architecture, avoid unrelated refactors, never fabricate execution evidence, and update `PROJECT_STATE.md` after meaningful milestones. Human approval is required for material architecture, security, privacy, data-loss, cost, compliance, or production deployment decisions.
