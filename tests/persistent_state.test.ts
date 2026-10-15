import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { persistentStore, PersistentStore, FileBackend } from '../src/server/persistentStore';

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

test('FileBackend enforces safe file mode 0o600 and dir mode 0o700 with atomic writes', async () => {
  const testDir = path.join(process.cwd(), 'data', 'test_mode_' + Date.now());
  const testFile = path.join(testDir, 'test_state.json');

  try {
    const fileBackend = new FileBackend(testDir, testFile);
    fileBackend.scheduleSave({ oneTimeTokens: [], sessions: [] });
    fileBackend.flushSync();

    assert.ok(fs.existsSync(testFile), 'State file should exist after flush');

    const fileStat = fs.statSync(testFile);
    const dirStat = fs.statSync(testDir);

    // Mode mask checking: 0o600 for file (read/write by owner only), 0o700 for directory
    const filePerms = fileStat.mode & 0o777;
    const dirPerms = dirStat.mode & 0o777;

    assert.strictEqual(filePerms, 0o600, 'File mode must be 0o600');
    assert.strictEqual(dirPerms, 0o700, 'Dir mode must be 0o700');
  } finally {
    try {
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    } catch {}
  }
});

test('PersistentStore in production refuses to boot without Postgres configured', () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedDbUrl = process.env.DATABASE_URL;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;

    assert.throws(
      () => {
        new PersistentStore();
      },
      /Postgres is required in production/
    );
  } finally {
    process.env.NODE_ENV = savedNodeEnv;
    if (savedDbUrl) process.env.DATABASE_URL = savedDbUrl;
  }
});
