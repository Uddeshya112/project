# Engineering Operating Model

This document translates the repository-wide agent contract in [AGENTS.md](../AGENTS.md) into an operational workflow for IntelliSchedule.

## Current product boundary

IntelliSchedule is a university academic operations and timetable platform. The observed repository stack is React 19 + Vite, Node.js 22 + Express 5, PostgreSQL/Supabase, and a modular monolith. Preserve that boundary unless a documented ADR and human-approved decision establish a need to change it.

Primary references:
- [System design](system-design.md)
- [Architecture](architecture.md)
- [Permissions](permissions.md)
- [API conventions](api-conventions.md)
- [Testing strategy](testing.md)
- [Threat model](security/threat-model.md)
- [Database architecture](DATABASE_ARCHITECTURE.md)
- [Deployment runbook](runbooks/deploy.md)
- [Rollback runbook](runbooks/rollback.md)
- [Backup runbook](runbooks/backups.md)

## Work item protocol

Each non-trivial issue/PR should state:
- user problem and acceptance criteria;
- requested scope, necessary supporting scope, optional improvements, and out-of-scope work;
- affected routes, roles, data entities, jobs, external services, and operational boundaries;
- risks and failure modes;
- tests and evidence required for acceptance;
- migration, rollout, and rollback plan when applicable;
- unresolved human decisions.

Keep work small enough to review. Do not bundle unrelated refactors or dependency modernization.

## Evidence ledger

Use this format in PRs and state updates:

| Claim | Status | Evidence |
| --- | --- | --- |
| Requirement behavior | Verified / Inferred / Unverified | Test or source location |
| Authorization/data isolation | Verified / Inferred / Unverified | Adversarial test and code path |
| Build/type/lint | Verified / Unverified | Exact command and outcome |
| Performance | Measured / Not measured | Workload, environment, method, raw result |
| Migration | Verified / Unverified / Not applicable | Schema inspection, apply result, validation, rollback evidence |
| Deployment/recovery | Verified / Unverified / Requires human action | Environment, timestamp, health and restore evidence |

A successful CI job only proves the checks actually run in that job. It does not prove production configuration, restore capability, all roles, or every security boundary.

## Severity and release decisions

- **Critical:** stop work/release, contain, fix, run full relevant regression and security rescan, and obtain fresh review.
- **High:** fix before release.
- **Medium:** fix before release when it affects core behavior, security, data integrity, reliability targets, or an explicit requirement. Otherwise document rationale, risk, mitigation, owner, and due date.
- **Low:** log and prioritize normally unless it violates an explicit requirement.

Do not release with known critical/high issues, confirmed ownership/authorization bypass, known data-loss conditions, exposed secrets, unsafe migrations, failed mandatory criteria, critical workflow regressions, or missing required backup/recovery verification.

## Migration protocol

1. Inspect the deployed schema and migration history; do not assume local files were applied.
2. Identify affected queries, constraints, indexes, table size, lock/rewrite risks, and concurrent application versions.
3. Prefer additive compatible changes; split high-risk changes into expand, deploy, backfill, verify, switch, and contract.
4. Use a non-production environment first.
5. Verify data invariants and application behavior.
6. Record rollback limits and the exact point after which rollback requires forward repair.
7. Update database documentation and `PROJECT_STATE.md` with observed results only.

## Incident protocol

For a suspected production incident: acknowledge and scope impact, preserve evidence, protect users/data, contain safely, communicate status, diagnose root cause, recover, verify, and write a blameless post-incident review. Follow [incident response](runbooks/incident-response.md).

## Context handoff

Before ending a session or switching agents:
- finish or safely pause the current atomic change;
- record exact branch and working state when available;
- record changed files and relevant commit/PR;
- list commands actually run and outcomes;
- list known failures, unverified claims, blockers, decisions needed, and exact next action;
- update `PROJECT_STATE.md`.

Never use state checkboxes as evidence of implementation.
