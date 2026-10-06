import bcrypt from 'bcryptjs';

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

export function hashPasswordBcrypt(pwd: string): string {
  return bcrypt.hashSync(pwd, 10);
}

export function hashPasswordScrypt(pwd: string): string {
  return bcrypt.hashSync(pwd, 10);
}

export function verifyPassword(pwd: string, hash: string): boolean {
  return bcrypt.compareSync(pwd, hash);
}

export function hashPasswordLegacy(pwd: string): string {
  return bcrypt.hashSync(pwd, 10);
}
