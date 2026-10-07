import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Db } from './db';
import { HttpError } from './validate';
import { evaluatePasswordPolicy, MAX_PASSWORD_LENGTH, verifyPassword } from '../lib/passwordUtils';
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
const DEMO_ROLE_EMAILS: Record<string, string> = {
  Coordinator: 'coordinator.demo@demo.thapar.local',
  Faculty: 'faculty.demo@demo.thapar.local',
  Student: 'student.demo@demo.thapar.local',
  Admin: 'admin.demo@demo.thapar.local',
  HOD: 'hod.demo@demo.thapar.local',
};

// Profile fields a user may edit themselves; admins may also edit the identity fields.
const SELF_PROFILE_FIELDS = ['phone', 'officeLocation', 'officeHours', 'specialization', 'notificationPreferences'];
const ADMIN_PROFILE_FIELDS = [...SELF_PROFILE_FIELDS, 'rollNumber', 'sectionId', 'batch', 'avatarUrl', 'facultyId'];
// Sample staff accounts are linked to records in the sample faculty roster so their portals have data.
const SAMPLE_FACULTY_LINKS: Record<string, string> = { 'usr-sharma': 'fac-0001', 'usr-gupta': 'fac-0002', 'usr-murthy': 'fac-0003', 'usr-roy': 'fac-0004', 'usr-demo-faculty': 'fac-0005' };

const SESSION_COOKIE = 'tt_session';
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

// Rate limiting is persisted in intellischedule.rate_limits through persistentRateLimit().
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

  async function startSession(req: Request, res: Response, user: UserRow) {
    const token = crypto.randomBytes(32).toString('base64url');
    const ttlMs = opts.sessionTtlHours * 3600_000;
    await db.query(`insert into ${T}.auth_sessions (token_hash, user_id, expires_at) values ($1, $2, $3)`, [
      sha256(token),
      user.id,
      new Date(Date.now() + ttlMs),
    ]);
    await db.query(`update ${T}.users set last_login_at = now() where id = $1`, [user.id]);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: ttlMs });
  }

  async function revokeSessions(userId: string) {
    await db.query(`delete from ${T}.auth_sessions where user_id = $1`, [userId]);
  }

  async function persistentRateLimit(key: string, max: number, windowMs: number): Promise<number> {
    const rows = await db.query<{ count: number; reset_at: Date }>(
      `insert into ${T}.rate_limits (key, count, reset_at)
       values ($1, 1, now() + ($2 * interval '1 millisecond'))
       on conflict (key) do update
       set count = case when ${T}.rate_limits.reset_at <= now() then 1 else ${T}.rate_limits.count + 1 end,
           reset_at = case when ${T}.rate_limits.reset_at <= now() then excluded.reset_at else ${T}.rate_limits.reset_at end
       returning count, reset_at`,
      [key, windowMs],
    );
    const row = rows[0];
    if (!row || row.count <= max) return 0;
    return Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
  }

  /** Attaches req.user when the session cookie is valid. Never rejects. */
  async function loadUser(req: Request, _res: Response, next: NextFunction) {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      const rows = await db.query<UserRow>(
        `select u.* from ${T}.auth_sessions s join ${T}.users u on u.id = s.user_id
          where s.token_hash = $1 and s.expires_at > now() and u.status = 'ACTIVE'`,
        [sha256(token)],
      );
      req.user = rows[0]?.is_demo && !opts.demoMode ? undefined : rows[0];
    }
    next();
  }

  /** First start: load the sample accounts; optionally ensure a bootstrap admin. */
  async function seedUsers() {
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from ${T}.users`);
    const seedSamples = process.env.SEED_SAMPLE_USERS === 'true' || (process.env.NODE_ENV !== 'production' && process.env.SEED_SAMPLE_USERS !== 'false');
    if (n === 0 && seedSamples) {
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
      const demoPwd =
        process.env.DEMO_ACCOUNTS_PASSWORD ||
        (process.env.NODE_ENV === 'production' ? '' : crypto.randomBytes(24).toString('base64url'));
      if (!samplePwd || !demoPwd) {
        throw new Error('Sample/demo account passwords must be supplied explicitly in production.');
      }
      const [sampleHash, demoHash] = await Promise.all([hashPassword(samplePwd), hashPassword(demoPwd)]);
      for (const u of SAMPLE_USERS) {
        const membership = INITIAL_MEMBERSHIPS.find((m) => m.userId === u.id);
        const isDemo = u.email.endsWith('@demo.thapar.local');
        await db.query(
          `insert into ${T}.users (id, email, name, role_code, department, password_hash, is_demo, profile)
           values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
          [
            u.id,
            u.email.toLowerCase(),
            u.name,
            roleById[membership?.roleId ?? ''] ?? 'STUDENT',
            u.department ?? '',
            isDemo ? demoHash : sampleHash,
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
    db.query(`delete from ${T}.auth_sessions where expires_at < now()`).catch(() => {});
    db.query(`delete from ${T}.oauth_states where created_at < now() - interval '10 minutes'`).catch(() => {});
    db.query(`delete from ${T}.password_reset_tokens where expires_at < now() or used_at is not null`).catch(() => {});
    db.query(`delete from ${T}.rate_limits where reset_at < now() - interval '1 day'`).catch(() => {});
  }, 3600_000).unref();

  const router = Router();

  router.get('/api/auth/config', (_req, res) => {
    res.json({ googleEnabled, demoEnabled: opts.demoMode, allowedDomains: opts.allowedDomains });
  });

  router.post('/api/auth/register', async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const email = normEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!name || name.length > 120 || !isEmail(email) || !password) {
      return res.status(400).json({ success: false, message: 'Valid name, email and password are required.' });
    }
    if (opts.allowedDomains.length) {
      const domain = email.split('@')[1] ?? '';
      if (!opts.allowedDomains.includes(domain)) {
        return res.status(400).json({ success: false, error: 'INVALID_EMAIL_DOMAIN', message: 'Registration is limited to approved institutional email domains.' });
      }
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` });
    }

    const wait = await persistentRateLimit(`register-ip:${req.ip}`, 10, 60 * 60_000);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ success: false, message: `Too many registration attempts. Try again in ${wait} seconds.` });
    }

    const policy = evaluatePasswordPolicy(password);
    if (!policy.isValid) {
      return res.status(400).json({ success: false, message: `Password needs: ${policy.errors.join(', ')}.` });
    }

    const existing = await userByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const roster = opts.rosterLookup(email);
    if (roster && !['STUDENT', 'CLASS_REPRESENTATIVE'].includes(roster.roleCode)) {
      return res.status(409).json({ success: false, message: 'Staff accounts are provisioned by an administrator or institutional Google sign-in.' });
    }

    const roleCode: RoleCode = roster?.roleCode ?? 'STUDENT';
    const profile = roster?.profile ?? {};
    const [user] = await db.query<UserRow>(
      `insert into ${T}.users (id, email, name, role_code, department, password_hash, profile)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [`usr-${crypto.randomUUID()}`, email, name, roleCode, roster?.department ?? '', await hashPassword(password), profile],
    );

    return res.status(201).json({
      success: true,
      userId: user.id,
      user: publicUser(user),
      requiresLogin: true,
      message: 'Account created successfully. You can now sign in with your email and password.',
    });
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
    const ipWait = await persistentRateLimit(`login-ip:${req.ip}`, IP_LIMIT_PER_MIN, 60_000);
    const accountWait = await persistentRateLimit(`login-acct:${email}`, 10, 15 * 60_000);
    const wait = Math.max(ipWait, accountWait);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ success: false, message: `Too many sign-in attempts. Try again in ${wait} seconds.` });
    }

    const user = await userByEmail(email);
    // Compare against a dummy hash when there is no usable password so timing does not reveal accounts.
    dummyHash ??= await hashPassword(crypto.randomUUID());
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
    if (verification.needsRehash) {
      const newHash = await hashPassword(password);
      await db.query(`update ${T}.users set password_hash = $2 where id = $1`, [user.id, newHash]);
      user.password_hash = newHash;
    }
    await db.query(`update ${T}.users set last_login_at = now() where id = $1`, [user.id]);
    await startSession(req, res, user);
    return res.json({ success: true, user: publicUser(user) });
  });

  router.post('/api/auth/demo-login', async (req, res) => {
    if (!opts.demoMode) {
      return res.status(403).json({ success: false, message: 'Demo access is disabled on this server.' });
    }
    const email = DEMO_ROLE_EMAILS[String(req.body?.roleKey)];
    const user = email ? await userByEmail(email) : undefined;
    if (!user || !user.is_demo || user.status !== 'ACTIVE') {
      return res.status(404).json({ success: false, message: 'That demo account is not available.' });
    }
    await startSession(req, res, user);
    return res.json({ success: true, user: publicUser(user) });
  });

  router.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(401).json({ authenticated: false });
    return res.json({ authenticated: true, user: publicUser(req.user) });
  });

  router.post('/api/auth/logout', async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await db.query(`delete from ${T}.auth_sessions where token_hash = $1`, [sha256(token)]);
    res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    return res.json({ success: true });
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
    const currentVerification = await verifyPassword(String(currentPassword ?? ''), user.password_hash);
    if (!currentVerification.isValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }
    const policy = evaluatePasswordPolicy(String(newPassword ?? ''));
    if (!policy.isValid) {
      return res.status(400).json({ success: false, message: `New password needs: ${policy.errors.join(', ')}.` });
    }
    await db.query(`update ${T}.users set password_hash = $2 where id = $1`, [user.id, await hashPassword(String(newPassword))]);
    await revokeSessions(user.id);
    await startSession(req, res, user);
    return res.json({ success: true, message: 'Password changed. Other devices have been signed out.' });
  });

  router.post('/api/auth/forgot-password', async (req, res) => {
    const wait = await persistentRateLimit(`forgot:${req.ip}`, 30, 60_000);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ success: false, message: 'Too many requests. Try again in a minute.' });
    }

    // Production fails closed when no outbound mail transport is configured. The response
    // is identical for all callers so account existence is never disclosed.
    const mailer = process.env.RESET_MAIL_WEBHOOK_URL;
    if (process.env.NODE_ENV === 'production' && !mailer) {
      return res.status(503).json({ success: false, message: 'Password recovery is temporarily unavailable.' });
    }

    const email = normEmail(req.body?.email);
    if (!isEmail(email)) {
      return res.json({ success: true, message: 'If an account exists for this email, password reset instructions have been sent.' });
    }

    const user = await userByEmail(email);
    let rawToken: string | undefined;
    if (user) {
      rawToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = sha256(rawToken);
      await db.query(`delete from ${T}.password_reset_tokens where user_id = $1 or expires_at < now()`, [user.id]);
      await db.query(
        `insert into ${T}.password_reset_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + interval '15 minutes')`,
        [tokenHash, user.id],
      );

      if (mailer) {
        const base = (opts.appUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
        const mailResp = await fetch(mailer, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.RESET_MAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.RESET_MAIL_WEBHOOK_TOKEN}` } : {}),
          },
          body: JSON.stringify({ to: email, resetUrl: `${base}/?token=${encodeURIComponent(rawToken)}` }),
        });
        if (!mailResp.ok) {
          await db.query(`delete from ${T}.password_reset_tokens where token_hash = $1`, [tokenHash]);
          return res.status(503).json({ success: false, message: 'Password recovery is temporarily unavailable.' });
        }
      }
    }

    const response: Record<string, unknown> = {
      success: true,
      message: 'If an account exists for this email, password reset instructions have been sent.',
    };
    if (process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_RESET_TOKEN === 'true' && rawToken) {
      response.resetToken = rawToken;
    }
    return res.json(response);
  });

  router.get('/api/auth/validate-token', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token || token.length > 256) return res.status(400).json({ valid: false, message: 'Reset token required.' });
    const rows = await db.query<UserRow & { token_hash?: string; expires_at?: Date; used_at?: Date | null }>(
      `select u.email, r.expires_at, r.used_at from ${T}.password_reset_tokens r
       join ${T}.users u on u.id = r.user_id
       where r.token_hash = $1`,
      [sha256(token)],
    );
    const row = rows[0];
    if (!row) return res.status(400).json({ valid: false, message: 'Invalid or unrecognized reset token.' });
    if (row.used_at) return res.status(400).json({ valid: false, message: 'This password reset link has already been used.' });
    if (new Date(row.expires_at!).getTime() <= Date.now()) return res.status(400).json({ valid: false, message: 'This password reset link has expired.' });
    return res.json({ valid: true, email: row.email });
  });

  router.post('/api/auth/reset-password', async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    if (newPassword.length > MAX_PASSWORD_LENGTH) return res.status(400).json({ success: false, message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` });
    const policy = evaluatePasswordPolicy(newPassword);
    if (!policy.isValid) return res.status(400).json({ success: false, message: `Password needs: ${policy.errors.join(', ')}.` });

    const rows = await db.query<{ user_id: string; token_hash: string; expires_at: Date; used_at: Date | null }>(
      `select user_id, token_hash, expires_at, used_at from ${T}.password_reset_tokens where token_hash = $1`,
      [sha256(token)],
    );
    const row = rows[0];
    if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset token. Please request a new one.' });
    }

    const newHash = await hashPassword(newPassword);
    await db.tx(async (q) => {
      const consumed = await q<{ user_id: string }>(
        `update ${T}.password_reset_tokens set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning user_id`,
        [row.token_hash],
      );
      if (!consumed.length) throw new HttpError(400, 'Invalid or expired password reset token. Please request a new one.');
      await q(`update ${T}.users set password_hash = $2 where id = $1`, [row.user_id, newHash]);
      await q(`delete from ${T}.auth_sessions where user_id = $1`, [row.user_id]);
    });

    return res.json({ success: true, message: 'Your password has been reset successfully. You can now sign in with your new password.' });
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
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).send('Too many sign-in attempts. Try again shortly.');
    }
    const state = crypto.randomBytes(32).toString('base64url');
    await db.query(`insert into ${T}.oauth_states (state) values ($1)`, [state]);
    res.cookie('tt_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60_000,
      path: '/',
    });
    const params = new URLSearchParams({
      client_id: opts.googleClientId!,
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
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

    const cookieState = readCookie(req, 'tt_oauth_state');
    res.clearCookie('tt_oauth_state', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    if (!cookieState || cookieState !== state) return fail('Invalid sign-in state. Please start Google sign-in again.');
    const consumed = await db.query(
      `delete from ${T}.oauth_states where state = $1 and created_at > now() - interval '10 minutes' returning state`,
      [state],
    );
    if (!consumed.length) return fail('Your sign-in link expired. Please try again.');

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
        }),
      });
      const tokens = (await tokenResp.json()) as { access_token?: string };
      if (!tokenResp.ok || !tokens.access_token) return fail('Google sign-in could not be completed.');

      const infoResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const info = (await infoResp.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
      if (!infoResp.ok || !info.sub || !info.email || !info.email_verified) return fail('Google did not return a verified email address.');

      const email = normEmail(info.email);
      const domain = email.split('@')[1];
      if (opts.allowedDomains.length && !opts.allowedDomains.includes(domain)) {
        return fail(`Please use your ${opts.allowedDomains.map((d) => '@' + d).join(' or ')} account.`);
      }

      let user = (await db.query<UserRow>(`select * from ${T}.users where google_sub = $1`, [info.sub]))[0] ?? (await userByEmail(email));
      if (user?.is_demo) return fail('Demo accounts cannot use Google sign-in.');
      if (user && user.google_sub && user.google_sub !== info.sub) return fail('This email is linked to a different Google account.');

      if (user && !user.google_sub) {
        [user] = await db.query<UserRow>(`update ${T}.users set google_sub = $2 where id = $1 returning *`, [user.id, info.sub]);
      }
      if (!user) {
        const match = opts.rosterLookup(email);
        if (!match) {
          return fail('Your account is not in the institute roster yet. Ask the timetable coordinator to add you.');
        }
        [user] = await db.query<UserRow>(
          `insert into ${T}.users (id, email, name, role_code, department, google_sub, profile)
           values ($1, $2, $3, $4, $5, $6, $7) returning *`,
          [`usr-${crypto.randomUUID()}`, email, match.name || info.name || email, match.roleCode, match.department, info.sub, match.profile ?? {}],
        );
      }
      if (user.status !== 'ACTIVE') return fail('This account is locked. Contact the timetable administrator.');

      await startSession(req, res, user);
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

  return { router, loadUser, seedUsers };
}
