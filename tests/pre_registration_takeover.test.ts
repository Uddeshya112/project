import test from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test('Duplicate registration cannot replace a created account password', async () => {
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

  // 2. A second registration must not replace the first account's credentials.
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
  assert.strictEqual(reg2Data.verificationToken, undefined);

  // 3. First account is active immediately.
  const loginAttacker = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: victimEmail, password: attackerPwd }),
  });
  assert.strictEqual(loginAttacker.status, 200);

  // 4. The second password cannot replace the first one.
  const loginSecondRegistration = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: victimEmail, password: victimPwd }),
  });
  assert.strictEqual(loginSecondRegistration.status, 401);
});
