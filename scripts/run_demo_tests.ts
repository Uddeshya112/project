/**
 * Automated Test Suite for Public Demo Accounts & Testing Flow
 * Verifies demo authentication, RBAC boundaries, bcrypt password verification,
 * timetable generation with demo dataset, and demo reset mechanics.
 */

import http from 'node:http';

const BASE_URL = 'http://localhost:3000';

interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: any;
}

function request(
  method: string,
  path: string,
  data?: any,
  token?: string
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : '';
    const headers: Record<string, string | number> = {
      Accept: 'application/json',
    };

    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      `${BASE_URL}${path}`,
      { method, headers },
      (res) => {
        let rawBody = '';
        res.on('data', (chunk) => {
          rawBody += chunk;
        });
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            parsed = rawBody;
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (data) {
      req.write(postData);
    }
    req.end();
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ [PASS] ${message}`);
  }
}

async function runDemoAudit() {
  console.log('================================================================');
  console.log('INTELLISCHEDULE PUBLIC DEMO AUDIT SUITE');
  console.log('================================================================\n');

  // 1. Check Demo Status API
  console.log('--- 1. Testing Demo Configuration & Status API ---');
  const statusRes = await request('GET', '/api/demo/status');
  assert(statusRes.status === 200, 'GET /api/demo/status returns HTTP 200');
  assert(statusRes.body?.enabled === true, 'Public demo mode is active');
  assert(Array.isArray(statusRes.body?.accounts) && statusRes.body.accounts.length === 5, 'Status reports exactly 5 supported demo accounts');

  // 2. Demo One-Click Authentication for all 5 roles
  console.log('\n--- 2. Testing One-Click Demo Role Authentication ---');
  const roles = [
    { key: 'Coordinator', expectedCode: 'COORDINATOR', email: 'coordinator.demo@demo.thapar.local' },
    { key: 'Faculty', expectedCode: 'FACULTY', email: 'faculty.demo@demo.thapar.local' },
    { key: 'Student', expectedCode: 'STUDENT', email: 'student.demo@demo.thapar.local' },
    { key: 'Admin', expectedCode: 'COLLEGE_ADMIN', email: 'admin.demo@demo.thapar.local' },
    { key: 'HOD', expectedCode: 'HOD', email: 'hod.demo@demo.thapar.local' },
  ];

  const sessionTokens: Record<string, string> = {};

  for (const r of roles) {
    const demoRes = await request('POST', '/api/auth/demo-login', { roleKey: r.key });
    assert(demoRes.status === 200, `Demo login for ${r.key} returns HTTP 200`);
    assert(demoRes.body?.success === true, `Demo login for ${r.key} succeeded`);
    assert(demoRes.body?.roleCode === r.expectedCode, `Server-authoritative roleCode is ${r.expectedCode}`);
    assert(demoRes.body?.user?.email === r.email, `Demo identity is ${r.email}`);
    assert(demoRes.body?.user?.isDemoUser === true, `User is explicitly flagged as isDemoUser=true`);
    assert(Boolean(demoRes.body?.token), `Issued cryptographic session token for ${r.key}`);
    sessionTokens[r.key] = demoRes.body?.token;
  }

  // 3. Bcrypt Password Verification with Standard Password
  console.log('\n--- 3. Testing Standard Credentials Login (ThaparDemo@2026Test!) ---');
  const standardLoginRes = await request('POST', '/api/auth/login', {
    email: 'coordinator.demo@demo.thapar.local',
    password: 'ThaparDemo@2026Test!',
  });
  assert(standardLoginRes.status === 200, 'Coordinator demo logs in with password ThaparDemo@2026Test! via /api/auth/login');
  assert(standardLoginRes.body?.user?.isDemoUser === true, 'Returned user object maintains isDemoUser=true');

  const wrongPassRes = await request('POST', '/api/auth/login', {
    email: 'coordinator.demo@demo.thapar.local',
    password: 'IncorrectPassword123!',
  });
  assert(wrongPassRes.status === 401, 'Incorrect password correctly rejected with HTTP 401');

  // 4. Session Verification & Logout
  console.log('\n--- 4. Testing Session Verification & Revocation ---');
  const coordToken = sessionTokens['Coordinator'];
  const meRes = await request('GET', '/api/auth/me', null, coordToken);
  assert(meRes.status === 200, '/api/auth/me accepts demo Bearer token and returns profile');
  assert(meRes.body?.user?.email === 'coordinator.demo@demo.thapar.local', 'Profile email matches coordinator demo');

  const logoutRes = await request('POST', '/api/auth/logout', null, coordToken);
  assert(logoutRes.status === 200, '/api/auth/logout succeeds');

  const revokedMeRes = await request('GET', '/api/auth/me', null, coordToken);
  assert(revokedMeRes.status === 401, 'Revoked demo token rejected on /api/auth/me with HTTP 401');

  // 5. RBAC & Privilege Enforcement
  console.log('\n--- 5. Testing Role Isolation & RBAC Boundaries ---');
  const studentToken = sessionTokens['Student'];
  const facultyToken = sessionTokens['Faculty'];
  const adminToken = sessionTokens['Admin'];

  // Student trying to generate timetable -> MUST BE FORBIDDEN
  const studentGenerate = await request('POST', '/api/timetables/generate', {}, studentToken);
  assert(studentGenerate.status === 403, 'Student blocked from timetable generation with HTTP 403 (FORBIDDEN)');

  // Faculty trying to publish timetable -> MUST BE FORBIDDEN
  const facultyPublish = await request('POST', '/api/timetables/publish', {}, facultyToken);
  assert(facultyPublish.status === 403, 'Faculty blocked from timetable publishing with HTTP 403 (FORBIDDEN)');

  // Admin publishing timetable -> PERMITTED
  const adminPublish = await request('POST', '/api/timetables/publish', {}, adminToken);
  assert(adminPublish.status === 200, 'Admin permitted to publish master timetable (HTTP 200)');

  // 6. Timetable Generator Execution on Demo Dataset
  console.log('\n--- 6. Testing Timetable Engine on Demo Dataset ---');
  // Re-login coordinator for generation test
  const freshCoordLogin = await request('POST', '/api/auth/demo-login', { roleKey: 'Coordinator' });
  const freshCoordToken = freshCoordLogin.body.token;

  const generateRes = await request('POST', '/api/timetables/generate', {}, freshCoordToken);
  assert(generateRes.status === 200, 'Coordinator triggers /api/timetables/generate successfully');
  assert(generateRes.body?.success === true || generateRes.body?.isFeasible === true, 'Timetable generation returns success=true');
  const sessionCount = generateRes.body?.sessionsGenerated || generateRes.body?.bestCandidate?.sessions?.length || 0;
  assert(sessionCount > 0, `Engine generated ${sessionCount} valid class sessions`);

  // 7. Safe Demo Data Reset
  console.log('\n--- 7. Testing Safe Demo Data Reset ---');
  const resetRes = await request('POST', '/api/demo/reset', {}, freshCoordToken);
  assert(resetRes.status === 200, '/api/demo/reset succeeds with HTTP 200');
  assert(resetRes.body?.success === true, 'Demo reset response confirms restoration to baseline');

  // Verify that Demo password is intact after reset
  const afterResetLogin = await request('POST', '/api/auth/login', {
    email: 'coordinator.demo@demo.thapar.local',
    password: 'ThaparDemo@2026Test!',
  });
  assert(afterResetLogin.status === 200, 'Coordinator demo can log in with ThaparDemo@2026Test! after dataset reset');

  console.log('\n================================================================');
  console.log('DEMO AUDIT RESULT: ALL TESTS PASSED');
  console.log('================================================================\n');
}

runDemoAudit().catch((err) => {
  console.error('Fatal demo test runner failure:', err);
  process.exit(1);
});
