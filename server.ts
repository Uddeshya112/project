import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import zlib from 'zlib';
import { performance } from 'node:perf_hooks';
import { connectDb } from './src/server/db';
import { createAuth, requireAuth, requireRole, STAFF_ROLES } from './src/server/auth';
import { store, type Viewer } from './src/server/store';
import { executeOptimizationEngine } from './src/lib/optimizationEngine';
import { HttpError } from './src/server/validate';
import { TimetableJobManager } from './src/server/jobManager';

const WORKSPACES: Record<string, string[]> = {
  SUPER_ADMIN: ['Admin', 'Coordinator'],
  COLLEGE_ADMIN: ['Admin', 'Coordinator'],
  COORDINATOR: ['Coordinator', 'Faculty'],
  HOD: ['Coordinator', 'Faculty'],
  FACULTY: ['Faculty'],
  CLASS_REPRESENTATIVE: ['Student', 'CR'],
  STUDENT: ['Student'],
};
const ROLE_NAMES: Record<string, string> = { SUPER_ADMIN: 'Super Admin', COLLEGE_ADMIN: 'College Admin / Dean', COORDINATOR: 'Timetable Coordinator', HOD: 'Head of Department', FACULTY: 'Faculty Member', CLASS_REPRESENTATIVE: 'Class Representative', STUDENT: 'Student' };
const ROLE_KEYS: Record<string, string> = {
  SUPER_ADMIN: 'Admin',
  COLLEGE_ADMIN: 'Admin',
  COORDINATOR: 'Coordinator',
  HOD: 'HOD',
  FACULTY: 'Faculty',
  CLASS_REPRESENTATIVE: 'Student',
  STUDENT: 'Student',
};

const DEFAULT_ALLOWED_ORIGINS = [
  'https://tiet-timetable-six.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
];

function envList(name: string, fallback: string[]) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

function toViewer(req: Request): Viewer {
  const u = req.user;
  if (!u) throw new HttpError(401, 'Authentication required.');
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    roleCode: u.role_code,
    isDemo: u.is_demo,
    profile: u.profile ?? {},
  };
}

function gzipJsonResponses(req: Request, res: Response, next: NextFunction) {
  const acceptsGzip = String(req.headers['accept-encoding'] || '').includes('gzip');
  if (!acceptsGzip) return next();

  const originalJson = res.json.bind(res);
  (res as any).json = (body: unknown) => {
    if (res.headersSent) return res;
    const payload = Buffer.from(JSON.stringify(body));
    const gzipped = zlib.gzipSync(payload);
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', gzipped.length);
    res.end(gzipped);
    return res;
  };
  return next();
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function parseVersionId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value).trim().replace(/^V/i, '').replace(/\.0$/, '');
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function createApp(db: import('./src/server/db').Db, jobManager?: TimetableJobManager) {
  const allowedOrigins = new Set(envList('ALLOWED_ORIGINS', DEFAULT_ALLOWED_ORIGINS));
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
  }));

  // Exact origin allow-list + credentialed cookies. Unknown origins are never reflected.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      return res.status(403).json({ success: false, error: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed.' });
    }
    next();
  });
  app.use(cors({
    origin: (origin, cb) => cb(null, origin && allowedOrigins.has(origin) ? origin : true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  }));

  app.use(express.json({ limit: '2mb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(gzipJsonResponses);

  app.get('/api/health/live', (_req, res) => res.json({ status: 'LIVE' }));
  app.get('/api/health/ready', (_req, res) => res.json({ status: 'READY' }));

  const auth = createAuth({
    db,
    demoMode: process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE === 'true',
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
    appUrl: process.env.APP_URL || 'https://tiet-timetable-six.vercel.app',
    allowedDomains: envList('ALLOWED_EMAIL_DOMAINS', ['thapar.edu']),
    sessionTtlHours: Math.min(168, Math.max(1, Number(process.env.SESSION_TTL_HOURS) || 24)),
    bcryptRounds: Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS) || 12)),
    rosterLookup: (email) => store.rosterLookup(email),
  });

  app.use(auth.loadUser);
  app.use(auth.router);

  app.get('/api/me', requireAuth, (req, res) => {
    const viewer = toViewer(req);
    const state = store.getBootstrapState(viewer);
    const roleCode = req.user!.role_code;
    const authorizedWorkspaces = WORKSPACES[roleCode] ?? ['Student'];
    const role = ROLE_KEYS[roleCode] ?? 'Student';
    res.json({
      success: true,
      user: {
        id: req.user!.id,
        name: req.user!.name,
        email: req.user!.email,
        department: req.user!.department,
        roleCode,
        roleName: ROLE_NAMES[roleCode] ?? 'Student',
        authorizedWorkspaces,
        isDemoUser: req.user!.is_demo,
        profile: req.user!.profile ?? {},
        hasPassword: Boolean(req.user!.password_hash),
      },
      role,
      roleCode,
      roleName: ROLE_NAMES[roleCode] ?? 'Student',
      authorizedWorkspaces,
      roster: state.roster,
    });
  });

  app.get('/api/me/timetable', requireAuth, (req, res) => {
    const viewer = toViewer(req);
    const state = store.getBootstrapState(viewer);
    const sessions = state.sessions.filter((s) => s.status !== 'Cancelled');
    const byCourse = new Map(state.courses.map((c) => [c.id, c]));
    const byRoom = new Map(state.rooms.map((r) => [r.id, r]));
    const byFaculty = new Map(state.facultyMembers.map((f) => [f.id, f]));
    res.json({
      success: true,
      user: { id: viewer.id, name: viewer.name, roleCode: viewer.roleCode, roster: state.roster },
      schedule: sessions.map((s) => ({
        id: s.id,
        day: s.day,
        timeSlotId: s.timeSlotId,
        timeSlot: state.academicYear.timeSlots.find((t) => t.id === s.timeSlotId)?.label ?? s.timeSlotId,
        courseId: s.courseId,
        courseCode: byCourse.get(s.courseId)?.code ?? s.courseId,
        courseName: byCourse.get(s.courseId)?.name ?? s.courseId,
        roomId: s.roomId,
        room: byRoom.get(s.roomId)?.name ?? s.roomId,
        facultyId: s.facultyId,
        faculty: byFaculty.get(s.facultyId)?.name ?? s.facultyId,
        sectionId: s.sectionId,
        status: s.status,
      })),
    });
  });

  const academicRead = requireAuth;
  const academicWrite = requireRole(['COORDINATOR', 'COLLEGE_ADMIN']);

  app.get('/api/academic/bootstrap', academicRead, (req, res) => res.json({ success: true, ...store.getBootstrapState(toViewer(req)), timestamp: new Date().toISOString() }));
  app.get('/api/academic/departments', academicRead, (req, res) => res.json({ success: true, departments: store.getBootstrapState(toViewer(req)).departments }));
  app.get('/api/academic/programs', academicRead, (req, res) => res.json({ success: true, programs: store.getBootstrapState(toViewer(req)).programs }));
  app.get('/api/academic/courses', academicRead, (req, res) => res.json({ success: true, courses: store.getBootstrapState(toViewer(req)).courses }));
  app.get('/api/academic/faculty', academicRead, (req, res) => res.json({ success: true, facultyMembers: store.getBootstrapState(toViewer(req)).facultyMembers }));
  app.get('/api/academic/rooms', academicRead, (req, res) => res.json({ success: true, rooms: store.getBootstrapState(toViewer(req)).rooms }));
  app.get('/api/academic/groups', academicRead, (req, res) => res.json({ success: true, sections: store.getBootstrapState(toViewer(req)).sections }));
  app.get('/api/academic/allocations', academicRead, (req, res) => res.json({ success: true, allocations: store.getBootstrapState(toViewer(req)).allocations }));

  const mutate = asyncRoute(async (req, res, _next) => res.json({ success: true }));

  app.post('/api/academic/departments', academicWrite, asyncRoute(async (req, res) => {
    const value = store.createDepartment(req.body, req.user!.name);
    await store.persist();
    res.status(201).json({ success: true, department: value });
  }));
  app.put('/api/academic/departments/:id', academicWrite, asyncRoute(async (req, res) => {
    const value = store.updateDepartment(String(req.params.id), req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, department: value });
  }));
  app.delete('/api/academic/departments/:id', academicWrite, asyncRoute(async (req, res) => {
    store.deleteDepartment(String(req.params.id), req.user!.name);
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/academic/programs', academicWrite, asyncRoute(async (req, res) => {
    const value = store.createProgram(req.body, req.user!.name);
    await store.persist();
    res.status(201).json({ success: true, program: value });
  }));
  app.put('/api/academic/programs/:id', academicWrite, asyncRoute(async (req, res) => {
    const value = store.updateProgram(String(req.params.id), req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, program: value });
  }));
  app.delete('/api/academic/programs/:id', academicWrite, asyncRoute(async (req, res) => {
    store.deleteProgram(String(req.params.id), req.user!.name);
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/academic/courses', academicWrite, asyncRoute(async (req, res) => {
    const value = store.createCourse(req.body, req.user!.name);
    await store.persist();
    res.status(201).json({ success: true, course: value, courseId: value.id });
  }));
  app.put('/api/academic/courses/:id', academicWrite, asyncRoute(async (req, res) => {
    const value = store.updateCourse(String(req.params.id), req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, course: value });
  }));
  app.delete('/api/academic/courses/:id', academicWrite, asyncRoute(async (req, res) => {
    store.deleteCourse(String(req.params.id), req.user!.name);
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/academic/faculty', academicWrite, asyncRoute(async (req, res) => {
    const value = store.createFaculty(req.body, req.user!.name);
    await store.persist();
    res.status(201).json({ success: true, faculty: value });
  }));
  app.put('/api/academic/faculty/:id', academicWrite, asyncRoute(async (req, res) => {
    const value = store.updateFaculty(String(req.params.id), req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, faculty: value });
  }));
  app.delete('/api/academic/faculty/:id', academicWrite, asyncRoute(async (req, res) => {
    store.deleteFaculty(String(req.params.id), req.user!.name);
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/academic/rooms', academicWrite, asyncRoute(async (req, res) => {
    const value = store.createRoom(req.body, req.user!.name);
    await store.persist();
    res.status(201).json({ success: true, room: value, roomId: value.id });
  }));
  app.put('/api/academic/rooms/:id', academicWrite, asyncRoute(async (req, res) => {
    const value = store.updateRoom(String(req.params.id), req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, room: value });
  }));
  app.delete('/api/academic/rooms/:id', academicWrite, asyncRoute(async (req, res) => {
    store.deleteRoom(String(req.params.id), req.user!.name);
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/academic/groups', academicWrite, asyncRoute(async (req, res) => {
    const value = store.createGroup(req.body, req.user!.name);
    await store.persist();
    res.status(201).json({ success: true, section: value });
  }));
  app.put('/api/academic/groups/:id', academicWrite, asyncRoute(async (req, res) => {
    const value = store.updateGroup(String(req.params.id), req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, section: value });
  }));
  app.delete('/api/academic/groups/:id', academicWrite, asyncRoute(async (req, res) => {
    store.deleteGroup(String(req.params.id), req.user!.name);
    await store.persist();
    res.json({ success: true });
  }));
  app.post('/api/academic/groups/bulk', academicWrite, asyncRoute(async (req, res) => {
    const value = store.bulkGenerateGroups(req.body, req.user!.name);
    await store.persist();
    res.status(201).json({ success: true, sections: value });
  }));
  app.post('/api/academic/subgroups', academicWrite, asyncRoute(async (req, res) => {
    const value = store.addSubgroup(req.body?.groupId, { name: req.body?.name, studentCount: req.body?.studentCount, type: req.body?.type }, req.user!.name);
    await store.persist();
    res.status(201).json({ success: true, subgroup: value });
  }));
  app.delete('/api/academic/subgroups/:groupId/:subgroupId', academicWrite, asyncRoute(async (req, res) => {
    store.deleteSubgroup(String(req.params.groupId), String(req.params.subgroupId), req.user!.name);
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/academic/allocations', academicWrite, asyncRoute(async (req, res) => {
    const value = store.createAllocation(req.body, req.user!.name);
    await store.persist();
    res.status(201).json({ success: true, allocation: value, allocationId: value.id });
  }));
  app.put('/api/academic/allocations/:id', academicWrite, asyncRoute(async (req, res) => {
    const value = store.updateAllocation(String(req.params.id), req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, allocation: value });
  }));
  app.delete('/api/academic/allocations/:id', academicWrite, asyncRoute(async (req, res) => {
    store.deleteAllocation(String(req.params.id), req.user!.name);
    await store.persist();
    res.json({ success: true });
  }));

  app.patch('/api/academic/year', academicWrite, asyncRoute(async (req, res) => {
    const value = store.updateAcademicYear(req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, academicYear: value });
  }));

  app.post('/api/academic/import', academicWrite, asyncRoute(async (req, res) => {
    if (!req.body?.parsedData) throw new HttpError(400, 'Parsed workbook payload is required.');
    const value = store.commitMasterExcelImport(req.body.parsedData, req.body.mode ?? 'upsert', req.user!.name);
    await store.persist();
    res.json(value);
  }));

  app.get('/api/students', requireRole(STAFF_ROLES), (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
    const search = String(req.query.search ?? '');
    const sectionId = String(req.query.sectionId ?? '');
    res.json({ success: true, ...store.queryStudents(page, limit, search, sectionId) });
  });

  app.get('/api/audit', requireRole(STAFF_ROLES), (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    res.json({ success: true, logs: store.getAuditLogs(limit) });
  });

  const schedulingWrite = requireRole(['COORDINATOR', 'COLLEGE_ADMIN']);

  const generate = asyncRoute(async (req, res) => {
    if (req.body?.async === true) {
      if (!jobManager) throw new HttpError(503, 'Background timetable jobs are not configured.');
      const state = store.getBootstrapState(toViewer(req));
      const jobId = await jobManager.createJob({
        academicYear: state.academicYear,
        allocations: state.allocations,
        facultyMembers: state.facultyMembers,
        rooms: state.rooms,
        sections: state.sections,
        courses: state.courses,
        constraints: state.constraints,
        options: {
          budgetMode: req.body?.budgetMode ?? 'BALANCED',
          timeBudgetMs: Math.min(30_000, Math.max(100, Number(req.body?.timeBudgetMs) || 800)),
          maxCandidates: Math.min(5, Math.max(1, Number(req.body?.maxCandidates) || 2)),
          seed: Number.isInteger(req.body?.seed) ? req.body.seed : 1337,
          optimizationProfile: req.body?.optimizationProfile,
        },
      });
      res.status(202).json({ jobId, status: 'PENDING', progress: 0 });
      return;
    }

    const result = store.generateRoutines(req.body, req.user!.name);
    await store.persist();
    res.json({ jobId: `job_sync_${Date.now()}`, ...result, generatedBy: req.user!.name });
  });
  app.post('/api/academic/generate', schedulingWrite, generate);
  app.post('/api/timetable/generate', schedulingWrite, generate);
  app.post('/api/timetables/generate', schedulingWrite, generate);
  app.post('/api/timetable/generate-engine', schedulingWrite, generate);

  app.post('/api/timetable/jobs', schedulingWrite, asyncRoute(async (req, res) => {
    if (!jobManager) throw new HttpError(503, 'Background timetable jobs are not configured.');
    const state = store.getBootstrapState(toViewer(req));
    const jobId = await jobManager.createJob({
      academicYear: state.academicYear,
      allocations: state.allocations,
      facultyMembers: state.facultyMembers,
      rooms: state.rooms,
      sections: state.sections,
      courses: state.courses,
      constraints: state.constraints,
      options: {
        budgetMode: req.body?.budgetMode ?? 'BALANCED',
        timeBudgetMs: Math.min(30_000, Math.max(100, Number(req.body?.timeBudgetMs) || 800)),
        maxCandidates: Math.min(5, Math.max(1, Number(req.body?.maxCandidates) || 1)),
        seed: Number.isInteger(req.body?.seed) ? req.body.seed : 1337,
        optimizationProfile: req.body?.optimizationProfile,
      },
    });
    res.status(202).json({ success: true, jobId, status: 'PENDING', progress: 0 });
  }));

  app.get('/api/timetable/jobs/:id', requireAuth, asyncRoute(async (req, res) => {
    if (!jobManager) throw new HttpError(503, 'Background timetable jobs are not configured.');
    const job = await jobManager.getJob(String(req.params.id));
    if (!job) throw new HttpError(404, 'Generation job not found.');
    res.json(job);
  }));

  app.post('/api/timetable/jobs/:id/cancel', schedulingWrite, asyncRoute(async (req, res) => {
    if (!jobManager) throw new HttpError(503, 'Background timetable jobs are not configured.');
    const cancelled = await jobManager.cancelJob(String(req.params.id));
    if (!cancelled) throw new HttpError(409, 'Generation job cannot be cancelled in its current state.');
    res.json({ success: true });
  }));

  app.get('/api/timetable/versions', requireAuth, (req, res) => {
    res.json({ success: true, versions: store.getBootstrapState(toViewer(req)).versions });
  });

  app.post('/api/timetable/select-routine', schedulingWrite, asyncRoute(async (req, res) => {
    const n = Number(req.body?.versionNumber);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'Version number is required.');
    const version = store.selectVersion(n, req.user!.name);
    await store.persist();
    res.json({ success: true, version });
  }));

  app.post('/api/timetable/move', schedulingWrite, asyncRoute(async (req, res) => {
    const version = store.moveSession(req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, version });
  }));

  app.post('/api/timetable/swap', schedulingWrite, asyncRoute(async (req, res) => {
    const version = store.swapSessions(req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, version });
  }));

  app.post('/api/timetable/versions/:versionNumber/restore', schedulingWrite, asyncRoute(async (req, res) => {
    const version = store.restoreVersion(Number(req.params.versionNumber), req.user!.name);
    await store.persist();
    res.json({ success: true, version });
  }));

  app.post('/api/timetable/sessions', requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN']), asyncRoute(async (req, res) => {
    const session = store.addSession(req.body, toViewer(req));
    await store.persist();
    res.status(201).json({ success: true, session });
  }));
  app.post('/api/timetable/sessions/:id/lock', schedulingWrite, asyncRoute(async (req, res) => {
    const session = store.toggleSessionLock(String(req.params.id), req.body?.reason, req.user!.name);
    await store.persist();
    res.json({ success: true, session });
  }));

  app.post('/api/timetable/review', schedulingWrite, asyncRoute(async (req, res) => {
    const value = store.setReviewStatus(req.body?.status, req.user!.name);
    await store.persist();
    res.json({ success: true, academicYear: value });
  }));

  app.post('/api/timetable/approve', requireRole(['COLLEGE_ADMIN']), asyncRoute(async (req, res) => {
    const value = store.approve(req.user!.name);
    await store.persist();
    res.json({ success: true, academicYear: value });
  }));

  app.post('/api/timetable/publish', requireRole(['COLLEGE_ADMIN']), asyncRoute(async (req, res) => {
    const versionNumber = parseVersionId(req.body?.versionId);
    if (versionNumber !== undefined) store.selectVersion(versionNumber, req.user!.name);
    const value = store.publish(req.user!.name);
    await store.persist();
    res.json({ success: true, academicYear: value });
  }));
  app.post('/api/timetables/publish', requireRole(['COLLEGE_ADMIN']), asyncRoute(async (req, res) => {
    const versionNumber = parseVersionId(req.body?.versionId);
    if (versionNumber !== undefined) store.selectVersion(versionNumber, req.user!.name);
    const value = store.publish(req.user!.name);
    await store.persist();
    res.json({ success: true, academicYear: value });
  }));

  app.get('/api/timetable/benchmark', requireRole(STAFF_ROLES), (req, res) => {
    const state = store.getBootstrapState(toViewer(req));
    const startedFast = performance.now();
    const fast = executeOptimizationEngine(
      state.academicYear,
      state.allocations,
      state.facultyMembers,
      state.rooms,
      state.sections,
      state.courses,
      state.constraints,
      { budgetMode: 'FAST', timeBudgetMs: 200, seed: 101, maxCandidates: 1 },
    );
    const fastMs = Math.max(0, Math.round((performance.now() - startedFast) * 10) / 10);
    const startedOpt = performance.now();
    const opt = executeOptimizationEngine(
      state.academicYear,
      state.allocations,
      state.facultyMembers,
      state.rooms,
      state.sections,
      state.courses,
      state.constraints,
      { budgetMode: 'MAXIMUM_OPTIMIZATION', timeBudgetMs: 500, seed: 101, maxCandidates: 3 },
    );
    const optMs = Math.max(0, Math.round((performance.now() - startedOpt) * 10) / 10);
    res.json({
      engineVersion: '2.x',
      fastMode: {
        isFeasible: fast.isFeasible,
        totalTimeMs: fastMs,
        candidatesEvaluated: fast.metrics.candidatesEvaluated,
        candidatesPruned: fast.metrics.candidatesPruned,
        healthScore: fast.bestCandidate?.healthScore ?? 0,
      },
      optimizationMode: {
        isFeasible: opt.isFeasible,
        totalTimeMs: optMs,
        candidatesEvaluated: opt.metrics.candidatesEvaluated,
        candidatesPruned: opt.metrics.candidatesPruned,
        healthScore: opt.bestCandidate?.healthScore ?? 0,
        candidatesCount: opt.allCandidates.length,
      },
    });
  });

  app.post('/api/recovery/cancel-class', requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN', 'HOD']), asyncRoute(async (req, res) => {
    const value = store.cancelClass(req.body, toViewer(req));
    await store.persist();
    res.json({ success: true, ...value, cancelledBy: req.user!.name });
  }));

  app.post('/api/recovery/schedule-makeup', requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN']), asyncRoute(async (req, res) => {
    const session = store.scheduleMakeup(req.body?.opportunityId, toViewer(req));
    await store.persist();
    res.json({ success: true, session });
  }));

  app.post('/api/recovery/decline-opportunity', requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN']), asyncRoute(async (req, res) => {
    store.declineOpportunity(req.body?.opportunityId, toViewer(req));
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/recovery/request-makeup', requireRole(['CLASS_REPRESENTATIVE', 'COORDINATOR', 'COLLEGE_ADMIN']), asyncRoute(async (req, res) => {
    store.postNotification({
      type: 'makeup_request',
      category: 'Info',
      title: 'Student makeup request',
      message: String(req.body?.message || 'A makeup request was submitted.').slice(0, 1000),
      recipientRole: 'Coordinator',
      actionable: true,
    }, toViewer(req));
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/recovery/request-substitute', requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN']), asyncRoute(async (req, res) => {
    store.postNotification({
      type: 'makeup_request',
      category: 'Info',
      title: 'Substitute faculty request',
      message: String(req.body?.message || 'A substitute faculty request was submitted.').slice(0, 1000),
      recipientRole: 'Coordinator',
      actionable: true,
    }, toViewer(req));
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/faculty/protected-slot', requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN', 'HOD']), asyncRoute(async (req, res) => {
    const faculty = store.toggleProtectedSlot(req.body, toViewer(req));
    await store.persist();
    res.json({ success: true, faculty });
  }));

  app.post('/api/constraints', schedulingWrite, asyncRoute(async (req, res) => {
    const constraint = store.createConstraint(req.body, req.user!.name);
    await store.persist();
    res.status(201).json({ success: true, constraint });
  }));
  app.patch('/api/constraints/:id', schedulingWrite, asyncRoute(async (req, res) => {
    const constraint = store.updateConstraint(String(req.params.id), req.body, req.user!.name);
    await store.persist();
    res.json({ success: true, constraint });
  }));
  app.delete('/api/constraints/:id', schedulingWrite, asyncRoute(async (req, res) => {
    store.deleteConstraint(String(req.params.id), req.user!.name);
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/constraints/:id/toggle', schedulingWrite, asyncRoute(async (req, res) => {
    const constraint = store.toggleConstraint(String(req.params.id), req.user!.name);
    await store.persist();
    res.json({ success: true, constraint });
  }));

  app.post('/api/notifications', requireRole(STAFF_ROLES), asyncRoute(async (req, res) => {
    store.postNotification(req.body, toViewer(req));
    await store.persist();
    res.status(201).json({ success: true });
  }));

  app.post('/api/notifications/:id/read', requireAuth, asyncRoute(async (req, res) => {
    store.markNotificationRead(String(req.params.id), toViewer(req));
    await store.persist();
    res.json({ success: true });
  }));

  app.post('/api/voting/polls', requireAuth, asyncRoute(async (req, res) => {
    const poll = store.createPoll(req.body, toViewer(req));
    await store.persist();
    res.status(201).json({ success: true, poll });
  }));

  app.post('/api/voting/vote', requireAuth, asyncRoute(async (req, res) => {
    const result = store.castVote(req.body, toViewer(req));
    await store.persist();
    res.json(result);
  }));

  app.get('/api/demo/status', requireAuth, (req, res) => {
    const demoEnabled = process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE === 'true';
    res.json({ success: true, enabled: demoEnabled, accounts: demoEnabled ? ['Coordinator', 'Faculty', 'Student', 'Admin', 'HOD'] : [] });
  });

  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    try {
      const { createServer: createVite } = await import('vite');
      const vite = await createVite({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('[DEV] Vite middleware unavailable; run the frontend separately.', err);
    }
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    const e = err as { message?: string };
    console.error('[api] request failed:', e?.message || err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  });

  return { app, seedUsers: auth.seedUsers, loadUser: auth.loadUser };
}

export async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const databaseUrl = process.env.DATABASE_URL || (isProduction ? '' : 'pglite:.data/intellischedule');
  if (!databaseUrl) throw new Error('DATABASE_URL must be configured in production.');

  const db = await connectDb(databaseUrl);
  await store.init(db, { seedDemoData: process.env.SEED_DEMO_DATA === 'true' });
  const jobManager = new TimetableJobManager(db);
  await jobManager.init();
  const { app, seedUsers } = await createApp(db, jobManager);
  await seedUsers();

  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, '0.0.0.0', () => {
    console.log('[STARTUP] HTTP server listening', { port });
  });

  const shutdown = async () => {
    server.close();
    await db.close();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}

if (process.env.INTELLISCHEDULE_NO_LISTEN !== '1') {
  startServer().catch((err) => {
    console.error('[STARTUP] Fatal:', err?.message || err);
    process.exitCode = 1;
  });
}

export default startServer;
