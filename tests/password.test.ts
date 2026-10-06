import test from 'node:test';
import assert from 'node:assert';
import {
  hashPasswordBcrypt,
  hashPasswordScrypt,
  hashPasswordLegacy,
  verifyPassword,
  BCRYPT_SALT_ROUNDS
} from '../src/lib/passwordUtils';
import bcrypt from 'bcryptjs';

test('Password hashing and verification with bcrypt', async () => {
  const pwd = 'StrongPassword123!';
  const hash = await hashPasswordBcrypt(pwd);
  
  const resValid = await verifyPassword(pwd, hash);
  assert.strictEqual(resValid.isValid, true);
  assert.strictEqual(resValid.needsRehash, false);

  const resWrong = await verifyPassword('WrongPassword123!', hash);
  assert.strictEqual(resWrong.isValid, false);
});

test('Password verification with old bcrypt cost (needs rehash)', async () => {
  const pwd = 'StrongPassword123!';
  const oldHash = await bcrypt.hash(pwd, 10); // cost 10 < 12
  const res = await verifyPassword(pwd, oldHash);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.needsRehash, true);
});

test('Password hashing and verification with scrypt', async () => {
  const pwd = 'StrongPassword123!';
  const hash = await hashPasswordScrypt(pwd);

  const resValid = await verifyPassword(pwd, hash);
  assert.strictEqual(resValid.isValid, true);
  assert.strictEqual(resValid.needsRehash, true); // scrypt always needs rehash to bcrypt

  const resWrong = await verifyPassword('WrongPassword123!', hash);
  assert.strictEqual(resWrong.isValid, false);
});

test('Password hashing and verification with legacy SHA-256', async () => {
  const pwd = 'StrongPassword123!';
  const hash = await hashPasswordLegacy(pwd);

  const resValid = await verifyPassword(pwd, hash);
  assert.strictEqual(resValid.isValid, true);
  assert.strictEqual(resValid.needsRehash, true);

  const resWrong = await verifyPassword('WrongPassword123!', hash);
  assert.strictEqual(resWrong.isValid, false);
});
