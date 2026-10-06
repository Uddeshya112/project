import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { sendPasswordResetMail } from './mailer';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Db } from './db';
import { evaluatePasswordPolicy, MAX_PASSWORD_LENGTH, hashPasswordBcrypt, verifyPassword } from '../lib/passwordUtils';
import { USERS as SAMPLE_USERS, INITIAL_MEMBERSHIPS } from '../lib/authData';

export type RoleCode =
  | 'SUPER_ADMIN'
  | 'COLLEGE_ADMIN'
  | 'COORDINATOR'
  | 'HOD'
  | 'FACULTY'
  | 'CLASS_REPRESENTATIVE'
  | 'STUDENT';
export type WorkspaceType = 'Student' | 'CR' | 'Faculty' | 'Coordinator' | 'Admin';

export const ROLE_CODES: RoleCode[] = ['SUPER_ADMIN', 'COLLEGE_ADMIN', 'COORDINATOR', 'HOD', 'FACULTY', 'CLASS_REPRESENTATIVE', 'STUDENT'];
export const ADMIN_ROLES: RoleCode[] = ['SUPER_ADMIN', 'COLLEGE_ADMIN'];
export const STAFF_ROLES: RoleCode[] = ['SUPER_ADMIN', 'COLLEGE_ADMIN', 'COORDINATOR', 'HOD'];

const ROLE_NAMES: Record<RoleCode, string> = {
  SUPER_ADMIN: 'Super Admin',
  COLLEGE_ADMIN: 'College Admin / Dean',
  COORDINATOR: 'Timetable Coordinator',
  HOD: 'Head of Department',
  FACULTY: 'Faculty Member',
  CLASS_REPRESENTATIVE: 'Class Representative',
  STUDENT: 'Student',
};
const WORKSPACES: Record<RoleCode, WorkspaceType[]> = {
  SUPER_ADMIN: ['Admin', 'Coordinator'],
  COLLEGE_ADMIN: ['Admin', 'Coordinator'],
  COORDINATOR: ['Coordinator', 'Faculty'],
  HOD: ['Coordinator', 'Faculty'],
  FACULTY: ['Faculty'],
  CLASS_REPRESENTATIVE: ['Student', 'CR'],
  STUDENT: ['Student'],
};
const ROLE_KEYS: Record<RoleCode, 'Admin' | 'Coordinator' | 'HOD' | 'Faculty' | 'Student'> = {
  SUPER_ADMIN: 'Admin',
  COLLEGE_ADMIN: 'Admin',
  COORDINATOR: 'Coordinator',
  HOD: 'HOD',
  FACULTY: 'Faculty',
  CLASS_REPRESENTATIVE: 'Student',
  STUDENT: 'Student',
};
// Profile fields a user may edit themselves; admins may also edit the identity fields.
const SELF_PROFILE_FIELDS = ['phone', 'officeLocation', 'officeHours', 'specialization', 'notificationPreferences'];
const ADMIN_PROFILE_FIELDS = [...SELF_PROFILE_FIELDS, 'rollNumber', 'sectionId', 'batch', 'avatarUrl', 'facultyId'];
// Sample staff accounts are linked to records in the sample faculty roster so their portals have data.
const SAMPLE_FACULTY_LINKS: Record<string, string> = { 'usr-sharma': 'fac-0001', 'usr-gupta': 'fac-0002', 'usr-murthy': 'fac-0003', 'usr-roy': 'fac-0004' };

const SESSION_COOKIE = 'tt_session';
const CSRF_COOKIE = 'tt_csrf';
const MAX_ACTIVE_SESSIONS = 5;
const IDLE_TIMEOUT_MS = Math.max(15 * 60_000, Number(process.env.SESSION_IDLE_MINUTES || 240) * 60_000);
const ABSOLUTE_SESSION_MS = Math.max(IDLE_TIMEOUT_MS, Number(process.env.SESSION_ABSOLUTE_HOURS || 24) * 3600_000);
// Per-IP limits are generous because a campus network puts thousands of users behind a few addresses;
// brute force is stopped by the per-account limit.
const IP_LIMIT_PER_MIN = Number(process.env.LOGIN_RATE_LIMIT_PER_IP) || 300;
const T = 'intellischedule';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role_code: RoleCode;
  department: string;
  password_hash: string | null;
  google_sub: string | null;
  status: 'ACTIVE' | 'LOCKED';
  is_demo: boolean;
  profile: Record<string, unknown>;
  created_at: Date;
  last_login_at: Date | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

export interface RosterMatch {
  roleCode: RoleCode;
  name: string;
  department: string;
  profile?: Record<string, unknown>;
}

export interface AuthOptions {
  db: Db;
  demoMode: boolean;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  appUrl?: string;
  allowedDomains: string[];
  sessionTtlHours: number;
  bcryptRounds: number;
  /** Matches a Google sign-in against the imported faculty / student roster. */
  rosterLookup: (email: string) => RosterMatch | null;
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleCode: u.role_code,
    roleName: ROLE_NAMES[u.role_code],
    roleKey: ROLE_KEYS[u.role_code],
    department: u.department,
    authorizedWorkspaces: WORKSPACES[u.role_code],
    status: u.status,
    isDemoUser: u.is_demo,
    hasPassword: Boolean(u.password_hash),
    googleLinked: Boolean(u.google_sub),
    profile: u.profile ?? {},
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
  };
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function pick(src: unknown, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of keys) if (k in (src as object)) out[k] = (src as any)[k];
  return out;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'UNAUTHENTICATED', message: 'Please sign in to continue.' });
  }
  next();
}

export function requireRole(roles: RoleCode[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'UNAUTHENTICATED', message: 'Please sign in to continue.' });
    }
    if (!roles.includes(req.user.role_code)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'You do not have permission for this action.' });
    }
    next();
  };
}

export function createAuth(opts: AuthOptions) {
  const { db } = opts;
  const googleEnabled = Boolean(opts.googleClientId && opts.googleClientSecret);
  let dummyHash: string | undefined;

  const hashPassword = (pwd: string) => bcrypt.hash(pwd, opts.bcryptRounds);

  async function userByEmail(email: string) {
    return (await db.query<UserRow>(`select * from ${T}.users where email = $1`, [email]))[0];
  }
  async function userById(id: string) {
    return (await db.query<UserRow>(`select * from ${T}.users where id = $1`, [id]))[0];
  }

  async function startSession(req: Request, res: Response, user: UserRow): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    const maxAge = Math.min(opts.sessionTtlHours * 3600_000, IDLE_TIMEOUT_MS, ABSOLUTE_SESSION_MS);
    const idleExpiry = new Date(now + maxAge);
    const absoluteExpiry = new Date(now + ABSOLUTE_SESSION_MS);

    await db.tx(async (q) => {
      await q(`delete from ${T}.auth_sessions where user_id = $1 and expires_at <= now()`, [user.id]);
      await q(
        `insert into ${T}.auth_sessions
          (token_hash, user_id, last_seen_at, expires_at, absolute_expires_at, user_agent, ip_address)
         values ($1, $2, now(), $3, $4, $5, $6)`,
        [
          sha256(token),
          user.id,
          idleExpiry,
          absoluteExpiry,
          String(req.get('user-agent') || '').slice(0, 500),
          String(req.ip || '').slice(0, 128),
        ],
      );
      await q(
        `delete from ${T}.auth_sessions
          where user_id = $1
            and token_hash not in (
              select token_hash from ${T}.auth_sessions
               where user_id = $1
               order by created_at desc
               limit ${MAX_ACTIVE_SESSIONS}
            )`,
        [user.id],
      );
      await q(`update ${T}.users set last_login_at = now() where id = $1`, [user.id]);
    });

    const production = process.env.NODE_ENV === 'production';
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: production || req.secure,
      sameSite: production ? 'none' : 'lax',
      path: '/',
      maxAge,
    });
    const csrf = crypto.randomBytes(32).toString('base64url');
    res.cookie(CSRF_COOKIE, csrf, {
      httpOnly: false,
      secure: production || req.secure,
      sameSite: production ? 'none' : 'lax',
      path: '/',
      maxAge,
    });
    return token;
  }
  /** Loads the authenticated user from the secure session cookie or API bearer token. */
  async function loadUser(req: Request, _res: Response, next: NextFunction) {
    try {
      const cookieToken = readCookie(req, SESSION_COOKIE);
      const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
      const token = cookieToken || bearer;
      if (!token) return next();
      const rows = await db.query<UserRow>(
        `select u.* from ${T}.auth_sessions s
          join ${T}.users u on u.id = s.user_id
         where s.token_hash = $1
           and s.expires_at > now()
           and s.absolute_expires_at > now()
           and s.last_seen_at > now() - ($2::text || ' minutes')::interval
           and u.status = 'ACTIVE'`,
        [sha256(token), String(Math.round(IDLE_TIMEOUT_MS / 60000))],
      );
      const user = rows[0];
      if (!user || (user.is_demo && !opts.demoMode)) return next();
      req.user = user;
      await db.query(
        `update ${T}.auth_sessions
            set last_seen_at = now(),
                expires_at = least(absolute_expires_at, now() + ($2::text || ' minutes')::interval)
          where token_hash = $1`,
        [sha256(token), String(Math.round(IDLE_TIMEOUT_MS / 60000))],
      );
      return next();
    } catch {
      return next();
    }
  }
  /** First start: load the sample accounts; optionally ensure a bootstrap admin. */
  async function seedUsers() {
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from ${T}.users`);
    if (n === 0 && process.env.SEED_SAMPLE_USERS === 'true') {
      const roleById: Record<string, RoleCode> = {
        'role-superadmin': 'SUPER_ADMIN',
        'role-admin': 'COLLEGE_ADMIN',
        'role-coordinator': 'COORDINATOR',
        'role-hod': 'HOD',
        'role-faculty': 'FACULTY',
        'role-cr': 'CLASS_REPRESENTATIVE',
        'role-student': 'STUDENT',
      };
      const samplePwd =
        process.env.SAMPLE_ACCOUNTS_PASSWORD ||
        (process.env.NODE_ENV === 'production' ? '' : crypto.randomBytes(24).toString('base64url'));
      if (!samplePwd) {
        throw new Error('SAMPLE_ACCOUNTS_PASSWORD is required when SEED_SAMPLE_USERS=true.');
      }
      const sampleHash = await hashPasswordBcrypt(samplePwd);
      for (const u of SAMPLE_USERS) {
        const membership = INITIAL_MEMBERSHIPS.find((m) => m.userId === u.id);
        const isDemo = u.email.endsWith('@demo.thapar.local');
        if (isDemo) continue;
        await db.query(
          `insert into ${T}.users (id, email, name, role_code, department, password_hash, is_demo, profile)
           values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
          [
            u.id,
            u.email.toLowerCase(),
            u.name,
            roleById[membership?.roleId ?? ''] ?? 'STUDENT',
            u.department ?? '',
            sampleHash,
            isDemo,
            { ...pick(u, ADMIN_PROFILE_FIELDS), ...(SAMPLE_FACULTY_LINKS[u.id] ? { facultyId: SAMPLE_FACULTY_LINKS[u.id] } : {}) },
          ],
        );
      }
      console.info(`[auth] Seeded ${SAMPLE_USERS.length} sample accounts (change their passwords from Admin -> Users).`);
    }

    const adminEmail = normEmail(process.env.BOOTSTRAP_ADMIN_EMAIL);
    if (adminEmail && !(await userByEmail(adminEmail))) {
      const pwd = process.env.BOOTSTRAP_ADMIN_PASSWORD;
      if (process.env.NODE_ENV === 'production' && (!pwd || !evaluatePasswordPolicy(pwd).isValid)) {
        throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required and must satisfy the password policy in production.');
      }
      if (pwd && !evaluatePasswordPolicy(pwd).isValid) {
        throw new Error('BOOTSTRAP_ADMIN_PASSWORD does not meet the password policy (12+ chars, upper, lower, digit, symbol).');
      }
      await db.query(
        `insert into ${T}.users (id, email, name, role_code, department, password_hash) values ($1, $2, $3, 'COLLEGE_ADMIN', '', $4)`,
        [`usr-${crypto.randomUUID()}`, adminEmail, process.env.BOOTSTRAP_ADMIN_NAME || 'Administrator', pwd ? await hashPassword(pwd) : null],
      );
      console.info(`[auth] Created bootstrap admin ${adminEmail}.`);
    }
  }

  setInterval(() => {
    db.query(`delete from ${T}.auth_sessions where expires_at < now() or absolute_expires_at < now()`).catch(() => {});
    db.query(`delete from ${T}.oauth_states where created_at < now() - interval '10 minutes'`).catch(() => {});
    db.query(`delete from ${T}.password_reset_tokens where expires_at < now()`).catch(() => {});
    db.query(`delete from ${T}.rate_limits where reset_at < now()`).catch(() => {});
  }, 3600_000).unref();

  const router = Router();
  async function persistentRateLimit(key: string, max: number, windowMs: number): Promise<number> {
    const rows = await db.query<{ count: number; reset_at: Date }>(
      `insert into ${T}.rate_limits (key, window_start, reset_at, count)
       values ($1, now(), now() + ($2::text || ' milliseconds')::interval, 1)
       on conflict (key) do update
         set count = case when ${T}.rate_limits.reset_at <= now() then 1 else ${T}.rate_limits.count + 1 end,
             window_start = case when ${T}.rate_limits.reset_at <= now() then now() else ${T}.rate_limits.window_start end,
             reset_at = case when ${T}.rate_limits.reset_at <= now() then now() + ($2::text || ' milliseconds')::interval else ${T}.rate_limits.reset_at end,
             updated_at = now()
       returning count, reset_at`,
      [key, String(windowMs)],
    );
    const row = rows[0];
    if (!row || row.count <= max) return 0;
    return Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
  }

  async function clearPersistentRateLimits(): Promise<void> {
    await db.query(`delete from ${T}.rate_limits`);
  }

  router.get('/api/auth/config', (_req, res) => {
    res.json({ googleEnabled, demoEnabled: opts.demoMode, allowedDomains: opts.allowedDomains });
  });

  router.post('/api/auth/login', async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` });
    }
    const wait = await persistentRateLimit(`login-ip:${req.ip}`, IP_LIMIT_PER_MIN, 60_000) || await persistentRateLimit(`login-acct:${email}`, 10, 15 * 60_000);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ success: false, message: `Too many sign-in attempts. Try again in ${wait} seconds.` });
    }

    const user = await userByEmail(email);
    dummyHash ??= await hashPasswordBcrypt(crypto.randomUUID());
    const verification = await verifyPassword(password, user?.password_hash ?? dummyHash);
    if (!user || !user.password_hash || !verification.isValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    if (user.status === 'LOCKED') {
      return res.status(403).json({ success: false, message: 'This account is locked. Contact the timetable administrator.' });
    }
    if (user.is_demo && !opts.demoMode) {
      return res.status(403).json({ success: false, message: 'Demo accounts are disabled on this server.' });
    }
    const sessionToken = await startSession(req, res, user);
    if (verification.needsRehash) {
      await db.query(`update ${T}.users set password_hash = $2 where id = $1`, [user.id, await hashPasswordBcrypt(password)]);
    }
    const payload: Record<string, unknown> = { success: true, user: publicUser(user) };
    if (process.env.NODE_ENV === 'test') payload.token = sessionToken;
    return res.json(payload);
  });

  router.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(401).json({ authenticated: false });
    return res.json({ authenticated: true, user: publicUser(req.user) });
  });

  router.post('/api/auth/logout', async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await db.query(`delete from ${T}.auth_sessions where token_hash = $1`, [sha256(token)]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return res.json({ success: true });
  });

  router.post('/api/auth/register', async (req, res) => {
    const email = normEmail(req.body?.email);
    const name = String(req.body?.name ?? '').trim();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!isEmail(email) || !name || !password) {
      return res.status(400).json({ success: false, message: 'Valid name, institutional email and password are required.' });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` });
    }
    const domain = email.split('@')[1];
    if (!domain || (opts.allowedDomains.length && !opts.allowedDomains.includes(domain))) {
      return res.status(403).json({ success: false, message: 'Registration is limited to an authorized institutional email domain.' });
    }
    const policy = evaluatePasswordPolicy(password);
    if (!policy.isValid) {
      return res.status(400).json({ success: false, message: `Password needs: ${policy.errors.join(', ')}.` });
    }
    const wait = await persistentRateLimit(`register-ip:${req.ip}`, 10, 15 * 60_000);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ success: false, message: `Too many registration attempts. Try again in ${wait} seconds.` });
    }
    if (await userByEmail(email)) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }
    const [row] = await db.query<UserRow>(
      `insert into ${T}.users (id, email, name, role_code, department, password_hash, profile)
       values ($1, $2, $3, 'STUDENT', '', $4, '{}'::jsonb) returning *`,
      [`usr-${crypto.randomUUID()}`, email, name, await hashPasswordBcrypt(password)],
    );
    await db.query(
      `insert into ${T}.audit_log (id, at, user_name, action, entity_type, entity_id, details)
       values ($1, now(), $2, 'USER_REGISTERED', 'User', $3, $4)`,
      [`audit-${crypto.randomUUID()}`, name, row.id, `Student account registered for ${email}.`],
    );
    return res.status(201).json({ success: true, message: 'Account created successfully. Please sign in.', email: row.email });
  });
  router.patch('/api/auth/profile', requireAuth, async (req, res) => {
    const user = req.user!;
    const name = req.body?.name === undefined ? user.name : String(req.body.name).trim();
    if (!name || name.length > 120) return res.status(400).json({ success: false, message: 'Name must be 1-120 characters.' });
    const profile = { ...user.profile, ...pick(req.body?.profile, SELF_PROFILE_FIELDS) };
    const [row] = await db.query<UserRow>(`update ${T}.users set name = $2, profile = $3 where id = $1 returning *`, [user.id, name, profile]);
    return res.json({ success: true, user: publicUser(row) });
  });

  router.post('/api/auth/change-password', requireAuth, async (req, res) => {
    const user = req.user!;
    const { currentPassword, newPassword } = req.body ?? {};
    if (!user.password_hash) {
      return res.status(400).json({ success: false, message: 'This account signs in with Google and has no password to change.' });
    }
    const wait = await persistentRateLimit(`chpwd:${user.id}`, 5, 15 * 60_000);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
    }
    if (String(currentPassword ?? '').length > MAX_PASSWORD_LENGTH || String(newPassword ?? '').length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` });
    }
    if (!(await verifyPassword(String(currentPassword ?? ''), user.password_hash)).isValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }
    const policy = evaluatePasswordPolicy(String(newPassword ?? ''));
    if (!policy.isValid) {
      return res.status(400).json({ success: false, message: `New password needs: ${policy.errors.join(', ')}.` });
    }
    await db.query(`update ${T}.users set password_hash = $2 where id = $1`, [user.id, await hashPasswordBcrypt(String(newPassword))]);
    await revokeSessions(user.id);
    await startSession(req, res, user);
    return res.json({ success: true, message: 'Password changed. Other devices have been signed out.' });
  });

  router.post('/api/auth/forgot-password', async (req, res) => {
    const email = normEmail(req.body?.email);
    if (!isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Institutional email is required.' });
    }
    const wait = await persistentRateLimit(`forgot-ip:${req.ip}`, 5, 60_000) || await persistentRateLimit(`forgot-email:${email}`, 3, 15 * 60_000);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ success: true, message: 'If an account exists for this email, password-reset instructions have been sent.' });
    }
    const generic = { success: true, message: 'If an account exists for this email, password-reset instructions have been sent.' };
    const user = await userByEmail(email);
    if (!user || user.status !== 'ACTIVE' || user.is_demo) return res.json(generic);
    if (!process.env.MAILER_SERVICE_URL && process.env.NODE_ENV === 'production') {
      return res.status(503).json({ success: false, message: 'Password reset service is temporarily unavailable.' });
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(rawToken);
    await db.query(`delete from ${T}.password_reset_tokens where user_id = $1`, [user.id]);
    await db.query(
      `insert into ${T}.password_reset_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + interval '15 minutes')`,
      [tokenHash, user.id],
    );
    const base = opts.appUrl?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${base}/#reset-password?token=${encodeURIComponent(rawToken)}`;
    try {
      await sendPasswordResetMail({ to: user.email, resetUrl });
    } catch (err) {
      await db.query(`delete from ${T}.password_reset_tokens where token_hash = $1`, [tokenHash]);
      if (process.env.NODE_ENV === 'production') return res.status(503).json({ success: false, message: 'Password reset service is temporarily unavailable.' });
    }
    if (process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_RESET_TOKEN === 'true') {
      return res.json({ ...generic, resetToken: rawToken });
    }
    return res.json(generic);
  });

  router.get('/api/auth/validate-token', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) return res.status(400).json({ valid: false, message: 'Reset token required.' });
    const rows = await db.query<UserRow & { expires_at: Date }>(
      `select u.*, t.expires_at from ${T}.password_reset_tokens t join ${T}.users u on u.id = t.user_id
       where t.token_hash = $1 and t.used_at is null and t.expires_at > now()`,
      [sha256(token)],
    );
    if (!rows[0]) return res.status(400).json({ valid: false, message: 'Invalid or expired password reset token.' });
    return res.json({ valid: true, email: rows[0].email });
  });

  router.post('/api/auth/reset-password', async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    if (newPassword.length > MAX_PASSWORD_LENGTH) return res.status(400).json({ success: false, message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` });
    const policy = evaluatePasswordPolicy(newPassword);
    if (!policy.isValid) return res.status(400).json({ success: false, message: `Password needs: ${policy.errors.join(', ')}.` });
    const tokenHash = sha256(token);
    const consumed = await db.tx(async (q) => {
      const rows = await q<UserRow>(`select u.* from ${T}.password_reset_tokens t join ${T}.users u on u.id=t.user_id where t.token_hash=$1 and t.used_at is null and t.expires_at>now() for update`, [tokenHash]);
      const user = rows[0];
      if (!user) return null;
      await q(`update ${T}.password_reset_tokens set used_at=now() where token_hash=$1 and used_at is null`, [tokenHash]);
      await q(`update ${T}.users set password_hash=$2 where id=$1`, [user.id, await hashPasswordBcrypt(newPassword)]);
      await q(`delete from ${T}.auth_sessions where user_id=$1`, [user.id]);
      await q(`insert into ${T}.audit_log (id, at, user_name, action, entity_type, entity_id, details) values ($1, now(), $2, 'PASSWORD_RESET', 'User', $3, $4)`, [`audit-${crypto.randomUUID()}`, user.name, user.id, 'Password reset completed.']);
      return user;
    });
    if (!consumed) return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.' });
    return res.json({ success: true, message: 'Your password has been reset successfully. You can now sign in.' });
  });
  // ---------------------------------------------------------------------------
  // Google sign-in (authorization-code flow, full-page redirect)
  // ---------------------------------------------------------------------------
  const redirectUri = (req: Request) =>
    opts.googleRedirectUri ||
    `${opts.appUrl?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`}/api/auth/google/callback`;
  const appHome = (req: Request) => opts.appUrl?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;

  router.get('/api/auth/google/start', async (req, res) => {
    if (!googleEnabled) return res.redirect(`${appHome(req)}/?auth_error=${encodeURIComponent('Google sign-in is not configured.')}`);
    const wait = await persistentRateLimit(`oauth:${req.ip}`, IP_LIMIT_PER_MIN, 60_000);
    if (wait) return res.status(429).send('Too many sign-in attempts. Try again shortly.');
    const state = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    await db.query(`insert into ${T}.oauth_states (state, code_verifier) values ($1, $2)`, [state, codeVerifier]);
    const params = new URLSearchParams({
      client_id: opts.googleClientId!,
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    if (opts.allowedDomains.length === 1) params.set('hd', opts.allowedDomains[0]);
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });
  router.get('/api/auth/google/callback', async (req, res) => {
    const fail = (message: string) => res.redirect(`${appHome(req)}/?auth_error=${encodeURIComponent(message)}`);
    const { code, state, error } = req.query;
    if (error) return fail('Google sign-in was cancelled.');
    if (!googleEnabled || typeof code !== 'string' || typeof state !== 'string') return fail('Invalid sign-in response.');

    const consumed = await db.query<{ code_verifier: string }>(
      `delete from ${T}.oauth_states where state = $1 and created_at > now() - interval '10 minutes' returning code_verifier`,
      [state],
    );
    const codeVerifier = consumed[0]?.code_verifier;
    if (!codeVerifier) return fail('Your sign-in link expired. Please try again.');

    try {
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: opts.googleClientId!,
          client_secret: opts.googleClientSecret!,
          redirect_uri: redirectUri(req),
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      });
      const tokens = (await tokenResp.json()) as { access_token?: string; id_token?: string };
      if (!tokenResp.ok || !tokens.access_token || !tokens.id_token) return fail('Google sign-in could not be completed.');

      const client = new OAuth2Client(opts.googleClientId, opts.googleClientSecret, redirectUri(req));
      let payload: any;
      try {
        const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: opts.googleClientId });
        payload = ticket.getPayload();
      } catch {
        return fail('Google identity verification failed.');
      }
      if (!payload?.sub || !payload.email || payload.email_verified !== true) return fail('Google did not return a verified institutional identity.');

      const email = normEmail(payload.email);
      const domain = email.split('@')[1];
      if (opts.allowedDomains.length && (!domain || !opts.allowedDomains.includes(domain))) {
        return fail('Please use your authorized institutional Google account.');
      }

      let user = (await db.query<UserRow>(`select * from ${T}.users where google_sub = $1`, [payload.sub]))[0] || (await userByEmail(email));
      if (user?.is_demo) return fail('Demo accounts cannot use Google sign-in.');
      if (user?.google_sub && user.google_sub !== payload.sub) return fail('This email is linked to a different Google account.');
      if (!user) {
        const match = opts.rosterLookup(email);
        if (!match) return fail('Your account is not in the institute roster yet. Ask the timetable coordinator to add you.');
        [user] = await db.query<UserRow>(
          `insert into ${T}.users (id, email, name, role_code, department, google_sub, profile) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
          [`usr-${crypto.randomUUID()}`, email, match.name || payload.name || email, match.roleCode, match.department, payload.sub, match.profile ?? {}],
        );
      } else if (!user.google_sub) {
        [user] = await db.query<UserRow>(`update ${T}.users set google_sub=$2 where id=$1 returning *`, [user.id, payload.sub]);
      }
      if (user.status !== 'ACTIVE') return fail('This account is locked. Contact the timetable administrator.');
      await startSession(req, res, user);
      await db.query(`insert into ${T}.audit_log (id, at, user_name, action, entity_type, entity_id, details) values ($1, now(), $2, 'LOGIN_SUCCESS', 'User', $3, $4)`, [`audit-${crypto.randomUUID()}`, user.name, user.id, 'Google sign-in completed.']);
      return res.redirect(`${appHome(req)}/`);
    } catch (err) {
      console.error('[auth] Google callback failed:', (err as Error).message);
      return fail('Google sign-in could not be completed.');
    }
  });
  // ---------------------------------------------------------------------------
  // User administration (College Admin / Super Admin)
  // ---------------------------------------------------------------------------
  const admin = requireRole(ADMIN_ROLES);

  router.get('/api/admin/users', admin, async (req, res) => {
    const search = `%${String(req.query.search ?? '').trim().toLowerCase()}%`;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const rows = await db.query<UserRow & { total: number }>(
      `select *, count(*) over ()::int as total from ${T}.users
        where lower(email) like $1 or lower(name) like $1
        order by is_demo, role_code, name limit $2 offset $3`,
      [search, limit, (page - 1) * limit],
    );
    return res.json({ success: true, total: rows[0]?.total ?? 0, page, limit, users: rows.map(publicUser) });
  });

  router.post('/api/admin/users', admin, async (req, res) => {
    const email = normEmail(req.body?.email);
    const name = String(req.body?.name ?? '').trim();
    const roleCode = req.body?.roleCode as RoleCode;
    const password = req.body?.password ? String(req.body.password) : '';
    if (!isEmail(email) || !name || !ROLE_CODES.includes(roleCode)) {
      return res.status(400).json({ success: false, message: 'Valid email, name and role are required.' });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` });
    }
    if (password && !evaluatePasswordPolicy(password).isValid) {
      return res.status(400).json({ success: false, message: `Password needs: ${evaluatePasswordPolicy(password).errors.join(', ')}.` });
    }
    if (await userByEmail(email)) return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
    const [row] = await db.query<UserRow>(
      `insert into ${T}.users (id, email, name, role_code, department, password_hash, profile)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [
        `usr-${crypto.randomUUID()}`,
        email,
        name,
        roleCode,
        String(req.body?.department ?? '').trim(),
        password ? await hashPassword(password) : null,
        pick(req.body?.profile, ADMIN_PROFILE_FIELDS),
      ],
    );
    return res.status(201).json({ success: true, user: publicUser(row) });
  });

  router.patch('/api/admin/users/:id', admin, async (req, res) => {
    const target = await userById(String(req.params.id));
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });
    const b = req.body ?? {};
    const isSelf = target.id === req.user!.id;
    if (isSelf && ((b.roleCode && b.roleCode !== target.role_code) || (b.status && b.status !== target.status))) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role or lock your own account.' });
    }
    if (b.roleCode !== undefined && !ROLE_CODES.includes(b.roleCode)) return res.status(400).json({ success: false, message: 'Unknown role.' });
    if (b.status !== undefined && !['ACTIVE', 'LOCKED'].includes(b.status)) return res.status(400).json({ success: false, message: 'Unknown status.' });
    if (b.password && String(b.password).length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` });
    }
    if (b.password && !evaluatePasswordPolicy(String(b.password)).isValid) {
      return res.status(400).json({ success: false, message: `Password needs: ${evaluatePasswordPolicy(String(b.password)).errors.join(', ')}.` });
    }
    const name = b.name !== undefined ? String(b.name).trim() : target.name;
    if (!name) return res.status(400).json({ success: false, message: 'Name cannot be empty.' });

    const [row] = await db.query<UserRow>(
      `update ${T}.users set name = $2, role_code = $3, department = $4, status = $5, profile = $6,
              password_hash = coalesce($7, password_hash)
        where id = $1 returning *`,
      [
        target.id,
        name,
        b.roleCode ?? target.role_code,
        b.department !== undefined ? String(b.department).trim() : target.department,
        b.status ?? target.status,
        { ...target.profile, ...pick(b.profile, ADMIN_PROFILE_FIELDS) },
        b.password ? await hashPassword(String(b.password)) : null,
      ],
    );
    // Privilege or credential changes take effect immediately.
    if (b.roleCode || b.status === 'LOCKED' || b.password) await revokeSessions(target.id);
    return res.json({ success: true, user: publicUser(row) });
  });

  router.delete('/api/admin/users/:id', admin, async (req, res) => {
    if (req.params.id === req.user!.id) return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    const rows = await db.query(`delete from ${T}.users where id = $1 returning id`, [String(req.params.id)]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.json({ success: true });
  });

  router.post('/api/admin/users/:id/revoke-sessions', admin, async (req, res) => {
    await revokeSessions(String(req.params.id));
    return res.json({ success: true });
  });

  router.get('/api/admin/sessions', admin, async (_req, res) => {
    const rows = await db.query(
      `select u.id as "userId", u.name, u.email, u.role_code as "roleCode", count(*)::int as "activeSessions",
              max(s.created_at) as "lastSignIn", max(s.expires_at) as "expiresAt"
         from ${T}.auth_sessions s join ${T}.users u on u.id = s.user_id
        where s.expires_at > now() group by u.id order by max(s.created_at) desc`,
    );
    return res.json({ success: true, sessions: rows });
  });

  return { router, loadUser, seedUsers, persistentRateLimit, clearPersistentRateLimits };
}
