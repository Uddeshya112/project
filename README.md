# IntelliSchedule

Timetable planning and day-to-day timetable operations for Thapar Institute of Engineering and Technology (TIET). Coordinators maintain academic data and generate timetables, admins approve and publish them, and students, class representatives and faculty work from the published timetable (cancellations, make-up classes, polls).

One Node.js 22 process (Express 5) serves the JSON API under `/api` and the built React 19 + Vite app from `dist/` on the same origin. Data is stored in Supabase Postgres.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

No database setup is needed for development. Without `DATABASE_URL` the server uses an embedded Postgres (PGlite) in `./.data/pglite`; delete that folder to start over. On first start it loads a sample dataset and 12 sample accounts, and the login page shows one-click demo buttons. See [docs/DEMO_ACCOUNTS.md](docs/DEMO_ACCOUNTS.md).

To use Supabase instead, copy `.env.example` to `.env` and set `DATABASE_URL`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs `server.ts` with tsx and Vite middleware (hot reload). |
| `npm run build` | `vite build` into `dist/`, then esbuild bundles `server.ts` into `dist-server/server.mjs`. |
| `npm start` | Runs `dist-server/server.mjs`. Set `NODE_ENV=production` so it serves `dist/` instead of starting Vite. |
| `npm test` | Engine and API tests (`node:test` via tsx). See [docs/testing.md](docs/testing.md). |
| `npm run lint` | Type check (`tsc --noEmit`). |
| `npm run workbook` | Writes the sample Excel master workbook to `public/`, `dist/` and the repo root. |

## Configuration

Everything is configured with environment variables. `.env.example` has the same list with comments.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Supabase: Project Settings -> Database -> Connection string; use the Transaction pooler URI (port 6543) on Cloud Run or other serverless hosts. Required in production; development defaults to `pglite:./.data/pglite`. |
| `DATABASE_SSL_CA` | Supabase CA certificate (PEM, `\n` allowed for newlines). When set, the database certificate is verified; otherwise TLS is used without verification and a warning is logged. |
| `PG_POOL_MAX` | Maximum Postgres connections (default 5). |
| `APP_URL` | Public address users open, e.g. `https://timetable.thapar.edu`. Used for Google redirects and the same-origin check. |
| `PORT` | Listen port (default 3000; the Docker image sets 8080). |
| `TRUST_PROXY` | Number of proxy hops in front of the app (default 1 when `NODE_ENV=production`, otherwise off). Needed for correct client IPs and Secure cookies. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Enable Google sign-in when both are set. |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated domains allowed to use Google sign-in (default `thapar.edu`). |
| `SESSION_TTL_HOURS` | Session lifetime in hours (default 168 = 7 days). |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME` | Create a College Admin at start if that email has no account. Without a password the admin signs in with Google. |
| `DEMO_MODE` | One-click demo logins on the sign-in page (default `true`). |
| `SEED_DEMO_DATA` | Load the sample academic dataset and baseline timetable when the database is empty (default `true`). |
| `SEED_SAMPLE_USERS` | Create the 12 sample accounts when the users table is empty (default `true`; only the exact value `false` turns it off). |
| `SAMPLE_ACCOUNTS_PASSWORD`, `DEMO_ACCOUNTS_PASSWORD` | Initial passwords of the sample and demo accounts, applied only when the accounts are created. |

Also read, but not in `.env.example`: `GOOGLE_REDIRECT_URI` (default `<APP_URL>/api/auth/google/callback`), `BCRYPT_ROUNDS` (default 12), `LOGIN_RATE_LIMIT_PER_IP` (default 300 per minute), `NODE_ENV`.

## Before real use

Demo mode and sample data are on by default. With `DEMO_MODE=true` anyone can sign in as the demo College Admin and change or publish data. Before real use:

1. Set `DEMO_MODE=false`.
2. Change or lock the seven sample accounts (demo accounts are refused automatically once demo mode is off). Alternatively start a fresh database with `SEED_SAMPLE_USERS=false`, `SEED_DEMO_DATA=false` and a `BOOTSTRAP_ADMIN_EMAIL`.
3. Run exactly one instance. See [docs/runbooks/deploy.md](docs/runbooks/deploy.md).

## Layout

| Path | Contents |
| --- | --- |
| `server.ts` | Express app: config, security middleware, route guards, static files. |
| `src/server/` | `auth.ts` (sessions, sign-in, user admin), `store.ts` (in-memory state, business rules, persistence), `db.ts` (pg / PGlite), `validate.ts`, `demoData.ts`. |
| `src/lib/` | Scheduling engine (`optimizationEngine.ts`), validator (`independentValidator.ts`), make-up matching and health score (`recoveryEngine.ts`), Excel parsing used by the browser. |
| `src/components/`, `src/context/` | React app. |
| `supabase/migrations/20261006000000_runtime_store.sql` | Database schema, applied automatically at start. |
| `tests/` | Engine and API tests. |

## Docs

- [PROJECT_STATE.md](PROJECT_STATE.md): what works, known limits
- [docs/architecture.md](docs/architecture.md): components and request flow
- [docs/system-design.md](docs/system-design.md): workflows, timetable lifecycle, scheduling engine
- [docs/DATABASE_ARCHITECTURE.md](docs/DATABASE_ARCHITECTURE.md): schema and persistence
- [docs/permissions.md](docs/permissions.md): role matrix
- [docs/api-conventions.md](docs/api-conventions.md): endpoints and error format
- [docs/DEMO_ACCOUNTS.md](docs/DEMO_ACCOUNTS.md): sample data and accounts
- [docs/testing.md](docs/testing.md): tests
- [docs/security/threat-model.md](docs/security/threat-model.md)
- Runbooks: [deploy](docs/runbooks/deploy.md), [rollback](docs/runbooks/rollback.md), [backups](docs/runbooks/backups.md)
- [ADR 0001](docs/decisions/0001-modular-monolith-and-academic-scheduling-engine.md): single process, in-memory working copy, built-in solver
