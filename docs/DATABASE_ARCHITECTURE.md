# Database

Supabase Postgres, reached by the server through a direct Postgres connection string (`DATABASE_URL`) with the `pg` driver. The browser never talks to the database, and the app does not use Supabase Auth, the Supabase REST API or Supabase client keys.

## Connection

- `DATABASE_URL`: Supabase -> Project Settings -> Database -> Connection string. On Cloud Run or other serverless hosts use the **Transaction pooler** URI (port 6543).
- TLS is always used for non-local hosts. Set `DATABASE_SSL_CA` to the Supabase CA certificate (Database settings -> SSL) to verify the server certificate; without it the connection is encrypted but not verified, and a warning is logged at start. Any `sslmode` in the URL is ignored.
- `PG_POOL_MAX` (default 5) limits the pool size.
- Development and tests use embedded Postgres (PGlite): `DATABASE_URL=pglite:./.data/pglite` (the development default) or `pglite:memory`. PGlite is refused when `NODE_ENV=production`.

## Schema

One file, `supabase/migrations/20261006000000_runtime_store.sql`, applied automatically in a transaction at every start. It only uses `create ... if not exists`, so re-running it is safe. The earlier 24-table migration was removed because nothing used it.

All tables are in their own schema, `intellischedule`. Supabase's REST API only exposes `public` (unless you add the schema under API settings), so these tables are reachable only through the server's connection. RLS is enabled on every table with no policies: roles other than the table owner (such as Supabase's `anon` and `authenticated`) get no rows if the schema is ever exposed. The server connects as the owner, so RLS does not restrict it; access control is in the API.

| Table | Contents |
| --- | --- |
| `users` | Accounts: email (unique), name, `role_code` (one of the 7 roles), department, `password_hash` (bcrypt; null = Google only), `google_sub`, `status` (`ACTIVE`/`LOCKED`), `is_demo`, `profile` (JSONB: phone, office, roll number, section, ...), timestamps. |
| `auth_sessions` | `token_hash` (SHA-256 of the session token; the token itself is never stored), `user_id` (cascade delete), `expires_at`. |
| `oauth_states` | Google sign-in `state` values, single use, valid 10 minutes. |
| `app_state` | Academic data and the live timetable as JSONB documents, one row per key, with an integer `version` for optimistic concurrency. |
| `timetable_versions` | One row per timetable version: `version_number`, full version JSON including its sessions, `is_published`, `created_at`. Append-only except the published flag. |
| `audit_log` | Append-only: time, actor name, action, entity type and id, details. |

Expired sessions and OAuth states are deleted hourly by the server.

### `app_state` documents

| Key | Contents |
| --- | --- |
| `academic` | Academic year (days, periods, publish status), departments, programs, courses, faculty, rooms, groups with subgroups, course allocations, constraints. |
| `students` | Student roster (roll number, name, email, group, subgroup). |
| `timetable` | Working draft sessions and version number; published sessions and version number. |
| `operations` | Notifications (latest 300, with per-user read state), make-up tasks, make-up options, polls, votes (`pollId:userId` -> option). |

## How writes work

The server loads all `app_state` documents, all timetable versions and the latest 500 audit entries at start and keeps them in memory. A change to academic or timetable data:

1. updates the in-memory copy,
2. in one transaction, updates each changed document with `... where key = $1 and version = $2` (bumping `version`), inserts new timetable versions, updates changed publish flags and inserts new audit entries,
3. then sends the response.

If a document's `version` no longer matches (another process wrote first), the transaction rolls back, the request fails with 409 and the server reloads everything from the database. This prevents silent overwrites, but it also means **only one instance can serve traffic**. Use e.g. Cloud Run `--max-instances 1`.

Users, sessions and OAuth states are read and written directly by `src/server/auth.ts`, not through the in-memory copy.

Not stored in the database: rate-limit counters (in process memory, reset on restart).

## Seeding

On first start with no `academic` document, the server loads the sample dataset (`SEED_DEMO_DATA`, default on) or an empty one, and saves it. If the `users` table is empty it creates the 12 sample accounts (`SEED_SAMPLE_USERS`, default on). See [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md).

## Useful SQL (Supabase SQL editor)

```sql
-- Sign everyone out
delete from intellischedule.auth_sessions;

-- Lock the demo accounts (their sessions stop working immediately)
update intellischedule.users set status = 'LOCKED' where is_demo;

-- Timetable versions
select version_number, is_published, created_at, data->>'versionLabel' as label
from intellischedule.timetable_versions order by version_number desc;

-- Recent audit entries
select at, user_name, action, details from intellischedule.audit_log order by at desc limit 50;
```

Do not edit `app_state` or `timetable_versions` by hand while the app is running: the running server keeps its in-memory copy. Restart the app after any manual change or restore.

To start over with fresh sample data on a non-production database, stop the app, run `drop schema intellischedule cascade;` and start it again (locally: delete `./.data/pglite`).

Backups and restores: [runbooks/backups.md](runbooks/backups.md).
