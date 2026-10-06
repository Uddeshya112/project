# Architecture

One Node.js 22 process (Express 5) serves both the JSON API under `/api` and the React 19 single-page app. There are no other services besides the Postgres database.

```
Browser: React 19 SPA (src/components, src/context)
   |  same-origin fetch, session cookie tt_session (httpOnly)
   v
Node 22 / Express 5 (server.ts)
   |- security headers, same-origin check, JSON body limit 10 MB
   |- src/server/auth.ts    sessions, password + Google sign-in, user admin   --> Postgres (direct queries)
   |- route guards           requireAuth / requireRole(...)
   |- src/server/store.ts   TimetableStore: in-memory working copy + business rules
   |     |- src/lib/optimizationEngine.ts   timetable generation
   |     |- src/lib/independentValidator.ts hard/soft constraint checks
   |     |- src/lib/recoveryEngine.ts       make-up slots, health score, single-session checks
   |     '- persist()  --> Postgres (one transaction per change)
   '- dist/ static files (production) or Vite middleware (development)
   v
src/server/db.ts: pg Pool -> Supabase Postgres, schema "intellischedule"
                  or PGlite (embedded Postgres) for development and tests
```

## Startup

1. `connectDb(DATABASE_URL)` opens the pool and runs `supabase/migrations/20261006000000_runtime_store.sql` in a transaction (idempotent `create ... if not exists`).
2. `store.init()` loads the four `app_state` documents, timetable versions and the latest 500 audit entries. If the database is empty it loads the sample dataset (when `SEED_DEMO_DATA` is on) and saves it.
3. `createApp()` builds the Express app; `seedUsers()` creates the sample accounts if the users table is empty and the bootstrap admin if configured.
4. The server listens on `PORT`. On SIGTERM/SIGINT it stops accepting connections, runs a final save, closes the pool, and exits (forced after 10 s).

In production `DATABASE_URL` is required and `pglite:` URLs are refused.

## Request flow

- `auth.loadUser` runs for every `/api` request. It hashes the `tt_session` cookie with SHA-256 and looks it up in `auth_sessions` joined with `users` (unexpired session, `ACTIVE` user). This is the only database read on a normal request.
- Route guards in `server.ts` check the role (matrix in [permissions.md](permissions.md)). Ownership checks (faculty acting on their own classes, class representatives on their own section) are in `store.ts`.
- Reads (`GET /api/academic/bootstrap` etc.) are served from the in-memory copy.
- Writes to `/api/academic`, `/api/timetable`, `/api/recovery`, `/api/voting` and `/api/notifications` change the in-memory copy, then `store.persist()` saves all changed documents, new versions, publish-flag changes and audit entries in one transaction **before** the response is sent. Saves are serialised.
  - If another writer changed a document first (version mismatch) the request fails with 409 and the store reloads from the database.
  - If the save fails for another reason (database unreachable) the request fails with 503; the change stays in memory and is written by the next successful save.
- User and session endpoints (`/api/auth/*`, `/api/admin/*`) read and write Postgres directly and do not go through the store.

Because of the in-memory copy, run exactly one instance. See [ADR 0001](decisions/0001-modular-monolith-and-academic-scheduling-engine.md).

## Frontend

- `src/lib/api.ts`: same-origin `fetch` with `credentials: 'same-origin'`; no tokens in JavaScript.
- `src/context/AuthContext.tsx`: sign-in, demo buttons, current user and workspaces.
- `src/context/TimetableContext.tsx`: loads `/api/academic/bootstrap` and calls the API for every change.
- Views per workspace (Admin, Coordinator, Faculty, Student, CR). Which workspaces a user gets is decided by the server from the role.

The Excel master workbook is parsed in the browser (`src/lib/excelMasterService.ts`, `xlsx`) and sent to `POST /api/academic/import` as JSON rows.

## Build and packaging

- `npm run build`: `vite build` -> `dist/`; esbuild bundles `server.ts` -> `dist-server/server.mjs` (npm packages stay external).
- `Dockerfile`: multi-stage `node:22-alpine`. The runtime image has production dependencies, `dist/`, `dist-server/` and `supabase/migrations/`, runs as `node`, sets `NODE_ENV=production` and `PORT=8080`, and has a healthcheck on `/api/health/ready`.
- In production Express serves `/assets` with a one-year immutable cache, other files from `dist/` with a one-hour cache, and `index.html` (no-cache) for every other non-API path.
