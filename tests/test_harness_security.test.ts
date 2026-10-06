import test from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test('ALLOW_TEST_RESET_TOKEN test harness security and production isolation', async () => {
  const email = 'coordinator.demo@demo.thapar.local';

  // 1. Request forgot-password without test headers
  const resNoTest = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.strictEqual(resNoTest.status, 200);
  const dataNoTest = await resNoTest.json();
  assert.strictEqual(dataNoTest.resetToken, undefined, 'Reset token must not be leaked without test flag/header');

  // 2. Request forgot-password with test header in non-production
  const resWithTest = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true' },
    body: JSON.stringify({ email }),
  });
  assert.strictEqual(resWithTest.status, 200);
  const dataWithTest = await resWithTest.json();
  if (process.env.NODE_ENV !== 'production') {
    assert.ok(dataWithTest.resetToken, 'Reset token should be present in test mode');
  } else {
    assert.strictEqual(dataWithTest.resetToken, undefined, 'Reset token must never be returned in production');
  }
});
