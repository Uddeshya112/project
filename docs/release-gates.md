# Evidence-Based Release Gates

A release is a decision supported by evidence, not by code generation or an agent's confidence. These gates supplement [AGENTS.md](../AGENTS.md) and the [testing strategy](testing.md).

## Gate A — Requirements and scope

- Acceptance criteria are explicit and mapped to code/tests.
- Requested and supporting scope are separated from optional/unrelated work.
- Material conflicts and human decisions are resolved.
- User-visible states and critical workflows are covered.

## Gate B — Code and CI

- [ ] Diff reviewed; no unexplained or unrelated changes.
- [ ] Typecheck/lint passed using the repository's configured command.
- [ ] Unit/integration/API tests passed as applicable.
- [ ] Production build passed.
- [ ] Required CI checks passed for the exact commit being released.
- [ ] No tests were skipped, deleted, or weakened to hide a defect.
- [ ] Dependency and secret checks completed to the extent required by the release policy.

Record exact commands and outcomes. If a check was unavailable, mark it unverified and state why.

## Gate C — Security and authorization

- [ ] Server-side authentication and authorization paths inspected.
- [ ] Every affected role and resource boundary tested, including forbidden access.
- [ ] Cross-user/ownership access tested where relevant.
- [ ] Inputs validated server-side and SQL remains parameterized.
- [ ] Session, CSRF/origin, cookie, headers, and rate-limit behavior reviewed for affected paths.
- [ ] Error messages and logs do not expose credentials, tokens, or unnecessary sensitive data.
- [ ] Threat model updated for material new entry points or assets.
- [ ] Secrets and dependency findings triaged.

A passing happy-path test or HTTP 200 is insufficient evidence for a security boundary.

## Gate D — Database and data integrity

- [ ] Actual target schema and applied migration state inspected.
- [ ] Migration compatibility, locking, indexes, constraints, backfill, and concurrent-version risks reviewed.
- [ ] Data invariants verified after migration.
- [ ] Rollback or forward-recovery procedure documented and appropriately tested.
- [ ] Backup and restoration requirements satisfied for the release risk.
- [ ] No destructive operation ran without explicit authorization.

Do not claim production schema or migration state from source files alone.

## Gate E — Reliability and operations

- [ ] Timeouts, retry behavior, duplicate requests, and failure handling reviewed where relevant.
- [ ] Health/readiness checks reflect the documented intent.
- [ ] Logs include useful safe context and do not log secrets.
- [ ] Deployment and rollback instructions match the current system.
- [ ] Alerts/runbooks are updated for new critical dependencies or failure modes.
- [ ] Backup restoration was actually tested when required by the release criteria.

## Gate F — UX, accessibility, and performance

- [ ] Loading, empty, error, success, and pending states handled for changed screens.
- [ ] Keyboard, focus, labels, contrast, responsive layouts, and reduced motion reviewed where relevant.
- [ ] Performance claims include workload, environment, methodology, and measurements.
- [ ] Load/concurrency tests performed when the changed risk or release target requires them.
- [ ] No optimization was accepted without correctness and regression verification.

## Gate G — Final review and human authority

- [ ] Fresh independent review completed for high-risk security/architecture changes where available.
- [ ] Relevant regression and security rescans completed.
- [ ] No unresolved Critical/High findings or other defined release blockers.
- [ ] All required human decisions are resolved.
- [ ] `PROJECT_STATE.md` accurately describes current evidence, unknowns, and next actions.
- [ ] Human release approval obtained where required.

## Required release record

For each release, record:
- commit SHA and environment;
- build/test/security checks actually run;
- migrations applied and their verification;
- smoke-test results;
- unresolved findings and accepted risks with owner and due date;
- rollback trigger and procedure;
- who approved the release.

If evidence is unavailable, the corresponding gate is **UNVERIFIED**, not passed.
