import test from 'node:test';
import assert from 'node:assert';
import { persistentStore } from '../src/server/persistentStore';

test('Persistent store token, session, and rate-limit persistence and TTL', async () => {
  const testEmail = `persistent.${Date.now()}@thapar.edu`;

  // 1. Issue token and create session
  const { rawToken, record } = persistentStore.issueOneTimeToken(testEmail, 'email_verification', 10000);
  assert.strictEqual(record.email, testEmail);

  const rawSessionToken = 'test_sess_' + Date.now();
  const session = persistentStore.createSession(rawSessionToken, 'user_123', 'STUDENT', 10000);
  assert.strictEqual(session.userId, 'user_123');

  // 2. Validate retrieval
  const validated = persistentStore.validateOneTimeToken(rawToken, 'email_verification');
  assert.ok(validated, 'Token should be valid');

  const fetchedSess = persistentStore.getSession(rawSessionToken);
  assert.ok(fetchedSess, 'Session should be valid');

  // 3. Test TTL cleanup with expired item
  persistentStore.issueOneTimeToken(testEmail, 'password_reset', -1000); // already expired
  persistentStore.createSession('expired_sess', 'user_123', 'STUDENT', -1000); // already expired

  persistentStore.cleanupExpiredRecords();

  const expiredTokenValid = persistentStore.validateOneTimeToken('expired_sess', 'password_reset');
  assert.strictEqual(expiredTokenValid, null);

  const expiredSessValid = persistentStore.getSession('expired_sess');
  assert.strictEqual(expiredSessValid, null);
});
