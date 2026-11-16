# PROJECT STATE — IntelliSchedule (University Academic Operations & Timetable Platform)

**Institution**: Thapar Institute of Engineering and Technology (TIET, Patiala)  
**Standard**: Principal Engineering Agent & SaaS Playbook Specification  
**Current Phase**: GOVERNANCE BASELINE ADDED — CURRENT SYSTEM REVALIDATION PENDING  
**Last Updated**: 2026-10-10

---

> **State integrity notice (2026-10-10):** The status table and measurements below were present in the repository before this governance change. They are retained as historical project notes, not independently verified current evidence. The connected GitHub inspection in this change read repository files/tree only; it did not execute a local build, tests, database queries, security scans, benchmark, restore, or production smoke test. Treat each old result as **UNVERIFIED** until reproduced against the current commit/environment. Repository evidence takes precedence over this file.
>
> **Observed discrepancy:** the state below references `supabase/migrations/20261004000000_init_supabase_schema.sql`, but the inspected `main` tree listed only `20261006000000_runtime_store.sql` and `20261006000001_persistent_state.sql` under `supabase/migrations/`. Determine whether the referenced migration was renamed, removed, or applied outside the repository before any database change. Do not infer production schema state from this discrepancy alone.
>
> **Observed architecture constraint:** `docs/architecture.md` documents an in-memory working copy and explicitly requires one application instance. Do not scale horizontally or change this model without addressing shared state/concurrency and recording an approved ADR.

## 1. 16-Layer Engineering Status

| Layer | Domain | Status | Evidence / Verification |
| :--- | :--- | :---: | :--- |
| **Layer 1** | System Design | **HISTORICAL CLAIM — NOT REVALIDATED** | Capacity estimates, personas, and workflows documented in `/docs/system-design.md`. |
| **Layer 2** | System Architecture | **HISTORICAL CLAIM — NOT REVALIDATED** | Modular monolith design, component diagrams, and ADR 0001 in `/docs/architecture.md`. |
| **Layer 3** | Databases & Storage | **HISTORICAL CLAIM — NOT REVALIDATED** | Supabase PostgreSQL production schema, RLS policies on all 24 tables, migration SQL `/supabase/migrations/20261004000000_init_supabase_schema.sql`, database architecture in `/docs/DATABASE_ARCHITECTURE.md`. |
| **Layer 4** | Auth & Authorization | **HISTORICAL CLAIM — NOT REVALIDATED** | Bcrypt KDF ($2b$ cost 12) primary password hashing, multi-scheme verification (Bcrypt, Scrypt, legacy SHA-256), automatic transparent rehash migration on login, anti-enumeration, session revocation, RBAC matrix in `/docs/permissions.md`. |
| **Layer 5** | APIs & Backend Logic | **HISTORICAL CLAIM — NOT REVALIDATED** | Supabase-backed REST endpoints with standard error codes and rate limiting documented in `/docs/api-conventions.md`. |
| **Layer 6** | Frontend & UI/UX | **HISTORICAL CLAIM — NOT REVALIDATED** | Thapar University design system, zero-pill discipline, loading/empty/error states across all views. |
| **Layer 7** | CI/CD & Deploy | **HISTORICAL CLAIM — NOT REVALIDATED** | Deployment & rollback runbooks in `/docs/runbooks/deploy.md` and `/docs/runbooks/rollback.md`. |
| **Layer 8** | Testing | **HISTORICAL CLAIM — NOT REVALIDATED** | 51/51 automated E2E & backend test assertions passing (`npm test`). |
| **Layer 9** | Hosting & Cloud | **HISTORICAL CLAIM — NOT REVALIDATED** | Express 5 + Node 22 LTS container on Google Cloud Run with environment configuration. |
| **Layer 10** | Security | **HISTORICAL CLAIM — NOT REVALIDATED** | Threat model in `/docs/security/threat-model.md`, security headers, CSRF state protection. |
| **Layer 11** | Rate Limiting | **HISTORICAL CLAIM — NOT REVALIDATED** | Token-bucket rate limiter on login, forgot-password, and OAuth initiation endpoints. |
| **Layer 12** | Caching & CDN | **HISTORICAL CLAIM — NOT REVALIDATED** | Cache-Control headers on API routes; Vite content hashing for static assets. |
| **Layer 13** | Error Tracking & Logs | **HISTORICAL CLAIM — NOT REVALIDATED** | Structured server logs, sensitive data redaction (passwords and tokens never logged). |
| **Layer 14** | Monitoring & Alerts | **HISTORICAL CLAIM — NOT REVALIDATED** | Active health check endpoints `/api/health/live` and `/api/health/ready`. |
| **Layer 15** | Scaling | **HISTORICAL CLAIM — NOT REVALIDATED** | Stateless session tokens, measured sub-5ms API p95 latency, in-memory bitset solver efficiency. |
| **Layer 16** | Hardware Performance | **HISTORICAL CLAIM — NOT REVALIDATED** | Empirically benchmarked: Bcrypt cost 12 p50 = 426.88 ms, API p95 = 3.37 ms, Bitset Solver p95 = 5.15 ms. |

---

## 2. Quality Gates & Test Suite Summary

- **TypeScript Compilation (`npm run lint` / `tsc --noEmit`)**: **0 Errors**
- **Production Asset Build (`npm run build` / `compile_applet`)**: **Passed**
- **Automated E2E Test Suite (`npm test`)**: **51 Passed / 0 Failed**
  - Monitoring & Health checks: 2/2 passed
  - Bcrypt & Scrypt KDF migration security: 5/5 passed
  - Auth API validations & Sessions: 11/11 passed
  - Google OAuth security & scope audits: 2/2 passed
  - Timetable constraint & generation solvers: 5/5 passed
  - Academic master data & pre-generation audits: 3/3 passed
  - Multi-perspective review & relational integrity: 3/3 passed
  - Empirical latency & solver performance benchmarks: 2/2 passed
- **Adversarial Red-Team Security Suite (`npm run test:security`)**: **20 / 20 Attacks Blocked / Verified**
- **High-Performance Solver Engine Suite (`npm run test:solver`)**: **Passed**
  - Small Workload (30 Allocations): p50 = 0.97 ms | p95 = 3.13 ms | Hard Violations = 0
  - Medium Workload (120 Allocations): p50 = 2.29 ms | p95 = 4.83 ms | Hard Violations = 0
  - Large Workload (300 Allocations): p50 = 6.99 ms | p95 = 8.58 ms | Hard Violations = 0
  - Stress Workload (600 Allocations): p50 = 8.87 ms | p95 = 10.82 ms | Hard Violations = 0
- **Benchmark Suite (`npm run benchmark`)**:
  - Bcrypt (Cost 12 Production): p50 = 426.88 ms | p95 = 447.51 ms
  - Bcrypt (Cost 10 Fast): p50 = 114.23 ms | p95 = 138.36 ms
  - Scrypt (N=16384, r=8, p=1): p50 = 43.38 ms | p95 = 60.85 ms
  - Legacy SHA-256 Verification + Bcrypt Upgrade: p50 = 367.75 ms
  - HTTP GET `/api/health/live`: p50 = 2.19 ms | p95 = 3.37 ms
  - Bitset Constraint Solver Engine: p50 = 0.18 ms | p95 = 0.41 ms
- **Health Check Endpoints**:
  - `GET /api/health/live`: `HTTP 200 {"status":"LIVE"}`
  - `GET /api/health/ready`: `HTTP 200 {"status":"READY"}`

---

## 3. Severity Matrix & Known Issues

- **Critical**: 0
- **High**: 0
- **Medium**: 0
- **Low**: 0
- **Release Blockers**: None.

---

## 4. Required Human Action

- **Google Workspace OAuth Provider**:
  - Status: **REQUIRES HUMAN ACTION**
  - Details: To enable live Google Single Sign-On in production, configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in deployment environment variables and register the redirect URI `https://<domain>/api/auth/google/callback` in the Google Cloud Console.

---

## 5. Immediate Next Actions

1. Monitor continuous application health via `/api/health/live` and `/api/health/ready`.
2. Maintain `PROJECT_STATE.md` and `/docs/` as living documentation across future feature iterations.


---

## 6. Current Session — Governance Baseline (2026-10-10)

### Change scope

- **REQUESTED SCOPE:** Add repository-level principal engineering agent instructions and evidence-based operating/release procedures.
- **IMPLEMENTED IN THIS BRANCH:** `AGENTS.md`, `CLAUDE.md`, `docs/engineering-operating-model.md`, `docs/release-gates.md`, `docs/runbooks/incident-response.md`, and `.github/pull_request_template.md`.
- **NOT CHANGED:** Application runtime code, database migrations, dependencies, production configuration, or deployment state.

### Verification evidence

- **VERIFIED:** The connected GitHub tool created the six files above on branch `chore/principal-engineering-operating-system`.
- **UNVERIFIED:** Typecheck, lint, tests, build, security/dependency scan, accessibility, performance, database schema/application state, backup restore, deployment health, and rollback behavior were not executed as part of this documentation-only change.
- **UNVERIFIED:** The historical test counts and benchmark figures in sections 2 and 3 have not been reproduced against the current commit in this session.

### Findings and risks

- **High / release risk pending verification:** Historical verification claims are not current evidence until rerun. This is a status/evidence gap, not proof that the application is broken.
- **Medium / repository consistency:** State references a migration file not present in the inspected main tree. Investigate migration history before changing schema.
- **Medium / scaling constraint:** Architecture documentation says exactly one application instance is required because working state is in memory. Preserve that deployment constraint unless a safe shared-state design is implemented and verified.
- **Pending human action:** Production Google OAuth configuration remains documented as requiring deployment-side credentials and provider configuration. Verify current status in the actual deployment before treating it as open or resolved.

### Immediate next actions

1. On the current branch/CI runner, install dependencies using the repository's established lockfile/package-manager workflow; investigate the coexistence of `bun.lock` and CI's `npm install` before changing package-manager policy.
2. Run the existing typecheck, test, security, solver, and production build commands and record exact outputs against the commit under test.
3. Reconcile migration history and `docs/DATABASE_ARCHITECTURE.md` with actual deployed schema/migration state; do not apply migrations until target environment and intended state are confirmed.
4. Reconfirm production deployment configuration, one-instance constraint, health checks, and rollback readiness with environment-level evidence.
5. Perform a fresh security review of auth, role/ownership checks, bootstrap data visibility, and any production credential exposure risk.
6. Update the layer table and release status only when each claim has new objective evidence.

## 7. Current Session — Login and Auth Repair (2026-10-30)

### Scope

- **REQUESTED SCOPE:** Diagnose and fix login errors across password, demo, restored-session, and Google sign-in flows.
- **NECESSARY SUPPORTING SCOPE:** Enforce the documented cookie-only session contract, reject cross-site state-changing requests, tighten CSP network sources, and make the existing verification harness work on Windows.
- **NOT CHANGED:** Database schema, dependency versions, deployment configuration, or production environment.

### Changes

- **VERIFIED IN CODE:** Authenticated users are reconciled by backend ID and email, with role and workspace fields read from the API response and membership state updated from the authoritative role.
- **VERIFIED IN CODE:** Session restore now checks `/api/auth/me` with the application cookie. Stale browser Supabase sessions no longer independently mark the app authenticated.
- **VERIFIED IN CODE:** Password and demo login use the same cookie-backed flow; login response bodies no longer expose session tokens.
- **VERIFIED IN CODE:** Google callback completion requires same-origin messages and a successful cookie-backed `/api/auth/me` check. Removed the hardcoded client-side fake-login fallback.
- **VERIFIED IN CODE:** State-changing cross-site `/api` requests receive `403 CSRF_ORIGIN_DENIED`; CSP `connect-src` is limited to same-origin and the configured Supabase endpoint.
- **VERIFIED IN CODE:** Test runner invokes the TSX CLI through Node on Windows; test-only demo mode is enabled explicitly. Logout coverage now exercises the session cookie.
- **VERIFIED IN CODE:** `PersistentStore.flushSync` no longer reaches into a private `FileBackend` field; the test-only token gate is exported from its dedicated module.

### Verification

- **VERIFIED:** `git diff --check` passed.
- **VERIFIED:** `pnpm run lint` passed.
- **VERIFIED:** `pnpm run build` passed; Vite reported the existing browser `crypto` externalization notice and a bundle-size warning.
- **VERIFIED:** Unit suite passed, 24/24.
- **VERIFIED:** Auth, session-cookie, CSRF, and CSP checks passed in the end-to-end audit, including logout revocation.
- **UNVERIFIED / FAILED GATE:** Full end-to-end audit passed 55/56 checks. The remaining failure was a timing benchmark: solver p95 62.23 ms against the existing 50 ms threshold. The benchmark varied substantially between runs; no threshold was weakened.
- **UNVERIFIED:** No production credentials, hosted deployment, real Supabase project, database migration, browser OAuth provider, or production session was exercised.

## 8. Current Session — Portal Sync and Runtime Repair (2026-11-17)

### Scope and changes

- **REQUESTED SCOPE:** Address the attached end-to-end audit of login/session stability, timetable persistence and cross-portal sync, demo reset, admin user APIs, HOD workspace, polls, and portal UI defects.
- **VERIFIED IN CODE:** The active legacy `server.ts` runtime uses `src/server/supabaseStore.ts` in memory; it is not wired to the documented modular `src/server/store.ts`. Added a versioned `legacy_academic_runtime` JSONB persistence document in `intellischedule.app_state`, with serialized writes and conflict/error responses. Production startup waits for DB-backed initialization before listening.
- **VERIFIED IN CODE:** Added server-validated class creation, wired manual slot entry to wait for the persisted result, replaced invalid form defaults with seeded entity IDs, and fixed equal timetable table columns.
- **VERIFIED IN CODE:** Added demo dataset reset, admin user/session endpoints, HOD department workspace and department sign-off endpoint. Final timetable approval remains Admin-only; Coordinator publication is supported as requested. HOD sign-off is recorded separately and cannot publish globally.
- **VERIFIED IN CODE:** Bootstrap refresh runs every 10 seconds and accepts empty arrays, student timetable visibility follows the published state, poll vote changes persist with per-user option state, and poll create/close endpoints persist to the shared store.
- **VERIFIED IN CODE:** Removed fake sample requests, student announcements/mentor/roll ranges/syllabus text, and attendance values. Syllabus completion/cancellation display is computed from session statuses; non-CSED course display codes now use department prefixes.

### Verification and live services

- **VERIFIED:** `npx tsc --noEmit --pretty false` passed after the current code changes.
- **VERIFIED:** `npm run build` passed; Vite reported the existing large-chunk warning.
- **VERIFIED:** Offline unit tests passed 17/17 (`password.test.ts`, `engine.test.ts`, `persistent_state.test.ts`).
- **BLOCKED BY SANDBOX:** Full `npm test` and HTTP integration tests could not connect to `127.0.0.1`; the OS returned `EACCES`, despite the local test server reporting that it was listening. The full suite timed out waiting for `/api/health/live`. The HTTP tests in the attempted direct subset failed for the same network restriction; these are not counted as product failures.
- **VERIFIED FROM RENDER CONNECTOR:** The Render service for `Uddeshya112/project` is `Tiet-timetable`, configured for one instance and auto-deploy from `main`; current live commit is `a2e1d9b`. There is no Render Postgres instance in the connected workspace. Recent Render application log retrieval returned 503, so production request logs were unavailable.
- **REQUIRES USER ACTION:** Vercel denied project access for team `uddeshya` (403). A single-use team consent link was generated; after approval, Vercel deployment/runtime checks can be retried. No Supabase management connector is available in this session, so Supabase project/database health and production data were not directly verified.
- **NOT CHANGED:** No deployment, environment variables, database schema, or remote branch was changed. All code changes remain local on `fix/full-e2e-sync`.

### Remaining gaps / release risks

- **UNVERIFIED:** No live browser-to-API-to-Supabase flow was completed; Vercel team access and direct Supabase inspection are still pending.
- **NOT IMPLEMENTED IN THIS SESSION:** Route-based URLs/deep-link Back/Forward navigation, PDF/CSV/ICS timetable exports, applying a winning poll to the timetable, dynamic What-If solver output, coordinator/faculty poll creation UI, and persisted approve/reject request decisions still need work.
- **REQUIRES REVIEW:** The compatibility persistence layer stores all legacy academic data in one JSON document and requires a single active app instance. The modular normalized store remains unwired; revisit this design before scaling.
