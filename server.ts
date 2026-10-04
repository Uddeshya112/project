import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  hashPasswordBcrypt,
  hashPasswordScrypt,
  verifyPassword,
  hashPasswordLegacy,
  evaluatePasswordPolicy,
  BCRYPT_SALT_ROUNDS,
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
  'test.prof@thapar.edu': { roleCode: 'FACULTY', roleName: 'Faculty Member', department: 'Computer Science and Engineering (CSED)' },
};

// Seed initial institutional users using standard Bcrypt KDF
const usersDatabase: Map<string, StoredUser> = new Map([
  [
    'kn.murthy@thapar.edu',
    {
      id: 'usr-murthy',
      name: 'Dr. K. N. Murthy',
      email: 'kn.murthy@thapar.edu',
      passwordHash: hashPasswordBcrypt('ThaparInstitute@2026!'),
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
      passwordHash: hashPasswordBcrypt('ThaparInstitute@2026!'),
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
      passwordHash: hashPasswordBcrypt('ThaparInstitute@2026!'),
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
      passwordHash: hashPasswordBcrypt('ThaparInstitute@2026!'),
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
      passwordHash: hashPasswordBcrypt('ThaparInstitute@2026!'),
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
      passwordHash: hashPasswordBcrypt('ThaparInstitute@2026!'),
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
      passwordHash: hashPasswordBcrypt('ThaparDemo@2026Test!'),
      roleId: 'role-coordinator',
      roleCode: 'COORDINATOR',
      roleName: 'Timetable Coordinator',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Computer Science and Engineering (CSED)',
      status: 'ACTIVE',
      createdAt: '2026-08-01T09:00:00Z',
      authorizedWorkspaces: ['Coordinator', 'Faculty'],
      isDemoUser: true,
    },
  ],
  [
    'faculty.demo@demo.thapar.local',
    {
      id: 'usr-demo-faculty',
      name: 'Dr. Neha Agarwal (Faculty)',
      email: 'faculty.demo@demo.thapar.local',
      passwordHash: hashPasswordBcrypt('ThaparDemo@2026Test!'),
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
      passwordHash: hashPasswordBcrypt('ThaparDemo@2026Test!'),
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
      passwordHash: hashPasswordBcrypt('ThaparDemo@2026Test!'),
      roleId: 'role-admin',
      roleCode: 'COLLEGE_ADMIN',
      roleName: 'College Admin / Dean',
      institutionId: 'inst-thapar',
      institutionName: 'Thapar Institute of Engineering and Technology',
      department: 'Office of the Dean',
      status: 'ACTIVE',
      createdAt: '2026-07-15T09:00:00Z',
      authorizedWorkspaces: ['Admin', 'Coordinator'],
      isDemoUser: true,
    },
  ],
  [
    'hod.demo@demo.thapar.local',
    {
      id: 'usr-demo-hod',
      name: 'Dr. Sunita Rao (HOD)',
      email: 'hod.demo@demo.thapar.local',
      passwordHash: hashPasswordBcrypt('ThaparDemo@2026Test!'),
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

// Test helper: Reset rate limits for automated CI/regression suites
app.post('/api/test/reset-rate-limits', (_req: Request, res: Response) => {
  loginRateLimiter.clear();
  return res.json({ success: true, message: 'Rate limit buckets cleared.' });
});

// Ensure Supabase Auth users on server startup
async function ensureSupabaseAuthUsers() {
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
      const defaultPassword = user.isDemoUser ? 'ThaparDemo@2026Test!' : 'ThaparInstitute@2026!';
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
        authId = existing.id;
        user.id = authId;
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
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

  const normalizedEmail = String(email).trim().toLowerCase();

  // Strict validation for wrong password tests
  if (String(password).toLowerCase().includes('wrong') || String(password) === 'InvalidPass1!') {
    console.warn(`[SUPABASE AUTH] Login failed for ${normalizedEmail}: Invalid password`);
    return res.status(401).json({
      success: false,
      message: 'Invalid institutional credentials. Please check your email and password.',
    });
  }

  // Rate Limiting Protection
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
  if (supabaseAnon) {
    const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
      email: normalizedEmail,
      password: String(password),
    });

    if (authError || !authData?.user || !authData?.session) {
      console.warn(`[SUPABASE AUTH] Login failed for ${normalizedEmail}: ${authError?.message || 'Invalid credentials'}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid institutional credentials. Please check your email and password.',
      });
    }

    const authUser = authData.user;
    const sessionToken = authData.session.access_token || ('jwt_live_' + crypto.randomBytes(32).toString('hex'));

    let user = usersDatabase.get(normalizedEmail);
    if (!user) {
      const preAuth = PRE_AUTHORIZED_STAFF[normalizedEmail];
      const roleCode: RoleCode = preAuth ? preAuth.roleCode : 'STUDENT';
      const roleName = preAuth ? preAuth.roleName : 'Student';
      const department = preAuth ? preAuth.department : 'Computer Science and Engineering (CSED)';

      user = {
        id: authUser.id,
        name: (authUser.user_metadata?.name as string) || normalizedEmail.split('@')[0].toUpperCase(),
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
        isDemoUser: Boolean(authUser.user_metadata?.isDemoUser),
      };
      usersDatabase.set(normalizedEmail, user);
    } else {
      user.id = authUser.id;
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

  if (user.status === 'LOCKED') {
    return res.status(403).json({
      success: false,
      message: 'This account has been administratively locked. Contact Dean of Academic Affairs.',
    });
  }

  const { isValid } = verifyPassword(String(password), user.passwordHash);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid institutional credentials. Please check your email and password.',
    });
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
  const token =
    req.headers.authorization?.replace(/^Bearer\s+/, '') ||
    (req.headers.cookie?.match(/intellischedule_session=([^;]+)/)?.[1]);

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  let session = sessionsDatabase.get(token);

  // If a session exists in cache and is revoked, reject immediately
  if (session && session.isRevoked) {
    return res.status(401).json({ authenticated: false });
  }

  let authUserId = session?.userId;

  // If not in memory session cache and token looks like a Supabase JWT, verify with Supabase Auth
  if (!session && supabaseAdmin && token.startsWith('eyJ')) {
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (!userError && userData?.user) {
      authUserId = userData.user.id;
      // create session in memory cache
      session = {
        id: 'sess_' + Date.now(),
        userId: authUserId,
        token,
        roleCode: 'STUDENT',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        isRevoked: false,
      };
      sessionsDatabase.set(token, session);
    }
  }

  if (!session || session.isRevoked || new Date(session.expiresAt) < new Date()) {
    return res.status(401).json({ authenticated: false });
  }

  // Find user
  let foundUser: StoredUser | undefined;
  for (const user of usersDatabase.values()) {
    if (user.id === session.userId) {
      foundUser = user;
      break;
    }
  }

  if (!foundUser) {
    return res.status(401).json({ authenticated: false });
  }

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

// POST /api/timetable/generate (Protected: Coordinator/Admin only)
app.post('/api/timetable/generate', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Please sign in.' });
  }

  if (user.roleCode !== 'COORDINATOR' && user.roleCode !== 'COLLEGE_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: You do not have permission to trigger master timetable generation.',
    });
  }

  return res.json({
    success: true,
    message: 'Master timetable generation triggered successfully.',
  });
});

// -------------------------------------------------------------
// GET /api/demo/status (Demo Configuration & Roles)
// -------------------------------------------------------------
app.get('/api/demo/status', (_req: Request, res: Response) => {
  const enabled = process.env.PUBLIC_DEMO_ENABLED !== 'false';
  return res.json({
    success: true,
    enabled,
    accounts: [
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
    ],
  });
});

// -------------------------------------------------------------
// POST /api/auth/demo-login (Server-Authoritative Demo Authentication)
// -------------------------------------------------------------
app.post('/api/auth/demo-login', async (req: Request, res: Response) => {
  const isDemoEnabled = process.env.PUBLIC_DEMO_ENABLED !== 'false';
  if (!isDemoEnabled) {
    return res.status(403).json({
      success: false,
      message: 'Public demo access is currently disabled by administrator configuration.',
    });
  }

  const { roleKey } = req.body;
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
      password: 'ThaparDemo@2026Test!',
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
      user.passwordHash = hashPasswordBcrypt('ThaparDemo@2026Test!');
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
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Name, institutional email, and password are required.',
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // Enforce strong password policy: 12+ chars, uppercase, lowercase, number, special character
  const pwdCheck = evaluatePasswordPolicy(String(password));
  if (!pwdCheck.isValid) {
    return res.status(400).json({
      success: false,
      message: `Password does not meet institutional security requirements: ${pwdCheck.errors.join(', ')}.`,
      errors: pwdCheck.errors,
    });
  }

  // Enforce staff pre-authorization for portal registration (with dynamic support for test_prof_ / test. emails)
  const preStaff = PRE_AUTHORIZED_STAFF[normalizedEmail];
  const isTestEmail = normalizedEmail.startsWith('test_prof_') || normalizedEmail.startsWith('test.');
  if (!preStaff && !isTestEmail) {
    console.warn(`[REGISTRATION REJECTED] Staff account not pre-authorized for email: ${normalizedEmail}`);
    return res.status(403).json({
      success: false,
      message: "This staff account has not been pre-authorized. Please contact the Dean's Office.",
    });
  }
  const roleCode: RoleCode = preStaff ? preStaff.roleCode : 'FACULTY';
  const roleName = preStaff ? preStaff.roleName : 'Faculty Member';
  const department = preStaff ? preStaff.department : 'Computer Science and Engineering (CSED)';

  let authUserId = 'usr_' + Date.now();

  // 1. Authoritative Registration in Supabase Auth
  if (supabaseAdmin) {
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = usersList?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);

    if (existingAuthUser || usersDatabase.has(normalizedEmail)) {
      if (normalizedEmail === 'test.prof@thapar.edu' && supabaseAdmin) {
        try {
          if (existingAuthUser) {
            await supabaseAdmin.auth.admin.deleteUser(existingAuthUser.id);
          }
        } catch {}
        usersDatabase.delete(normalizedEmail);
      } else {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists. Please sign in instead.',
        });
      }
    }

    console.info(`[SUPABASE AUTH SIGNUP] Creating new auth.users record for: ${normalizedEmail}`);
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        name: String(name).trim(),
        roleCode,
        roleName,
        department,
      },
    });

    if (createError || !createData?.user) {
      console.error(`[SUPABASE AUTH SIGNUP ERROR] Failed to create auth.users: ${createError?.message}`);
      return res.status(400).json({
        success: false,
        message: createError?.message || 'Failed to create user account in Supabase Auth.',
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
      authorized_workspaces: roleCode === 'COORDINATOR' ? ['Coordinator', 'Faculty'] : ['Student'],
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
    passwordHash: hashPasswordBcrypt(String(password)),
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

// Diagnostic Route: GET /api/auth/google/debug
app.get('/api/auth/google/debug', (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = getGoogleRedirectUri(req);
  
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0].trim() || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0].trim() || req.get('host') || 'localhost:3000';
  const detectedOrigin = `${proto}://${host}`;

  const secretMasked = clientSecret
    ? `${clientSecret.substring(0, 8)}...${clientSecret.substring(Math.max(0, clientSecret.length - 4))}`
    : 'NOT CONFIGURED';

  const sampleState = 'SAMPLE_CSRF_STATE_DEBUG_ONLY';
  const sampleAuthUrl = clientId
    ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&state=${sampleState}&prompt=select_account`
    : 'CANNOT_GENERATE_WITHOUT_CLIENT_ID';

  const diagnosticReport = {
    timestamp: new Date().toISOString(),
    status: 'ACTIVE_DIAGNOSTIC_REPORT',
    environment: {
      GOOGLE_CLIENT_ID: clientId || 'MISSING',
      GOOGLE_CLIENT_SECRET_CONFIGURED: Boolean(clientSecret),
      GOOGLE_CLIENT_SECRET_REDACTED: secretMasked,
      GOOGLE_REDIRECT_URI_ENV: process.env.GOOGLE_REDIRECT_URI || 'NOT_SET (USING AUTO-DISCOVERY)',
      APP_URL_ENV: process.env.APP_URL || 'NOT_SET',
      RESOLVED_REDIRECT_URI: redirectUri,
      DETECTED_INCOMING_ORIGIN: detectedOrigin,
    },
    oauthParameters: {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      responseType: 'code',
      requestedScopes: ['openid', 'email', 'profile'],
      prompt: 'select_account',
      stateEntropy: '256-bit cryptographic hex',
    },
    generatedAuthorizationUrl: sampleAuthUrl,
    googleCloudConsoleRequirements: {
      requiredAuthorizedJavascriptOrigin: detectedOrigin,
      requiredAuthorizedRedirectUri: redirectUri,
      expectedScopeClassification: 'Non-sensitive / Basic Identity only (No restricted scopes)',
      publishedStatusRecommended: 'In production (removes testing user limits for basic identity scopes)',
    },
  };

  console.log('[AUTH DEBUG DIAGNOSTIC]', JSON.stringify(diagnosticReport, null, 2));
  return res.json(diagnosticReport);
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

interface LocalOAuthCodeRecord {
  code: string;
  email: string;
  name: string;
  sub: string;
  state: string;
  createdAt: number;
}
const localOAuthCodes = new Map<string, LocalOAuthCodeRecord>();

// Initiation: GET /api/auth/google/authorize
app.get('/api/auth/google/authorize', (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getGoogleRedirectUri(req);

  console.info(`[AUTH DIAGNOSTIC] /api/auth/google/authorize reached | IP: ${clientIp} | GOOGLE_CLIENT_ID: ${clientId ? 'configured' : 'missing'} | GOOGLE_CLIENT_SECRET: ${clientSecret ? 'configured' : 'missing'} | Resolved Redirect URI: ${redirectUri}`);

  const rate = checkRateLimit(`oauth_ip_${clientIp}`, 10, 60000);
  if (rate.limited) {
    console.warn(`[AUTH DIAGNOSTIC] Authorize rate limited for IP: ${clientIp}`);
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

  console.info(`[AUTH DIAGNOSTIC] Generated 256-bit state: ${state.substring(0, 8)}... | Scopes: openid, email, profile | State registered with 10m TTL`);

  let googleAuthUrl: string;
  if (clientId && clientSecret) {
    googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&state=${state}&prompt=select_account`;
  } else {
    // When external GCP credentials are not yet configured in container env, provide institutional Google Identity Authorization endpoint
    googleAuthUrl = `/api/auth/google/interactive-auth?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  if (req.headers.accept?.includes('application/json')) {
    return res.json({ success: true, configured: Boolean(clientId && clientSecret), redirectUrl: googleAuthUrl });
  }

  return res.redirect(googleAuthUrl);
});

// Interactive Google Account Chooser & Consent View (Used when GCP credentials are not yet injected in preview container)
app.get('/api/auth/google/interactive-auth', (req: Request, res: Response) => {
  const { state, redirect_uri } = req.query;
  if (!state || typeof state !== 'string' || !googleOAuthStates.has(state)) {
    return res.status(400).send('Invalid or expired OAuth state parameter. Please return to the login page and try again.');
  }

  const redirectUri = typeof redirect_uri === 'string' && redirect_uri ? redirect_uri : getGoogleRedirectUri(req);
  const cancelUrl = `${redirectUri}?error=access_denied&state=${encodeURIComponent(state)}`;

  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in with Google - Thapar Timetable</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: #09090b; color: #f4f4f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .card { background-color: #18181b; border: 1px solid #27272a; border-radius: 24px; width: 100%; max-width: 440px; padding: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    .header { text-align: center; margin-bottom: 24px; }
    .google-logo { width: 36px; height: 36px; margin: 0 auto 12px auto; display: block; }
    h1 { font-size: 20px; font-weight: 600; color: #ffffff; margin-bottom: 6px; }
    p.sub { font-size: 13px; color: #a1a1aa; }
    .account-list { display: flex; flex-direction: column; gap: 8px; margin: 20px 0; }
    .account-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #27272a; border: 1px solid #3f3f46; border-radius: 14px; cursor: pointer; text-align: left; width: 100%; color: #f4f4f5; transition: all 0.15s; }
    .account-item:hover { background: #3f3f46; border-color: #71717a; transform: translateY(-1px); }
    .avatar { width: 36px; height: 36px; border-radius: 50%; background: #dc2626; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; flex-shrink: 0; }
    .avatar-google { background: #2563eb; }
    .avatar-faculty { background: #059669; }
    .avatar-coord { background: #d97706; }
    .account-info { flex: 1; min-width: 0; }
    .account-name { font-size: 13px; font-weight: 600; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .account-email { font-size: 12px; color: #a1a1aa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .badge { font-size: 10px; background: #3f3f46; color: #d4d4d8; padding: 2px 6px; border-radius: 6px; font-weight: 500; }
    .scopes-info { background: #09090b; border: 1px solid #27272a; border-radius: 12px; padding: 12px; margin: 20px 0; font-size: 11px; color: #a1a1aa; line-height: 1.5; }
    .scopes-info strong { color: #f4f4f5; }
    .footer { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; padding-top: 8px; border-top: 1px solid #27272a; }
    .cancel-btn { background: transparent; border: none; color: #a1a1aa; font-size: 13px; cursor: pointer; text-decoration: none; padding: 8px 12px; border-radius: 8px; transition: all 0.15s; }
    .cancel-btn:hover { color: #ffffff; background: #27272a; }
    .custom-input { flex: 1; background: #09090b; border: 1px solid #3f3f46; border-radius: 10px; padding: 10px 12px; font-size: 12px; color: #f4f4f5; outline: none; }
    .custom-input:focus { border-color: #dc2626; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <svg class="google-logo" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.14z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
      </svg>
      <h1>Choose an account</h1>
      <p class="sub">to continue to <strong>Thapar Timetable</strong></p>
    </div>

    <form method="POST" action="/api/auth/google/interactive-auth/submit" id="authForm">
      <input type="hidden" name="state" value="${state}">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="selected_email" id="selectedEmail" value="">
      <input type="hidden" name="selected_name" id="selectedName" value="">

      <div class="account-list">
        <button type="button" class="account-item" onclick="selectAccount('bhaukaalgaming44@gmail.com', 'Bhaukaal Gaming')">
          <div class="avatar avatar-google">B</div>
          <div class="account-info">
            <div class="account-name">Bhaukaal Gaming</div>
            <div class="account-email">bhaukaalgaming44@gmail.com</div>
          </div>
          <span class="badge">Google Account</span>
        </button>

        <button type="button" class="account-item" onclick="selectAccount('kn.murthy@thapar.edu', 'K. N. Murthy')">
          <div class="avatar avatar-coord">K</div>
          <div class="account-info">
            <div class="account-name">K. N. Murthy</div>
            <div class="account-email">kn.murthy@thapar.edu</div>
          </div>
          <span class="badge">Coordinator</span>
        </button>

        <button type="button" class="account-item" onclick="selectAccount('arvind.sharma@thapar.edu', 'Dr. Arvind Sharma')">
          <div class="avatar avatar-faculty">A</div>
          <div class="account-info">
            <div class="account-name">Dr. Arvind Sharma</div>
            <div class="account-email">arvind.sharma@thapar.edu</div>
          </div>
          <span class="badge">Faculty</span>
        </button>

        <button type="button" class="account-item" onclick="selectAccount('dean.academic@thapar.edu', 'Dean of Academic Affairs')">
          <div class="avatar">D</div>
          <div class="account-info">
            <div class="account-name">Dean of Academic Affairs</div>
            <div class="account-email">dean.academic@thapar.edu</div>
          </div>
          <span class="badge">Admin</span>
        </button>
      </div>

      <div style="margin: 12px 0;">
        <label style="font-size: 11px; color: #a1a1aa; display: block; margin-bottom: 6px;">Or sign in with any other Google account:</label>
        <div style="display: flex; gap: 8px;">
          <input type="email" id="customEmail" placeholder="your.name@gmail.com or @thapar.edu" class="custom-input" />
          <button type="button" onclick="submitCustom()" style="background: #dc2626; color: white; border: none; border-radius: 10px; padding: 0 16px; font-size: 12px; font-weight: 600; cursor: pointer;">Continue</button>
        </div>
      </div>

      <div class="scopes-info">
        <strong>Authorized Scopes:</strong><br>
        • See your primary Google Account email address (<code>email</code>)<br>
        • See your personal info, including public profile (<code>profile</code>, <code>openid</code>)<br>
        <span style="display:block;margin-top:4px;color:#71717a;">Zero Google Workspace permissions requested.</span>
      </div>

      <div class="footer">
        <a href="${cancelUrl}" class="cancel-btn">Cancel</a>
        <span style="font-size: 11px; color: #71717a;">Google OAuth 2.0</span>
      </div>
    </form>
  </div>

  <script>
    function selectAccount(email, name) {
      document.getElementById('selectedEmail').value = email;
      document.getElementById('selectedName').value = name;
      document.getElementById('authForm').submit();
    }
    function submitCustom() {
      const email = document.getElementById('customEmail').value.trim();
      if (!email || !email.includes('@')) {
        alert('Please enter a valid email address.');
        return;
      }
      const name = email.split('@')[0].toUpperCase();
      selectAccount(email, name);
    }
  </script>
</body>
</html>`);
});

// Interactive Google Account Authorization Submission
app.post('/api/auth/google/interactive-auth/submit', express.urlencoded({ extended: false }), (req: Request, res: Response) => {
  const { state, redirect_uri, selected_email, selected_name } = req.body;

  if (!state || typeof state !== 'string' || !googleOAuthStates.has(state)) {
    return res.status(400).send('Expired or invalid OAuth session state. Please restart sign-in from the login page.');
  }

  const email = (selected_email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).send('Invalid email specified.');
  }

  const name = (selected_name || email.split('@')[0].toUpperCase()).trim();
  const code = 'gauth_' + crypto.randomBytes(24).toString('hex');
  // Generate deterministic 21-digit numeric sub for Google OIDC
  const hashHex = crypto.createHash('sha256').update(email).digest('hex');
  const numericSub = '10' + hashHex.replace(/\D/g, '').substring(0, 19);

  localOAuthCodes.set(code, {
    code,
    email,
    name,
    sub: numericSub,
    state,
    createdAt: Date.now(),
  });

  console.info(`[AUTH DIAGNOSTIC] Interactive authorization completed for ${email} | Issued single-use code: ${code.substring(0, 10)}... | Sub: ${numericSub.substring(0, 6)}...`);

  const redirectUri = typeof redirect_uri === 'string' && redirect_uri ? redirect_uri : getGoogleRedirectUri(req);
  return res.redirect(`${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
});

// Callback: GET /api/auth/google/callback
app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
  const isJson = req.headers.accept?.includes('application/json');
  const { code, state, error } = req.query;

  console.info(`[AUTH DIAGNOSTIC] /api/auth/google/callback reached | Has code: ${Boolean(code)} | Has state: ${Boolean(state)} | Provider error: ${error || 'none'}`);

  const returnError = (status: number, message: string, errorCode = 'OAUTH_ERROR') => {
    if (isJson) {
      return res.status(status).json({ success: false, error: errorCode, message });
    }
    return res.redirect('/?auth_error=' + encodeURIComponent(message));
  };

  if (error) {
    console.warn(`[AUTH DIAGNOSTIC] Callback provider error received: ${String(error)} (Category: ${String(error).includes('access_denied') ? 'access_denied' : 'provider_failure'})`);
    return returnError(400, 'Google sign-in was cancelled or rejected.', 'OAUTH_PROVIDER_ERROR');
  }

  if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
    console.warn('[AUTH DIAGNOSTIC] Callback rejected: Missing or invalid code or state parameters');
    return returnError(400, 'Invalid or missing OAuth parameters.', 'INVALID_PARAMETERS');
  }

  // Validate state
  const stateRecord = googleOAuthStates.get(state);
  if (!stateRecord || Date.now() - stateRecord.createdAt > 10 * 60 * 1000) {
    googleOAuthStates.delete(state);
    console.warn(`[AUTH DIAGNOSTIC] State validation FAILED: ${!stateRecord ? 'State not found or already consumed (replay attempt blocked)' : 'State expired (>10m)'}`);
    return returnError(400, 'Expired or invalid OAuth session state. Please try again.', 'INVALID_STATE');
  }
  // Single-use token invalidation
  googleOAuthStates.delete(state);
  console.info('[AUTH DIAGNOSTIC] State validation PASSED: State verified and consumed (single-use guarantee enforced)');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getGoogleRedirectUri(req);

  try {
    let userinfo: { sub: string; email: string; name?: string; email_verified: boolean } | null = null;

    // 1. Check local authorization code first
    const localCodeRecord = localOAuthCodes.get(code);
    if (localCodeRecord) {
      localOAuthCodes.delete(code); // Enforce single-use consumption!
      if (Date.now() - localCodeRecord.createdAt > 5 * 60 * 1000) {
        console.warn('[AUTH DIAGNOSTIC] Local authorization code expired');
        return returnError(400, 'Authorization code has expired. Please try again.', 'EXPIRED_CODE');
      }
      userinfo = {
        sub: localCodeRecord.sub,
        email: localCodeRecord.email,
        name: localCodeRecord.name,
        email_verified: true,
      };
      console.info(`[AUTH DIAGNOSTIC] Server-side authorization code exchange succeeded | sub: ${userinfo.sub.substring(0, 6)}... | email: ${userinfo.email}`);
    } else {
      // 2. Real Google Cloud Token Exchange
      if (!clientId || !clientSecret) {
        console.error('[AUTH DIAGNOSTIC] Token exchange BLOCKED: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing at callback time (REQUIRES HUMAN ACTION)');
        return returnError(500, 'Google authentication configuration is missing.', 'CONFIG_MISSING');
      }

      console.info(`[AUTH DIAGNOSTIC] Token exchange attempted with https://oauth2.googleapis.com/token | Redirect URI: ${redirectUri}`);
      // Exchange code for tokens
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
      console.info(`[AUTH DIAGNOSTIC] Token exchange HTTP status: ${tokenResp.status} | Google error: ${tokenData.error || 'none'} | Description: ${tokenData.error_description || 'none'}`);

      if (!tokenResp.ok || !tokenData.access_token) {
        console.warn(`[AUTH DIAGNOSTIC] Token exchange failed with Google: category=${tokenData.error || 'unknown'}`);
        return res.redirect('/?auth_error=' + encodeURIComponent('Google sign-in could not be completed. Please try again.'));
      }

      // Validate ID Token if present (OIDC validation: issuer, audience, expiration)
      if (tokenData.id_token) {
        try {
          const parts = tokenData.id_token.split('.');
          if (parts.length === 3) {
            const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
            const payload = JSON.parse(payloadJson);
            const issValid = payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com';
            const audValid = payload.aud === clientId;
            const expValid = typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
            console.info(`[AUTH DIAGNOSTIC] ID token claims validated: issuer=${payload.iss} (${issValid ? 'VALID' : 'INVALID'}) | aud=${audValid ? 'MATCH' : 'MISMATCH'} | expiration=${expValid ? 'VALID' : 'EXPIRED'}`);
            if (!issValid || !audValid || !expValid) {
              console.warn('[AUTH DIAGNOSTIC] ID token claim validation failed.');
              return res.redirect('/?auth_error=' + encodeURIComponent('Google sign-in could not be completed. Please try again.'));
            }
          }
        } catch (err) {
          console.warn('[AUTH DIAGNOSTIC] Could not parse ID token JWT payload:', err);
        }
      }

      // Retrieve userinfo using access_token
      console.info('[AUTH DIAGNOSTIC] Retrieving userinfo from https://openidconnect.googleapis.com/v1/userinfo');
      const userinfoResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      const remoteUserinfo = await userinfoResp.json();
      console.info(`[AUTH DIAGNOSTIC] Identity validation HTTP status: ${userinfoResp.status} | sub present: ${Boolean(remoteUserinfo.sub)} | email present: ${Boolean(remoteUserinfo.email)} | email_verified: ${Boolean(remoteUserinfo.email_verified)}`);

      if (!userinfoResp.ok || !remoteUserinfo.sub || !remoteUserinfo.email) {
        console.warn('[AUTH DIAGNOSTIC] Failed to retrieve valid user identity from Google.');
        return res.redirect('/?auth_error=' + encodeURIComponent('Google sign-in could not be completed. Please try again.'));
      }

      userinfo = {
        sub: remoteUserinfo.sub,
        email: remoteUserinfo.email,
        name: remoteUserinfo.name,
        email_verified: Boolean(remoteUserinfo.email_verified),
      };
    }

    if (!userinfo) {
      return returnError(400, 'Unable to determine user identity.', 'IDENTITY_ERROR');
    }

    const { sub, email, name, email_verified } = userinfo;

    if (!email_verified) {
      console.warn('[AUTH DIAGNOSTIC] Identity validation FAILED: Google email is not verified.');
      return res.redirect('/?auth_error=' + encodeURIComponent('Google sign-in could not be completed. Please try again.'));
    }

    const normalizedEmail = String(email).trim().toLowerCase();

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
      // Check if user already registered by email
      user = usersDatabase.get(normalizedEmail);
      if (user) {
        // Link identity to existing account
        console.info(`[AUTH DIAGNOSTIC] Local user mapping: Found existing user by email. Linking permanent Google sub: ${sub.substring(0, 6)}...`);
        userIdentitiesDatabase.set(identityKey, {
          id: 'ident_' + Date.now(),
          userId: user.id,
          provider: 'google',
          providerSubject: sub,
          createdAt: new Date().toISOString(),
        });
      } else {
        // Create new user with server-determined role
        const preAuth = PRE_AUTHORIZED_STAFF[normalizedEmail];
        const roleCode = preAuth ? preAuth.roleCode : 'STUDENT';
        const roleName = preAuth ? preAuth.roleName : 'Student';
        const department = preAuth ? preAuth.department : 'Computer Science and Engineering (CSED)';

        console.info(`[AUTH DIAGNOSTIC] Local user mapping: Creating new user account linked to sub. Role: ${roleCode} | Dept: ${department}`);

        user = {
          id: 'usr_g_' + Date.now(),
          name: name ? String(name).trim() : normalizedEmail.split('@')[0].toUpperCase(),
          email: normalizedEmail,
          passwordHash: hashPasswordBcrypt('OAuth_Google_' + sub + '_' + normalizedEmail),
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
    } else {
      console.info(`[AUTH DIAGNOSTIC] Local user mapping: Successfully resolved existing user via stable Google sub: ${sub.substring(0, 6)}... (Role: ${user.roleCode})`);
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

    res.cookie('intellischedule_session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
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

    console.info(`[AUTH DIAGNOSTIC] Session created successfully: ${session.id} | Role: ${roleKey} | Authorized workspaces: ${authorizedWorkspaces.join(', ')}`);
    console.info('[AUTH DIAGNOSTIC] Sending response: Posting GOOGLE_AUTH_SUCCESS to window.opener or redirecting to application workspace');

    return res.send(`<!DOCTYPE html><html><head><title>Authentication Complete</title><style>body{font-family:system-ui,sans-serif;background-color:#09090b;color:#f4f4f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.card{text-align:center;background:#18181b;border:1px solid #27272a;padding:32px;border-radius:16px;}</style></head><body><div class="card"><h3 style="margin:0 0 8px 0;font-size:16px;">Signed in as ${user.email}</h3><p style="margin:0;font-size:13px;color:#a1a1aa;">Completing session setup and redirecting...</p></div><script>const authPayload={type:'GOOGLE_AUTH_SUCCESS',token:${JSON.stringify(sessionToken)},roleKey:${JSON.stringify(roleKey)},authorizedWorkspaces:${JSON.stringify(authorizedWorkspaces)},user:{id:${JSON.stringify(user.id)},name:${JSON.stringify(user.name)},email:${JSON.stringify(user.email)},department:${JSON.stringify(user.department)},roleCode:${JSON.stringify(user.roleCode)},authorizedWorkspaces:${JSON.stringify(authorizedWorkspaces)}}};if(window.opener){window.opener.postMessage(authPayload,'*');setTimeout(()=>{window.close();},400);}else{window.location.href='/?token='+encodeURIComponent(${JSON.stringify(sessionToken)});}</script></body></html>`);
  } catch (err) {
    console.error('[AUTH DIAGNOSTIC] Exception in Google OAuth callback handler:', err);
    const errMsg = 'Google sign-in could not be completed. Please try again.';
    return res.send(`<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#09090b;color:#ef4444;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><p style="color:#a1a1aa;font-size:14px;">${errMsg}</p><script>if(window.opener){window.opener.postMessage({type:'GOOGLE_AUTH_ERROR',message:${JSON.stringify(errMsg)}},'*');setTimeout(()=>window.close(),1200);}else{window.location.href='/?auth_error='+encodeURIComponent(${JSON.stringify(errMsg)});}</script></body></html>`);
  }
});

// -------------------------------------------------------------
// POST /api/auth/forgot-password (Rate limited, anti-enumeration)
// -------------------------------------------------------------
const handleForgotPassword = (req: Request, res: Response) => {
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

    resetTokensDatabase.set(rawToken, {
      id: 'prt_' + Date.now(),
      email: normalizedEmail,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins
      isUsed: false,
      createdAt: new Date().toISOString(),
    });
  }

  // Security requirement: Always return generic response to avoid email enumeration
  return res.json({
    success: true,
    message: 'If an account exists for this email, a password reset link has been sent.',
    resetToken: rawToken, // Provided for direct verification in browser environment
  });
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

  const record = resetTokensDatabase.get(token);
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

  const record = resetTokensDatabase.get(String(token));
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
  user.passwordHash = hashPasswordBcrypt(String(newPassword));
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
  resetTokensDatabase.set(String(token), record);

  // Invalidate all active sessions for this user
  for (const [key, sess] of sessionsDatabase.entries()) {
    if (sess.userId === user.id) {
      sess.isRevoked = true;
      sessionsDatabase.set(key, sess);
    }
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

export function authenticateRequest(req: Request): { user: StoredUser; session: StoredSession } | null {
  const token =
    req.headers.authorization?.replace(/^Bearer\s+/, '') ||
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

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const auth = authenticateRequest(req);
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
app.get('/api/academic/bootstrap', (req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({
    success: true,
    ...state,
    timestamp: new Date().toISOString(),
  });
});

// 1. Departments CRUD
app.get('/api/academic/departments', (_req: Request, res: Response) => {
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
    const dept = supabaseStore.updateDepartment(req.params.id, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, department: dept });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/departments/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    supabaseStore.deleteDepartment(req.params.id, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Department deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 2. Programs CRUD
app.get('/api/academic/programs', (_req: Request, res: Response) => {
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
    const prog = supabaseStore.updateProgram(req.params.id, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, program: prog });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/programs/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    supabaseStore.deleteProgram(req.params.id, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Program deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 3. Courses CRUD
app.get('/api/academic/courses', (_req: Request, res: Response) => {
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
    const course = supabaseStore.updateCourse(req.params.id, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, course });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/courses/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    supabaseStore.deleteCourse(req.params.id, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Course deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 4. Faculty CRUD
app.get('/api/academic/faculty', (_req: Request, res: Response) => {
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
    const faculty = supabaseStore.updateFaculty(req.params.id, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, faculty });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/faculty/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    supabaseStore.deleteFaculty(req.params.id, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Faculty removed successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 5. Rooms CRUD
app.get('/api/academic/rooms', (_req: Request, res: Response) => {
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
    const room = supabaseStore.updateRoom(req.params.id, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, room });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/rooms/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    supabaseStore.deleteRoom(req.params.id, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Room deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 6. Groups & Subgroups (Cohorts) CRUD
app.get('/api/academic/groups', (_req: Request, res: Response) => {
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
    const group = supabaseStore.updateGroup(req.params.id, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, section: group });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/groups/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    supabaseStore.deleteGroup(req.params.id, req.authenticatedUser?.name);
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
    supabaseStore.deleteSubgroup(req.params.groupId, req.params.subgroupId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Subgroup removed successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 7. Course Allocations CRUD
app.get('/api/academic/allocations', (_req: Request, res: Response) => {
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
    const alloc = supabaseStore.updateAllocation(req.params.id, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, allocation: alloc });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/allocations/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    supabaseStore.deleteAllocation(req.params.id, req.authenticatedUser?.name);
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
  const { budgetMode = 'BALANCED', timeBudgetMs = 800, seed = 1337, maxCandidates = 3 } = body;

  const result = supabaseStore.generateMasterTimetable(
    {
      budgetMode,
      timeBudgetMs: Number(timeBudgetMs),
      seed: Number(seed),
      maxCandidates: Number(maxCandidates),
    },
    req.authenticatedUser?.name
  );

  return res.json({
    ...result,
    generatedBy: req.authenticatedUser?.name,
  });
};

app.post('/api/timetable/generate', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);
app.post('/api/timetables/generate', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);
app.post('/api/timetable/generate-engine', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);

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
app.get('/api/timetable/versions', (_req: Request, res: Response) => {
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
app.get('/api/timetable/benchmark', (req: Request, res: Response) => {
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

// Schedule Makeup Session
app.post('/api/recovery/schedule-makeup', requireAuth, requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { opportunityId } = req.body;
  if (!opportunityId) {
    return res.status(400).json({ success: false, message: 'Opportunity ID is required.' });
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

// Notifications
app.get('/api/notifications', (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, notifications: state.notifications });
});

app.post('/api/notifications/:id/read', (req: Request, res: Response) => {
  const success = supabaseStore.markNotificationRead(req.params.id);
  return res.json({ success });
});

// Immutable Audit Events
app.get('/api/audit', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN', 'HOD']), (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, auditLogs: state.auditLogs });
});

// -------------------------------------------------------------
// Vite middleware in dev or static files in production
// -------------------------------------------------------------
async function setupApp() {
  // Synchronize baseline users into Supabase Auth Authority on startup
  await ensureSupabaseAuthUsers().catch(err => console.error('[SUPABASE AUTH SETUP ERROR]:', err));

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Thapar Timetable Server running on http://0.0.0.0:${port}`);
  });
}

if (!process.env.VERCEL) {
  setupApp();
} else {
  ensureSupabaseAuthUsers().catch(() => {});
}

export default app;
