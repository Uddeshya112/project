import test from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test('Typed one-time tokens cross-use and lifecycle enforcement', async () => {
  const email = `token.test.${Date.now()}@thapar.edu`;
  const password = 'Password123!';

  // 1. Register unverified user -> receives verification token
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
  const verifyToken = regData.verificationToken;
  assert.ok(verifyToken, 'Verification token expected in test mode');

  // 2. Try using verification token at /api/auth/reset-password -> MUST fail with 400
  const resetWithVerifyTokenRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({
      token: verifyToken,
      newPassword: 'NewPassword123!',
    }),
  });
  assert.strictEqual(resetWithVerifyTokenRes.status, 400);

  // 3. Verify email with valid token
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({ token: verifyToken }),
  });
  assert.strictEqual(verifyRes.status, 200);

  // 4. Try reusing verification token -> MUST fail with 400
  const reuseVerifyRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({ token: verifyToken }),
  });
  assert.strictEqual(reuseVerifyRes.status, 400);

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

  // 6. Try using reset token at /api/auth/verify-email -> MUST fail with 400
  const verifyWithResetTokenRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({ token: resetToken }),
  });
  assert.strictEqual(verifyWithResetTokenRes.status, 400);
});
