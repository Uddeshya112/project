import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { OAuth2Client } from 'google-auth-library';
import {
  hashPasswordBcrypt,
  hashPasswordBcryptSync,
  hashPasswordScrypt,
  verifyPassword,
  hashPasswordLegacy,
  evaluatePasswordPolicy,
  BCRYPT_SALT_ROUNDS,
  MAX_PASSWORD_LENGTH,
} from './src/lib/passwordUtils';
import { executeOptimizationEngine, compileSchedulingProblem } from './src/lib/optimizationEngine';
import {
  INITIAL_ACADEMIC_YEAR,
  INITIAL_ALLOCATIONS,
  FACULTY_MEMBERS,
  ROOMS,
  SECTIONS,
  COURSES,
  INITIAL_CONSTRAINTS,
} from './src/lib/initialData';
import { supabaseStore } from './src/server/supabaseStore';
import { timetableJobManager } from './src/server/jobManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Initialize Server-side Supabase Clients
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';
const supabaseAnonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

export const supabaseAdmin: SupabaseClient | null =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export const supabaseAnon: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

if (supabaseAdmin) {
  console.info('[SUPABASE AUTH] Connected to Supabase Auth Authority at ' + supabaseUrl);
} else {
  console.warn('[SUPABASE AUTH] Service role key missing; operating in local mode.');
}

// Security Middleware: Headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ||
    [
      'https://tiet-timetable-six.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ].join(','))
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    callback(null, origin === undefined || allowedOrigins.has(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Requested-With'],
};

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

export type WorkspaceType = 'Student' | 'CR' | 'Faculty' | 'Coordinator' | 'Admin';

export type RoleCode = 'SUPER_ADMIN' | 'COLLEGE_ADMIN' | 'COORDINATOR' | 'HOD' | 'FACULTY' | 'CLASS_REPRESENTATIVE' | 'STUDENT';

// In-Memory Database simulating PostgreSQL + Redis session store
interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  roleId: string;
  roleCode: RoleCode;
  roleName: string;
  institutionId: string;
  institutionName: string;
  department: string;
  status: 'ACTIVE' | 'LOCKED';
  createdAt: string;
  authorizedWorkspaces?: WorkspaceType[];
  isDemoUser?: boolean;
}

interface StoredSession {
  id: string;
  userId: string;
  token: string;
  roleCode: string;
  createdAt: string;
  expiresAt: string;
  isRevoked: boolean;
}

interface StoredResetToken {
  id: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  isUsed: boolean;
  createdAt: string;
}

interface StoredUserIdentity {
  id: string;
  userId: string;
  provider: 'google';
  providerSubject: string;
  createdAt: string;
}

// In-Memory Rate Limiter (IP & Account level)
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const loginRateLimiter = new Map<string, RateLimitBucket>();

export function clearRateLimits() {
  loginRateLimiter.clear();
}

function checkRateLimit(key: string, maxAttempts = 60, windowMs = 60000): { limited: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const bucket = loginRateLimiter.get(key);

  if (!bucket || now > bucket.resetAt) {
    loginRateLimiter.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false };
  }

  if (bucket.count >= maxAttempts) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    return { limited: true, retryAfterSec };
  }

  bucket.count += 1;
  return { limited: false };
}

// Pre-authorized staff directory (auth.role_assignments)
const DEMO_ACCOUNT_PASSWORD =
  process.env.DEMO_ACCOUNT_PASSWORD ||
  crypto.randomBytes(16).toString('hex') + 'A1!';
const SEED_USER_PASSWORD =
  process.env.SEED_USER_PASSWORD ||
  (() => {
    const generated = crypto.randomBytes(16).toString('hex') + 'T1!';
    if (process.env.NODE_ENV !== 'production') {
    }
    return generated;
  })();
const isProdEnvironment = process.env.NODE_ENV === 'production';

const PRE_AUTHORIZED_STAFF: Record<string, { roleCode: 'COORDINATOR' | 'FACULTY' | 'HOD' | 'COLLEGE_ADMIN'; roleName: string; department: string }> = {
  'kn.murthy@thapar.edu': { roleCode: 'COORDINATOR', roleName: 'Timetable Coordinator', department: 'Computer Science and Engineering (CSED)' },
  'a.sharma@thapar.edu': { roleCode: 'FACULTY', roleName: 'Faculty (CSED)', department: 'Computer Science and Engineering (CSED)' },
  'p.gupta@thapar.edu': { roleCode: 'FACULTY', roleName: 'Faculty (CSED)', department: 'Computer Science and Engineering (CSED)' },
  's.roy@thapar.edu': { roleCode: 'HOD', roleName: 'Head of Department', department: 'School of Mathematics' },
  'dean@thapar.edu': { roleCode: 'COLLEGE_ADMIN', roleName: 'Dean of Academic Affairs', department: 'Office of the Dean' },
  'coordinator.demo@demo.thapar.local': { roleCode: 'COORDINATOR', roleName: 'Timetable Coordinator', department: 'Computer Science and Engineering (CSED)' },
  'faculty.demo@demo.thapar.local': { roleCode: 'FACULTY', roleName: 'Faculty Member', department: 'Computer Science and Engineering (CSED)' },
  'hod.demo@demo.thapar.local': { roleCode: 'HOD', roleName: 'Head of Department', department: 'School of Mathematics' },
  'admin.demo@demo.thapar.local': { roleCode: 'COLLEGE_ADMIN', roleName: 'College Admin / Dean', department: 'Office of the Dean' },
};

// Seed initial institutional users using standard Bcrypt KDF (Non-production only)
const usersDatabase: Map<string, StoredUser> = new Map(
  isProdEnvironment
    ? []
    : [
  [
    'kn.murthy@thapar.edu',
    {
      id: 'usr-murthy',
      name: 'Dr. K. N. Murthy',
      email: 'kn.murthy@thapar.edu',
      passwordHash: hashPasswordBcryptSync(SEED_USER_PASSWORD),
      roleId: 'role-coordinator',
      roleCode: 'COORDINATOR',
      roleName: 'Timetable Coordinator',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Computer Science and Engineering (CSED)',
      status: 'ACTIVE',
      createdAt: '2026-08-01T09:00:00Z',
      authorizedWorkspaces: ['Coordinator', 'Faculty'],
    },
  ],
  [
    'a.sharma@thapar.edu',
    {
      id: 'usr-sharma',
      name: 'Prof. Arvind Sharma',
      email: 'a.sharma@thapar.edu',
      passwordHash: hashPasswordBcryptSync(SEED_USER_PASSWORD),
      roleId: 'role-faculty',
      roleCode: 'FACULTY',
      roleName: 'Faculty Member',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Computer Science and Engineering (CSED)',
      status: 'ACTIVE',
      createdAt: '2026-08-01T09:00:00Z',
      authorizedWorkspaces: ['Faculty'],
    },
  ],
  [
    'p.gupta@thapar.edu',
    {
      id: 'usr-gupta',
      name: 'Dr. Priya Gupta',
      email: 'p.gupta@thapar.edu',
      passwordHash: hashPasswordBcryptSync(SEED_USER_PASSWORD),
      roleId: 'role-faculty',
      roleCode: 'FACULTY',
      roleName: 'Faculty Member',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Computer Science and Engineering (CSED)',
      status: 'ACTIVE',
      createdAt: '2026-08-01T09:00:00Z',
      authorizedWorkspaces: ['Faculty'],
    },
  ],
  [
    's.roy@thapar.edu',
    {
      id: 'usr-roy',
      name: 'Prof. Sunita Roy',
      email: 's.roy@thapar.edu',
      passwordHash: hashPasswordBcryptSync(SEED_USER_PASSWORD),
      roleId: 'role-hod',
      roleCode: 'HOD',
      roleName: 'Head of Department',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'School of Mathematics',
      status: 'ACTIVE',
      createdAt: '2026-08-01T09:00:00Z',
      authorizedWorkspaces: ['Coordinator', 'Faculty'],
    },
  ],
  [
    'dean@thapar.edu',
    {
      id: 'usr-dean',
      name: 'Dr. Vikram Sengupta',
      email: 'dean@thapar.edu',
      passwordHash: hashPasswordBcryptSync(SEED_USER_PASSWORD),
      roleId: 'role-admin',
      roleCode: 'COLLEGE_ADMIN',
      roleName: 'College Admin / Dean',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Office of the Dean',
      status: 'ACTIVE',
      createdAt: '2026-07-15T09:00:00Z',
      authorizedWorkspaces: ['Admin', 'Coordinator'],
    },
  ],
  [
    'aarav.m@thapar.edu',
    {
      id: 'usr-aarav',
      name: 'Aarav Mehta',
      email: 'aarav.m@thapar.edu',
      passwordHash: hashPasswordBcryptSync(SEED_USER_PASSWORD),
      roleId: 'role-student',
      roleCode: 'STUDENT',
      roleName: 'Student',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Computer Science and Engineering (CSED)',
      status: 'ACTIVE',
      createdAt: '2026-08-10T10:00:00Z',
      authorizedWorkspaces: ['Student', 'CR'],
    },
  ],
  [
    'coordinator.demo@demo.thapar.local',
    {
      id: 'usr-demo-coordinator',
      name: 'Prof. Rajesh K. Demo (Coordinator)',
      email: 'coordinator.demo@demo.thapar.local',
      passwordHash: hashPasswordBcryptSync(DEMO_ACCOUNT_PASSWORD),
      roleId: isProdEnvironment ? 'role-student' : 'role-coordinator',
      roleCode: (isProdEnvironment ? 'STUDENT' : 'COORDINATOR') as RoleCode,
      roleName: isProdEnvironment ? 'Student' : 'Timetable Coordinator',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Computer Science and Engineering (CSED)',
      status: 'ACTIVE',
      createdAt: '2026-08-01T09:00:00Z',
      authorizedWorkspaces: (isProdEnvironment ? ['Student'] : ['Coordinator', 'Faculty']) as WorkspaceType[],
      isDemoUser: true,
    },
  ],
  [
    'faculty.demo@demo.thapar.local',
    {
      id: 'usr-demo-faculty',
      name: 'Dr. Neha Agarwal (Faculty)',
      email: 'faculty.demo@demo.thapar.local',
      passwordHash: hashPasswordBcryptSync(DEMO_ACCOUNT_PASSWORD),
      roleId: 'role-faculty',
      roleCode: 'FACULTY',
      roleName: 'Faculty Member',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Computer Science and Engineering (CSED)',
      status: 'ACTIVE',
      createdAt: '2026-08-01T09:00:00Z',
      authorizedWorkspaces: ['Faculty'],
      isDemoUser: true,
    },
  ],
  [
    'student.demo@demo.thapar.local',
    {
      id: 'usr-demo-student',
      name: 'Rohan Sharma (Student)',
      email: 'student.demo@demo.thapar.local',
      passwordHash: hashPasswordBcryptSync(DEMO_ACCOUNT_PASSWORD),
      roleId: 'role-student',
      roleCode: 'STUDENT',
      roleName: 'Student',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Computer Science and Engineering (CSED)',
      status: 'ACTIVE',
      createdAt: '2026-08-10T10:00:00Z',
      authorizedWorkspaces: ['Student'],
      isDemoUser: true,
    },
  ],
  [
    'admin.demo@demo.thapar.local',
    {
      id: 'usr-demo-admin',
      name: 'Dr. Vikram Sengupta (Dean/Admin)',
      email: 'admin.demo@demo.thapar.local',
      passwordHash: hashPasswordBcryptSync(DEMO_ACCOUNT_PASSWORD),
      roleId: isProdEnvironment ? 'role-student' : 'role-admin',
      roleCode: (isProdEnvironment ? 'STUDENT' : 'COLLEGE_ADMIN') as RoleCode,
      roleName: isProdEnvironment ? 'Student' : 'College Admin / Dean',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Office of the Dean',
      status: 'ACTIVE',
      createdAt: '2026-07-15T09:00:00Z',
      authorizedWorkspaces: (isProdEnvironment ? ['Student'] : ['Admin', 'Coordinator']) as WorkspaceType[],
      isDemoUser: true,
    },
  ],
  [
    'hod.demo@demo.thapar.local',
    {
      id: 'usr-demo-hod',
      name: 'Dr. Sunita Rao (HOD)',
      email: 'hod.demo@demo.thapar.local',
      passwordHash: hashPasswordBcryptSync(DEMO_ACCOUNT_PASSWORD),
      roleId: 'role-hod',
      roleCode: 'HOD',
      roleName: 'Head of Department',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'School of Mathematics',
      status: 'ACTIVE',
      createdAt: '2026-08-01T09:00:00Z',
      authorizedWorkspaces: ['Coordinator', 'Faculty'],
      isDemoUser: true,
    },
  ],
]);

const sessionsDatabase: Map<string, StoredSession> = new Map();
const resetTokensDatabase: Map<string, StoredResetToken> = new Map();
const userIdentitiesDatabase: Map<string, StoredUserIdentity> = new Map();
const googleOAuthStates: Map<string, { createdAt: number }> = new Map();

function resolveWorkspacesForUser(user: StoredUser): WorkspaceType[] {
  if (user.authorizedWorkspaces && user.authorizedWorkspaces.length > 0) {
    return user.authorizedWorkspaces;
  }
  switch (user.roleCode) {
    case 'COORDINATOR':
      return ['Coordinator', 'Faculty'];
    case 'FACULTY':
      return ['Faculty'];
    case 'HOD':
      return ['Coordinator', 'Faculty'];
    case 'COLLEGE_ADMIN':
    case 'SUPER_ADMIN':
      return ['Admin', 'Coordinator'];
    case 'CLASS_REPRESENTATIVE':
      return ['Student', 'CR'];
    case 'STUDENT':
    default:
      return user.id === 'usr-aarav' ? ['Student', 'CR'] : ['Student'];
  }
}

function mapRoleCodeToDashboard(roleCode: string): 'Coordinator' | 'Faculty' | 'HOD' | 'Admin' | 'Student' {
  switch (roleCode) {
    case 'COORDINATOR':
      return 'Coordinator';
    case 'FACULTY':
      return 'Faculty';
    case 'HOD':
      return 'HOD';
    case 'COLLEGE_ADMIN':
    case 'SUPER_ADMIN':
      return 'Admin';
    case 'STUDENT':
    default:
      return 'Student';
  }
}

// -------------------------------------------------------------
// HEALTH CHECKS (Layer 14 - Monitoring & Operational Soundness)
// -------------------------------------------------------------
app.get('/api/health/live', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.status(200).json({
    status: 'LIVE',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'intellischedule-core',
  });
});

app.get('/api/health/ready', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const dbUsersCount = usersDatabase.size;
  const activeSessionsCount = sessionsDatabase.size;
  return res.status(200).json({
    status: 'READY',
    timestamp: new Date().toISOString(),
    checks: {
      inMemoryDatabase: 'OK',
      userStoreCount: dbUsersCount,
      activeSessions: activeSessionsCount,
      rateLimiter: 'OK',
    },
  });
});

// Test helper: Reset rate limits for automated CI/regression suites (Only registered when NODE_ENV === 'test')
if (process.env.NODE_ENV === 'test') {
  app.post('/api/test/reset-rate-limits', (_req: Request, res: Response) => {
    loginRateLimiter.clear();
    return res.json({ success: true, message: 'Rate limit buckets cleared.' });
  });
}

// Ensure Supabase Auth users on server startup (Never run in production)
async function ensureSupabaseAuthUsers() {
  if (process.env.NODE_ENV === 'production') return;
  if (!supabaseAdmin) return;
  try {
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
    const existingMap = new Map((usersList?.users || []).map(u => [u.email?.toLowerCase(), u]));

    // 1. Ensure institution exists in Supabase
    await supabaseAdmin.from('institutions').upsert({
      id: 'inst-thapar',
      name: 'Thapar Institute of Engineering and Technology',
      code: 'TIET',
      domain: 'thapar.edu',
      status: 'ACTIVE',
      location: 'Patiala, Punjab',
      established_year: 1956,
    });

    // 2. Ensure roles exist
    const defaultRoles = [
      { id: 'role-super_admin', code: 'SUPER_ADMIN', name: 'Super Administrator' },
      { id: 'role-college_admin', code: 'COLLEGE_ADMIN', name: 'Dean / Administrator' },
      { id: 'role-coordinator', code: 'COORDINATOR', name: 'Timetable Coordinator' },
      { id: 'role-hod', code: 'HOD', name: 'Head of Department' },
      { id: 'role-faculty', code: 'FACULTY', name: 'Faculty Member' },
      { id: 'role-class_representative', code: 'CLASS_REPRESENTATIVE', name: 'Class Representative' },
      { id: 'role-student', code: 'STUDENT', name: 'Student' },
    ];
    for (const r of defaultRoles) {
      await supabaseAdmin.from('roles').upsert(r);
    }

    // 3. Seed users into auth.users and public.profiles
    for (const [email, user] of usersDatabase.entries()) {
      const defaultPassword = user.isDemoUser ? DEMO_ACCOUNT_PASSWORD : SEED_USER_PASSWORD;
      const existing = existingMap.get(email.toLowerCase());

      let authId = user.id;
      if (!existing) {
        const { data: created } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: {
            name: user.name,
            roleCode: user.roleCode,
            roleName: user.roleName,
            department: user.department,
            isDemoUser: Boolean(user.isDemoUser),
          },
        });
        if (created?.user) {
          authId = created.user.id;
          user.id = authId;
        }
      } else {
        // NEVER update password for existing users
        authId = existing.id;
        user.id = authId;
      }

      // Upsert profile in Supabase public.profiles
      await supabaseAdmin.from('profiles').upsert({
        id: authId,
        email: user.email,
        name: user.name,
        institution_id: 'inst-thapar',
        department: user.department,
        role_code: user.roleCode,
        role_name: user.roleName,
        authorized_workspaces: resolveWorkspacesForUser(user),
        is_demo_user: Boolean(user.isDemoUser),
        status: user.status,
      });
    }

    console.info('[SUPABASE AUTH] Synchronized baseline institutional and demo users into auth.users and public.profiles.');
  } catch (err: any) {
    console.warn('[SUPABASE AUTH] User bootstrap sync notice:', err?.message || err);
  }
}

// -------------------------------------------------------------
// POST /api/auth/login (Authoritative Supabase Auth Verification)
// -------------------------------------------------------------
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const { email, password } = req.body;

  // Validate format
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Both institutional email and password are required.',
    });
  }
  if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`,
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // Rate Limiting Protection (Applied BEFORE credential checks)
  const isDemo = normalizedEmail.endsWith('@demo.thapar.local');
  const ipCheck = checkRateLimit(`login_ip_${clientIp}`, isDemo ? 120 : 30, 60000);
  const accountCheck = checkRateLimit(`login_acc_${normalizedEmail}`, isDemo ? 120 : 15, 60000);

  if (ipCheck.limited || accountCheck.limited) {
    const retrySec = ipCheck.retryAfterSec || accountCheck.retryAfterSec || 60;
    return res.status(429).json({
      success: false,
      message: `Too many login attempts. Please try again in ${retrySec} seconds.`,
      retryAfter: retrySec,
    });
  }

  // 1. Authoritative Supabase Auth Verification
  const authClient = supabaseAnon || supabaseAdmin;
  if (authClient) {
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: normalizedEmail,
      password: String(password),
    });

    if (authError || !authData?.user || !authData?.session) {
      console.info(`[SUPABASE AUTH] Login failed for ${normalizedEmail}: ${authError?.message || 'Invalid credentials'}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid institutional credentials. Please check your email and password.',
      });
    }

    const authUser = authData.user;
    const sessionToken = authData.session.access_token || ('jwt_live_' + crypto.randomBytes(32).toString('hex'));

    let user = usersDatabase.get(normalizedEmail);
    if (!user) {
      // Look up profile from Supabase profiles table (roles are server-authoritative)
      let profileRoleCode: RoleCode | undefined;
      let profileRoleName: string | undefined;
      let profileDepartment: string | undefined;
      let profileName: string | undefined;
      let profileIsDemo: boolean = false;

      if (supabaseAdmin) {
        try {
          const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', authUser.id).single();
          if (profile) {
            profileRoleCode = profile.role_code as RoleCode;
            profileRoleName = profile.role_name;
            profileDepartment = profile.department;
            profileName = profile.name;
            profileIsDemo = Boolean(profile.is_demo_user);
          }
        } catch {}
      }

      const preAuth = PRE_AUTHORIZED_STAFF[normalizedEmail];
      const roleCode: RoleCode =
        profileRoleCode ||
        (preAuth ? preAuth.roleCode : 'STUDENT');
      const roleName =
        profileRoleName ||
        (preAuth ? preAuth.roleName : (roleCode === 'COORDINATOR' ? 'Timetable Coordinator' : roleCode === 'FACULTY' ? 'Faculty Member' : roleCode === 'COLLEGE_ADMIN' ? 'College Admin / Dean' : roleCode === 'HOD' ? 'Head of Department' : 'Student'));
      const department =
        profileDepartment ||
        (preAuth ? preAuth.department : 'Computer Science and Engineering (CSED)');
      const name =
        profileName ||
        normalizedEmail.split('@')[0].toUpperCase();

      user = {
        id: authUser.id,
        name,
        email: normalizedEmail,
        passwordHash: 'SUPABASE_AUTH_MANAGED',
        roleId: 'role-' + roleCode.toLowerCase(),
        roleCode,
        roleName,
        institutionId: 'inst-thapar',
        institutionName: 'Thapar Institute of Engineering and Technology',
        department,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        isDemoUser: profileIsDemo,
      };
      usersDatabase.set(normalizedEmail, user);
    } else {
      user.id = authUser.id;
    }

    if (user.isDemoUser && process.env.NODE_ENV === 'production' && (user.roleCode === 'COLLEGE_ADMIN' || user.roleCode === 'COORDINATOR')) {
      return res.status(403).json({
        success: false,
        message: 'Administrative and coordinator demo accounts are prohibited in production.',
      });
    }

    // Upsert public profile
    if (supabaseAdmin) {
      await supabaseAdmin.from('profiles').upsert({
        id: authUser.id,
        email: normalizedEmail,
        name: user.name,
        institution_id: 'inst-thapar',
        department: user.department,
        role_code: user.roleCode,
        role_name: user.roleName,
        authorized_workspaces: resolveWorkspacesForUser(user),
        is_demo_user: Boolean(user.isDemoUser),
        status: user.status,
      });
    }

    // Generate session
    const session: StoredSession = {
      id: 'sess_' + Date.now(),
      userId: user.id,
      token: sessionToken,
      roleCode: user.roleCode,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isRevoked: false,
    };
    sessionsDatabase.set(sessionToken, session);

    res.cookie('intellischedule_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    const roleKey = mapRoleCodeToDashboard(user.roleCode);
    const authorizedWorkspaces = resolveWorkspacesForUser(user);

    return res.json({
      success: true,
      message: `Welcome, ${user.name}`,
      token: sessionToken,
      role: roleKey,
      roleCode: user.roleCode,
      roleName: user.roleName,
      authorizedWorkspaces,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        institution: user.institutionName,
        authorizedWorkspaces,
        isDemoUser: Boolean(user.isDemoUser),
      },
    });
  }

  // Fallback if Supabase not configured in local testing
  const user = usersDatabase.get(normalizedEmail);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid institutional credentials. Please check your email and password.',
    });
  }

  if (user.isDemoUser && process.env.NODE_ENV === 'production' && (user.roleCode === 'COLLEGE_ADMIN' || user.roleCode === 'COORDINATOR')) {
    return res.status(403).json({
      success: false,
      message: 'Administrative and coordinator demo accounts are prohibited in production.',
    });
  }

  if (user.status === 'LOCKED') {
    return res.status(403).json({
      success: false,
      message: 'This account has been administratively locked. Contact Dean of Academic Affairs.',
    });
  }

  const passwordVerification = await verifyPassword(String(password), user.passwordHash);
  if (!passwordVerification.isValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid institutional credentials. Please check your email and password.',
    });
  }

  if (passwordVerification.needsRehash) {
    user.passwordHash = hashPasswordBcryptSync(String(password));
    usersDatabase.set(normalizedEmail, user);
  }

  const sessionToken = 'jwt_live_' + crypto.randomBytes(32).toString('hex');
  const session: StoredSession = {
    id: 'sess_' + Date.now(),
    userId: user.id,
    token: sessionToken,
    roleCode: user.roleCode,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    isRevoked: false,
  };
  sessionsDatabase.set(sessionToken, session);

  res.cookie('intellischedule_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });

  const roleKey = mapRoleCodeToDashboard(user.roleCode);
  const authorizedWorkspaces = resolveWorkspacesForUser(user);

  return res.json({
    success: true,
    message: `Welcome, ${user.name}`,
    token: sessionToken,
    role: roleKey,
    roleCode: user.roleCode,
    roleName: user.roleName,
    authorizedWorkspaces,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      institution: user.institutionName,
      authorizedWorkspaces,
      isDemoUser: Boolean(user.isDemoUser),
    },
  });
});

// -------------------------------------------------------------
// GET /api/auth/me (Session Verification)
// -------------------------------------------------------------
app.get('/api/auth/me', async (req: Request, res: Response) => {
  const auth = await authenticateRequestAsync(req);
  if (!auth || !auth.user) {
    return res.status(401).json({ authenticated: false });
  }

  const foundUser = auth.user;
  const roleKey = mapRoleCodeToDashboard(foundUser.roleCode);
  const authorizedWorkspaces = resolveWorkspacesForUser(foundUser);

  return res.json({
    authenticated: true,
    user: {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      department: foundUser.department,
      institution: foundUser.institutionName,
      authorizedWorkspaces,
      isDemoUser: Boolean(foundUser.isDemoUser),
    },
    role: roleKey,
    roleCode: foundUser.roleCode,
    roleName: foundUser.roleName,
    authorizedWorkspaces,
  });
});

// -------------------------------------------------------------
// POST /api/auth/logout
// -------------------------------------------------------------
app.post('/api/auth/logout', async (req: Request, res: Response) => {
  const token =
    req.headers.authorization?.replace(/^Bearer\s+/, '') ||
    (req.headers.cookie?.match(/intellischedule_session=([^;]+)/)?.[1]);

  if (token) {
    let session = sessionsDatabase.get(token);
    if (session) {
      session.isRevoked = true;
      sessionsDatabase.set(token, session);
    } else {
      sessionsDatabase.set(token, {
        id: 'sess_revoked_' + Date.now(),
        userId: 'revoked_token',
        token,
        roleCode: 'STUDENT',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        isRevoked: true,
      });
    }
  }

  if (supabaseAnon) {
    await supabaseAnon.auth.signOut().catch(() => {});
  }

  res.clearCookie('intellischedule_session', { path: '/' });
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// -------------------------------------------------------------
// USER CONTEXT & RBAC API ENDPOINTS
// -------------------------------------------------------------

function getAuthenticatedUser(req: Request): StoredUser | null {
  const token =
    req.headers.authorization?.replace(/^Bearer\s+/, '') ||
    (req.headers.cookie?.match(/intellischedule_session=([^;]+)/)?.[1]);

  if (!token) return null;
  const session = sessionsDatabase.get(token);
  if (!session || session.isRevoked || new Date(session.expiresAt) < new Date()) {
    return null;
  }

  for (const user of usersDatabase.values()) {
    if (user.id === session.userId) return user;
  }
  return null;
}

// GET /api/me (Current Authenticated User Profile)
app.get('/api/me', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Please sign in to continue.' });
  }

  const roleKey = mapRoleCodeToDashboard(user.roleCode);
  const authorizedWorkspaces = resolveWorkspacesForUser(user);

  return res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      institution: user.institutionName,
      roleCode: user.roleCode,
      roleName: user.roleName,
      roleKey,
      authorizedWorkspaces,
      program: 'B.Tech in Computer Science & Engineering',
      semester: 5,
      section: 'CSE-A',
      rollNumber: '102303999',
    },
  });
});

// GET /api/me/timetable (Authenticated User's Schedule)
app.get('/api/me/timetable', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Please sign in to continue.' });
  }

  return res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      roleCode: user.roleCode,
      section: 'CSE-A',
    },
    schedule: [
      { day: 'Monday', timeSlot: '08:00 - 09:00', courseCode: 'CS501', courseName: 'Data Structures', room: 'LT101', faculty: 'Prof. Arvind Sharma', status: 'Cancelled' },
      { day: 'Monday', timeSlot: '10:00 - 11:00', courseCode: 'CS502', courseName: 'Operating Systems', room: 'LT102', faculty: 'Dr. Priya Gupta', status: 'Confirmed' },
      { day: 'Monday', timeSlot: '11:00 - 12:00', courseCode: 'CS503', courseName: 'Database Management', room: 'Room 204', faculty: 'Dr. Rohan Patel', status: 'Confirmed' },
      { day: 'Tuesday', timeSlot: '09:00 - 10:00', courseCode: 'MA501', courseName: 'Discrete Mathematics', room: 'LT101', faculty: 'Prof. Sunita Roy', status: 'Confirmed' },
      { day: 'Wednesday', timeSlot: '10:00 - 11:00', courseCode: 'CS501', courseName: 'Data Structures', room: 'Room 204', faculty: 'Prof. Arvind Sharma', status: 'Confirmed' },
      { day: 'Thursday', timeSlot: '11:00 - 12:00', courseCode: 'CS503', courseName: 'Database Management', room: 'Room 204', faculty: 'Dr. Rohan Patel', status: 'Confirmed' },
      { day: 'Friday', timeSlot: '09:00 - 10:00', courseCode: 'CS502', courseName: 'Operating Systems', room: 'LT102', faculty: 'Dr. Priya Gupta', status: 'Confirmed' },
    ],
  });
});

// -------------------------------------------------------------
// GET /api/demo/status (Demo Configuration & Roles)
// -------------------------------------------------------------
app.get('/api/demo/status', (_req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  const allowInProd = process.env.ALLOW_DEMO_IN_PRODUCTION === 'true';
  const enabled = process.env.PUBLIC_DEMO_ENABLED === 'true' && (!isProd || allowInProd);
  let accounts = [
    {
      roleKey: 'Coordinator',
      label: 'Coordinator',
      email: 'coordinator.demo@demo.thapar.local',
      name: 'Prof. Rajesh K. Demo',
      department: 'Computer Science & Engineering',
      description: 'Master academic scheduling, solver orchestration, conflict review & publishing',
    },
    {
      roleKey: 'Faculty',
      label: 'Faculty',
      email: 'faculty.demo@demo.thapar.local',
      name: 'Dr. Neha Agarwal',
      department: 'Computer Science & Engineering',
      description: 'Personal teaching timetable, room & section allocations, availability blocks',
    },
    {
      roleKey: 'Student',
      label: 'Student',
      email: 'student.demo@demo.thapar.local',
      name: 'Rohan Sharma',
      department: 'B.Tech CSE - Section A',
      description: 'Weekly student class routine, room assignments & faculty details',
    },
    {
      roleKey: 'Admin',
      label: 'Admin',
      email: 'admin.demo@demo.thapar.local',
      name: 'Dr. Vikram Sengupta',
      department: 'Office of the Dean',
      description: 'Institutional regulatory profiles, master timetable publishing & governance',
    },
    {
      roleKey: 'HOD',
      label: 'HOD',
      email: 'hod.demo@demo.thapar.local',
      name: 'Dr. Sunita Rao',
      department: 'School of Mathematics',
      description: 'Departmental faculty load balance, syllabus progress & elective management',
    },
  ];

  if (isProd) {
    accounts = accounts.filter(a => a.roleKey !== 'Admin' && a.roleKey !== 'Coordinator');
  }

  return res.json({
    success: true,
    enabled,
    accounts,
  });
});

// -------------------------------------------------------------
// POST /api/auth/demo-login (Server-Authoritative Demo Authentication)
// -------------------------------------------------------------
app.post('/api/auth/demo-login', async (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  const allowInProd = process.env.ALLOW_DEMO_IN_PRODUCTION === 'true';

  if (isProd && !allowInProd) {
    return res.status(403).json({
      success: false,
      message: 'Demo login is prohibited in production environment.',
    });
  }

  const isDemoEnabled = process.env.PUBLIC_DEMO_ENABLED === 'true';
  if (!isDemoEnabled) {
    return res.status(403).json({
      success: false,
      message: 'Public demo access is currently disabled by administrator configuration.',
    });
  }

  const { roleKey } = req.body;
  if (isProd && (roleKey === 'Admin' || roleKey === 'Coordinator')) {
    return res.status(403).json({
      success: false,
      message: 'Administrative and coordinator demo roles are prohibited in production.',
    });
  }

  const roleEmailMap: Record<string, string> = {
    Coordinator: 'coordinator.demo@demo.thapar.local',
    Faculty: 'faculty.demo@demo.thapar.local',
    Student: 'student.demo@demo.thapar.local',
    Admin: 'admin.demo@demo.thapar.local',
    HOD: 'hod.demo@demo.thapar.local',
  };

  const targetEmail = roleEmailMap[roleKey];
  if (!targetEmail) {
    return res.status(400).json({
      success: false,
      message: 'Invalid demo role requested.',
    });
  }

  let sessionToken = 'jwt_demo_' + crypto.randomBytes(32).toString('hex');
  let authUserId: string | undefined = undefined;

  if (supabaseAnon) {
    const { data: authData, error: authErr } = await supabaseAnon.auth.signInWithPassword({
      email: targetEmail,
      password: DEMO_ACCOUNT_PASSWORD,
    });
    if (!authErr && authData?.session?.access_token) {
      sessionToken = authData.session.access_token;
      authUserId = authData.user?.id;
    }
  }

  const user = usersDatabase.get(targetEmail);
  if (!user || !user.isDemoUser) {
    return res.status(404).json({
      success: false,
      message: 'Demo account not found in database.',
    });
  }

  if (isProd && (user.roleCode === 'COLLEGE_ADMIN' || user.roleCode === 'COORDINATOR')) {
    return res.status(403).json({
      success: false,
      message: 'Administrative and coordinator demo roles are prohibited in production.',
    });
  }

  if (authUserId) {
    user.id = authUserId;
  }

  const session: StoredSession = {
    id: 'sess_demo_' + Date.now(),
    userId: user.id,
    token: sessionToken,
    roleCode: user.roleCode,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    isRevoked: false,
  };
  sessionsDatabase.set(sessionToken, session);

  res.cookie('intellischedule_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });

  const resolvedRoleKey = mapRoleCodeToDashboard(user.roleCode);
  const authorizedWorkspaces = resolveWorkspacesForUser(user);

  return res.json({
    success: true,
    message: `Authenticated as ${user.name} (${user.roleName})`,
    token: sessionToken,
    role: resolvedRoleKey,
    roleCode: user.roleCode,
    roleName: user.roleName,
    authorizedWorkspaces,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      institution: user.institutionName,
      authorizedWorkspaces,
      isDemoUser: true,
    },
  });
});

// -------------------------------------------------------------
// POST /api/demo/reset (Safe Demo Data Reset)
// -------------------------------------------------------------
app.post('/api/demo/reset', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.authenticatedUser?.isDemoUser && process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      message: 'Demo reset can only be executed by authenticated demo accounts.',
    });
  }

  // Restore demo passwords and ensure pristine state
  const demoAccounts = [
    'coordinator.demo@demo.thapar.local',
    'faculty.demo@demo.thapar.local',
    'student.demo@demo.thapar.local',
    'admin.demo@demo.thapar.local',
    'hod.demo@demo.thapar.local',
  ];

  for (const email of demoAccounts) {
    const user = usersDatabase.get(email);
    if (user) {
      user.passwordHash = hashPasswordBcryptSync(DEMO_ACCOUNT_PASSWORD);
      user.status = 'ACTIVE';
      usersDatabase.set(email, user);
    }
  }

  return res.json({
    success: true,
    message: 'Demo dataset and accounts safely restored to pristine initial state.',
    timestamp: new Date().toISOString(),
  });
});

// -------------------------------------------------------------
// POST /api/auth/register (Authoritative Supabase Auth Signup)
// -------------------------------------------------------------
app.post('/api/auth/register', async (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const ipMaxAttempts = process.env.NODE_ENV === 'test' ? 100 : 20;
  const ipRate = checkRateLimit(`register_ip_${clientIp}`, ipMaxAttempts, 60000);
  if (ipRate.limited) {
    return res.status(429).json({
      success: false,
      message: `Too many registration attempts from this IP. Please wait ${ipRate.retryAfterSec} seconds.`,
      error: 'RATE_LIMIT_EXCEEDED',
    });
  }

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Name, institutional email, and password are required.',
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const emailMaxAttempts = process.env.NODE_ENV === 'test' ? 100 : 5;
  const emailRate = checkRateLimit(`register_email_${normalizedEmail}`, emailMaxAttempts, 60000);
  if (emailRate.limited) {
    return res.status(429).json({
      success: false,
      message: `Too many registration attempts for this email address. Please wait ${emailRate.retryAfterSec} seconds.`,
      error: 'RATE_LIMIT_EXCEEDED',
    });
  }

  if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`,
    });
  }

  // Require allowed email domain
  const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || 'thapar.edu')
    .split(',')
    .map(d => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  const emailDomain = normalizedEmail.split('@')[1];

  if (!emailDomain || !allowedDomains.includes(emailDomain)) {
    return res.status(400).json({
      success: false,
      message: `Registration is only permitted for authorized institutional email domains (${allowedDomains.join(', ')}).`,
      error: 'INVALID_EMAIL_DOMAIN',
    });
  }

  // Enforce strong password policy: 12+ chars, uppercase, lowercase, number, special character
  const pwdCheck = evaluatePasswordPolicy(String(password));
  if (!pwdCheck.isValid) {
    return res.status(400).json({
      success: false,
      message: `Password does not meet institutional security requirements: ${pwdCheck.errors.join(', ')}.`,
      errors: pwdCheck.errors,
    });
  }

  // Default to lowest role (STUDENT), never FACULTY.
  // Only emails in an admin-managed allowlist (role_assignments table) may receive staff roles.
  let roleCode: RoleCode = 'STUDENT';
  let roleName = 'Student';
  let department = 'Computer Science and Engineering (CSED)';

  if (supabaseAdmin) {
    try {
      const { data: assignment } = await supabaseAdmin
        .from('role_assignments')
        .select('role_code, role_name, department')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (assignment?.role_code) {
        roleCode = assignment.role_code as RoleCode;
        roleName = assignment.role_name || (roleCode === 'COORDINATOR' ? 'Timetable Coordinator' : roleCode === 'FACULTY' ? 'Faculty Member' : 'Student');
        if (assignment.department) {
          department = assignment.department;
        }
      }
    } catch (err: any) {
      console.warn('[REGISTRATION] Error querying role_assignments:', err?.message || err);
    }
  } else {
    const preStaff = PRE_AUTHORIZED_STAFF[normalizedEmail];
    if (preStaff) {
      roleCode = preStaff.roleCode;
      roleName = preStaff.roleName;
      department = preStaff.department;
    }
  }

  let authUserId = 'usr_' + Date.now();

  // 1. Authoritative Registration in Supabase Auth
  if (supabaseAdmin) {
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = usersList?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);

    if (existingAuthUser || usersDatabase.has(normalizedEmail)) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please sign in instead.',
      });
    }

    console.info(`[SUPABASE AUTH SIGNUP] Creating new auth.users record for: ${normalizedEmail}`);
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      user_metadata: {
        name: String(name).trim(),
      },
    });

    if (createError || !createData?.user) {
      console.error(`[SUPABASE AUTH SIGNUP ERROR] Failed to create auth.users: ${createError?.message}`);
      const errMsg = createError?.message || '';
      const isDuplicate =
        errMsg.toLowerCase().includes('already') ||
        errMsg.toLowerCase().includes('exists') ||
        errMsg.toLowerCase().includes('registered') ||
        errMsg.toLowerCase().includes('duplicate') ||
        errMsg.toLowerCase().includes('database error') ||
        errMsg.toLowerCase().includes('unique') ||
        createError?.status === 422 ||
        createError?.status === 409;

      return res.status(isDuplicate ? 409 : 400).json({
        success: false,
        message: isDuplicate
          ? 'An account with this email already exists. Please sign in instead.'
          : errMsg || 'Failed to create user account in Supabase Auth.',
      });
    }

    authUserId = createData.user.id;
    console.info(`[SUPABASE AUTH SIGNUP SUCCESS] auth.users created with ID: ${authUserId}`);

    // Create / Upsert public profile record linked to auth.users.id
    await supabaseAdmin.from('profiles').upsert({
      id: authUserId,
      email: normalizedEmail,
      name: String(name).trim(),
      institution_id: 'inst-thapar',
      department,
      role_code: roleCode,
      role_name: roleName,
      authorized_workspaces: roleCode === 'COORDINATOR' ? ['Coordinator', 'Faculty'] : roleCode === 'FACULTY' ? ['Faculty'] : ['Student'],
      is_demo_user: false,
      status: 'ACTIVE',
    });
  } else {
    if (usersDatabase.has(normalizedEmail)) {
      return res.status(409).json({
        success: false,
        message: 'An account with this institutional email already exists.',
      });
    }
  }

  const newUser: StoredUser = {
    id: authUserId,
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash: hashPasswordBcryptSync(String(password)),
    roleId: 'role-' + roleCode.toLowerCase(),
    roleCode,
    roleName,
    institutionId: 'inst-thapar',
    institutionName: 'Thapar Institute of Engineering and Technology',
    department,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  usersDatabase.set(normalizedEmail, newUser);

  // Note: Registration does NOT create an authenticated session or issue session cookies.
  // The user must explicitly proceed to login and enter their credentials.
  return res.status(201).json({
    success: true,
    message: 'Account created successfully. Please sign in with your new email and password.',
    email: normalizedEmail,
    userId: authUserId,
    user: {
      id: authUserId,
      email: normalizedEmail,
      name: newUser.name,
      roleCode,
      roleName,
      department,
    },
    requiresLogin: true,
  });
});

// -------------------------------------------------------------
// Google OAuth 2.0 Backend Endpoints
// -------------------------------------------------------------
app.get('/api/auth/google/status', (_req: Request, res: Response) => {
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  res.json({
    configured,
    provider: 'Google OAuth 2.0 (Identity Only: openid, email, profile)',
    message: configured
      ? 'Google OAuth 2.0 is active.'
      : 'Google OAuth 2.0 is currently unconfigured (REQUIRES HUMAN ACTION: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables). Institutional email and password authentication is active.',
  });
});

function getGoogleRedirectUri(req?: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  if (process.env.APP_URL) {
    const base = process.env.APP_URL.trim().replace(/\/+$/, '');
    return `${base}/api/auth/google/callback`;
  }
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0].trim() || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0].trim() || req.get('host') || 'localhost:3000';
    return `${proto}://${host}/api/auth/google/callback`;
  }
  return 'http://localhost:3000/api/auth/google/callback';
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initiation: GET /api/auth/google/authorize
app.get('/api/auth/google/authorize', (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getGoogleRedirectUri(req);

  // If GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET are missing, return 503 "Google sign-in not configured"
  if (!clientId || !clientSecret) {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(503).json({ success: false, message: 'Google sign-in not configured' });
    }
    return res.status(503).send('Google sign-in not configured');
  }

  const rate = checkRateLimit(`oauth_ip_${clientIp}`, 10, 60000);
  if (rate.limited) {
    return res.status(429).json({
      success: false,
      message: `Too many authorization attempts. Please wait ${rate.retryAfterSec} seconds.`,
    });
  }

  // Generate cryptographically secure random state (32 bytes = 256 bits)
  const state = crypto.randomBytes(32).toString('hex');
  googleOAuthStates.set(state, { createdAt: Date.now() });

  // Clean expired states older than 10 mins
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [st, val] of googleOAuthStates.entries()) {
    if (val.createdAt < tenMinutesAgo) {
      googleOAuthStates.delete(st);
    }
  }

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&state=${state}&prompt=select_account`;

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ success: true, configured: true, redirectUrl: googleAuthUrl });
  }

  return res.redirect(googleAuthUrl);
});

// Callback: GET /api/auth/google/callback
app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
  const isJson = req.headers.accept?.includes('application/json');
  const { code, state, error } = req.query;
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  const returnError = (status: number, message: string, errorCode = 'OAUTH_ERROR') => {
    if (isJson) {
      return res.status(status).json({ success: false, error: errorCode, message });
    }
    return res.redirect(`/?auth_error=${encodeURIComponent(message)}`);
  };

  if (error) {
    return returnError(400, 'Google sign-in was cancelled or rejected.', 'OAUTH_PROVIDER_ERROR');
  }

  if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
    return returnError(400, 'Invalid or missing OAuth parameters.', 'INVALID_PARAMETERS');
  }

  // Validate state
  const stateRecord = googleOAuthStates.get(state);
  if (!stateRecord || Date.now() - stateRecord.createdAt > 10 * 60 * 1000) {
    googleOAuthStates.delete(state);
    return returnError(400, 'Expired or invalid OAuth session state. Please try again.', 'INVALID_STATE');
  }
  // Single-use token invalidation
  googleOAuthStates.delete(state);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getGoogleRedirectUri(req);

  if (!clientId || !clientSecret) {
    return returnError(503, 'Google sign-in not configured', 'CONFIG_MISSING');
  }

  try {
    // Exchange code for tokens with Google
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.id_token) {
      console.warn('[GOOGLE OAUTH] Token exchange failed with Google');
      return returnError(400, 'Google sign-in could not be completed. Please try again.', 'TOKEN_EXCHANGE_FAILED');
    }

    // Verify ID Token signature using OAuth2Client.verifyIdToken
    let payload: any = null;
    try {
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokenData.id_token,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (verifyErr: any) {
      console.warn('[GOOGLE OAUTH] ID token verification failed:', verifyErr?.message || verifyErr);
      return returnError(400, 'Invalid Google ID token signature.', 'INVALID_ID_TOKEN');
    }

    if (!payload || !payload.email) {
      return returnError(400, 'Unable to determine user identity from Google ID token.', 'IDENTITY_ERROR');
    }

    if (!payload.email_verified) {
      return returnError(400, 'Google email address must be verified.', 'EMAIL_NOT_VERIFIED');
    }

    const normalizedEmail = String(payload.email).trim().toLowerCase();
    const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || 'thapar.edu')
      .split(',')
      .map(d => d.trim().toLowerCase().replace(/^@/, ''));
    const emailDomain = normalizedEmail.split('@')[1];

    if (!emailDomain || !allowedDomains.includes(emailDomain)) {
      return returnError(403, `Google accounts outside authorized institutional domains (${allowedDomains.join(', ')}) are not permitted.`, 'UNAUTHORIZED_DOMAIN');
    }

    const sub = payload.sub;
    const name = payload.name;

    // Check institutional identity
    const identityKey = `google_${sub}`;
    let identity = userIdentitiesDatabase.get(identityKey);
    let user: StoredUser | undefined;

    if (identity) {
      for (const u of usersDatabase.values()) {
        if (u.id === identity.userId) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      user = usersDatabase.get(normalizedEmail);
      if (user) {
        userIdentitiesDatabase.set(identityKey, {
          id: 'ident_' + Date.now(),
          userId: user.id,
          provider: 'google',
          providerSubject: sub,
          createdAt: new Date().toISOString(),
        });
      } else {
        const preAuth = PRE_AUTHORIZED_STAFF[normalizedEmail];
        const roleCode = preAuth ? preAuth.roleCode : 'STUDENT';
        const roleName = preAuth ? preAuth.roleName : 'Student';
        const department = preAuth ? preAuth.department : 'Computer Science and Engineering (CSED)';

        user = {
          id: 'usr_g_' + Date.now(),
          name: name ? String(name).trim() : normalizedEmail.split('@')[0].toUpperCase(),
          email: normalizedEmail,
          passwordHash: hashPasswordBcryptSync('OAuth_Google_' + sub + '_' + normalizedEmail),
          roleId: 'role-' + roleCode.toLowerCase(),
          roleCode,
          roleName,
          institutionId: 'inst-thapar',
          institutionName: 'Thapar Institute of Engineering and Technology',
          department,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        };
        usersDatabase.set(normalizedEmail, user);

        userIdentitiesDatabase.set(identityKey, {
          id: 'ident_' + Date.now(),
          userId: user.id,
          provider: 'google',
          providerSubject: sub,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Create session
    const sessionToken = 'jwt_live_' + crypto.randomBytes(32).toString('hex');
    const session: StoredSession = {
      id: 'sess_' + Date.now(),
      userId: user.id,
      token: sessionToken,
      roleCode: user.roleCode,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isRevoked: false,
    };
    sessionsDatabase.set(sessionToken, session);

    // Set cookie with same options as other login routes: sameSite: 'lax', secure in production
    res.cookie('intellischedule_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    const roleKeyMap: Record<RoleCode, string> = {
      COORDINATOR: 'Coordinator',
      FACULTY: 'Faculty',
      HOD: 'HOD',
      COLLEGE_ADMIN: 'Admin',
      SUPER_ADMIN: 'Admin',
      CLASS_REPRESENTATIVE: 'Student',
      STUDENT: 'Student',
    };
    const roleKey = roleKeyMap[user.roleCode] || 'Student';
    const authorizedWorkspaces = resolveWorkspacesForUser(user);

    if (isJson) {
      return res.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name, roleCode: user.roleCode },
      });
    }

    const safeEmail = escapeHtml(user.email);
    const safeRoleKey = escapeHtml(roleKey);

    return res.send(`<!DOCTYPE html><html><head><title>Authentication Complete</title><style>body{font-family:system-ui,sans-serif;background-color:#09090b;color:#f4f4f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.card{text-align:center;background:#18181b;border:1px solid #27272a;padding:32px;border-radius:16px;}</style></head><body><div class="card"><h3 style="margin:0 0 8px 0;font-size:16px;">Signed in as ${safeEmail}</h3><p style="margin:0;font-size:13px;color:#a1a1aa;">Completing session setup and redirecting...</p></div><script>const authPayload={type:'GOOGLE_AUTH_SUCCESS',roleKey:${JSON.stringify(safeRoleKey)},authorizedWorkspaces:${JSON.stringify(authorizedWorkspaces)}};const targetOrigin=${JSON.stringify(appUrl)};if(window.opener){window.opener.postMessage(authPayload,targetOrigin);setTimeout(()=>{window.close();},400);}else{window.location.href='/';}</script></body></html>`);
  } catch (err) {
    console.error('[GOOGLE OAUTH] Exception in Google OAuth callback handler:', err);
    return returnError(400, 'Google sign-in could not be completed. Please try again.', 'CALLBACK_EXCEPTION');
  }
});

// -------------------------------------------------------------
// -------------------------------------------------------------
// POST /api/auth/forgot-password (Rate limited, anti-enumeration, secure token hash)
// -------------------------------------------------------------
async function sendResetEmail(email: string, token: string): Promise<void> {
  if (process.env.SMTP_URL || process.env.MAILER_SERVICE) {
    // Custom mailer hook behind environment variable
    return;
  }
  const authClient = supabaseAnon || supabaseAdmin;
  if (authClient) {
    try {
      await authClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`,
      });
    } catch (err: any) {
      console.warn('[RESET EMAIL] Supabase resetPasswordForEmail notice:', err?.message || err);
    }
  }
}

const handleForgotPassword = async (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Institutional email is required.',
    });
  }

  // Rate Limiting
  const rate = checkRateLimit(`forgot_ip_${clientIp}`, 5, 60000);
  if (rate.limited) {
    return res.status(429).json({
      success: false,
      message: `Too many password reset requests. Please wait ${rate.retryAfterSec} seconds.`,
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = usersDatabase.get(normalizedEmail);

  let rawToken: string | undefined = undefined;

  if (user) {
    rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Store reset token keyed by tokenHash, never by raw token
    resetTokensDatabase.set(tokenHash, {
      id: 'prt_' + Date.now(),
      email: normalizedEmail,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins
      isUsed: false,
      createdAt: new Date().toISOString(),
    });

    // Send token by email
    await sendResetEmail(normalizedEmail, rawToken);
  }

  // Security requirement: Always return generic response to avoid email enumeration.
  // Never leak resetToken in production or by default.
  const responseData: Record<string, any> = {
    success: true,
    message: 'If an account exists for this email, a password reset link has been sent.',
  };

  // Only for automated tests: return token if BOTH NODE_ENV === 'test' and ALLOW_TEST_RESET_TOKEN === 'true', NEVER in production
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.ALLOW_TEST_RESET_TOKEN === 'true' &&
    rawToken
  ) {
    responseData.resetToken = rawToken;
  }

  return res.json(responseData);
};

app.post('/api/auth/forgot-password', handleForgotPassword);
app.post('/auth/forgot-password', handleForgotPassword);

// -------------------------------------------------------------
// GET /api/auth/validate-token
// -------------------------------------------------------------
app.get('/api/auth/validate-token', (req: Request, res: Response) => {
  const token = req.query.token as string;

  if (!token) {
    return res.status(400).json({ valid: false, message: 'Reset token required.' });
  }

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const record = resetTokensDatabase.get(tokenHash);
  if (!record) {
    return res.status(400).json({ valid: false, message: 'Invalid or unrecognized reset token.' });
  }

  if (record.isUsed) {
    return res.status(400).json({ valid: false, message: 'This password reset link has already been used.' });
  }

  if (new Date(record.expiresAt) < new Date()) {
    return res.status(400).json({ valid: false, message: 'This password reset link has expired (valid for 15 mins).' });
  }

  return res.json({ valid: true, email: record.email });
});

// -------------------------------------------------------------
// POST /api/auth/reset-password
// -------------------------------------------------------------
app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Token and new password are required.',
    });
  }

  const pwdCheck = evaluatePasswordPolicy(String(newPassword));
  if (!pwdCheck.isValid) {
    return res.status(400).json({
      success: false,
      message: `Password does not meet security requirements: ${pwdCheck.errors.join(', ')}.`,
      errors: pwdCheck.errors,
    });
  }

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const record = resetTokensDatabase.get(tokenHash);
  if (!record || record.isUsed || new Date(record.expiresAt) < new Date()) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired password reset token. Please request a new one.',
    });
  }

  const user = usersDatabase.get(record.email);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User account not found.',
    });
  }

  // Update password in database with modern Bcrypt KDF
  user.passwordHash = hashPasswordBcryptSync(String(newPassword));
  usersDatabase.set(record.email, user);

  // Sync password with Supabase Auth
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: String(newPassword),
      });
    } catch (err: any) {
      console.warn('[SUPABASE AUTH] Password update notice:', err?.message || err);
    }
  }

  // Mark token used
  record.isUsed = true;
  resetTokensDatabase.set(tokenHash, record);

  // Invalidate ALL active sessions for this user across memory & Supabase
  for (const [key, sess] of sessionsDatabase.entries()) {
    if (sess.userId === user.id) {
      sess.isRevoked = true;
      sessionsDatabase.set(key, sess);
    }
  }
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.auth.admin.signOut(user.id);
    } catch {}
  }

  return res.json({
    success: true,
    message: 'Your password has been reset successfully. You can now sign in with your new password.',
  });
});

// -------------------------------------------------------------
// SERVER-SIDE RBAC MIDDLEWARE & AUTHORIZATION CONTROLS
// -------------------------------------------------------------
export interface AuthenticatedRequest extends Request {
  authenticatedUser?: StoredUser;
  authenticatedSession?: StoredSession;
}

export async function authenticateRequestAsync(req: Request): Promise<{ user: StoredUser; session?: StoredSession } | null> {
  const authHeader = req.headers.authorization;
  const token =
    authHeader?.replace(/^Bearer\s+/i, '').trim() ||
    (req.headers.cookie?.match(/intellischedule_session=([^;]+)/)?.[1]);

  if (!token) return null;

  // 1. Check local session database (fast cache & revocation check)
  const session = sessionsDatabase.get(token);
  if (session && (session.isRevoked || new Date(session.expiresAt) < new Date())) {
    return null;
  }
  if (session) {
    for (const user of usersDatabase.values()) {
      if (user.id === session.userId) {
        return { user, session };
      }
    }
  }

  // 2. Authoritative Supabase Access Token Verification
  const authClient = supabaseAdmin || supabaseAnon;
  if (authClient) {
    try {
      const { data: authData, error: authError } = await authClient.auth.getUser(token);
      if (!authError && authData?.user) {
        const authUser = authData.user;
        const normalizedEmail = (authUser.email || '').toLowerCase().trim();

        // Retrieve profile from Supabase profiles table using auth.users.id
        let profile: any = null;
        if (supabaseAdmin) {
          const { data: p } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', authUser.id)
            .maybeSingle();
          profile = p;
        }

        // If not found by ID, attempt lookup by email and sync ID
        if (!profile && supabaseAdmin && normalizedEmail) {
          const { data: pByEmail } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('email', normalizedEmail)
            .maybeSingle();
          if (pByEmail) {
            profile = pByEmail;
            await supabaseAdmin.from('profiles').update({ id: authUser.id }).eq('email', normalizedEmail);
          }
        }

        const preAuth = PRE_AUTHORIZED_STAFF[normalizedEmail];
        const roleCode: RoleCode =
          (profile?.role_code as RoleCode) ||
          (preAuth ? preAuth.roleCode : 'STUDENT');
        const roleName =
          profile?.role_name ||
          (preAuth ? preAuth.roleName : (roleCode === 'COORDINATOR' ? 'Timetable Coordinator' : roleCode === 'FACULTY' ? 'Faculty Member' : roleCode === 'COLLEGE_ADMIN' ? 'College Admin / Dean' : roleCode === 'HOD' ? 'Head of Department' : 'Student'));
        const department =
          profile?.department ||
          (preAuth ? preAuth.department : 'Computer Science and Engineering (CSED)');
        const name =
          profile?.name ||
          normalizedEmail.split('@')[0].toUpperCase();

        const user: StoredUser = {
          id: authUser.id,
          name,
          email: normalizedEmail,
          passwordHash: 'SUPABASE_AUTH_MANAGED',
          roleId: 'role-' + roleCode.toLowerCase(),
          roleCode,
          roleName,
          institutionId: profile?.institution_id || 'inst-thapar',
          institutionName: 'Thapar Institute of Engineering and Technology',
          department,
          status: (profile?.status as any) || 'ACTIVE',
          createdAt: authUser.created_at || new Date().toISOString(),
          authorizedWorkspaces: profile?.authorized_workspaces || (roleCode === 'COORDINATOR' ? ['Coordinator', 'Faculty'] : [roleCode as any]),
          isDemoUser: Boolean(profile?.is_demo_user),
        };

        if (normalizedEmail) {
          usersDatabase.set(normalizedEmail, user);
        }

        return { user };
      }
    } catch (err) {
      console.warn('[SUPABASE TOKEN VERIFICATION ERROR]', err);
    }
  }

  return null;
}

export function authenticateRequest(req: Request): { user: StoredUser; session: StoredSession } | null {
  const token =
    req.headers.authorization?.replace(/^Bearer\s+/i, '').trim() ||
    (req.headers.cookie?.match(/intellischedule_session=([^;]+)/)?.[1]);

  if (!token) return null;

  const session = sessionsDatabase.get(token);
  if (!session || session.isRevoked || new Date(session.expiresAt) < new Date()) {
    return null;
  }

  for (const user of usersDatabase.values()) {
    if (user.id === session.userId) {
      return { user, session };
    }
  }

  return null;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const auth = await authenticateRequestAsync(req);
  if (!auth) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHENTICATED',
      message: 'Authentication token is missing, invalid, or expired.',
    });
  }
  req.authenticatedUser = auth.user;
  req.authenticatedSession = auth.session;
  next();
}

export function requireRole(allowedRoles: RoleCode[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.authenticatedUser) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'Authentication required before permission verification.',
      });
    }

    if (!allowedRoles.includes(req.authenticatedUser.roleCode)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Access denied. Role '${req.authenticatedUser.roleCode}' lacks permission for this operation. Required: [${allowedRoles.join(', ')}].`,
      });
    }

    next();
  };
}

// -------------------------------------------------------------
// PROTECTED ACADEMIC & TIMETABLE APIS WITH SERVER-SIDE RBAC
// -------------------------------------------------------------

// -------------------------------------------------------------
// SUPABASE-BACKED MASTER ACADEMIC & TIMETABLE API ENDPOINTS
// -------------------------------------------------------------

// Master Bootstrap State (Database-backed read for complete academic workspace)
app.get('/api/academic/bootstrap', requireAuth, (req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({
    success: true,
    ...state,
    timestamp: new Date().toISOString(),
  });
});

// Paginated Students Query Endpoint
app.get('/api/students', requireAuth, (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = (req.query.search as string) || '';
  const sectionId = (req.query.sectionId as string) || '';

  const result = supabaseStore.queryStudents(page, limit, search, sectionId);
  return res.json({
    success: true,
    ...result,
  });
});

// 1. Departments CRUD
app.get('/api/academic/departments', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, departments: state.departments });
});

app.post('/api/academic/departments', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { name, code, hodName, contactEmail, status } = req.body;
  if (!name || !code) {
    return res.status(400).json({ success: false, message: 'Department name and code are required.' });
  }
  try {
    const dept = supabaseStore.createDepartment(
      {
        name: String(name).trim(),
        code: String(code).trim().toUpperCase(),
        hodName: hodName || 'Head of Department',
        contactEmail: contactEmail || `hod.${String(code).toLowerCase()}@thapar.edu`,
        status: status || 'Active',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({ success: true, message: `Department '${dept.name}' created.`, department: dept });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/departments/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const deptId = req.params.id as string;
    const dept = supabaseStore.updateDepartment(deptId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, department: dept });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/departments/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const deptId = req.params.id as string;
    supabaseStore.deleteDepartment(deptId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Department deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 2. Programs CRUD
app.get('/api/academic/programs', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, programs: state.programs });
});

app.post('/api/academic/programs', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { name, code, departmentId, durationYears, totalSemesters, status } = req.body;
  if (!name || !code) {
    return res.status(400).json({ success: false, message: 'Program name and code are required.' });
  }
  try {
    const prog = supabaseStore.createProgram(
      {
        name: String(name).trim(),
        code: String(code).trim().toUpperCase(),
        departmentId: departmentId || 'dept-cse',
        durationYears: Number(durationYears) || 4,
        totalSemesters: Number(totalSemesters) || 8,
        status: status || 'Active',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({ success: true, message: `Program '${prog.name}' created.`, program: prog });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/programs/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const progId = req.params.id as string;
    const prog = supabaseStore.updateProgram(progId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, program: prog });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/programs/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const progId = req.params.id as string;
    supabaseStore.deleteProgram(progId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Program deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 3. Courses CRUD
app.get('/api/academic/courses', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, courses: state.courses });
});

app.post('/api/academic/courses', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const {
    code,
    name,
    title,
    credits,
    departmentId,
    requiredLecturesPerWeek,
    requiredTutorialsPerWeek,
    requiredLabsPerWeek,
    requiresLab,
    requiredEquipment,
    primaryFacultyId,
  } = req.body;
  const courseCode = String(code || '').trim().toUpperCase();
  const courseName = String(name || title || '').trim();

  if (!courseCode || !courseName) {
    return res.status(400).json({ success: false, message: 'Course code and course title are required.' });
  }

  try {
    const course = supabaseStore.createCourse(
      {
        code: courseCode,
        name: courseName,
        departmentId: departmentId || 'dept-cse',
        credits: Number(credits) || 4,
        requiredLecturesPerWeek: Number(requiredLecturesPerWeek) || 3,
        requiredTutorialsPerWeek: Number(requiredTutorialsPerWeek) || 0,
        requiredLabsPerWeek: Number(requiredLabsPerWeek) || 0,
        totalSemesterHours: 45,
        completedHours: 0,
        cancelledHours: 0,
        requiresLab: Boolean(requiresLab || (Number(requiredLabsPerWeek) || 0) > 0),
        requiredEquipment: Array.isArray(requiredEquipment) ? requiredEquipment : ['Projector'],
        primaryFacultyId: primaryFacultyId || 'fac-sharma',
        status: 'Active',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({
      success: true,
      message: `Course '${course.code} - ${course.name}' added to curriculum catalog.`,
      courseId: course.id,
      course,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/courses/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const courseId = req.params.id as string;
    const course = supabaseStore.updateCourse(courseId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, course });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/courses/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const courseId = req.params.id as string;
    supabaseStore.deleteCourse(courseId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Course deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 4. Faculty CRUD
app.get('/api/academic/faculty', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, facultyMembers: state.facultyMembers });
});

app.post('/api/academic/faculty', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { name, email, departmentId, designation, subjectsQualified, maxDirectTeachingHours, preferences } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Faculty name and institutional email are required.' });
  }
  try {
    const faculty = supabaseStore.createFaculty(
      {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        departmentId: departmentId || 'dept-cse',
        designation: designation || 'Assistant Professor',
        subjectsQualified: Array.isArray(subjectsQualified) ? subjectsQualified : ['CS501'],
        maxDirectTeachingHours: Number(maxDirectTeachingHours) || 14,
        weeklyHoursLimit: 40,
        preferences: preferences || {
          preferredDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          preferredPeriods: [1, 2, 3, 4],
          protectedSlots: [],
          maxConsecutivePeriods: 2,
          availableForMakeup: true,
          availableForTutorial: true,
        },
        status: 'Active',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({ success: true, message: `Faculty '${faculty.name}' registered.`, faculty });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/faculty/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const facultyId = req.params.id as string;
    const faculty = supabaseStore.updateFaculty(facultyId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, faculty });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/faculty/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const facultyId = req.params.id as string;
    supabaseStore.deleteFaculty(facultyId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Faculty removed successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 5. Rooms CRUD
app.get('/api/academic/rooms', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, rooms: state.rooms });
});

app.post('/api/academic/rooms', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { name, capacity, building, floor, type, equipment } = req.body;
  if (!name || !capacity) {
    return res.status(400).json({ success: false, message: 'Room name and capacity are required.' });
  }
  try {
    const room = supabaseStore.createRoom(
      {
        name: String(name).trim(),
        building: building || 'Turing Block',
        floor: Number(floor) || 1,
        capacity: Number(capacity),
        type: type || 'LectureHall',
        equipment: Array.isArray(equipment) ? equipment : ['Projector', 'Whiteboard'],
        isAvailable: true,
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({
      success: true,
      message: `Room '${room.name}' registered with capacity ${room.capacity}.`,
      roomId: room.id,
      room,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/rooms/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const roomId = req.params.id as string;
    const room = supabaseStore.updateRoom(roomId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, room });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/rooms/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const roomId = req.params.id as string;
    supabaseStore.deleteRoom(roomId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Room deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 6. Groups & Subgroups (Cohorts) CRUD
app.get('/api/academic/groups', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, sections: state.sections });
});

app.post('/api/academic/groups', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { name, departmentId, program, semester, batchYear, studentCount, targetSize, maxSize, classRepresentative, subSections } = req.body;
  if (!name || !studentCount) {
    return res.status(400).json({ success: false, message: 'Group name and student count are required.' });
  }
  try {
    const group = supabaseStore.createGroup(
      {
        name: String(name).trim(),
        departmentId: departmentId || 'dept-cse',
        program: program || 'B.Tech Computer Science & Engineering',
        semester: Number(semester) || 5,
        batchYear: Number(batchYear) || 2024,
        studentCount: Number(studentCount),
        targetSize: Number(targetSize) || Number(studentCount),
        maxSize: Number(maxSize) || Math.ceil(Number(studentCount) * 1.2),
        subSections: Array.isArray(subSections) ? subSections : undefined,
        classRepresentative: classRepresentative || {
          name: 'Section Representative',
          email: `cr.${String(name).toLowerCase()}@thapar.edu`,
          studentId: '102303001',
        },
        status: 'Active',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({ success: true, message: `Cohort '${group.name}' registered.`, section: group });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/groups/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    const group = supabaseStore.updateGroup(groupId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, section: group });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/groups/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    supabaseStore.deleteGroup(groupId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Cohort removed successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// Bulk Cohort Generation
app.post('/api/academic/groups/bulk', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { programName, batchYear, totalStudents, numGroups, namingPattern, numSubgroupsPerGroup, departmentId } = req.body;
  if (!totalStudents || !numGroups) {
    return res.status(400).json({ success: false, message: 'Total students and number of groups are required.' });
  }
  try {
    const groups = supabaseStore.bulkGenerateGroups(
      {
        programName: programName || 'B.Tech Computer Science & Engineering',
        batchYear: Number(batchYear) || 2024,
        totalStudents: Number(totalStudents),
        numGroups: Number(numGroups),
        namingPattern: namingPattern || 'CSE-{A}',
        numSubgroupsPerGroup: Number(numSubgroupsPerGroup) || 2,
        departmentId,
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({ success: true, message: `Generated ${groups.length} cohorts with subgroups.`, sections: groups });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// Subgroup Add & Delete
app.post('/api/academic/subgroups', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { groupId, name, studentCount, type } = req.body;
  if (!groupId || !name) {
    return res.status(400).json({ success: false, message: 'Group ID and subgroup name are required.' });
  }
  try {
    const sub = supabaseStore.addSubgroup(groupId, name, Number(studentCount) || undefined, type || 'Lab', req.authenticatedUser?.name);
    return res.status(201).json({ success: true, subgroup: sub });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/subgroups/:groupId/:subgroupId', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const subgroupId = req.params.subgroupId as string;
    supabaseStore.deleteSubgroup(groupId, subgroupId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Subgroup removed successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 7. Course Allocations CRUD
app.get('/api/academic/allocations', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, allocations: state.allocations });
});

app.post('/api/academic/allocations', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { courseId, facultyId, sectionId, subSectionId, sessionType, hoursPerWeek, preferredRoomId } = req.body;
  if (!courseId || !facultyId || !sectionId) {
    return res.status(400).json({ success: false, message: 'Course ID, Faculty ID, and Section ID are required.' });
  }
  try {
    const alloc = supabaseStore.createAllocation(
      {
        courseId,
        facultyId,
        sectionId,
        subSectionId,
        sessionType: sessionType || 'Lecture',
        hoursPerWeek: Number(hoursPerWeek) || 3,
        preferredRoomId,
        status: 'Allocated',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({
      success: true,
      message: 'Course-Faculty allocation created successfully.',
      allocationId: alloc.id,
      allocation: alloc,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/allocations/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const allocId = req.params.id as string;
    const alloc = supabaseStore.updateAllocation(allocId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, allocation: alloc });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/allocations/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const allocId = req.params.id as string;
    supabaseStore.deleteAllocation(allocId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Allocation deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 8. Transactional Master Excel Import
app.post('/api/academic/import', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { parsedData, mode = 'upsert' } = req.body;
  if (!parsedData) {
    return res.status(400).json({ success: false, message: 'Parsed workbook payload is required.' });
  }
  try {
    const result = supabaseStore.commitMasterExcelImport(parsedData, mode, req.authenticatedUser?.name);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `Database import error: ${err.message}` });
  }
});

// -------------------------------------------------------------
// TIMETABLE SCHEDULING, SOLVER & VERSIONING APIS
// -------------------------------------------------------------

// Timetable Generation (Server-Side Solver + Independent Validator + Supabase Persistence)
const handleGenerateTimetable = (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const { budgetMode = 'BALANCED', timeBudgetMs = 800, routines, async: isAsync } = body;

  if (isAsync) {
    const state = supabaseStore.getAcademicState();

    const jobId = timetableJobManager.createJob(
      state.academicYear,
      state.allocations,
      state.facultyMembers,
      state.rooms,
      state.sections,
      state.courses,
      state.constraints,
      { budgetMode, timeBudgetMs: Number(timeBudgetMs) }
    );

    return res.status(202).json({
      jobId,
      status: 'PENDING',
      message: 'Timetable generation job initiated in background.',
    });
  }

  const result = supabaseStore.generateDualRoutines(
    {
      budgetMode,
      timeBudgetMs: Number(timeBudgetMs),
      routines: Array.isArray(routines) ? routines : undefined,
    },
    req.authenticatedUser?.name
  );

  const jobId = `job_sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return res.json({
    jobId,
    ...result,
    generatedBy: req.authenticatedUser?.name,
  });
};

app.post('/api/academic/generate', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);
app.post('/api/timetable/generate', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);
app.post('/api/timetables/generate', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);
app.post('/api/timetable/generate-engine', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);

// Job API Endpoints
app.post('/api/timetable/jobs', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const { budgetMode = 'BALANCED', timeBudgetMs = 800, optimizationProfile = 'BALANCED', seed } = body;

  const state = supabaseStore.getAcademicState();

  const jobId = timetableJobManager.createJob(
    state.academicYear,
    state.allocations,
    state.facultyMembers,
    state.rooms,
    state.sections,
    state.courses,
    state.constraints,
    { budgetMode, timeBudgetMs: Number(timeBudgetMs), optimizationProfile, seed }
  );

  return res.status(202).json({
    jobId,
    status: 'PENDING',
    progress: 0,
    message: 'Generation job enqueued successfully.',
  });
});

app.get('/api/timetable/jobs/:id', requireAuth, (req: Request, res: Response) => {
  const jobId = req.params.id as string;
  const job = timetableJobManager.getJob(jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: `Job ${jobId} not found.` });
  }
  return res.json(job);
});

app.post('/api/timetable/jobs/:id/cancel', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: Request, res: Response) => {
  const jobId = req.params.id as string;
  const success = timetableJobManager.cancelJob(jobId);
  if (!success) {
    return res.status(400).json({ success: false, message: `Job ${jobId} could not be cancelled or has already completed.` });
  }
  return res.json({ success: true, message: `Job ${jobId} has been cancelled.` });
});

// Select Routine Version as Active Draft
app.post('/api/timetable/select-routine', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { versionNumber } = req.body;
  if (!versionNumber) {
    return res.status(400).json({ success: false, message: 'Version number is required.' });
  }

  const result = supabaseStore.selectRoutineVersion(Number(versionNumber), req.authenticatedUser?.name);
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }

  return res.json({
    success: true,
    message: result.message,
    version: result.version,
  });
});

// Controlled Manual Move with Independent Validation
app.post('/api/timetable/move', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { sessionId, targetDay, targetTimeSlotId, targetRoomId, reason } = req.body;
  if (!sessionId || !targetDay || !targetTimeSlotId || !targetRoomId) {
    return res.status(400).json({ success: false, message: 'Session ID, target day, time slot, and room ID are required.' });
  }

  const result = supabaseStore.moveSessionWithValidation(
    sessionId,
    targetDay,
    targetTimeSlotId,
    targetRoomId,
    reason || 'Manual Coordinator Adjustment',
    req.authenticatedUser?.name
  );

  if (!result.success) {
    return res.status(422).json({ success: false, error: result.error, message: result.error });
  }

  return res.json({
    success: true,
    message: 'Session moved successfully and draft version saved.',
    version: result.updatedVersion,
  });
});

// Controlled Manual Swap with Independent Validation
app.post('/api/timetable/swap', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { sessionAId, sessionBId, reason } = req.body;
  if (!sessionAId || !sessionBId) {
    return res.status(400).json({ success: false, message: 'Session A ID and Session B ID are required for swapping.' });
  }

  const result = supabaseStore.swapSessionsWithValidation(
    sessionAId,
    sessionBId,
    reason || 'Manual Coordinator Swap',
    req.authenticatedUser?.name
  );

  if (!result.success) {
    return res.status(422).json({ success: false, error: result.error, message: result.error });
  }

  return res.json({
    success: true,
    message: 'Sessions swapped successfully and draft version saved.',
    version: result.updatedVersion,
  });
});

// Timetable Approval (College Admin / Dean only)
app.post('/api/timetable/approve', requireAuth, requireRole(['COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { versionId } = req.body;
  supabaseStore.approveTimetable(versionId || 'V1.0', req.authenticatedUser?.name);
  return res.json({
    success: true,
    message: `Timetable version ${versionId || 'V1.0'} has been officially approved by Academic Dean.`,
    approvedBy: req.authenticatedUser?.name,
    timestamp: new Date().toISOString(),
  });
});

// Timetable Publish (College Admin / Dean only)
const handlePublishTimetable = (req: AuthenticatedRequest, res: Response) => {
  const { versionId } = req.body;
  supabaseStore.publishTimetable(versionId || 'V1.0', req.authenticatedUser?.name);
  return res.json({
    success: true,
    message: `Timetable version ${versionId || 'V1.0'} is now officially published for institutional access.`,
    publishedBy: req.authenticatedUser?.name,
    timestamp: new Date().toISOString(),
  });
};

app.post('/api/timetable/publish', requireAuth, requireRole(['COLLEGE_ADMIN']), handlePublishTimetable);
app.post('/api/timetables/publish', requireAuth, requireRole(['COLLEGE_ADMIN']), handlePublishTimetable);

// Timetable Versions List & Restore
app.get('/api/timetable/versions', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, versions: state.versions });
});

app.post('/api/timetable/versions/:versionNumber/restore', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const verNum = Number(req.params.versionNumber);
  const restored = supabaseStore.restoreVersion(verNum, req.authenticatedUser?.name);
  if (!restored) {
    return res.status(404).json({ success: false, message: `Version ${verNum} not found.` });
  }
  return res.json({ success: true, message: `Restored timetable to ${restored.versionLabel}`, version: restored });
});

// Timetable Benchmark Endpoint
app.get('/api/timetable/benchmark', requireAuth, (req: Request, res: Response) => {
  const resultFast = executeOptimizationEngine(
    INITIAL_ACADEMIC_YEAR,
    INITIAL_ALLOCATIONS,
    FACULTY_MEMBERS,
    ROOMS,
    SECTIONS,
    COURSES,
    INITIAL_CONSTRAINTS,
    { budgetMode: 'FAST', timeBudgetMs: 200, seed: 101, maxCandidates: 1 }
  );

  const resultOpt = executeOptimizationEngine(
    INITIAL_ACADEMIC_YEAR,
    INITIAL_ALLOCATIONS,
    FACULTY_MEMBERS,
    ROOMS,
    SECTIONS,
    COURSES,
    INITIAL_CONSTRAINTS,
    { budgetMode: 'MAXIMUM_OPTIMIZATION', timeBudgetMs: 500, seed: 101, maxCandidates: 3 }
  );

  return res.json({
    engineVersion: '2.0.0-BitsetMRV',
    fastMode: {
      isFeasible: resultFast.isFeasible,
      totalTimeMs: resultFast.metrics.totalTimeMs,
      candidatesEvaluated: resultFast.metrics.candidatesEvaluated,
      candidatesPruned: resultFast.metrics.candidatesPruned,
      healthScore: resultFast.bestCandidate?.healthScore || 0,
    },
    optimizationMode: {
      isFeasible: resultOpt.isFeasible,
      totalTimeMs: resultOpt.metrics.totalTimeMs,
      candidatesEvaluated: resultOpt.metrics.candidatesEvaluated,
      candidatesPruned: resultOpt.metrics.candidatesPruned,
      healthScore: resultOpt.bestCandidate?.healthScore || 0,
      candidatesCount: resultOpt.allCandidates.length,
    },
  });
});

// -------------------------------------------------------------
// RECOVERY, NOTIFICATIONS & REPLACEMENT VOTING APIS
// -------------------------------------------------------------

// Cancel Class (Faculty, Coordinator, Admin)
app.post('/api/recovery/cancel-class', requireAuth, requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN', 'HOD']), (req: AuthenticatedRequest, res: Response) => {
  const { sessionId, reason } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, message: 'Session ID is required.' });
  }
  const result = supabaseStore.cancelClassSession(sessionId, reason || 'Unforeseen conflict', req.authenticatedUser?.name);
  if (!result.success) {
    return res.status(404).json({ success: false, message: 'Session not found.' });
  }
  return res.json({
    success: true,
    message: `Class session ${sessionId} cancelled and queued for autonomous self-healing recovery.`,
    task: result.task,
    cancelledBy: req.authenticatedUser?.name,
  });
});

// Schedule Makeup Session (Validates target entities, pending state, and hard conflict freedom)
app.post('/api/recovery/schedule-makeup', requireAuth, requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { opportunityId } = req.body;
  if (!opportunityId) {
    return res.status(400).json({ success: false, message: 'Opportunity ID is required.' });
  }

  const state = supabaseStore.getBootstrapState();
  const opp = (state.recoveryOpportunities || []).find((o: any) => o.id === opportunityId);
  if (!opp) {
    return res.status(404).json({ success: false, message: 'Recovery opportunity not found.' });
  }

  // Verify opportunity is in PENDING/Proposed state
  const statusUpper = String(opp.status || '').toUpperCase();
  if (statusUpper !== 'PROPOSED' && statusUpper !== 'PENDING') {
    return res.status(400).json({
      success: false,
      message: `Recovery opportunity is already ${opp.status}. Only PENDING or Proposed opportunities can be scheduled.`,
    });
  }

  // Verify referenced cancellation task exists
  const makeupTask = (state.makeupTasks || []).find((t: any) => t.id === opp.makeupTaskId);
  if (!makeupTask) {
    return res.status(400).json({ success: false, message: 'Referenced cancellation task not found.' });
  }

  // Validate target room, faculty, time slot, and date/day are present
  const roomId = req.body.roomId || opp.roomId;
  const facultyId = req.body.facultyId || opp.facultyId;
  const timeSlotId = req.body.timeSlotId || opp.timeSlotId;
  const targetDay = req.body.targetDay || req.body.date || opp.targetDay;

  if (!roomId || !facultyId || !timeSlotId || !targetDay) {
    return res.status(400).json({
      success: false,
      message: 'Target room, faculty, time slot, and date are required to schedule makeup session.',
    });
  }

  // Verify no conflicts in schedule before creating the makeup class
  const activeSessions = (state.sessions || []).filter((s: any) => s.status !== 'Cancelled');

  const facultyConflict = activeSessions.find(
    (s: any) => s.facultyId === facultyId && s.day === targetDay && s.timeSlotId === timeSlotId
  );
  if (facultyConflict) {
    return res.status(409).json({
      success: false,
      message: `Faculty collision: Faculty member is already scheduled for session ${facultyConflict.id} at ${targetDay} ${timeSlotId}.`,
    });
  }

  const roomConflict = activeSessions.find(
    (s: any) => s.roomId === roomId && s.day === targetDay && s.timeSlotId === timeSlotId
  );
  if (roomConflict) {
    return res.status(409).json({
      success: false,
      message: `Room collision: Room ${roomId} is already occupied by session ${roomConflict.id} at ${targetDay} ${timeSlotId}.`,
    });
  }

  const sectionConflict = activeSessions.find(
    (s: any) => s.sectionId === makeupTask.sectionId && s.day === targetDay && s.timeSlotId === timeSlotId
  );
  if (sectionConflict) {
    return res.status(409).json({
      success: false,
      message: `Section collision: Student section ${makeupTask.sectionId} is already in session ${sectionConflict.id} at ${targetDay} ${timeSlotId}.`,
    });
  }

  const result = supabaseStore.scheduleMakeupSession(opportunityId, req.authenticatedUser?.name);
  if (!result.success) {
    return res.status(400).json({ success: false, message: 'Unable to schedule recovery makeup slot.' });
  }
  return res.json({ success: true, message: 'Makeup session scheduled successfully.', session: result.session });
});

// Decline Opportunity
app.post('/api/recovery/decline', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { opportunityId } = req.body;
  supabaseStore.declineOpportunity(opportunityId, req.authenticatedUser?.name);
  return res.json({ success: true, message: 'Opportunity marked declined.' });
});

// Replacement Poll Voting (Enforces 1-vote constraint per student)
app.post('/api/voting/vote', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { pollId, optionId } = req.body;
  const studentId = req.authenticatedUser?.id || req.authenticatedUser?.email || 'student';

  if (!pollId || !optionId) {
    return res.status(400).json({ success: false, message: 'Poll ID and option ID are required.' });
  }

  const result = supabaseStore.castReplacementVote(pollId, studentId, optionId);
  if (!result.success) {
    return res.status(409).json({ success: false, message: result.message });
  }
  return res.json(result);
});

// Notifications (Authenticated & Filtered by User Identity / Target Role)
app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  const user = req.authenticatedUser;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  const userRole = user.roleCode;
  const userDashboardRole = mapRoleCodeToDashboard(user.roleCode);
  const userId = user.id;

  const filtered = state.notifications.filter((n: any) => {
    if (n.userId && n.userId === userId) return true;
    if (!n.recipientRole || n.recipientRole === 'ALL' || n.recipientRole === '*') return true;
    if (n.recipientRole === userRole || n.recipientRole === userDashboardRole) return true;
    if (Array.isArray(n.recipientRoles) && (n.recipientRoles.includes(userRole) || n.recipientRoles.includes(userDashboardRole))) return true;
    return false;
  });

  return res.json({ success: true, notifications: filtered });
});

app.post('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const notifId = req.params.id as string;
  const success = supabaseStore.markNotificationRead(notifId);
  return res.json({ success });
});

// Redaction helpers for sensitive audit logging & telemetry
function redactSensitiveText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    // Redact bcrypt/scrypt/legacy hashes
    .replace(/\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_HASH]')
    .replace(/scrypt:[a-f0-9]+:[a-f0-9]+/gi, '[REDACTED_HASH]')
    .replace(/sha256:[a-f0-9]+:[a-f0-9]+/gi, '[REDACTED_HASH]')
    // Redact JWT or hex session tokens
    .replace(/jwt_[a-zA-Z0-9_\-\.]+/g, '[REDACTED_TOKEN]')
    .replace(/sb_[a-zA-Z0-9_\-]+/g, '[REDACTED_TOKEN]')
    // Redact explicit password/secret key-value patterns in JSON or text
    .replace(/(["']?(?:password|passwd|pwd|secret|token|apiKey|authHeader)["']?\s*[:=]\s*["'])([^"'\s]+)(["'])/gi, '$1[REDACTED]$3')
    // Redact email addresses to masked format (e.g. j***@thapar.edu)
    .replace(/([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '$1***@$2');
}

function redactSensitiveValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return redactSensitiveText(val);
  }
  if (Array.isArray(val)) {
    return val.map(redactSensitiveValue);
  }
  if (typeof val === 'object') {
    const sanitized: Record<string, any> = {};
    const sensitiveKeyRegex = /password|secret|token|hash|key|auth|credential|session/i;
    for (const [k, v] of Object.entries(val)) {
      if (sensitiveKeyRegex.test(k)) {
        sanitized[k] = '[REDACTED]';
      } else if (k.toLowerCase().includes('email') && typeof v === 'string') {
        sanitized[k] = redactSensitiveText(v);
      } else {
        sanitized[k] = redactSensitiveValue(v);
      }
    }
    return sanitized;
  }
  return val;
}

function redactAuditLog(log: any): any {
  if (!log) return log;
  return {
    ...log,
    userId: log.userId ? (log.userId.includes('@') ? redactSensitiveText(log.userId) : log.userId) : log.userId,
    userName: log.userName ? redactSensitiveText(log.userName) : log.userName,
    details: typeof log.details === 'string' ? redactSensitiveText(log.details) : redactSensitiveValue(log.details),
    payload: log.payload ? redactSensitiveValue(log.payload) : undefined,
  };
}

// Immutable Audit Events (Redacted for Security & Privacy)
app.get('/api/audit', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN', 'HOD']), (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  const sanitizedLogs = (state.auditLogs || []).map(redactAuditLog);
  return res.json({ success: true, auditLogs: sanitizedLogs });
});

// -------------------------------------------------------------
// Vite middleware in dev or static files in production
// -------------------------------------------------------------
async function setupApp() {
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res, next) => {
      if (_req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    try {
      const { createServer } = await import('vite');
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch {
      app.use(express.static(path.join(__dirname, 'dist')));
    }
  }

  // Synchronize baseline users into Supabase Auth Authority in background non-blocking
  if (process.env.NODE_ENV !== 'production') {
    ensureSupabaseAuthUsers().catch(err => console.error('[SUPABASE AUTH SETUP ERROR]:', err));
  }
}

if (!process.env.VERCEL) {
  const effectivePort = Number(process.env.PORT) || 3000;
  console.log("[STARTUP] About to bind HTTP server", {
    port: effectivePort,
    host: "0.0.0.0"
  });

  const server = app.listen(effectivePort, "0.0.0.0", () => {
    console.log("[STARTUP] HTTP SERVER LISTENING", {
      port: effectivePort,
      address: "0.0.0.0"
    });
  });

  setupApp().catch(err => console.error('[SETUP APP ERROR]:', err));
} else {
  if (process.env.NODE_ENV !== 'production') {
    ensureSupabaseAuthUsers().catch(() => {});
  }
}

export default app;
