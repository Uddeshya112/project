# IntelliSchedule

Production-oriented academic timetable management and optimization for educational institutions.

## Runtime architecture

- Frontend: Vite/React, deployed to Vercel.
- Backend: Express on Node.js 22, deployed to Render.
- Persistence: direct PostgreSQL (Supabase Postgres is supported through DATABASE_URL).
- Authentication: one backend-authoritative, PostgreSQL-backed session system using an httpOnly `tt_session` cookie.
- Scheduling: constraint-aware optimization engine plus independent timetable validation.

The browser is not an authentication authority and does not store bearer session tokens.

## Development

1. Copy `.env.example` to `.env`.
2. For local development, use `DATABASE_URL=pglite:.data/intellischedule`.
3. Set `SEED_DEMO_DATA=true` and `DEMO_MODE=true` only when you explicitly want local demo fixtures.
4. Install dependencies with `npm install`.
5. Run the full verification suite with `npm test`.
6. Start the backend/frontend development server with `npm run dev`.

## Production

Production requires `DATABASE_URL`, `DATABASE_SSL_CA`, `ALLOWED_ORIGINS`, `ALLOWED_EMAIL_DOMAINS`, and `RESET_MAIL_WEBHOOK_URL` for password recovery. Google OAuth variables are required when Google sign-in is enabled.

The backend fails closed when a required production database or password-recovery security dependency is missing.

## Security

The server uses exact CORS origin allow-listing, Helmet security headers, bounded request bodies, persistent database-backed rate limits, persistent hashed password-reset tokens, server-side RBAC and roster ownership checks, roster-scoped academic responses for non-staff users, and browser-independent authorization.

Historical credentials or secrets that appeared in older Git revisions must still be rotated externally; removing them from a working tree does not invalidate the old values.

## Spreadsheet import

Workbook parsing uses the security-maintained `@keep-lts/xlsx` package as a drop-in replacement for the abandoned npm `xlsx@0.18.5` baseline. The upstream SheetJS npm registry is frozen at 0.18.5; the maintained fork backports relevant security fixes while preserving the API. citeturn106225search0turn106225search1

## Verification

CI runs on Node 22 and checks TypeScript, application/API tests, solver tests, adversarial/security tests, and the production Vite build.