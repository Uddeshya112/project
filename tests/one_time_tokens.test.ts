import test from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test('Registration signs in without email verification; password-reset tokens remain purpose-bound', async () => {
  const email = `token.test.${Date.now()}@thapar.edu`;
  const password = 'Password123!';

  // 1. Registration creates an active account and never returns a verification token.
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({
      email,
      password,
      name: 'Token Test User',
      roleCode: 'STUDENT',
      department: 'CSED',
    }),
  });
  assert.strictEqual(regRes.status, 201);
  const regData = await regRes.json();
  assert.strictEqual(regData.user?.emailVerified, true);
  assert.strictEqual(regData.verificationToken, undefined);

  // 2. The just-created credentials can sign in immediately.
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.strictEqual(loginRes.status, 200);

  // 3. No email-verification token was issued, so the legacy endpoint rejects an empty token.
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({ token: '' }),
  });
  assert.strictEqual(verifyRes.status, 400);

  // 5. Request password reset -> receives reset token
  const forgotRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({ email }),
  });
  assert.strictEqual(forgotRes.status, 200);
  const forgotData = await forgotRes.json();
  const resetToken = forgotData.resetToken;
  assert.ok(resetToken, 'Reset token expected in test mode');

  // 5. Try using a reset token at /api/auth/verify-email -> MUST fail with 400
  const verifyWithResetTokenRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({ token: resetToken }),
  });
  assert.strictEqual(verifyWithResetTokenRes.status, 400);
});
