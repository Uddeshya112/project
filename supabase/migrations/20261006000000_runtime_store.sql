-- IntelliSchedule runtime schema. Applied automatically at server start (idempotent).
-- Direct Postgres access is server-only; public Supabase roles have no policies here.

create schema if not exists intellischedule;

create table if not exists intellischedule.users (
  id            text primary key,
  email         text not null unique,
  name          text not null,
  role_code     text not null check (role_code in
                  ('SUPER_ADMIN','COLLEGE_ADMIN','COORDINATOR','HOD','FACULTY','CLASS_REPRESENTATIVE','STUDENT')),
  department    text not null default '',
  password_hash text,
  google_sub    text unique,
  status        text not null default 'ACTIVE' check (status in ('ACTIVE','LOCKED')),
  is_demo       boolean not null default false,
  profile       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists intellischedule.auth_sessions (
  token_hash           text primary key,
  user_id              text not null references intellischedule.users(id) on delete cascade,
  created_at           timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  expires_at           timestamptz not null,
  absolute_expires_at  timestamptz not null,
  user_agent           text not null default '',
  ip_address           text not null default ''
);
create index if not exists auth_sessions_user_idx on intellischedule.auth_sessions(user_id);
create index if not exists auth_sessions_expiry_idx on intellischedule.auth_sessions(expires_at);
create index if not exists auth_sessions_absolute_expiry_idx on intellischedule.auth_sessions(absolute_expires_at);

create table if not exists intellischedule.oauth_states (
  state         text primary key,
  code_verifier text not null,
  created_at    timestamptz not null default now()
);

create table if not exists intellischedule.password_reset_tokens (
  token_hash  text primary key,
  user_id     text not null references intellischedule.users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists password_reset_tokens_expiry_idx on intellischedule.password_reset_tokens(expires_at);

create table if not exists intellischedule.rate_limits (
  key            text primary key,
  window_start   timestamptz not null,
  reset_at       timestamptz not null,
  count          integer not null default 0,
  updated_at     timestamptz not null default now()
);
create index if not exists rate_limits_reset_idx on intellischedule.rate_limits(reset_at);

create table if not exists intellischedule.replacement_votes (
  poll_id     text not null,
  user_id     text not null references intellischedule.users(id) on delete cascade,
  option_id   text not null,
  created_at  timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index if not exists replacement_votes_poll_idx on intellischedule.replacement_votes(poll_id);

create table if not exists intellischedule.jobs (
  job_id         text primary key,
  status         text not null check (status in ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  progress       integer not null default 0 check (progress between 0 and 100),
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  completed_at   timestamptz,
  requested_by   text references intellischedule.users(id) on delete set null,
  payload        jsonb not null,
  result         jsonb,
  error          text,
  cancel_requested boolean not null default false
);
create index if not exists jobs_status_idx on intellischedule.jobs(status);
create index if not exists jobs_created_idx on intellischedule.jobs(created_at desc);

create table if not exists intellischedule.audit_log (
  id          text primary key,
  at          timestamptz not null,
  user_name   text not null,
  action      text not null,
  entity_type text not null,
  entity_id   text not null,
  details     text not null
);
create index if not exists audit_log_at_idx on intellischedule.audit_log(at desc);

-- Deny-by-default through Supabase APIs. The application connects with a dedicated server DB role.
alter table intellischedule.users enable row level security;
alter table intellischedule.auth_sessions enable row level security;
alter table intellischedule.oauth_states enable row level security;
alter table intellischedule.password_reset_tokens enable row level security;
alter table intellischedule.rate_limits enable row level security;
alter table intellischedule.replacement_votes enable row level security;
alter table intellischedule.jobs enable row level security;
alter table intellischedule.audit_log enable row level security;

-- No application RLS policies are created here. With RLS enabled, the public/authenticated API roles cannot read or mutate runtime tables.

-- Backfill columns for older deployments of this migration.
alter table intellischedule.auth_sessions add column if not exists last_seen_at timestamptz not null default now();
alter table intellischedule.auth_sessions add column if not exists absolute_expires_at timestamptz;
alter table intellischedule.auth_sessions add column if not exists user_agent text not null default '';
alter table intellischedule.auth_sessions add column if not exists ip_address text not null default '';
update intellischedule.auth_sessions
   set absolute_expires_at = coalesce(absolute_expires_at, expires_at)
 where absolute_expires_at is null;
alter table intellischedule.auth_sessions alter column absolute_expires_at set not null;

alter table intellischedule.oauth_states add column if not exists code_verifier text;
