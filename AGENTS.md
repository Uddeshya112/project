# Engineering Agent Operating Contract

This repository is IntelliSchedule, a university academic operations and timetable platform. These instructions govern AI agents, automation, and contributors working in this repository. They supplement the existing architecture and product requirements; they do not authorize a rewrite.

## Authority and truth

- The human owns material product, architecture, security, privacy, cost, compliance, data, and deployment decisions.
- Follow approved requirements first, then security/data integrity, correctness, applicable legal obligations, reliability, measured performance, maintainability, operational simplicity, and developer convenience.
- Do not silently invent requirements or resolve material conflicts. Present the conflict, consequences, viable options, trade-offs, safest reversible option, and the specific human decision needed.
- Label claims as **VERIFIED**, **INFERRED**, **UNVERIFIED**, or **REQUIRES HUMAN ACTION** in reports and project state. A prior note, checkbox, generated file, successful startup, HTTP 200, passing build, or agent confidence is not proof by itself.
- Never fabricate tests, logs, scans, benchmarks, migration results, cloud state, backups, uptime, or deployment state.
- Preserve existing working behavior. Do not perform unrelated refactors or broad dependency upgrades.

## Mandatory session start

1. Read `PROJECT_STATE.md`, this file, and `CLAUDE.md` when present.
2. Read relevant files under `docs/`, especially system design, architecture, permissions, API conventions, testing, security threat model, ADRs, and runbooks.
3. Inspect `git status --short`, current branch, recent commits, and the target diff.
4. Inspect package manifests and lockfiles before changing dependencies or package-manager behavior.
5. Inspect the relevant implementation and tests; do not infer repository state from documentation alone.
6. Identify the smallest safe next change, scope, blast radius, and required verification.

If a tool or environment is unavailable, say so and provide exact commands marked **REQUIRES HUMAN EXECUTION**. Never imply that unavailable commands were run.

## Scope contract

Classify each proposed change as:
- **REQUESTED SCOPE**
- **NECESSARY SUPPORTING SCOPE**
- **OPTIONAL IMPROVEMENT**
- **UNRELATED IMPROVEMENT**

Implement requested and necessary supporting scope only. List optional work separately. Seek human approval before material architectural, destructive data, privacy, cost, compliance, or production-deployment decisions.

## Change loop

For each meaningful task:

1. **Understand** the acceptance criteria and failure modes.
2. **Inspect** code, dependencies, state, tests, and affected boundaries.
3. **Plan** a small atomic change and the verification needed.
4. **Implement** complete, coherent code. No placeholders, fake success paths, disabled checks, omitted implementation, or invented APIs.
5. **Review** the diff for unexpected, unrelated, generated, secret, configuration, dependency, and test changes.
6. **Verify proportionally** using the cheapest relevant checks first, then expand according to risk.
7. **Fix root causes**, add/strengthen regression coverage, and search for the same defect pattern across the repository.
8. **Update** `PROJECT_STATE.md` and relevant documentation with observed evidence and remaining work.
9. **Report** what changed, why, files, commands actually run, exact results, security/performance/database implications, limitations, risks, and human actions.

### Verification hierarchy

- Local change: syntax/typecheck and targeted unit tests.
- Module change: module and integration tests plus relevant authorization/security tests.
- Cross-cutting change: full tests, typecheck, lint, build, dependency/security checks, and affected E2E tests.
- Pre-release: full relevant regression, critical E2E, permissions/tenant isolation, security and dependency review, accessibility, performance/load tests where applicable, migration review, deployment/rollback, and backup-restore evidence.
- Do not run expensive or production-impacting tests without need or authorization. Never point destructive tests at production.

## Failure circuit breaker

If the same fundamental failure remains after three substantive fix attempts, stop. Do not weaken tests, suppress errors, disable security, or make unrelated edits. Report:
1. exact failure and reproduction command;
2. relevant real output;
3. what each of the three attempts changed and why it failed;
4. three root-cause hypotheses with evidence for/against;
5. environmental ambiguity and the precise human decision needed.

Wait for a human decision before continuing.

## Security and data boundaries

- Server-side authorization is authoritative. Never trust client role state, hidden fields, request-supplied ownership, or a URL identifier as authorization.
- Apply least privilege and defense in depth to every route, query, mutation, export, job, cache, and file access.
- Follow `docs/permissions.md`, `docs/security/threat-model.md`, and `docs/api-conventions.md`; update them when reality changes.
- Validate input at server boundaries; use parameterized SQL; keep errors safe; redact secrets and sensitive personal data from logs.
- Never commit credentials, tokens, private keys, production data, or secrets. If exposure is suspected, stop, assess blast radius, and require credential rotation.
- Do not create custom cryptography or hand-roll session/password primitives.
- Treat AI input and output as untrusted if AI functionality is involved; model output must not grant authority or bypass server controls.
- Do not claim the system is legally compliant without qualified review.

## Database and migration safety

- Treat every schema/data migration as a production change. Inspect current schema, migrations, application compatibility, query/index impact, locking, backfill, rollback, and concurrent-version behavior.
- Prefer additive/backward-compatible migrations. Separate expand, compatible deploy, backfill, verification, switch, and contract steps for risky changes.
- Do not edit production schema manually. Do not execute destructive migrations or production data changes without explicit authorization.
- Document irreversible operations and verified rollback limits. A rollback script existing is not proof rollback works.
- Document backup cadence, retention, RPO/RTO, restoration steps, and the last actual restore evidence. Never claim backup recovery is verified without a restore test in an isolated target.

## Dependencies and performance

- Inspect `package.json`, `bun.lock`, CI configuration, and existing utilities before dependency changes. Verify package/API existence and runtime compatibility; update lockfiles with the selected package manager.
- Keep this project’s existing Express 5 + React 19 + Vite + PostgreSQL/Supabase modular-monolith architecture unless evidence justifies change. Do not substitute an unrelated framework because it is fashionable.
- Measure before optimizing. Define workload, environment, methodology, and before/after evidence. Prioritize correctness, security, algorithms, database/I/O, memory, concurrency, then micro-optimization.
- Do not introduce microservices, Kubernetes, sharding, distributed locks, custom queues, or lock-free algorithms without a measured need, alternatives analysis, operating cost, failure modes, tests, and rollback plan.

## Quality and release rules

- Never alter/delete/skip a test merely to make the suite pass. Fix production code and retain a meaningful regression test.
- Test negative paths: invalid input, denied permissions, stale/expired sessions, cross-owner access, duplicate requests, database/service failures, retries, malformed input, timeouts, and concurrency where relevant.
- Review accessibility and responsive states for user-facing changes.
- Critical or High findings, confirmed authorization/ownership bypass, data loss, secret exposure, production-corrupting migration, mandatory gate failure, critical workflow regression, or missing required recovery evidence block release.
- Medium findings require documented rationale, risk, mitigation, owner, and follow-up if accepted; do not silently accept them.
- For high-risk architecture/security/release review, use an independent fresh reviewer where available. The reviewer must actively look for missed authorization, data leaks, injection, races, fake tests, and operational gaps.
- Do not merge/deploy solely because code was generated. Require objective gate evidence and human approval where applicable.

## Persistent state integrity

Maintain root `PROJECT_STATE.md` after every meaningful milestone. Track phase, active task, priorities, milestones, 16-layer status, evidence, passed/failed checks, known bugs/findings by severity, blockers, pending decisions, migrations, deployment, risks, incomplete work, and next actions.

State is a continuity aid, not proof. If state conflicts with repository/tool evidence, repository/tool evidence wins; correct the state before proceeding. Keep historical claims clearly separated from current verified evidence.

## Completion report

Do not simply say “done.” Report:
1. changes and rationale;
2. files changed;
3. tests/checks actually executed and results;
4. security checks and their scope;
5. performance measurements (or state none were taken);
6. database/migration and dependency changes;
7. known limitations and unverified items;
8. human actions required and remaining risks;
9. next recommended action.

A task is complete only when its applicable acceptance criteria and gates have evidence, the final diff is reviewed, known blockers are addressed, and project state reflects reality.
