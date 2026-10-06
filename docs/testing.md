# Testing

```bash
npm run lint   # tsc --noEmit
npm test       # tsx --test tests/engine.test.ts tests/api.test.ts
```

Tests use Node's built-in runner (`node:test`) through tsx. No database or network is needed.

## `tests/engine.test.ts`

Runs the scheduling engine on the sample dataset (`buildDemoDataset()`) and checks the result with the independent validator:

- every allocated hour is scheduled with zero hard violations
- local search lowers the soft penalty and keeps hard constraints
- the health score is not pinned to a floor at this size
- candidates differ, the seed matters, and the same seed gives the same result
- an odd-hour lab is still scheduled
- faculty unavailable periods are never used, including after local search
- locked sessions stay where they were pinned
- impossible input returns a diagnostic instead of failing silently

## `tests/api.test.ts`

Starts the real Express app (`createApp`) on an in-memory embedded Postgres (`pglite:memory`) with the sample data and accounts, then calls it over HTTP with a cookie-keeping client. It sets `NODE_ENV=test`, `INTELLISCHEDULE_NO_LISTEN=1` and `BCRYPT_ROUNDS=4` (fast hashing for tests only).

Covered:

- **Auth**: health endpoints expose nothing internal; everything else needs a session; wrong password and unknown email return 401; session cookie is HttpOnly and SameSite=Lax and no token is in the body; logout; all 12 sample/demo accounts and the 5 demo buttons work; per-account login rate limit; cross-site POST rejected; security headers; Google sign-in fails cleanly when not configured; forgot-password returns no reset token.
- **Roles**: a student gets the published timetable, no audit log or roster, and 403 on admin, coordinator and teaching endpoints; coordinators cannot publish.
- **Validation**: academic CRUD rejects bad input, duplicates and deletes of records in use; odd lab hours rejected; Excel import with one bad row changes nothing (422).
- **Workflow**: generate -> select routine -> publish (admin) -> students see exactly that version; moves into a clash return 422; lock works.
- **Recovery and polls**: faculty can cancel only their own classes; cancelling twice is refused; make-up options are proposed; the same option cannot be scheduled twice; one vote per student; notification read state is per user.
- **User admin**: create, duplicate (409), weak password (400), role change and lock sign the user out, admins cannot demote or delete themselves; profile updates cannot touch identity fields; password change.
- **Persistence**: a second store loaded from the same database sees the same data, versions, published timetable and audit trail (restart); a second writer with a stale copy fails instead of overwriting.

## Not covered

- No browser or UI tests; the React app is checked by hand.
- Google sign-in against real Google (only the "not configured" path is tested).
- Supabase itself: tests run on PGlite, which is Postgres compiled to WebAssembly, not on a Supabase instance.
- Load and performance.
- There is no CI configuration in the repository; run the commands above before deploying.

## Manual smoke test

```bash
npm run dev
curl -s http://localhost:3000/api/health/ready      # {"status":"READY"}
```

Then sign in with a demo button (or an account from [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md)), generate a timetable as Coordinator, publish it as Admin, and check the Student view.
