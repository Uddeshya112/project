import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import compression from 'compression';
import path from 'path';
import { connectDb, type Db } from './src/server/db';
import { createAuth, requireAuth, requireRole, publicUser, rateLimit, ADMIN_ROLES, STAFF_ROLES, type RoleCode } from './src/server/auth';
import { store, type Viewer } from './src/server/store';
import { HttpError } from './src/server/validate';
import { executeOptimizationEngine } from './src/lib/optimizationEngine';

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const flag = (v: string | undefined, fallback: boolean) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

const config = {
  port: Number(env.PORT) || 3000,
  // Supabase: Project Settings -> Database -> Connection string (use the pooler URI on serverless hosts).
  databaseUrl: env.DATABASE_URL || env.SUPABASE_DB_CONNECTION_STRING || (isProd ? '' : 'pglite:./.data/pglite'),
  appUrl: env.APP_URL?.replace(/\/+$/, ''),
  demoMode: flag(env.DEMO_MODE, true),
  seedDemoData: flag(env.SEED_DEMO_DATA, true),
  allowedDomains: (env.ALLOWED_EMAIL_DOMAINS ?? 'thapar.edu').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
  trustProxy: env.TRUST_PROXY ?? (isProd ? '1' : 'false'),
};

const COORDINATION: RoleCode[] = ['COORDINATOR', ...ADMIN_ROLES];
const TEACHING: RoleCode[] = ['FACULTY', 'HOD', ...COORDINATION];

const viewer = (req: Request): Viewer => ({
  id: req.user!.id,
  name: req.user!.name,
  email: req.user!.email,
  roleCode: req.user!.role_code,
  isDemo: req.user!.is_demo,
  profile: req.user!.profile ?? {},
});
const who = (req: Request) => req.user!.name;

export async function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy === 'true');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://images.unsplash.com https://lh3.googleusercontent.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com",
      );
    }
    next();
  });

  app.use('/api', express.json({ limit: '10mb' }));

  // The API is same-origin only. Browsers send Origin on state-changing requests; reject foreign ones.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      host = '';
    }
    if (host === req.get('host') || (config.appUrl && origin === new URL(config.appUrl).origin)) return next();
    return res.status(403).json({ success: false, message: 'Cross-site request rejected.' });
  });

  const auth = createAuth({
    db,
    demoMode: config.demoMode,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: env.GOOGLE_REDIRECT_URI,
    appUrl: config.appUrl,
    allowedDomains: config.allowedDomains,
    sessionTtlHours: Number(env.SESSION_TTL_HOURS) || 168,
    bcryptRounds: Number(env.BCRYPT_ROUNDS) || 12,
    rosterLookup: store.rosterLookup,
  });

  // ---------------------------------------------------------------------------
  // Health (no auth, no internals)
  // ---------------------------------------------------------------------------
  app.get('/api/health/live', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'LIVE' });
  });
  app.get('/api/health/ready', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await db.query('select 1');
      res.json({ status: 'READY' });
    } catch {
      res.status(503).json({ status: 'DATABASE_UNAVAILABLE' });
    }
  });

  app.use('/api', auth.loadUser);
  app.use(auth.router);

  // Store-mutating requests are saved to the database before the response is sent.
  app.use(['/api/academic', '/api/timetable', '/api/recovery', '/api/voting', '/api/notifications'], (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const send = res.json.bind(res);
    res.json = ((body: unknown) => {
      store.persist().then(
        () => send(body),
        (err: Error) => {
          console.error('[store] save failed:', err.message);
          res.status(err instanceof HttpError ? err.status : 503);
          send({ success: false, message: err instanceof HttpError ? err.message : 'Your change could not be saved. Please try again.' });
        },
      );
      return res;
    }) as typeof res.json;
    next();
  });

  // ---------------------------------------------------------------------------
  // Current user & reads
  // ---------------------------------------------------------------------------
  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ success: true, user: publicUser(req.user!), roster: store.rosterContext(viewer(req)) });
  });

  app.get('/api/academic/bootstrap', requireAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...store.getBootstrapState(viewer(req)), timestamp: new Date().toISOString() });
  });

  app.get('/api/students', requireRole(STAFF_ROLES), (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    res.json({ success: true, ...store.queryStudents(page, limit, String(req.query.search ?? ''), String(req.query.sectionId ?? '')) });
  });

  app.get('/api/audit', requireRole(STAFF_ROLES), (req, res) => {
    res.json({ success: true, auditLogs: store.getAuditLogs(Math.min(500, Number(req.query.limit) || 200)) });
  });

  // ---------------------------------------------------------------------------
  // Academic master data (coordinators and admins)
  // ---------------------------------------------------------------------------
  const coord = requireRole(COORDINATION);
  const crud: Array<[string, string, (b: unknown, u: string) => unknown, (id: string, b: unknown, u: string) => unknown, (id: string, u: string) => void]> = [
    ['departments', 'department', (b, u) => store.createDepartment(b, u), (id, b, u) => store.updateDepartment(id, b, u), (id, u) => store.deleteDepartment(id, u)],
    ['programs', 'program', (b, u) => store.createProgram(b, u), (id, b, u) => store.updateProgram(id, b, u), (id, u) => store.deleteProgram(id, u)],
    ['courses', 'course', (b, u) => store.createCourse(b, u), (id, b, u) => store.updateCourse(id, b, u), (id, u) => store.deleteCourse(id, u)],
    ['faculty', 'faculty', (b, u) => store.createFaculty(b, u), (id, b, u) => store.updateFaculty(id, b, u), (id, u) => store.deleteFaculty(id, u)],
    ['rooms', 'room', (b, u) => store.createRoom(b, u), (id, b, u) => store.updateRoom(id, b, u), (id, u) => store.deleteRoom(id, u)],
    ['groups', 'section', (b, u) => store.createGroup(b, u), (id, b, u) => store.updateGroup(id, b, u), (id, u) => store.deleteGroup(id, u)],
    ['allocations', 'allocation', (b, u) => store.createAllocation(b, u), (id, b, u) => store.updateAllocation(id, b, u), (id, u) => store.deleteAllocation(id, u)],
  ];
  for (const [route, key, create, update, remove] of crud) {
    app.post(`/api/academic/${route}`, coord, (req, res) => {
      res.status(201).json({ success: true, [key]: create(req.body, who(req)) });
    });
    app.put(`/api/academic/${route}/:id`, coord, (req, res) => {
      res.json({ success: true, [key]: update(String(req.params.id), req.body, who(req)) });
    });
    app.delete(`/api/academic/${route}/:id`, coord, (req, res) => {
      remove(String(req.params.id), who(req));
      res.json({ success: true });
    });
  }

  app.post('/api/academic/groups/bulk', coord, (req, res) => {
    res.status(201).json({ success: true, sections: store.bulkGenerateGroups(req.body, who(req)) });
  });
  app.post('/api/academic/subgroups', coord, (req, res) => {
    res.status(201).json({ success: true, subgroup: store.addSubgroup(String(req.body?.groupId ?? ''), req.body, who(req)) });
  });
  app.delete('/api/academic/subgroups/:groupId/:subgroupId', coord, (req, res) => {
    store.deleteSubgroup(String(req.params.groupId), String(req.params.subgroupId), who(req));
    res.json({ success: true });
  });
  app.put('/api/academic/year', coord, (req, res) => {
    res.json({ success: true, academicYear: store.updateAcademicYear(req.body, who(req)) });
  });
  app.post('/api/academic/import', coord, (req, res) => {
    res.json(store.commitMasterExcelImport(req.body?.parsedData, req.body?.mode ?? 'upsert', who(req)));
  });

  // ---------------------------------------------------------------------------
  // Timetable
  // ---------------------------------------------------------------------------
  app.post('/api/academic/generate', coord, (req, res) => {
    res.json({ ...store.generateRoutines(req.body, who(req)), generatedBy: who(req) });
  });
  app.post('/api/timetable/select-routine', coord, (req, res) => {
    res.json({ success: true, version: store.selectVersion(Number(req.body?.versionNumber), who(req)) });
  });
  app.post('/api/timetable/move', coord, (req, res) => {
    res.json({ success: true, message: 'Session moved; draft version saved.', version: store.moveSession(req.body, who(req)) });
  });
  app.post('/api/timetable/swap', coord, (req, res) => {
    res.json({ success: true, message: 'Sessions swapped; draft version saved.', version: store.swapSessions(req.body, who(req)) });
  });
  app.post('/api/timetable/status', coord, (req, res) => {
    res.json({ success: true, academicYear: store.setReviewStatus(req.body?.status, who(req)) });
  });
  app.post('/api/timetable/approve', requireRole(ADMIN_ROLES), (req, res) => {
    res.json({ success: true, message: 'Timetable approved.', academicYear: store.approve(who(req)) });
  });
  app.post('/api/timetable/publish', requireRole(ADMIN_ROLES), (req, res) => {
    res.json({ success: true, message: 'Timetable published to all students and faculty.', academicYear: store.publish(who(req)) });
  });
  app.get('/api/timetable/versions/:versionNumber', requireRole(STAFF_ROLES), (req, res) => {
    res.json({ success: true, version: store.getVersion(Number(req.params.versionNumber)) });
  });
  app.post('/api/timetable/versions/:versionNumber/restore', coord, (req, res) => {
    res.json({ success: true, version: store.restoreVersion(Number(req.params.versionNumber), who(req)) });
  });

  // Runs the real engine on the current data; staff only because it is CPU-bound.
  app.get('/api/timetable/benchmark', requireRole(STAFF_ROLES), (req, res) => {
    if (rateLimitedBenchmark(req)) return res.status(429).json({ success: false, message: 'Benchmark is limited to once every 10 seconds.' });
    const s = store.getBootstrapState(viewer(req));
    const run = (budgetMode: 'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION', timeBudgetMs: number) => {
      const r = executeOptimizationEngine(s.academicYear, s.allocations, s.facultyMembers, s.rooms, s.sections, s.courses, s.constraints, {
        budgetMode,
        timeBudgetMs,
        seed: 101,
        maxCandidates: 1,
      });
      return { isFeasible: r.isFeasible, statusMessage: r.statusMessage, metrics: r.metrics, sessions: r.bestCandidate?.sessions.length ?? 0, softPenalty: r.bestCandidate?.softPenalty ?? null };
    };
    res.json({ success: true, fast: run('FAST', 300), balanced: run('BALANCED', 800), maximum: run('MAXIMUM_OPTIMIZATION', 1500) });
  });

  // ---------------------------------------------------------------------------
  // Recovery, polls, notifications
  // ---------------------------------------------------------------------------
  const teaching = requireRole(TEACHING);
  app.post('/api/recovery/cancel-class', teaching, (req, res) => {
    res.json({ success: true, message: 'Class cancelled; make-up options generated.', ...store.cancelClass(req.body, viewer(req)) });
  });
  app.post('/api/recovery/schedule-makeup', teaching, (req, res) => {
    res.json({ success: true, message: 'Make-up class scheduled.', session: store.scheduleMakeup(req.body?.opportunityId, viewer(req)) });
  });
  app.post('/api/recovery/decline', teaching, (req, res) => {
    store.declineOpportunity(req.body?.opportunityId, viewer(req));
    res.json({ success: true });
  });
  app.post('/api/voting/vote', requireRole(['STUDENT', 'CLASS_REPRESENTATIVE']), (req, res) => {
    res.json(store.castVote(req.body, viewer(req)));
  });
  app.post('/api/voting/polls', requireRole(['CLASS_REPRESENTATIVE', ...STAFF_ROLES]), (req, res) => {
    res.status(201).json({ success: true, poll: store.createPoll(req.body, viewer(req)) });
  });
  app.post('/api/timetable/sessions', teaching, (req, res) => {
    res.status(201).json({ success: true, session: store.addSession(req.body, viewer(req)) });
  });
  app.post('/api/timetable/sessions/:id/lock', coord, (req, res) => {
    res.json({ success: true, session: store.toggleSessionLock(String(req.params.id), req.body?.reason, who(req)) });
  });
  app.post('/api/academic/faculty-protected-slot', teaching, (req, res) => {
    res.json({ success: true, faculty: store.toggleProtectedSlot(req.body, viewer(req)) });
  });
  app.post('/api/academic/constraints/:id/toggle', coord, (req, res) => {
    res.json({ success: true, constraint: store.toggleConstraint(String(req.params.id), who(req)) });
  });
  app.post('/api/notifications', requireRole(['CLASS_REPRESENTATIVE', ...TEACHING]), (req, res) => {
    if (rateLimit(`notify:${req.user!.id}`, 10, 60_000)) return res.status(429).json({ success: false, message: 'Too many requests; wait a minute.' });
    store.postNotification(req.body, viewer(req));
    res.status(201).json({ success: true });
  });
  app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
    store.markNotificationRead(String(req.params.id), viewer(req));
    res.json({ success: true });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, message: 'Not found.' });
  });

  // ---------------------------------------------------------------------------
  // Frontend
  // ---------------------------------------------------------------------------
  const distDir = path.join(process.cwd(), 'dist');
  if (isProd) {
    app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else if (env.NODE_ENV !== 'test') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, message: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Malformed JSON body.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request body is too large.' });
    console.error(`[error] ${req.method} ${req.path}:`, err);
    res.status(500).json({ success: false, message: 'Something went wrong on the server.' });
  });

  return { app, seedUsers: auth.seedUsers };
}

const benchmarkRuns = new Map<string, number>();
function rateLimitedBenchmark(req: Request) {
  const last = benchmarkRuns.get(req.user!.id) ?? 0;
  if (Date.now() - last < 10_000) return true;
  benchmarkRuns.set(req.user!.id, Date.now());
  return false;
}

async function main() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required in production (Supabase: Project Settings -> Database -> Connection string).');
  }
  if (isProd && config.demoMode) {
    console.warn('[startup] DEMO_MODE is on: anyone can sign in as the demo Coordinator/Admin and change data. Set DEMO_MODE=false before real use.');
  }
  const db = await connectDb(config.databaseUrl);
  await store.init(db, { seedDemoData: config.seedDemoData });
  const { app, seedUsers } = await createApp(db);
  await seedUsers();

  // Express 5 passes listen errors (e.g. port in use) to this callback instead of throwing.
  const server = app.listen(config.port, '0.0.0.0', (err?: Error) => {
    if (err) {
      console.error(`[startup] cannot listen on port ${config.port}: ${err.message}`);
      process.exit(1);
    }
    console.info(`[startup] IntelliSchedule listening on port ${config.port} (${isProd ? 'production' : 'development'})`);
  });
  const shutdown = (signal: string) => {
    console.info(`[shutdown] ${signal} received, closing.`);
    server.close(() => {
      store
        .persist()
        .catch(() => {})
        .finally(() => db.close().finally(() => process.exit(0)));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (!env.INTELLISCHEDULE_NO_LISTEN) {
  main().catch((err) => {
    console.error('[startup] failed:', err.message);
    process.exit(1);
  });
}
