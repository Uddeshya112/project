import test from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test('Pre-registration account takeover prevention', async () => {
  const victimEmail = `victim.${Date.now()}@thapar.edu`;
  const attackerPwd = 'AttackerPassword123!';
  const victimPwd = 'VictimPassword123!';

  // 1. Attacker registers victim's address with attackerPwd
  const reg1Res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({
      email: victimEmail,
      password: attackerPwd,
      name: 'Attacker Attempt',
      roleCode: 'STUDENT',
      department: 'CSED',
    }),
  });
  assert.strictEqual(reg1Res.status, 201);

  // 2. Victim registers victim's address with victimPwd (overwrites pending)
  const reg2Res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({
      email: victimEmail,
      password: victimPwd,
      name: 'Real Victim',
      roleCode: 'STUDENT',
      department: 'CSED',
    }),
  });
  assert.strictEqual(reg2Res.status, 201);
  const reg2Data = await reg2Res.json();
  const victimToken = reg2Data.verificationToken;
  assert.ok(victimToken, 'Verification token for victim registration expected');

  // 3. Attacker tries to log in before verification -> 401
  const loginAttackerUnverified = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: victimEmail, password: attackerPwd }),
  });
  assert.strictEqual(loginAttackerUnverified.status, 401);

  // 4. Victim verifies using victimToken
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: victimToken }),
  });
  assert.strictEqual(verifyRes.status, 200);

  // 5. Attacker tries to log in with attackerPwd -> MUST fail (401)
  const loginAttackerRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: victimEmail, password: attackerPwd }),
  });
  assert.strictEqual(loginAttackerRes.status, 401);

  // 6. Victim logs in with victimPwd -> MUST succeed (200)
  const loginVictimRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: victimEmail, password: victimPwd }),
  });
  assert.strictEqual(loginVictimRes.status, 200);
});
