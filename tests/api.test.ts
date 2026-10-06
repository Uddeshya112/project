// End-to-end API tests against a real (embedded) Postgres. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.NODE_ENV = 'test';
process.env.INTELLISCHEDULE_NO_LISTEN = '1';
process.env.BCRYPT_ROUNDS = '4';
process.env.DEMO_MODE = 'true';
process.env.SEED_DEMO_DATA = 'true';

const SAMPLE_PWD = process.env.SEED_USER_PASSWORD || 'ThaparInstitute@2026!';
let base = '';
let server: Server;
let db: import('../src/server/db').Db;

type Res = { status: number; body: any; headers: Headers };

/** Minimal cookie-keeping client, one per signed-in user. */
class Client {
  cookie = '';
  constructor(private origin?: string) {}
  async req(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Res> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (this.cookie) headers.cookie = this.cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET' && this.origin !== undefined) headers.origin = this.origin;
    const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const set = r.headers.get('set-cookie');
    if (set) {
      const m = /tt_session=([^;]*)/.exec(set);
      if (m) this.cookie = m[1] ? `tt_session=${m[1]}` : '';
    }
    const text = await r.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    return { status: r.status, body: parsed, headers: r.headers };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b: unknown = {}) => this.req('POST', p, b);
  put = (p: string, b: unknown) => this.req('PUT', p, b);
  patch = (p: string, b: unknown) => this.req('PATCH', p, b);
  del = (p: string) => this.req('DELETE', p);
}

async function login(email: string, password = SAMPLE_PWD) {
  const c = new Client();
  const r = await c.post('/api/auth/login', { email, password });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.body)}`);
  return c;
}
async function demo(roleKey: string) {
  const c = new Client();
  const r = await c.post('/api/auth/demo-login', { roleKey });
  assert.equal(r.status, 200, `demo ${roleKey}: ${JSON.stringify(r.body)}`);
  return c;
}

const scheduleKey = (s: any) =>
  `${s.courseId}|${s.sectionId}|${s.subSectionId ?? ''}|${s.facultyId}|${s.roomId}|${s.day}|${s.timeSlotId}`;

before(async () => {
  const { connectDb } = await import('../src/server/db');
  const { store } = await import('../src/server/store');
  const { createApp } = await import('../server');
  db = await connectDb('pglite:memory');
  await store.init(db, { seedDemoData: true });
  const { app, seedUsers } = await createApp(db);
  await seedUsers();
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.close();
  await db?.close();
});

test('health endpoints expose no internals', async () => {
  const c = new Client();
  assert.deepEqual((await c.get('/api/health/live')).body, { status: 'LIVE' });
  assert.deepEqual((await c.get('/api/health/ready')).body, { status: 'READY' });
});

test('everything except auth/health requires a session', async () => {
  const c = new Client();
  for (const p of ['/api/academic/bootstrap', '/api/me', '/api/students', '/api/audit', '/api/admin/users']) {
    assert.equal((await c.get(p)).status, 401, p);
  }
  assert.equal((await c.post('/api/academic/generate')).status, 401);
});

test('password login: wrong password, original sample password, cookie flags, logout', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/auth/login', { email: 'dean@thapar.edu', password: 'nope-Wrong1!' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'nobody@thapar.edu', password: SAMPLE_PWD })).status, 401);

  const r = await c.post('/api/auth/login', { email: 'DEAN@thapar.edu', password: SAMPLE_PWD });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.roleCode, 'COLLEGE_ADMIN');
  assert.equal(r.body.token, undefined, 'token must not be exposed to JavaScript');
  const cookie = r.headers.get('set-cookie') ?? '';
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);

  assert.equal((await c.get('/api/me')).body.user.email, 'dean@thapar.edu');
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/me')).status, 401);
});

test('all original demo and sample accounts can sign in', async () => {
  for (const e of ['kn.murthy@thapar.edu', 'a.sharma@thapar.edu', 'p.gupta@thapar.edu', 's.roy@thapar.edu', 'aarav.m@thapar.edu', 'rahul.v@thapar.edu']) await login(e);
  for (const e of ['coordinator', 'faculty', 'student', 'admin', 'hod']) await login(`${e}.demo@demo.thapar.local`, 'ThaparDemo@2026Test!');
  for (const r of ['Coordinator', 'Faculty', 'Student', 'Admin', 'HOD']) await demo(r);
});

test('sample staff accounts are linked to faculty records; responses are compressed', async () => {
  const c = await login('kn.murthy@thapar.edu');
  assert.equal((await c.get('/api/me')).body.roster.facultyId, 'fac-0003');
  const r = await fetch(base + '/api/academic/bootstrap', { headers: { cookie: c.cookie, 'accept-encoding': 'gzip' } });
  assert.equal(r.headers.get('content-encoding'), 'gzip');
});

test('login is rate limited per account', async () => {
  const c = new Client();
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await c.post('/api/auth/login', { email: 'p.gupta@thapar.edu', password: `bad-Pass${i}!` })).status;
  assert.equal(last, 429);
});

test('cross-site state-changing requests are rejected', async () => {
  const c = new Client('https://evil.example');
  const r = await c.post('/api/auth/login', { email: 'dean@thapar.edu', password: SAMPLE_PWD });
  assert.equal(r.status, 403);
});

test('security headers are set', async () => {
  const r = await new Client().get('/api/health/live');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('google sign-in is refused cleanly when not configured; removed fake endpoints are gone', async () => {
  const c = new Client();
  const r = await c.get('/api/auth/google/start');
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location') ?? '', /auth_error=/);
  assert.equal((await c.get('/api/auth/google/interactive-auth')).status, 404);
  assert.equal((await c.post('/api/test/reset-rate-limits')).status, 404);
  const f = await c.post('/api/auth/forgot-password', { email: 'dean@thapar.edu' });
  assert.equal(f.status, 200);
  assert.equal(f.body.resetToken, undefined);
});

test('students see only what they should', async () => {
  const s = await demo('Student');
  const b = (await s.get('/api/academic/bootstrap')).body;
  assert.equal(b.auditLogs.length, 0);
  assert.equal(b.students, undefined);
  assert.ok(b.sessions.length > 0, 'student sees the published timetable');
  assert.ok(b.roster.sectionId, 'student is linked to a section');
  assert.equal((await s.get('/api/students')).status, 403);
  assert.equal((await s.post('/api/academic/departments', { name: 'X', code: 'X' })).status, 403);
  assert.equal((await s.post('/api/recovery/cancel-class', { sessionId: b.sessions[0].id })).status, 403);
  assert.equal((await s.get('/api/admin/users')).status, 403);
});

test('academic CRUD validates input and protects references', async () => {
  const c = await demo('Coordinator');
  assert.equal((await c.post('/api/academic/departments', { name: 'Biotech' })).status, 400);
  const created = await c.post('/api/academic/departments', { name: 'Department of Biotechnology', code: 'dbt' });
  assert.equal(created.status, 201);
  assert.equal(created.body.department.code, 'DBT');
  assert.equal((await c.post('/api/academic/departments', { name: 'Again', code: 'DBT' })).status, 409);
  assert.equal((await c.del('/api/academic/departments/dept-cse')).status, 409, 'department with programs cannot be deleted');
  assert.equal((await c.put('/api/academic/rooms/room-cr-1', { capacity: 'abc' })).status, 400);
  assert.equal((await c.put('/api/academic/rooms/does-not-exist', { capacity: 10 })).status, 404);
  assert.equal((await c.put('/api/academic/rooms/room-cr-1', { capacity: 75 })).body.room.capacity, 75);
  assert.equal((await c.del('/api/academic/departments/dept-dbt')).status, 200);

  const b = (await c.get('/api/academic/bootstrap')).body;
  const sec = b.sections[0];
  const lab = await c.post('/api/academic/allocations', {
    courseId: b.courses[0].id, facultyId: b.facultyMembers[0].id, sectionId: sec.id, subSectionId: sec.subSections[0].id, sessionType: 'Lab', hoursPerWeek: 3,
  });
  assert.equal(lab.status, 400, 'odd lab hours are rejected');
  assert.equal((await c.post('/api/academic/allocations', { courseId: 'nope', facultyId: b.facultyMembers[0].id, sectionId: sec.id })).status, 400);
});

test('excel import validates everything before changing anything', async () => {
  const c = await demo('Coordinator');
  const before = (await c.get('/api/academic/bootstrap')).body;
  assert.equal((await c.post('/api/academic/import', { parsedData: {}, mode: 'replace' })).status, 400);
  const bad = await c.post('/api/academic/import', {
    mode: 'upsert',
    parsedData: { courses: [{ code: 'ZZ999', name: 'Ghost', departmentCode: 'NOPE' }] },
  });
  assert.equal(bad.status, 422);
  assert.match(bad.body.message, /Courses row 2/);
  const after = (await c.get('/api/academic/bootstrap')).body;
  assert.equal(after.courses.length, before.courses.length, 'nothing changed');
});

test('generate -> select -> publish workflow with role checks', async () => {
  const coord = await demo('Coordinator');
  const gen = await coord.post('/api/academic/generate', { budgetMode: 'FAST' });
  assert.equal(gen.status, 200, JSON.stringify(gen.body).slice(0, 300));
  assert.equal(gen.body.success, true);
  const routine = gen.body.routines[1];
  assert.ok(routine.versionNumber > 1);
  assert.equal(routine.validation.hardViolations, 0);
  const draft = (await coord.get('/api/academic/bootstrap')).body;
  assert.equal(draft.activeVersionNumber, gen.body.routines[0].versionNumber, 'first routine is the working draft');
  assert.deepEqual(draft.sessions.map(scheduleKey).sort(), gen.body.routines[0].sessions.map(scheduleKey).sort());

  assert.equal((await coord.post('/api/timetable/select-routine', { versionNumber: routine.versionNumber })).status, 200);
  assert.equal((await coord.post('/api/timetable/publish')).status, 403, 'coordinators cannot publish');

  const admin = await demo('Admin');
  const pub = await admin.post('/api/timetable/publish');
  assert.equal(pub.status, 200);
  const state = (await admin.get('/api/academic/bootstrap')).body;
  assert.equal(state.publishStatus, 'Published');
  assert.equal(state.publishedVersionNumber, routine.versionNumber);

  const student = await demo('Student');
  const sb = (await student.get('/api/academic/bootstrap')).body;
  assert.deepEqual(sb.sessions.map(scheduleKey).sort(), routine.sessions.map(scheduleKey).sort());
});

test('manual edits are validated on the server', async () => {
  const c = await demo('Coordinator');
  const b = (await c.get('/api/academic/bootstrap')).body;
  const [a, other] = b.sessions;
  // Move a class into a slot where its faculty already teaches.
  const clash = b.sessions.find((s: any) => s.facultyId === a.facultyId && (s.day !== a.day || s.timeSlotId !== a.timeSlotId));
  if (clash) {
    const r = await c.post('/api/timetable/move', { sessionId: a.id, targetDay: clash.day, targetTimeSlotId: clash.timeSlotId, targetRoomId: a.roomId });
    assert.equal(r.status, 422);
  }
  assert.equal((await c.post('/api/timetable/swap', { sessionAId: a.id, sessionBId: a.id })).status, 400);
  const lock = await c.post(`/api/timetable/sessions/${other.id}/lock`, { reason: 'Pinned lab' });
  assert.equal(lock.status, 200);
  assert.equal(lock.body.session.isLocked, true);
});

test('faculty can only cancel their own classes; make-up flow cannot double-book', async () => {
  const fac = await demo('Faculty');
  const me = (await fac.get('/api/me')).body.roster;
  assert.ok(me.facultyId);
  const b = (await fac.get('/api/academic/bootstrap')).body;
  const mine = b.sessions.find((s: any) => s.facultyId === me.facultyId && s.status !== 'Cancelled');
  assert.ok(mine, 'faculty sees at least one of their own published classes');

  const coord = await demo('Coordinator');
  const all = (await coord.get('/api/academic/bootstrap')).body.sessions;
  const notMine = all.find((s: any) => s.facultyId !== me.facultyId && s.status !== 'Cancelled');
  assert.ok(notMine, 'staff can identify another faculty member\'s class for authorization testing');
  assert.equal((await fac.post('/api/recovery/cancel-class', { sessionId: notMine.id, reason: 'x' })).status, 403);

  const cancel = await fac.post('/api/recovery/cancel-class', { sessionId: mine.id, reason: 'Conference' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal((await fac.post('/api/recovery/cancel-class', { sessionId: mine.id })).status, 409);
  const opps = cancel.body.opportunities;
  assert.ok(opps.length > 0, 'make-up options are proposed');
  assert.ok(opps.every((o: any) => !(o.targetDay === mine.day && o.timeSlotId === mine.timeSlotId)), 'never re-proposes the cancelled slot');
  assert.equal((await fac.post('/api/recovery/schedule-makeup', { opportunityId: opps[0].id })).status, 200);
  assert.equal((await fac.post('/api/recovery/schedule-makeup', { opportunityId: opps[0].id })).status, 409);
});

test('polls: one vote per student, options validated', async () => {
  const coord = await demo('Coordinator');
  const student = await demo('Student');
  const sectionId = (await student.get('/api/me')).body.roster.sectionId;
  const poll = await coord.post('/api/voting/polls', { sectionId, question: 'Make-up time?', options: [{ day: 'Monday', timeSlotLabel: '16:00' }, { day: 'Tuesday', timeSlotLabel: '16:00' }] });
  assert.equal(poll.status, 201);
  const id = poll.body.poll.id;
  assert.equal((await student.post('/api/voting/vote', { pollId: id, optionId: 'opt-9' })).status, 400);
  assert.equal((await student.post('/api/voting/vote', { pollId: id, optionId: 'opt-1' })).status, 200);
  assert.equal((await student.post('/api/voting/vote', { pollId: id, optionId: 'opt-2' })).status, 409);
  const mine = (await student.get('/api/academic/bootstrap')).body.polls.find((p: any) => p.id === id);
  assert.equal(mine.userVotedOptionId, 'opt-1');
});

test('notification read state is per user', async () => {
  const coord = await demo('Coordinator');
  const admin = await demo('Admin');
  const n = (await coord.get('/api/academic/bootstrap')).body.notifications[0];
  assert.equal((await coord.post(`/api/notifications/${n.id}/read`)).status, 200);
  assert.equal((await coord.get('/api/academic/bootstrap')).body.notifications.find((x: any) => x.id === n.id).read, true);
  assert.equal((await admin.get('/api/academic/bootstrap')).body.notifications.find((x: any) => x.id === n.id).read, false);
});

test('admin user management revokes sessions on privilege changes', async () => {
  const admin = await login('dean@thapar.edu');
  const created = await admin.post('/api/admin/users', { email: 'new.prof@thapar.edu', name: 'New Prof', roleCode: 'FACULTY', password: 'Str0ng!Passw0rd' });
  assert.equal(created.status, 201);
  assert.equal((await admin.post('/api/admin/users', { email: 'new.prof@thapar.edu', name: 'Dup', roleCode: 'FACULTY' })).status, 409);
  assert.equal((await admin.post('/api/admin/users', { email: 'weak@thapar.edu', name: 'Weak', roleCode: 'FACULTY', password: 'short' })).status, 400);

  const prof = await login('new.prof@thapar.edu', 'Str0ng!Passw0rd');
  const id = created.body.user.id;
  assert.equal((await admin.patch(`/api/admin/users/${id}`, { roleCode: 'COORDINATOR' })).status, 200);
  assert.equal((await prof.get('/api/me')).status, 401, 'role change signs the user out');

  assert.equal((await admin.patch(`/api/admin/users/${id}`, { status: 'LOCKED' })).status, 200);
  assert.equal((await new Client().post('/api/auth/login', { email: 'new.prof@thapar.edu', password: 'Str0ng!Passw0rd' })).status, 403);

  const self = (await admin.get('/api/me')).body.user.id;
  assert.equal((await admin.patch(`/api/admin/users/${self}`, { roleCode: 'STUDENT' })).status, 400);
  assert.equal((await admin.del(`/api/admin/users/${self}`)).status, 400);
  assert.equal((await admin.del(`/api/admin/users/${id}`)).status, 200);
});

test('users can update their profile and change their password', async () => {
  const c = await login('a.sharma@thapar.edu');
  const p = await c.patch('/api/auth/profile', { profile: { phone: '+91 1234', rollNumber: 'hack' } });
  assert.equal(p.status, 200);
  assert.equal(p.body.user.profile.phone, '+91 1234');
  assert.notEqual(p.body.user.profile.rollNumber, 'hack', 'users cannot edit identity fields');

  assert.equal((await c.post('/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'N3w!Password123' })).status, 400);
  assert.equal((await c.post('/api/auth/change-password', { currentPassword: SAMPLE_PWD, newPassword: 'N3w!Password123' })).status, 200);
  await login('a.sharma@thapar.edu', 'N3w!Password123');
});

test('everything survives a server restart (state is in Postgres)', async () => {
  const c = await demo('Coordinator');
  await c.post('/api/academic/rooms', { name: 'Restart Hall', capacity: 99 });
  const live = (await c.get('/api/academic/bootstrap')).body;

  const { TimetableStore } = await import('../src/server/store');
  const fresh = new TimetableStore();
  await fresh.init(db, { seedDemoData: true });
  const viewer = { id: 'x', name: 'x', email: 'x@x', roleCode: 'COORDINATOR' as const, isDemo: false, profile: {} };
  const reloaded = fresh.getBootstrapState(viewer);
  assert.equal(reloaded.rooms.length, live.rooms.length);
  assert.ok(reloaded.rooms.some((r) => r.name === 'Restart Hall'));
  assert.equal(reloaded.versions.length, live.versions.length);
  assert.equal(reloaded.publishedSessions.length, live.publishedSessions.length);
  assert.equal(reloaded.publishedVersionNumber, live.publishedVersionNumber);
  const audit = await db.query(`select count(*)::int as n from intellischedule.audit_log`);
  assert.ok(audit[0].n > 5, 'audit trail is persisted');
});

test('concurrent writers cannot silently overwrite each other', async () => {
  const { TimetableStore } = await import('../src/server/store');
  const other = new TimetableStore();
  await other.init(db, { seedDemoData: true });
  const c = await demo('Coordinator');
  await c.post('/api/academic/rooms', { name: 'Writer One', capacity: 10 }); // bumps the stored version
  other.createRoom({ name: 'Writer Two', capacity: 10 }, 'test');
  await assert.rejects(other.persist(), /changed by another server instance/);
});
