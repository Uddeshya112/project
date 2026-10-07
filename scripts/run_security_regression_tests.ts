const BASE_URL = 'http://localhost:3000';

async function loginCookie(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: HTTP ${res.status}`);
  const raw = res.headers.get('set-cookie') ?? '';
  const match = /tt_session=([^;]+)/.exec(raw);
  if (!match) throw new Error(`No session cookie returned for ${email}`);
  return `tt_session=${match[1]}`;
}

const headers = (cookie: string) => ({ Cookie: cookie });

async function expectStatus(name: string, actual: Response, expected: number) {
  const ok = actual.status === expected;
  console.log(`${ok ? '✓' : '✗'} ${name} -> HTTP ${actual.status}`);
  if (!ok) throw new Error(`${name}: expected HTTP ${expected}, received HTTP ${actual.status}`);
}

async function main() {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password) throw new Error('SEED_USER_PASSWORD is required.');

  const student = await loginCookie('aarav.m@thapar.edu', password);
  const faculty = await loginCookie('a.sharma@thapar.edu', password);
  const coordinator = await loginCookie('kn.murthy@thapar.edu', password);
  const admin = await loginCookie('dean@thapar.edu', password);

  await expectStatus('Anonymous generation', await fetch(`${BASE_URL}/api/timetable/generate`, { method: 'POST' }), 401);
  await expectStatus('Anonymous publish', await fetch(`${BASE_URL}/api/timetable/publish`, { method: 'POST' }), 401);

  await expectStatus('Student generation', await fetch(`${BASE_URL}/api/timetable/generate`, { method: 'POST', headers: headers(student) }), 403);
  await expectStatus('Faculty publish', await fetch(`${BASE_URL}/api/timetable/publish`, { method: 'POST', headers: { ...headers(faculty), 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: 1 }) }), 403);
  await expectStatus('Coordinator publish', await fetch(`${BASE_URL}/api/timetable/publish`, { method: 'POST', headers: { ...headers(coordinator), 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: 1 }) }), 403);

  const studentBootstrap = await fetch(`${BASE_URL}/api/academic/bootstrap`, { headers: headers(student) });
  const studentData = await studentBootstrap.json();
  if (studentBootstrap.status !== 200 || !studentData.roster?.sectionId || (studentData.sections?.length ?? 0) > 1) {
    throw new Error('Student bootstrap is not correctly section-scoped.');
  }
  console.log('✓ Student bootstrap is section-scoped');

  const facultyBootstrap = await fetch(`${BASE_URL}/api/academic/bootstrap`, { headers: headers(faculty) });
  const facultyData = await facultyBootstrap.json();
  if (facultyBootstrap.status !== 200 || (facultyData.sessions ?? []).some((s: any) => facultyData.roster?.facultyId && s.facultyId !== facultyData.roster.facultyId)) {
    throw new Error('Faculty bootstrap contains sessions outside the signed-in faculty record.');
  }
  console.log('✓ Faculty bootstrap is faculty-scoped');

  const adminUsers = await fetch(`${BASE_URL}/api/admin/users`, { headers: headers(admin) });
  await expectStatus('Admin user management for admins', adminUsers, 200);
  const studentAdmin = await fetch(`${BASE_URL}/api/admin/users`, { headers: headers(student) });
  await expectStatus('Admin user management for students', studentAdmin, 403);

  const email = `security-${Date.now()}@thapar.edu`;
  const registration = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Security Regression User', email, password: 'Strong!Password2026', roleCode: 'COLLEGE_ADMIN' }),
  });
  const registrationData = await registration.json();
  if (registration.status !== 201 || registrationData.user?.roleCode !== 'STUDENT' || registrationData.token) {
    throw new Error('Registration contract or role isolation is broken.');
  }
  console.log('✓ Registration creates a student account without auto-login');

  const registeredStudent = await loginCookie(email, 'Strong!Password2026');
  await expectStatus('Registered student publish', await fetch(`${BASE_URL}/api/timetable/publish`, { method: 'POST', headers: { ...headers(registeredStudent), 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: 1 }) }), 403);

  const gmail = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'External', email: `security-${Date.now()}@gmail.com`, password: 'Strong!Password2026' }),
  });
  const gmailData = await gmail.json();
  if (gmail.status !== 400 || gmailData.error !== 'INVALID_EMAIL_DOMAIN') throw new Error('Institutional email restriction is broken.');
  console.log('✓ Registration rejects non-institutional domains');

  const reset = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'invalid', newPassword: 'Strong!Password2026' }),
  });
  await expectStatus('Invalid password reset', reset, 400);

  const benchmark = await fetch(`${BASE_URL}/api/timetable/benchmark`, { headers: headers(admin) });
  const benchmarkData = await benchmark.json();
  if (benchmark.status !== 200 || typeof benchmarkData.fastMode?.candidatesEvaluated !== 'number' || typeof benchmarkData.optimizationMode?.candidatesEvaluated !== 'number') {
    throw new Error('Solver benchmark did not return calculated metrics.');
  }
  console.log('✓ Solver benchmark returns calculated metrics');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});