import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Modern KDF Password Utilities with Transparent Migration Support
 * Supported KDFs:
 *  - Primary: Bcrypt ($2b$ cost 12)
 *  - Secondary: Scrypt (RFC 7914, N=16384, r=8, p=1)
 *  - Legacy: SHA-256 + Salt (automatic transparent upgrade on login)
 */

export const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hash password using standard Bcrypt KDF (Blowfish-based key derivation)
 */
export function hashPasswordBcrypt(pwd: string, rounds = BCRYPT_SALT_ROUNDS): string {
  const salt = bcrypt.genSaltSync(rounds);
  return bcrypt.hashSync(pwd, salt);
}

/**
 * Hash password using Scrypt KDF (RFC 7914)
 */
export function hashPasswordScrypt(pwd: string, customSaltHex?: string): string {
  const salt = customSaltHex ? Buffer.from(customSaltHex, 'hex') : crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(pwd, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
  return `scrypt$N=16384,r=8,p=1$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Legacy salted SHA-256 hashing (retained strictly for migration verification)
 */
export function hashPasswordLegacy(pwd: string): string {
  return crypto.createHash('sha256').update(pwd + '_tiet_salt_2026').digest('hex');
}

export interface PasswordVerificationResult {
  isValid: boolean;
  needsRehash: boolean;
  detectedAlgorithm: 'bcrypt' | 'scrypt' | 'sha256' | 'unknown';
}

/**
 * Verify a plain-text password against any stored hash format
 * Automatically detects whether the stored hash needs a transparent upgrade to modern Bcrypt
 */
export function verifyPassword(pwd: string, storedHash: string): PasswordVerificationResult {
  if (!storedHash || !pwd) {
    return { isValid: false, needsRehash: false, detectedAlgorithm: 'unknown' };
  }

  // 1. Check if storedHash is Bcrypt ($2a$, $2b$, or $2y$)
  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(storedHash)) {
    try {
      const isValid = bcrypt.compareSync(pwd, storedHash);
      return { isValid, needsRehash: false, detectedAlgorithm: 'bcrypt' };
    } catch {
      return { isValid: false, needsRehash: false, detectedAlgorithm: 'bcrypt' };
    }
  }

  // 2. Check if storedHash is Scrypt
  if (storedHash.startsWith('scrypt$N=16384,r=8,p=1$')) {
    const parts = storedHash.split('$');
    if (parts.length === 4) {
      const saltHex = parts[2];
      const expectedKeyHex = parts[3];
      const salt = Buffer.from(saltHex, 'hex');
      const derivedKey = crypto.scryptSync(pwd, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
      const expectedBuf = Buffer.from(expectedKeyHex, 'hex');
      if (derivedKey.length === expectedBuf.length && crypto.timingSafeEqual(derivedKey, expectedBuf)) {
        // Valid under scrypt, flag for upgrade to standard bcrypt
        return { isValid: true, needsRehash: true, detectedAlgorithm: 'scrypt' };
      }
    }
    return { isValid: false, needsRehash: false, detectedAlgorithm: 'scrypt' };
  }

  // 3. Backward compatibility check: Legacy salted SHA-256 (64-char hex)
  if (/^[0-9a-f]{64}$/i.test(storedHash)) {
    const legacyHash = crypto.createHash('sha256').update(pwd + '_tiet_salt_2026').digest('hex');
    const legacyBuf = Buffer.from(legacyHash, 'utf8');
    const storedBuf = Buffer.from(storedHash, 'utf8');
    if (legacyBuf.length === storedBuf.length && crypto.timingSafeEqual(legacyBuf, storedBuf)) {
      // Valid password under legacy scheme -> Flag for immediate on-the-fly rehash migration to modern bcrypt
      return { isValid: true, needsRehash: true, detectedAlgorithm: 'sha256' };
    }
    return { isValid: false, needsRehash: false, detectedAlgorithm: 'sha256' };
  }

  return { isValid: false, needsRehash: false, detectedAlgorithm: 'unknown' };
}
