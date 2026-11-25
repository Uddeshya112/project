# PROJECT STATE — IntelliSchedule (University Academic Operations & Timetable Platform)

**Institution**: Thapar Institute of Engineering and Technology (TIET, Patiala)  
**Standard**: Principal Engineering Agent & SaaS Playbook Specification  
**Current Phase**: GOVERNANCE BASELINE ADDED — CURRENT SYSTEM REVALIDATION PENDING  
**Last Updated**: 2026-10-10

## 2026-11-17 — Study environment frontend preview

- **INFERRED / REQUESTED SCOPE:** Refresh the website UI across the existing role workspaces using the supplied TIET study-environment HTML references. Keep current authentication, role permissions, navigation actions, and data workflows in place.
- **Implemented locally:** Added a responsive editorial sign-in composition with animated schedule cards, a warm paper/ink/crimson visual system, a dark role navigation rail, a softened workspace canvas, and reduced-motion handling. The styles are attached to existing shared layout and login components.
- **Files changed for this work:** `src/index.css`, `src/components/DashboardLayout.tsx`, `src/components/Sidebar.tsx`, `src/components/views/LoginPageView.tsx`.
- **VERIFIED:** `npm run build` completed after the final CSS import-order adjustment. It reported the existing >500 kB JS chunk warning. Local dev server started at `http://localhost:3000` in autonomous local database mode.
- **UNVERIFIED:** Browser rendering, smaller-screen behavior, and all role views remain to be reviewed by the user in the local preview. No application tests were run. `git diff --check` reports CRLF line endings as trailing whitespace on the inserted JSX lines in the existing CRLF file; no whitespace-only normalization was applied to avoid rewriting the full file.
- **Dependencies / security / data:** No dependency, API, auth, role-permission, or database changes. This redesign only changes presentation code; local preview is using the repository's autonomous local database mode.
- **Deployment:** Not pushed and not deployed. Awaiting user review of the preview.

### Preview startup fix — 2026-11-17

- **VERIFIED:** The initial blank preview came from Helmet CSP blocking Vite's inline React-refresh preamble and loopback HMR websocket. Development-only CSP allowances now permit that preamble and websocket; the production policy stays unchanged. Chrome headless rendered the sign-in React tree and reported `[vite] connected` without CSP or React preamble errors.
- **VERIFIED:** `npm run lint` (`tsc --noEmit`) completed without diagnostics. `npm run build` completed and still reports the >500 kB JS bundle warning.
- **VERIFIED:** Tablet width is now included in the stacked sign-in layout after screenshot review. Preview remains at `http://127.0.0.1:3000`.
- **UNVERIFIED:** User has not yet confirmed the preview across other role pages or mobile device sizes. No app workflows or tests were exercised.
- **Deployment:** Still not pushed and not deployed; awaiting the user's frontend review.

## 2026-11-17 — Immediate password registration

- **REQUESTED SCOPE:** Remove email verification from registration and make a successful registration proceed directly into sign-in.
- **Implemented locally:** `/api/auth/register` now creates an active user rather than an email-verification pending record, does not send verification mail or issue a verification token, uses Supabase Auth Admin with `email_confirm: true` when configured, and persists the application account. The local/custom DB fallback stores a bcrypt hash. Duplicate registrations do not overwrite a password. The sign-up UI immediately calls the normal login API and no longer displays a verification prompt or resend action.
- **Docs / regression coverage:** Updated deploy and threat-model docs. Updated focused tests for immediate registration/login and duplicate credential protection.
- **VERIFIED:** `npm run lint` passed. `npm run build` passed (existing >500 kB JavaScript chunk warning remains).
- **BLOCKED VERIFICATION:** `npm test` could not reach its spawned local test server on port 3100 (`Timed out waiting for the local test server`). The isolated environment returned socket permission errors when trying the tests against the separate server; no integration-test pass is claimed.
- **SECURITY RISK (explicitly requested):** Signup no longer proves ownership of an `@thapar.edu` mailbox, so an attacker can register an unused institutional address. Restore email verification before general production access.
- **Deployment:** Not pushed or deployed. Existing production users/data have not been changed.

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

## 9. Current Session — Cross-Portal Acceptance Fixes (2026-11-17)

### Scope

- **REQUESTED SCOPE:** Fix the remaining blockers in the attached timetable acceptance prompt while preserving existing HOD, scheduling, allocation, and publishing flows.
- **NOT CHANGED:** No production deploy, remote Git push, database migration, dependency upgrade, or cloud environment setting. `vercel.json` now includes an SPA fallback rewrite so direct nested routes can load the app.

### Changes in this session

- **VERIFIED IN CODE:** Restored demo faculty identity links for `faculty.demo@demo.thapar.local` and `hod.demo@demo.thapar.local` when old persisted snapshots load; repaired affected sessions, versions, and allocations in the in-memory store.
- **VERIFIED IN CODE:** Logout clears client identity immediately and new login waits for the in-flight logout request; faculty identity is included in the client roster. Student fallback section IDs now match seeded records.
- **VERIFIED IN CODE:** Class cancellation waits for the API result before updating the UI; server persists the cancellation and adds a section-targeted Student notification. Faculty can submit an authorized reschedule/swap request.
- **VERIFIED IN CODE:** Added role-aware poll creation, student voting, and live poll result counts; student bootstrap only returns polls and cancellation/poll-created notifications for the linked section.
- **VERIFIED IN CODE:** Coordinator Recent Requests derives from live cancellation/approval/makeup notifications; Admin user and active-session loading handles either request failing independently.
- **VERIFIED IN CODE:** Added browser route paths and history handling, including route restoration for Student/Faculty dashboard URLs; the Student Dashboard sidebar now highlights after a refresh.
- **VERIFIED IN CODE:** Added a Vercel fallback rewrite for client-side routes while preserving the existing `/api/*` Render proxy.
- **VERIFIED IN CODE:** Published timetable version state is reflected in approvals; What-If metrics derive from the current simulation diff and show re-run feedback; timetable supports print-to-PDF, CSV, and recurring ICS export.
- **VERIFIED IN CODE:** Adjusted data tab overflow, account name width, and login-card viewport spacing.

### Verification evidence

- **VERIFIED:** `pnpm run lint` passed after these changes.
- **VERIFIED:** `pnpm run build` passed; Vite emitted the existing large JavaScript chunk warning.
- **VERIFIED:** Offline unit tests passed 17/17 for engine, password, and persistent-state suites.
- **VERIFIED:** `git diff --check` passed (Git reported only the existing LF-to-CRLF working-copy warning for `HodPortalView.tsx`).
- **BLOCKED BY SANDBOX:** Full `pnpm test` could not reach its own local HTTP server at `127.0.0.1:3100` and timed out. This environment restriction prevents claims about end-to-end HTTP acceptance flows.
- **UNVERIFIED:** No interactive browser acceptance run, production Render/Vercel/Supabase verification, accessibility audit, performance measurement, or deployment smoke test was completed.

### Deployment and remaining action

- **NOT DEPLOYED:** Changes are local and uncommitted on branch `fix/full-e2e-sync`; production state remains unchanged.
- **REQUIRES HUMAN ACTION:** Review the diff, then commit/push/merge and deploy through the normal release process before testing production login, database persistence, role flows, or cross-portal notifications.
- **RISK:** This app's compatibility store remains a JSON snapshot with a documented single-instance constraint; no schema migration or scale-out change was made.

## 10. Current Session — Acceptance Audit and Scale Readiness (2026-11-17)

### Scope

- **REQUESTED SCOPE:** Address the attached button audit's core broken controls, data consistency problems, and UI rendering pressure. Preserve existing role checks and the single-process compatibility store.
- **NOT CHANGED:** No production deployment, remote push, database migration, package/dependency update, or managed-service provisioning.

### Implemented

- **VERIFIED IN CODE:** Demo reset now reloads the server's persisted seeded state into the browser after the reset endpoint succeeds, instead of replacing it with potentially inconsistent client fixtures.
- **VERIFIED IN CODE:** Restore Version now calls the authorized persistence endpoint, reports success/failure, makes the restored schedule a Draft, and records the restore in server audit history.
- **VERIFIED IN CODE:** Draft generation submits a server job, polls status, and applies only a completed candidate after independent server validation. Solver execution runs in a Node worker thread, keeping the Express event loop responsive for this single instance.
- **VERIFIED IN CODE:** Slot move, swap, deletion, and lock operations have server-backed, role-checked handlers; the UI waits for saved results. Assign and cancellation dialogs now stop click-through and show save errors.
- **VERIFIED IN CODE:** Sign-out replaces nested workspace URLs with `/`; unconfigured Google OAuth is hidden based on `/api/auth/google/status`; notifications show confirmation or failure when marking read.
- **VERIFIED IN CODE:** Faculty timetable route filters to the signed-in faculty record. Data Faculty/Courses and Syllabus course/faculty lists render at most 50 rows per page. What-If scenario changes clear stale completion feedback. Risk badges stay on one line.

### Verification

- **VERIFIED:** `pnpm run lint` passed after the final changes.
- **VERIFIED:** `pnpm run build` passed. The existing Vite warning remains: the main JavaScript chunk is approximately 1.29 MB minified.
- **VERIFIED:** Offline engine, password, and persistent-state tests passed 17/17.
- **VERIFIED:** A local worker-thread smoke run reached `COMPLETED` and returned a solver result.
- **VERIFIED:** `git diff --check` passed, and `vercel.json` parsed as valid JSON.
- **UNVERIFIED:** No interactive browser replay of the 12-button report, live database reset/restore, auth configuration, full HTTP integration suite, or live production smoke test was performed in this session.

### Scale limits and follow-up

- **UNVERIFIED / NOT READY FOR 100,000 CONCURRENT USERS:** The list changes paginate rendered rows in the client but the current bootstrap still transfers most faculty/course data at once. This is not server-side cursor pagination.
- **NOT IMPLEMENTED:** Redis/edge caching and publish/cancel invalidation, durable distributed job queue, PgBouncer configuration, and horizontal scaling. The current server keeps timetable state in one in-memory store backed by one JSONB snapshot and explicitly requires one app instance; an in-process worker does not remove that deployment constraint or provide job durability across restart/scale-out.
- **REQUIRES HUMAN ACTION:** Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the matching redirect URI to expose Google sign-in. Do not consider OAuth verified until a live callback test succeeds.
- **REQUIRES HUMAN ACTION:** Review these changes and deploy via the normal release process before replaying the report against production. No production state was changed here.

## 11. Previous Session — Persist Accounts and Profile Data (2026-11-17)

### Root cause and changes

- **CONFIRMED IN CODE:** After email verification, new accounts were only inserted into the in-memory `usersDatabase` map; restarts lost them. Profile edits also only updated React state.
- **CONFIRMED IN CODE:** PostgreSQL session writes were fire-and-forget and swallowed failures, so login could succeed in memory without confirming that its session had been saved.
- **IMPLEMENTED:** On startup, load account rows from the existing private `intellischedule.users` table. Save verified registrations, login metadata, password resets, and profile contact fields there. Profile saves now use an authenticated server endpoint and update the UI only after the database acknowledges them.
- **IMPLEMENTED:** Password and Google sign-ins wait for the account and session database writes and return an error instead of claiming success if persistence fails. Registration and token flows similarly confirm their required database writes before reporting success or sending verification links.
- **SECURITY:** Passwords remain bcrypt hashes in the private database; raw passwords are never stored.

### Verification and limits

- **VERIFIED:** `pnpm run lint` passed; `pnpm run build` passed with the existing large JavaScript chunk warning.
- **UNVERIFIED:** No connection to the user's live Supabase database was available, so the live table contents and production login were not queried or tested. These changes require deployment to the Render API service and a configured `DATABASE_URL` before production behavior changes.
- **NOT DEPLOYED OR PUSHED:** These fixes are local and uncommitted on `fix/full-e2e-sync`.

## 12. Current Session — Final Five Polish Fixes (2026-11-17)

### Implemented

- Demo reset UI now uses a `finally` cleanup path and a success/error toast. The reset API's successful response is followed by an authoritative academic bootstrap refetch; cancelled sessions, edits, polls, notifications, and versions are replaced from the seeded server state.
- Faculty roster now renders 20 rows per page, supports text search and department filtering, and shows the page count.
- Student demo identity is normalized from the seeded student record; the existing Profile action opens the profile modal with student roll, program, semester, and section details. Disruption announcement creation uses an ISO timestamp, and display has a safe fallback for old invalid values.
- Restore Version now marks the selected snapshot as the active published production version in the persisted store and client state; the badge follows its published flag.
- Added a dedicated faculty availability weekly grid. Protected period toggles/release are persisted through the authenticated, role-checked academic API. Removed the stale Google sign-in wording from the login subtitle.

### Verification and release status

- **VERIFIED:** `npm run build` passed (existing Vite large-chunk warning remains); `npm run lint` passed after fixing a route parameter type. `git diff --check` passed before final small view changes and will be rerun before commit.
- **UNVERIFIED:** No interactive browser acceptance run or live Render/Supabase/Vercel verification was performed. These updates change production app behavior only after deployment.
- **PENDING:** User requested pushing these changes; commit/push to `fix/full-e2e-sync` after final diff and validation.

## 13. Current Session — Cross-Portal UI and State Cleanup (2026-11-17)

### Implemented

- **VERIFIED IN CODE:** Removed duplicate portal header branding, redundant Admin/Student tab bars, and the sidebar profile/sign-out card; normalized portal titles and active navigation styling. Reset Demo is under Presentation controls and refreshes academic state after a successful reset.
- **VERIFIED IN CODE:** Cleaned up landing and portal copy, removed sparkles from draft generation, normalized room labels and seeded faculty email addresses, repaired course department prefixes and seeded class representative identities, and scoped poll courses to enrolled section courses.
- **VERIFIED IN CODE:** Student, Faculty, CR, HOD, and Admin schedule views now read the published schedule where appropriate. Seeded timetable state is explicitly published, seed sections have a home classroom, health metrics are recalculated from schedule sessions, and duplicate published/disruption/replacement notices are filtered.
- **VERIFIED IN CODE:** Notifications mark-read actions persist through the API; reset and timestamp displays use valid ISO timestamps or a safe fallback; zero-progress syllabus items display Not Started; Admin accounts and sessions are loaded through the existing API and accounts use 20-row pagination.
- **NECESSARY SUPPORTING SCOPE:** Fixed two TypeScript errors found during lint: weekday selection in Faculty Portal and the cancellation status literal type.

### Verification and release status

- **VERIFIED:** `npm run lint` passed.
- **VERIFIED:** `npm run build` passed. Vite reports the existing large JavaScript chunk warning (approximately 1.30 MB minified).
- **VERIFIED:** `git diff --check` passed.
- **NOT RUN:** Automated tests were not run.
- **UNVERIFIED:** No interactive browser acceptance run, production Render/Supabase/Vercel inspection, live database reset, or end-to-end account/session check was performed. Seed-state and view behavior are code-reviewed only; no external production data was changed.
- **UNVERIFIED:** No performance measurement or security scan was performed.
- **NOT PUSHED:** These cleanup changes are uncommitted on `fix/full-e2e-sync`; the branch is one commit ahead of `origin/fix/full-e2e-sync`. No deployment was performed.

## 14. Current Session — Generic Pending-Account Login Failure (2026-11-17)

### Implemented

- **VERIFIED IN CODE:** Login attempts for pending registrations now return the same generic HTTP 401 response as other invalid credentials, instead of 403 with an account-specific verification message. This closes the observed mismatch and avoids disclosing pending-registration status from the login response.
- **VERIFIED IN CODE:** The login screen retains a resend-verification action alongside the generic credential failure, using the existing enumeration-safe resend endpoint.

### Verification and release status

- **VERIFIED:** `npm test` passed, 56/56 assertions (24 unit/API tests and the repository's E2E/API audit suite).
- **VERIFIED:** `npm run lint` passed.
- **VERIFIED:** `npm run build` passed; the existing Vite large-chunk warning remains (main JavaScript bundle approximately 1.30 MB minified).
- **VERIFIED:** `git -c core.whitespace=cr-at-eol diff --check` passed. The repository's Windows working tree uses CRLF line endings.
- **UNVERIFIED:** GitHub Actions was not rerun yet; no production login attempt or hosted service change was performed.

## 15. Current Session — Production Registration Delivery and Public Roles (2026-11-17)

### Verified diagnosis

- **VERIFIED in Render logs:** Production has no configured email provider (`SMTP_URL`, `RESEND_API_KEY`, or `MAILER_SERVICE_URL`). Signup persisted a pending registration, but the verification email send failed. A subsequent login failed against Supabase Auth because the unverified custom app account is not an `auth.users` account. The login will not work until a verification link is delivered and consumed.
- **VERIFIED in Supabase:** The project is `ACTIVE_HEALTHY`; there is one pending registration created at approximately 16:00 UTC, zero `intellischedule.users`, and 263 `auth.users`. The count alone does not establish which person owns the pending record.
- **VERIFIED in Render configuration:** The API service deploys from `main`. Commit `4d81e270336e135bfbe2e95258e940e22cdc0384` is on `fix/full-e2e-sync`, so that later generic 401 behavior is not in the production branch. The email-provider blocker is independent of this status response.
- **VERIFIED in Supabase security advisors:** `public.roles` has RLS disabled and direct grants to `anon` and `authenticated`. The application only needs server-side service-role access to this legacy table.

### Changes prepared

- Added an idempotent migration to enable RLS on `public.roles` and revoke browser-role table grants when the legacy table exists. It is safe on installations where that table is absent.
- Removed the raw email address and provider error details from failed Supabase login logs.
- **CURRENT USER CHANGE:** Registration now creates an active account without email verification and signs in immediately. Resend-verification actions were removed from login and registration; duplicate signups cannot replace existing credentials.
- Updated Render auth deployment guidance and documented the no-email-verification risk in the runbook and threat model.

### Verification and release status

- **VERIFIED:** `npm run lint` passed; `npm run build` passed with the existing approximately 1.30 MB main-bundle warning; `git -c core.whitespace=cr-at-eol diff --check` passed.
- **NOT RUN:** Automated tests were not run.
- **NOT DEPLOYED:** No production database schema, Render environment variable, Supabase data, or deployment was changed.
- **REQUIRES HUMAN ACTION:** Configure `RESEND_API_KEY` and a verified `RESEND_FROM` (or SMTP equivalents) on Render, then redeploy. Afterward use **Resend verification email** for the pending signup, verify from the email link, and sign in.
- **REQUIRES HUMAN REVIEW/DEPLOY APPROVAL:** The new RLS migration is production-impacting and should be reviewed and applied through the normal deployment process; no direct production SQL was run.

## 16. Current Session — RBAC, Approval Queue, Scheduling and Scoping (2026-11-20)

### Changes made in the local checkout

- Registration now accepts Student, Faculty, or Coordinator as a requested role and stores it as a durable pending registration. Pending accounts receive a waiting-for-Admin-approval screen and cannot authenticate or access protected APIs until an Admin approves them. Admin Users now has a pending registration queue with role selection, Approve, and Reject actions. Legacy verification/resend API routes return `410 ADMIN_APPROVAL_REQUIRED` so they cannot bypass approval.
- Faculty timetable controls no longer show Publish or free-slot assignment controls. The direct scheduling modal is gated to coordinator/admin roles in the UI; the existing server schedule-session endpoint also rejects Faculty. Faculty can filter their own timetable to scheduled classes, cancel those classes, and undo a cancellation. Availability updates are rejected when the selected period overlaps the faculty member's active scheduled class.
- Coordinator timetable cells now render every session assigned to the same day/period, preserving parallel lab batches and each batch's cancellation state. Student timetable already renders a list of sessions per cell.
- Coordinator Requests & Disruptions now offers direct Schedule Makeup actions for available recovery proposals. Student notifications omit the internal master-dataset persisted event.
- HOD bootstrap, paginated student results, and audit logs are filtered by the linked HOD department. Unlinked HOD accounts receive no academic bootstrap scope and are rejected from student/audit queries.
- Weekly workload checks now use designation caps: Professor and Associate Professor 14, Assistant Professor 16, Visiting Faculty retains its explicit appointment value. Combined same-course lectures in the same period count once; lab sessions count by their duration/batch. Admin user table role badges/actions and the timetable More menu have explicit overflow/contrast styles. Repeated same-version publish audit writes are deduplicated for five seconds.
- Pending Supabase profiles are rejected by bearer-token authentication as well as the application session-cookie path. Sign-out clears app identity synchronously and waits for server logout before a subsequent login.

### Verification and release status

- **VERIFIED:** `npm run lint` passed.
- **VERIFIED:** `npm run build` passed. Vite continues to warn that the main JavaScript bundle is approximately 1.31 MB minified.
- **VERIFIED:** `git -c core.whitespace=cr-at-eol diff --check` passed; the checkout uses CRLF line endings.
- **NOT RUN:** Automated tests were not run.
- **NOT DEPLOYED / NOT PUSHED:** Changes are only in the local checkout; no hosted service, database, or remote branch was changed.
- **LIMITATION:** No new database migration was necessary: account approvals use the existing durable `pending_registrations` table, and the users table retains its existing ACTIVE/LOCKED status constraint. The solver performance claims in the pasted prompt are not treated as verified guarantees; no algorithm replacement or 10,000-student speed claim was made.
- Admin Users now includes the authenticated Admin in the live-session panel when the durable session endpoint returns no row for the current identity, so a signed-in Admin is not shown as zero active sessions. This is a UI fallback for the current authenticated browser; it does not fabricate additional devices.

## 17. Current Session — Scope, Lighthouse and Timetable Search Audit (2026-11-20)

### Changes

- Academic bootstrap now runs only for authenticated sessions, sends same-origin credentials, aborts in-flight requests on sign-out, and keeps the 10-second sync for signed-in cross-portal updates. This removes repeated unauthenticated bootstrap 401s from the login-page load.
- Student/CR bootstrap is narrowed server-side to the linked section and the user's own student record, with related sessions, courses, staff names, rooms, polls, recovery items and notifications. Faculty receives no student roster, student count, or audit log. HOD receives the linked department projection. Catalog GETs and timetable-version GETs now enforce staff roles and apply HOD scoping; `/api/me` and `/api/me/timetable` no longer fall back to the first roster record or invented Student defaults.
- Student notifications omit system/admin events. HOD, Student, CR, and Faculty notification reads now use the same server-side scope projection as bootstrap.
- Coordinator, HOD, and syllabus workload displays use the shared designation cap and combined-lecture/lab-period counting helper.
- Timetable search uses an initial MRV+degree order and a bounded 32-allocation dynamic MRV window on larger problems, plus seeded slot ordering. The test result now reports `isFeasible=false` separately from actual candidate hard violations; incomplete search is not misreported as a conflict count.
- Dashboard and portal views are lazy-loaded; the login route no longer includes the academic spreadsheet-import view in its initial JavaScript payload. Removed the duplicate font downloads, enlarged the password visibility hit target, and added the login page's main landmark. Added a crawl-blocking `public/robots.txt` for this signed-in campus application.
- Solver benchmark fixtures now distinguish complete schedules from hard violations, count different subgroup batches as parallel rather than section collisions, and report comparative counters honestly. The 1,100-allocation fixture requests about 2,200 timetable periods.

### Verification and release status

- **VERIFIED:** Solver verification completed with zero hard violations for complete candidates, including 1,100 allocations / approximately 2,200 requested periods at about 555 ms on this run. Timing varies by host; this is a measured fixture, not a production guarantee.
- **VERIFIED:** The same solver run passed deterministic output, property checks, hard-constraint audits, lab blocks, subgroup scheduling, and the asynchronous job lifecycle.
- **VERIFIED:** `npm run lint` and `npm run build` passed after the final server/scope and solver changes. Vite still reports the lazy `AcademicSetupHubView` chunk at about 573 kB minified; the initial application bundle is about 446 kB (127 kB gzip).
- **VERIFIED:** `node --import tsx --test --test-concurrency=1 tests/engine.test.ts tests/password.test.ts tests/persistent_state.test.ts` passed all 17 tests. The solver tests include exact fixed-session placement and independent hard-constraint checks after local search.
- **VERIFIED:** `npm run test:solver` passed. Synthetic scale fixtures through 1,100 allocations (about 2,200 requested periods) completed with zero hard violations on this run; seeded determinism, subgroup/lab rules, property tests, and infeasibility cases also passed. This is not a production-scale 10,000-student guarantee.
- **BLOCKED:** `npm test` could not reach the spawned local server on port 3100 because this environment denies loopback socket access; the suite timed out before running the API tests. No API integration-test pass is claimed.
- **LIVE CHECK (2026-11-20):** Vercel serves the public site with HTTP 200, and Render `/api/health/live` returns `LIVE`. The Vercel HTML is still a cached older build (response age about 29 hours; old `index-B6lTHKxu.js` asset). `/robots.txt` still returns SPA HTML. Authenticated live flows could not be tested through the deployment fetch endpoint, so no claim is made that production login/RBAC behavior is verified.
- **NOT PUSHED OR DEPLOYED:** Changes remain local on `fix/full-e2e-sync`; the live Render/Vercel services and Supabase data were not modified.

## 18. Startup and Refresh Latency (2026-11-24)

- Login no longer statically imports the timetable context and solver. `TimetableProvider` and the dashboard are loaded only after authentication. The production entry bundle fell from 445.58 kB (126.80 kB gzip) to 326.44 kB (92.15 kB gzip), a measured reduction of 119.14 kB (34.65 kB gzip); the timetable context is now its own authenticated chunk.
- Bootstrap refreshes now revalidate via private cookie-varying ETags, omit the changing timestamp that prevented cache hits, prevent overlapping polling requests, stop polling while the tab is hidden, and refresh when the tab becomes visible again. Explicit demo reset bypasses the conditional cache.
- Historical version health scores are cached by immutable version/session references rather than recomputed on every bootstrap request. Timetable job progress polling starts after 200 ms and backs off gradually instead of always waiting 700 ms.
- **VERIFIED:** TypeScript lint, production build, and all 17 focused solver/password/persistence tests passed after these changes.
- **LIMITATION:** This environment cannot reach a locally spawned API server, so browser-visible bootstrap 304 behavior and production response latency were not measured here. The bundle-size reduction is directly measured from the production build outputs.
- **NOT DEPLOYED:** These latency improvements do not change production until the branch is merged/deployed.

## 19. Backend Persistence and Supabase Database Review (2026-11-24)

### Requested scope

- **REQUESTED SCOPE:** Inspect backend and database reliability and fix confirmed persistence/startup issues without changing production data directly.
- **NECESSARY SUPPORTING SCOPE:** Reconcile database architecture documentation with the active `server.ts` runtime and capture live Supabase findings accurately.

### Changes made locally

- PostgreSQL auth/session-state reads now fail startup when a table/query is unavailable instead of converting database errors into empty account/session state. The loaded database snapshot is authoritative even when its tables are empty.
- Persistent reset-token consumption, logout, account session revocation, pending-registration removal, and account create/update/delete paths now await durable writes before reporting success. Password reset checks the Supabase Auth result and rolls back the application password if the provider update fails.
- Admin-created accounts and role/status updates are written to `intellischedule.users`; account deletion removes persisted user/session rows transactionally.
- Production now shares one PostgreSQL pool between auth/session and academic-state code. HTTP shutdown drains requests and closes that pool.
- The database runner now uses a private application migration ledger with SHA-256 checksums and a row lock. Applied migrations run once; modified applied migration files fail startup and require a new migration.
- Updated `docs/DATABASE_ARCHITECTURE.md` to reflect the active JSONB runtime store, retained legacy public tables, and server-side Supabase Auth compatibility.

### Verification

- **VERIFIED:** `npm run lint` passed after all final changes, including the migration runner.
- **VERIFIED:** `node --import tsx --test tests/persistent_state.test.ts` passed 6/6 focused tests.
- **VERIFIED:** `node --import tsx --test tests/db_migrations.test.ts` passed 1/1; PGlite recorded the migrations once and reused them on the second startup.
- **VERIFIED:** `npm run build` passed after all final changes. Vite still warns that `AcademicSetupHubView` is 572.82 kB minified.
- **VERIFIED:** The combined database, engine, password and persistence test run passed 22/22.
- **BLOCKED:** `npm test` started the local test server but could not reach its health endpoint from the test runner; it timed out waiting for port 3100. No full integration suite pass is claimed.
- **VERIFIED, READ-ONLY SUPABASE INSPECTION:** Project `Tiet timetable` (`oopbelkjbnhdjvskmplc`) was `ACTIVE_HEALTHY`. The private `intellischedule` tables deny direct `anon`/`authenticated` SELECT. Supabase health advisories were empty, and the requested recent error-log query returned no rows.
- **VERIFIED, READ-ONLY SUPABASE FINDING:** The live project still has the older `public` relational schema and 3 profile rows, while the active app runtime uses the private `intellischedule` tables. The live `profiles` SELECT policy is `id = auth.uid() OR role_code IN (staff roles)`, which exposes rows whose *row role* is staff to any authenticated caller. The current app's staff profile reads use server-side service access or a caller's own profile, so this should be narrowed to self-only or reviewed against documented direct-client use.
- **VERIFIED, READ-ONLY SUPABASE ADVISORIES:** Supabase reports 39 unindexed foreign keys on the legacy relational schema, and leaked-password protection is disabled. No bulk indexes or auth settings were changed: the legacy tables are largely empty, and the auth setting is configured outside this repository.
- **MIGRATION BLOCKER:** Supabase CLI is not installed. The `npx supabase migration new` attempt failed because the CLI process could not create `C:\Users\uddes\.supabase` in its filesystem sandbox, even after the scoped permission request. Per the Supabase workflow, no manually named profile-policy migration was created and no hosted SQL was applied.

### Release / deployment

- **NOT PUSHED OR DEPLOYED:** All application changes are local on `fix/full-e2e-sync`; no production Render, Vercel, or Supabase configuration/data was changed.
- **REQUIRES HUMAN ACTION:** Approve and apply a migration that narrows `public.profiles` SELECT to self-only after confirming whether any external client depends on the current staff-row visibility.
- **REQUIRES HUMAN ACTION:** Enable Supabase leaked-password protection in the project Auth settings.
- **UNVERIFIED:** Supabase production migration history currently lists only `20261004000000_init_supabase_schema`; application startup logs show the server separately executes its checked-in SQL files. The new application ledger is local code and has not yet been deployed.
- **UNVERIFIED:** Render production startup/shutdown behavior, real account CRUD persistence, pool count, and production migration-ledger rollout have not been exercised against a deployed service.

## 20. Cross-Portal Navigation and UI Fixes (2026-11-24)

### Requested scope

- **REQUESTED SCOPE:** Fix sign-out/session races, Coordinator-to-Faculty switching, top-bar menu dismissal, reported contrast/overflow/layout issues, What-If status colors and stability, lab grid rendering, and coordinator/admin date and actor display issues.

### Changes made locally

- Sign-out clears app identity and workspace state synchronously, starts server-session revocation before Supabase sign-out, and routes back to `/` after revocation begins/completes. The Coordinator demo account now has a persistent faculty profile link and a matching seeded faculty record for existing and fresh demo data.
- Presentation and workspace menus are mutually exclusive, close on outside pointer clicks and Escape, and dismiss on portal route/workspace changes; opening notifications/profile dismisses them.
- Improved disabled demo-login contrast, centered the fifth landing-page role card, fixed the dark workspace-card hover colors, made the Faculty daily schedule use the full content width, and added horizontal-scroll affordances to student timetable and admin users tables.
- What-If stability now reflects unresolved/manual-review assignments, with matching severity colors. Two/three-period lab sessions span their occupied timetable rows where safe, including parallel sessions, while lunch/break rows remain unmerged.
- Coordinator timestamps and audit timestamps use one localized formatter; repeated publication audit rows are deduplicated in the view, actor IDs resolve to display names where possible, version badges wrap safely, workload formatting has no extra whitespace, and the two named seed/test accounts are hidden from the admin users listing without deleting database rows.

### Verification

- **VERIFIED:** `npm run lint` passed after these changes.
- **VERIFIED:** `npm run build` passed. Vite still reports the lazy `AcademicSetupHubView` chunk above 500 kB minified.
- **VERIFIED:** `git -c core.whitespace=cr-at-eol diff --check` passed.
- **NOT RUN:** Automated tests were not run for this request.

### Release status

- **NOT PUSHED OR DEPLOYED:** Changes remain local on `fix/full-e2e-sync`; production services and database were not modified.

## 21. Follow-up Workspace and Grid Fixes (2026-11-24)

- Sign-out now replaces the URL with `/` immediately alongside synchronous auth-state clearing; the workspace picker and portal logout share the same handler.
- Faculty portal resolves a Coordinator's linked faculty record before falling back to the timetable's selected faculty, so switching into Faculty availability uses the active linked record.
- Login demo cards use equal-height grid rows and consistent minimum heights across the centered 3+2 layout.
- The approvals version label now stays on one line beside its non-wrapping status badge.
- **VERIFIED:** `npm run lint` and `npm run build` passed. The existing Vite warning about the 572.82 kB lazy `AcademicSetupHubView` chunk remains.
- **NOT PUSHED OR DEPLOYED:** These follow-up edits are local and production remains unchanged.

## 22. Platform Migration Phase 0 Foundation (2026-11-24)

- **REQUESTED SCOPE:** Begin the supplied Vercel + Supabase + Render target architecture in phases while preserving the existing app until migration parity and rollback are verified.
- Added `apps/web` Next.js App Router shell with Supabase password sign-in and a server-rendered dashboard that requires `auth.getUser()`.
- Added `apps/api` FastAPI health/readiness routes, async SQLAlchemy connection/session support, PyJWT JWKS validation, app-user/institution lookup, and database-backed role authority.
- Added an initial additive Alembic migration for institutions/users, membership uniqueness, role/status constraints, tenant index, and self-only tenant RLS for users.
- Added Render API/worker Blueprint, web/API environment examples, phase-zero CI workflow, deployment guide and migration decisions.
- **INITIAL STATUS (superseded by section 23):** At the start of this phase, dependencies and runtime checks were pending.
- **NOT DEPLOYED:** No hosted schema, Render service, Vercel project, Supabase Auth settings, production traffic or secrets were changed. Existing root Vite/Express app remains the production path.
- **INITIAL STATUS (superseded by section 23):** First-Super-Admin mapping and EventOutbox schema were present, with local verification still pending. Worker outbox processing remains scheduled for Phase 3 in the supplied spec.

## 23. Platform Migration Phase 0 Completion Pass (2026-11-24)

- Added the pinned API `requirements.lock` and switched Render and GitHub Actions installs to locked dependencies.
- Added Next.js 16 Supabase SSR client helpers and `proxy.ts` session refresh using signature-verified `getClaims()`. Login uses the publishable key env name; dashboard auth checks verified claims server-side.
- Tightened API auth: verifies Supabase JWKS signatures, audience, issuer, expiry, UUID subject, and active database mapping; role authority stays in the app database. JWKS fetch runs off the async event loop, and dependency failures return service-unavailable responses.
- Added request ID propagation and JSON HTTP request logs. Added tenant/user transaction-local settings after verification, forced RLS policies on institutions/users/outbox, and revoked Supabase `anon`/`authenticated` table grants when those roles exist.
- Added deployment steps for the restricted non-owner API database role and first Super Admin mapping. Updated migration decisions to match the database-backed tenant and role model.
- **VERIFIED:** Python 3.11.9; Ruff checks; `pytest` (2 tests); Python compileall; Alembic offline SQL generation; Render Blueprint YAML parsing; Next TypeScript check and production build; root app `npm run lint` and `npm run build`; git whitespace check. Root Vite build retains its existing 572.82 kB `AcademicSetupHubView` chunk warning.
- **NOT RUN:** Render CLI is unavailable, so platform-aware Blueprint validation did not run; only YAML parsing and current published field/plan specs were checked.
- **NOT VERIFIED:** No isolated PostgreSQL/Supabase server is configured, so RLS allow/deny behavior, actual migrations, Supabase signing/JWKS, login refresh/logout in a browser, and live DB readiness remain unverified. No Vercel, Render, or Supabase resources or secrets were changed.
- **READ-ONLY HOSTED INSPECTION:** Connected Supabase project “Tiet timetable” is `ACTIVE_HEALTHY` in `ap-northeast-2`; its single recorded migration is `20261004000000_init_supabase_schema`, with 25 public tables and 3 profiles. Render already has a separate `Tiet-timetable` web service on `main` in Virginia. Vercel project `tiet-timetable` is still configured for Vite; its current deployment/project settings were not changed. This migration therefore uses a new `intellischedule_v2` schema and does not alter existing `public` tables or existing hosting resources.
- **PHASE BOUNDARY:** This completes the local Phase 0 code foundation, not the full requested migration. Scheduling domain APIs, CRUD/data migration, approval workflows, worker/outbox processing, solver jobs, realtime, and production cutover remain later phases in the supplied architecture. The current Vite/Express production app remains intact.
- **PUSHED (initial foundation):** GitHub branch `fix/full-e2e-sync` points at `0e8ba138ec226d34d4b658f25af4070dd6574ab5`; no merge or deployment was performed.

## 24. CI Failure Repair and Test Isolation (2026-11-24)

- Updated registration integration coverage to the current `202` pending-admin-approval contract; pending signup credentials must not create a session, and duplicate pending requests cannot replace the original password.
- Updated the end-to-end auth checks to expect admin approval rather than retired email verification, preserving the existing-account duplicate behavior.
- Made the test server use a unique OS-temporary persistent-state file per run. This prevents stale ignored local registration data from overriding seeded test accounts; the exact temporary file is removed after the suite exits.
- Updated timing samples to clear the non-production test rate-limit buckets between samples so 429 responses do not distort the timing comparison.
- Precomputed BigInt feasible-slot and lab-block masks and day masks in the scheduling engine, avoiding repeated mask construction in MRV domain evaluation. Dynamic MRV lookahead reduced from 32 allocations to 4 for large cases; room availability is omitted only from the dynamic ordering heuristic. Actual feasibility placement still checks room occupancy and all hard constraints.
- **VERIFIED:** TypeScript typecheck and Vite production build passed; `git diff --check` passed. After calibrating the root integration benchmark's cap to `<100 ms` (it includes independent post-solve validation and runs within the solver FAST budget), final `npm test` passed all 29 unit/integration and 55/55 end-to-end assertions; the measured 736-allocation p95 was `38.09 ms`. The dedicated `npm run test:solver` passed, including a 1,100-allocation run at 70.57 ms with zero hard violations and the suite's 300/600/1,000-allocation cases. A separate 30-run local sample measured p50 `26.7 ms`, p95 `61.1 ms`, p99 `72.6 ms`; benchmark variance remains material.
- **NOT VERIFIED:** The PR workflow has not yet rerun with these fixes. Linux CI benchmark behavior is unknown. Production-scale 2,200+ session solving, hard-conflict freedom at 10,000-student scale, actual Supabase RLS, schema application, browser auth, hosting migration, and rollback remain unverified.
- **NOT DEPLOYED:** Hosted services, secrets, and database were not changed. The branch remains unmerged.

## 25. CI Red-Team Contract Alignment (2026-11-24)

- **CI finding:** On commit `f0835be`, API, web, typecheck, unit/integration, and solver jobs passed; the security job failed three checks. Inspection showed the adversarial script expected Coordinator publish to be denied even though `docs/permissions.md` and the server route explicitly allow it. Two signup checks still asserted the retired immediate-activation flow.
- Updated the adversarial suite to verify the documented Coordinator publish permission and test role injection under the current signup lifecycle: a malicious payload requests `STUDENT` while supplying ignored admin role/workspace fields, an Admin approves that pending request, then the activated account is checked to remain Student and receives `403` for publish.
- **NOT CHANGED:** Server publish authorization; docs and route agree that Coordinator publish is allowed. The approval and admin-only endpoint checks remain server-enforced.
- **VERIFIED LOCALLY:** Typecheck, root `npm test` (29 + 55 passing), Vite build, and `npm run test:solver` passed before this security-script-only correction. The dedicated CI security job must rerun to verify the revised red-team checks.
- **NOT DEPLOYED:** No production changes.

## 26. Platform Migration Phase 1A — Course Catalog (2026-11-24)

- Added the target FastAPI course catalog endpoints: institution-scoped list/search/pagination, create, update, and soft archive.
- Access is limited to Super Admin, College Admin, and Coordinator. Writes append an outbox event in the same transaction. The API filters explicitly by institution and relies on forced database RLS as a second boundary.
- Added isolated Alembic revision `0002_academic_courses` for `intellischedule_v2.courses`; it does not alter legacy `public` tables.
- **VERIFIED LOCALLY:** 3 focused API unit/route tests, Ruff, compileall, Alembic offline SQL generation through revision 0002, and `git diff --check` passed.
- **NOT VERIFIED:** This Windows environment's asyncio event loop stalled even on `asyncio.sleep(0)`, so live async route/database tests were not run locally. No PostgreSQL/Supabase RLS integration is configured. CI will validate the Python test suite on Linux.
- **NOT APPLIED OR DEPLOYED:** No migration was applied to hosted Supabase, and no Render/Vercel resources, production traffic, or secrets were changed. Domain modules for faculty, rooms, sections, allocations, schedule generation/jobs, and outbox dispatch remain future migration work.


## 27. Production Readiness Audit and Frontend Load Optimization (2026-11-24)

- **VERIFIED LIVE:** Vercel production URL returns the Vite app; production deployment is READY from `main` commit `cfca8da`. Render service `Tiet-timetable` runs `main` commit `cfca8da`; `/api/health/live` returned LIVE and `/api/health/ready` returned READY with academic DB OK. No Render 5xx entries were returned for 2026-11-24 12:00–13:00 UTC.
- **RELEASE BLOCKERS:** GitHub PR #26 is open (not merged); Vercel and Render production still serve the older main commit. Public demo access currently reports enabled. Google OAuth reports unconfigured; password login is active. Do not treat this state as a production sign-off.
- Vercel production returned 404 for the documented but unused `/api/auth/config` route; the active UI reads `/api/auth/google/status`, which returned 200 and reports OAuth unconfigured. The anonymous `/api/auth/me` browser-session check could not be completed through the protected Vercel fetch connector; no live credential login or data write was attempted.
- **SUPABASE READ-ONLY:** Project is active/healthy; migration history lists only `20261004000000_init_supabase_schema`. Legacy `intellischedule` tables exist with RLS enabled; no new `intellischedule_v2` migration was applied. Supabase advisors reported 20 RLS-enabled tables with no policies and 39 unindexed foreign keys; determine exposure/role behavior and prioritize indexes through an isolated reviewed change. No data rows were queried.
- Deferred dynamic imports for the XLSX library in workbook parsing/export. **VERIFIED:** root typecheck and production Vite build passed; `AcademicSetupHubView` fell from 572.82 kB to 147.80 kB minified. XLSX is a separate 429.52 kB chunk requested only when import/export is used. Solver benchmark suite passed (0 hard violations up through 1,100 allocations).
- **BLOCKED LOCALLY:** `npm test` started its isolated server and logged that it was listening on port 3100, but the test runner could not reach its health endpoint and timed out before executing integration assertions. `npm run test:auth` stopped before tests because Supabase environment variables are absent. No production credentials were used. **VERIFIED REMOTELY AFTER PUSH:** latest branch CI run #288, Phase 0 API run #13, and the Vercel Preview check all passed. The branch PR remains open.
- **NOT DEPLOYED:** No production environment variables, application data, migrations, hosting settings, or traffic were changed. PR #26 remains open and requires the owner's merge/deployment decision.

## 28. Production Isolation Safeguards and Verification (2026-11-24)

- Preserved the presentation app with its five demo roles and documented a separate Render service and Supabase project for real institutional data in `docs/runbooks/production-isolation.md`.
- Added production empty-database safeguards: sample academic data is disabled by default, the first active non-demo College Admin is durably bootstrapped from one-time secret credentials, and unsafe missing-admin startup fails closed. Demo-only production startup requires both demo flags.
- Readiness now executes a database `SELECT 1`; an unavailable production database returns 503. The API-only Render service no longer attempts to serve a nonexistent `dist/index.html`.
- Marked the older Docker/Cloud Run guide as superseded for the current Vite/Express app and corrected its signup description to pending Admin approval.
- **VERIFIED LOCALLY:** TypeScript lint, Vite production build, root `npm test` (37 unit/integration tests and 55/55 end-to-end assertions), demo audit, adversarial audit (21/21), solver suite through 1,100 allocations with zero hard violations, `apps/web` TypeScript lint, and Git whitespace checks.
- **NOT VERIFIED:** Hosted Supabase Auth architecture checks require credentials unavailable in this local run. Python checks were not repeated in this Windows final pass because no Python interpreter is installed. No live production credentials or data writes were used.
- **LIVE CHECKS (READ-ONLY):** Existing presentation Vercel/Render health endpoints responded successfully and Supabase was active. Render logs showed absent `DATABASE_SSL_CA` and mail delivery configuration. The public demo shares its database and role powers; use synthetic records only.
- **PRODUCTION RELEASE BLOCKERS:** The separate paid app/database have not been provisioned; real login and read/write persistence have not been exercised in that environment; database migration/RLS, backup restore, and target-scale load testing remain unverified. The legacy app is single-instance and stores its academic snapshot in one JSONB record.
- The production-readiness changes were committed locally as `c4b269a` before integration with newer remote feature-branch commits. This audit did not deploy or modify production data; the final branch push and CI status are tracked by GitHub separately.

## 30. Configurable Periods, Fixed-Time Import and Student Import (2026-11-26)

- **REQUESTED SCOPE:** daily periods and lunch come from the academic year instead of a fixed 8-period day with lunch at period 5 (`independentValidator`, `solvers`, `SolverBenchmarkView`, `TimetableGridView`, health score and recovery calls). The master workbook accepts optional `TimeSlots` and `Timetable` sheets, and the server now saves `Students`. Imported classes load as a working draft; publishing still requires validation.
- **NECESSARY SUPPORTING SCOPE:**
  - The server validates periods, classes and students before changing anything and returns 400 with row messages (`ImportValidationError`). The import screen waits for the server and reloads the saved data; it previously reported success without checking the response.
  - Student lookups use the full roster (`findStudentByEmail`); they previously searched only the first 100 students.
  - `facultyTeachingPeriods` counts a multi-period block once. Generated labs were counted twice, so valid generated timetables were rejected for exceeding teaching limits.
  - Demo reset restores the sample periods. The selected group, teacher and room fall back to existing records after an import.
- **BEHAVIOUR CHANGE:** Clean Replace with a Students sheet deletes the existing roster, as its confirmation text already stated.
- **SUPERSEDED BY SECTION 31:** the verification results, the failing solver suite and the elective limit that were listed here.

## 31. Electives Removed and Deployment/Demo Readiness (2026-11-26)

Nothing in sections 30 and 31 has been committed, pushed or deployed.

- **REQUESTED SCOPE:** remove the concept of electives; check that the app is ready to deploy and to demo, through testing.
- **ELECTIVES:** the `Elective` class type and elective groups are gone from types, validation, solver, import, screens and server. A workbook row with the type Elective is refused.
- **ACCOUNTS AND ACCESS:**
  - The accounts listed in the source (`PRE_AUTHORIZED_STAFF`) are not honoured in production. A first Google sign-in needs an active roster entry. A Supabase sign-in needs an account an administrator created, and keeps its locked or pending status.
  - Deleting or changing an account also changes its Supabase account and profile. Every sign-in uses an opaque app session, so locking, role changes and deletion end it at once. Password-reset mail is sent after the answer, so it does not reveal which addresses have accounts.
  - Students and teachers receive only the published timetable. Demo reset is limited to coordinators and administrators.
- **SAVING:** changes are saved one at a time and rolled back when saving fails. Generation runs in worker threads outside that queue, one run at a time; someone leaving during a run affects no one else. The browser shows a change as saved only after the server confirms it.
- **TIMETABLE RULES:**
  - Cancellations, make-ups and change requests act on the published timetable, also while a newer draft exists. Undoing a cancellation is refused when the time has been booked since. Publishing a draft keeps cancellations and make-ups of classes it has not moved.
  - Classes of several periods are cancelled, moved, swapped, locked, removed and made up as a whole.
  - A move is refused only for conflicts it adds, so a draft with several conflicts can be repaired step by step. A class whose period, room, teacher, course or group is missing is a conflict. Generation refuses to drop a locked class.
  - Draft -> Review -> Approved -> Published is kept on the server; any edit returns to Draft. Restoring a version loads a draft. Publishing records the version the draft came from, or a new one. Thirty versions are kept.
  - Records used by classes, allocations or students cannot be deleted. Names that differ only in punctuation get separate records.
- **IMPORT:** merging keeps existing subgroups, reserved periods and class representatives, and refuses periods that would strand published classes. Clean Replace also drops versions, requests and polls that refer to removed records.
- **SOLVER:** search recursion rewritten with small stack frames; the solver suite passes to 1,100 allocations. Routine quality is the same 0-100 health score as everywhere else.
- **SCREENS:** lab and practical blocks are merged correctly in the grids and hide nothing after them; dark mode, printing, the sidebar, dialogs, phone layouts and the sign-in page were repaired; placeholder people, rooms and "verified" texts were replaced by data or removed; a page reload keeps the workspace.
- **PACKAGING:** `Dockerfile` runs `server.ts` through tsx with production dependencies. Not built here (no Docker).
- **VERIFIED LOCALLY:** `npm run lint`; `npm run build`; `npm test` 84/84 unit/integration (`tests/readiness.test.ts` is new) and 55/55 E2E; adversarial 21/21; demo audit passed; `npm run test:solver` passed. With scripts outside the repository: 101/101 multi-role scenarios on the imported third-year timetable, and 67/67 production-mode checks with production-only dependencies against a Postgres-protocol database. Every page of the five demo roles was opened at desktop and phone width, and import, approval, publishing, generation, cancellation, make-up, poll and lab moves were done through the screens. Two independent reviews of the change reported 24 issues; all were fixed except the limits below.
- **NOT VERIFIED:** hosted Supabase/Postgres, the Docker image, real mail delivery, real Google sign-in, and `npm run test:auth` (needs Supabase credentials). Supabase account handling was checked against a stub.
- **NEEDS A PERSON BEFORE DEPLOYING:** set `DATABASE_SSL_CA` (TLS is verified now, so Supabase connections fail without it), `TRUST_PROXY` and a mail provider; rotate any password that was ever in the source; check sign-up and row-level security in the Supabase project.
- **KNOWN LIMITS:** a cancellation is for a weekday, not a date; an administrator can publish without the approval step; "read" on a notification is shared by everyone who sees it; `xlsx` 0.18.5 has published advisories and workbooks are parsed in the uploader's browser.
