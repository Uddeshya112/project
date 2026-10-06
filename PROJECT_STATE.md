# PROJECT STATE — IntelliSchedule

**Institution:** Thapar Institute of Engineering and Technology (TIET)  
**Current branch:** `codex/full-hardening`  
**Base:** `main`  
**Status:** Hardening implementation in progress; production release must wait for CI and deployment verification.

## Completed on this branch

- Unified runtime around the PostgreSQL-backed `TimetableStore`; the obsolete in-memory `supabaseStore` was removed.
- Unified application authentication around PostgreSQL-backed `tt_session` cookies.
- Removed browser-side bearer-token/localStorage auth handling.
- Added exact CORS allow-listing, Helmet, bounded request bodies, and no-store API headers.
- Added persistent login/OAuth/password-change rate-limit buckets.
- Added persistent hashed, expiring, single-use password-reset tokens with session revocation.
- Bound Google OAuth state to a browser cookie and retained server-side single-use state.
- Enforced server-side roster/ownership checks for faculty cancellation, recovery, and voting.
- Scoped bootstrap/timetable data for students, CRs, and faculty.
- Replaced hardcoded `/api/me` and `/api/me/timetable` demo values with database-derived values.
- Removed client shipment of the large academic fixture module.
- Fixed DSATUR conflict-node parsing and unique-color saturation accounting.
- Replaced fixed solver benchmark scores and validator subgroup/utilization values with calculated metrics.
- Connected generator UI controls to the real backend request and persisted routine version numbers.
- Blocked approval/publication of incomplete timetables.
- Fixed Docker/Node 22 deployment assumptions and added a Vercel API rewrite for same-origin session cookies.
- Replaced the vulnerable npm `xlsx@0.18.5` package with the security-maintained `@keep-lts/xlsx@0.18.6`. citeturn565165search0turn565165search1
- Added mainline CI for typecheck, tests, solver/security suites, and production build.
- Removed stale hardcoded demo credential values from the client and current server runtime path.

## Remaining verification

- CI must finish successfully on pull request #1.
- The deployment environments must be configured with `DATABASE_URL`, verified `DATABASE_SSL_CA`, `ALLOWED_ORIGINS`, and production password-recovery mail settings.
- Historical Git history may still contain compromised credentials; those secrets must be rotated externally even after source cleanup.
- The remaining frontend CRUD helpers still need a final transactional UX pass so failed server writes cannot leave stale optimistic state in memory.

## Pull request

PR #1 — **security: complete backend and scheduler hardening**

This branch is intentionally not merged until the automated verification is green.