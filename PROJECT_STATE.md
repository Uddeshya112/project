# Project state

Last updated: 2026-10-06.

## What works

- Academic setup: academic year (working days, periods, lunch), departments, programs, courses, faculty, rooms, groups and subgroups, course allocations, soft-constraint switches. Bulk load through the Excel master workbook (parsed in the browser, validated and committed by the server).
- Timetable generation with the built-in engine (default: a student-focused and a faculty-focused routine), manual move / swap / add / lock with server-side hard-constraint checks, numbered versions, restore, review status, approve and publish.
- Published timetable for students, class representatives and faculty; class cancellation with proposed make-up slots; class polls; notifications.
- Sign-in with Google (roster-gated) or password; Users & Roles administration; audit log.
- Persistence in Supabase Postgres; local development and tests on embedded Postgres.

Details: [docs/system-design.md](docs/system-design.md), [docs/architecture.md](docs/architecture.md).

## How it is checked

- `npm run lint` (type check) and `npm test` (engine tests and API tests on embedded Postgres). See [docs/testing.md](docs/testing.md).
- There is no CI configuration and no browser end-to-end test in the repository. The React UI is checked by hand.

## Known limits

- **One instance only.** The API keeps a working copy of the data in memory. A second instance would hit version conflicts (its writes fail with 409 and it reloads). Rate-limit counters are also per process. Run with e.g. Cloud Run `--max-instances 1`; that is the scaling ceiling.
- **The solver blocks the event loop.** Generation runs on the request thread with a total budget of at most 3 s per request (shared by its routines), so other requests wait for up to that long. The staff-only benchmark endpoint runs about 2.6 s of solver budget and is limited to once per 10 s per user.
- **No email delivery.** Forgot-password only tells users to use Google sign-in or ask an admin; admins reset passwords in Admin -> Users & Roles. Notifications are in-app only.
- **Excel import is all-or-nothing.** One bad row rejects the whole workbook (the first 50 errors are listed). The request body limit is 10 MB.
- **Sample data and demo mode are on by default** (`SEED_DEMO_DATA`, `SEED_SAMPLE_USERS`, `DEMO_MODE`). With demo mode on, anyone can sign in as the demo College Admin. See [docs/DEMO_ACCOUNTS.md](docs/DEMO_ACCOUNTS.md).
- Every signed-in user receives the full academic dataset from `GET /api/academic/bootstrap` (faculty names and emails, rooms, all sections' sessions). The student roster and audit log are staff-only. The portals filter the timetable to the user's own section or classes in the browser.
- Each save rewrites every changed JSON document in full, and every timetable version stores a full copy of its sessions. Nothing is pruned.
- Faculty accounts are matched to the faculty roster by email, or by a `facultyId` link an admin can set in Admin -> Users & Roles. The sample staff accounts are pre-linked to sample faculty records (a.sharma -> fac-0001, p.gupta -> fac-0002, kn.murthy -> fac-0003, s.roy -> fac-0004).
- Health scores of generated versions come from the engine's penalty formula; versions created by manual edits use `calculateHealthScore` in `recoveryEngine.ts`. The two are not directly comparable.
- The audit log stores the actor's display name, not the user id.

## Before going live

Follow [docs/runbooks/deploy.md](docs/runbooks/deploy.md). In short: Supabase project and pooler URI, Google OAuth client, `APP_URL`, `TRUST_PROXY=1`, `DEMO_MODE=false`, sample passwords changed (or a fresh database without sample users plus `BOOTSTRAP_ADMIN_EMAIL`), one instance, backups checked ([docs/runbooks/backups.md](docs/runbooks/backups.md)).
