import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export const BCRYPT_SALT_ROUNDS = 12;

// Password policy shared by the login page and the server. Hashing lives server-side (src/server/auth.ts).

export interface PasswordPolicyCheck {
  isValid: boolean;
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
  score: number;
  strength: 'weak' | 'fair' | 'strong';
  errors: string[];
}

/** 12+ characters with upper, lower, digit and symbol. */
export function evaluatePasswordPolicy(pwd: string): PasswordPolicyCheck {
  const password = typeof pwd === 'string' ? pwd : '';
  const length = password.length >= 12;
  const uppercase = /[A-Z]/.test(password);
  const lowercase = /[a-z]/.test(password);
  const number = /[0-9]/.test(password);
  const special = /[^A-Za-z0-9]/.test(password);

  const errors: string[] = [];
  if (!length) errors.push('At least 12 characters');
  if (!uppercase) errors.push('At least one uppercase letter (A-Z)');
  if (!lowercase) errors.push('At least one lowercase letter (a-z)');
  if (!number) errors.push('At least one number (0-9)');
  if (!special) errors.push('At least one special character (!@#$%^&* etc.)');

  const score = [length, uppercase, lowercase, number, special].filter(Boolean).length;
  return {
    isValid: score === 5,
    length,
    uppercase,
    lowercase,
    number,
    special,
    score,
    strength: score === 5 ? 'strong' : score >= 3 ? 'fair' : 'weak',
    errors,
  };
}

export async function hashPasswordBcrypt(pwd: string): Promise<string> {
  return bcrypt.hash(pwd, BCRYPT_SALT_ROUNDS);
}

export function hashPasswordBcryptSync(pwd: string): string {
  return bcrypt.hashSync(pwd, BCRYPT_SALT_ROUNDS);
}

export async function hashPasswordScrypt(pwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(pwd, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`scrypt:${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export async function hashPasswordLegacy(pwd: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + pwd).digest('hex');
  return `sha256:${salt}:${hash}`;
}

export async function verifyPassword(
  pwd: string,
  hash: string
): Promise<{ isValid: boolean; needsRehash: boolean }> {
  if (!hash || typeof hash !== 'string') {
    return { isValid: false, needsRehash: false };
  }

  // 1. Bcrypt verification
  if (hash.startsWith('$2')) {
    const isValid = await bcrypt.compare(pwd, hash);
    if (!isValid) return { isValid: false, needsRehash: false };
    const match = hash.match(/^\$2[aby]?\$(\d+)\$/);
    const cost = match ? parseInt(match[1], 10) : BCRYPT_SALT_ROUNDS;
    const needsRehash = cost < BCRYPT_SALT_ROUNDS;
    return { isValid: true, needsRehash };
  }

  // 2. Scrypt verification
  if (hash.startsWith('scrypt:')) {
    const parts = hash.split(':');
    if (parts.length === 3) {
      const [, salt, expectedHex] = parts;
      return new Promise((resolve) => {
        crypto.scrypt(pwd, salt, 64, (err, derivedKey) => {
          if (err) {
            resolve({ isValid: false, needsRehash: false });
            return;
          }
          const matches = crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), derivedKey);
          resolve({ isValid: matches, needsRehash: true });
        });
      });
    }
  }

  // 3. Legacy SHA-256 verification
  if (hash.startsWith('sha256:')) {
    const parts = hash.split(':');
    if (parts.length === 3) {
      const [, salt, expectedHex] = parts;
      const computed = crypto.createHash('sha256').update(salt + pwd).digest('hex');
      const matches = crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(computed, 'hex'));
      return { isValid: matches, needsRehash: true };
    }
  }

  const fallbackComputed = crypto.createHash('sha256').update(pwd).digest('hex');
  if (fallbackComputed === hash) {
    return { isValid: true, needsRehash: true };
  }

  return { isValid: false, needsRehash: false };
}

export function hashPasswordScryptSync(pwd: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(pwd, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export function hashPasswordLegacySync(pwd: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + pwd).digest('hex');
  return `sha256:${salt}:${hash}`;
}

export function verifyPasswordSync(
  pwd: string,
  hash: string
): { isValid: boolean; needsRehash: boolean; detectedAlgorithm?: string } {
  if (!hash || typeof hash !== 'string') {
    return { isValid: false, needsRehash: false, detectedAlgorithm: 'unknown' };
  }
  if (hash.startsWith('$2')) {
    const isValid = bcrypt.compareSync(pwd, hash);
    if (!isValid) return { isValid: false, needsRehash: false, detectedAlgorithm: 'bcrypt' };
    const match = hash.match(/^\$2[aby]?\$(\d+)\$/);
    const cost = match ? parseInt(match[1], 10) : BCRYPT_SALT_ROUNDS;
    return { isValid: true, needsRehash: cost < BCRYPT_SALT_ROUNDS, detectedAlgorithm: 'bcrypt' };
  }
  if (hash.startsWith('scrypt:')) {
    const parts = hash.split(':');
    if (parts.length === 3) {
      const [, salt, expectedHex] = parts;
      try {
        const derivedKey = crypto.scryptSync(pwd, salt, 64);
        const matches = crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), derivedKey);
        return { isValid: matches, needsRehash: true, detectedAlgorithm: 'scrypt' };
      } catch {
        return { isValid: false, needsRehash: false, detectedAlgorithm: 'scrypt' };
      }
    }
  }
  if (hash.startsWith('sha256:')) {
    const parts = hash.split(':');
    if (parts.length === 3) {
      const [, salt, expectedHex] = parts;
      const computed = crypto.createHash('sha256').update(salt + pwd).digest('hex');
      const matches = crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(computed, 'hex'));
      return { isValid: matches, needsRehash: true, detectedAlgorithm: 'sha256' };
    }
  }
  return { isValid: false, needsRehash: false, detectedAlgorithm: 'unknown' };
}
