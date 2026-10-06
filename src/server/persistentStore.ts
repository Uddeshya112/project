import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type OneTimeTokenPurpose = 'email_verification' | 'password_reset';

export interface StoredOneTimeToken {
  id: string;
  email: string;
  tokenHash: string;
  purpose: OneTimeTokenPurpose;
  expiresAt: string;
  isUsed: boolean;
  createdAt: string;
}

export interface StoredSession {
  id: string;
  userId: string;
  tokenHash: string;
  roleCode: string;
  createdAt: string;
  expiresAt: string;
  isRevoked: boolean;
}

export interface PendingRegistration {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  roleCode: string;
  roleName: string;
  department: string;
  createdAt: string;
}

export interface RateLimitRecord {
  count: number;
  resetsAt: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'persistent_state.json');

class PersistentStore {
  public oneTimeTokens = new Map<string, StoredOneTimeToken>();
  public sessions = new Map<string, StoredSession>();
  public pendingRegistrations = new Map<string, PendingRegistration>();
  public rateLimitBuckets = new Map<string, RateLimitRecord>();

  constructor() {
    this.loadFromDisk();
    setInterval(() => this.cleanupExpiredRecords(), 10 * 60 * 1000).unref();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.oneTimeTokens)) {
          this.oneTimeTokens = new Map(data.oneTimeTokens);
        }
        if (Array.isArray(data.sessions)) {
          this.sessions = new Map(data.sessions);
        }
        if (Array.isArray(data.pendingRegistrations)) {
          this.pendingRegistrations = new Map(data.pendingRegistrations);
        }
        if (Array.isArray(data.rateLimitBuckets)) {
          this.rateLimitBuckets = new Map(data.rateLimitBuckets);
        }
      }
    } catch (err) {
      console.warn('[PERSISTENT STORE] Failed to load disk state, starting fresh:', err);
    }
  }

  public saveToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        oneTimeTokens: Array.from(this.oneTimeTokens.entries()),
        sessions: Array.from(this.sessions.entries()),
        pendingRegistrations: Array.from(this.pendingRegistrations.entries()),
        rateLimitBuckets: Array.from(this.rateLimitBuckets.entries()),
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[PERSISTENT STORE] Failed to save state to disk:', err);
    }
  }

  public hashToken(raw: string): string {
    return crypto.createHash('sha256').update(String(raw)).digest('hex');
  }

  // --- One-Time Tokens ---
  public issueOneTimeToken(
    email: string,
    purpose: OneTimeTokenPurpose,
    ttlMs: number
  ): { rawToken: string; record: StoredOneTimeToken } {
    const normalizedEmail = email.trim().toLowerCase();
    for (const record of this.oneTimeTokens.values()) {
      if (record.email === normalizedEmail && record.purpose === purpose && !record.isUsed) {
        record.isUsed = true;
      }
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const record: StoredOneTimeToken = {
      id: 'ott_' + crypto.randomUUID(),
      email: normalizedEmail,
      tokenHash,
      purpose,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      isUsed: false,
      createdAt: new Date().toISOString(),
    };

    this.oneTimeTokens.set(tokenHash, record);
    this.saveToDisk();
    return { rawToken, record };
  }

  public consumeOneTimeToken(rawToken: string, expectedPurpose: OneTimeTokenPurpose): StoredOneTimeToken | null {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const tokenHash = this.hashToken(rawToken);
    const record = this.oneTimeTokens.get(tokenHash);
    if (!record) return null;
    if (record.purpose !== expectedPurpose) return null;
    if (record.isUsed) return null;
    if (new Date(record.expiresAt) < new Date()) return null;

    record.isUsed = true;
    this.saveToDisk();
    return record;
  }

  public validateOneTimeToken(rawToken: string, expectedPurpose: OneTimeTokenPurpose): StoredOneTimeToken | null {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const tokenHash = this.hashToken(rawToken);
    const record = this.oneTimeTokens.get(tokenHash);
    if (!record) return null;
    if (record.purpose !== expectedPurpose) return null;
    if (record.isUsed) return null;
    if (new Date(record.expiresAt) < new Date()) return null;

    return record;
  }

  public invalidateUserTokens(email: string): void {
    const normalized = email.trim().toLowerCase();
    for (const tok of this.oneTimeTokens.values()) {
      if (tok.email === normalized) {
        tok.isUsed = true;
      }
    }
    this.saveToDisk();
  }

  // --- Sessions ---
  public createSession(rawToken: string, userId: string, roleCode: string, ttlMs: number = 24 * 60 * 60 * 1000): StoredSession {
    const tokenHash = this.hashToken(rawToken);
    const session: StoredSession = {
      id: 'sess_' + crypto.randomUUID(),
      userId,
      tokenHash,
      roleCode,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      isRevoked: false,
    };
    this.sessions.set(tokenHash, session);
    this.saveToDisk();
    return session;
  }

  public getSession(rawToken: string): StoredSession | null {
    if (!rawToken) return null;
    const tokenHash = this.hashToken(rawToken);
    const session = this.sessions.get(tokenHash);
    if (!session || session.isRevoked || new Date(session.expiresAt) < new Date()) {
      return null;
    }
    return session;
  }

  public revokeSession(rawToken: string): void {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    const session = this.sessions.get(tokenHash);
    if (session) {
      session.isRevoked = true;
    } else {
      this.sessions.set(tokenHash, {
        id: 'sess_revoked_' + crypto.randomUUID(),
        userId: 'revoked_token',
        tokenHash,
        roleCode: 'STUDENT',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        isRevoked: true,
      });
    }
    this.saveToDisk();
  }

  public revokeUserSessions(userId: string): void {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        session.isRevoked = true;
      }
    }
    this.saveToDisk();
  }

  // --- Pending Registrations ---
  public setPendingRegistration(email: string, pending: PendingRegistration): void {
    this.pendingRegistrations.set(email.trim().toLowerCase(), pending);
    this.saveToDisk();
  }

  public getPendingRegistration(email: string): PendingRegistration | null {
    return this.pendingRegistrations.get(email.trim().toLowerCase()) || null;
  }

  public deletePendingRegistration(email: string): void {
    this.pendingRegistrations.delete(email.trim().toLowerCase());
    this.saveToDisk();
  }

  // --- Rate Limit Buckets ---
  public checkRateLimit(key: string, limit: number, windowMs: number): { limited: boolean; retryAfterSec: number } {
    const now = Date.now();
    const record = this.rateLimitBuckets.get(key);

    if (!record || record.resetsAt < now) {
      this.rateLimitBuckets.set(key, { count: 1, resetsAt: now + windowMs });
      this.saveToDisk();
      return { limited: false, retryAfterSec: 0 };
    }

    if (record.count >= limit) {
      const retryAfterSec = Math.ceil((record.resetsAt - now) / 1000);
      return { limited: true, retryAfterSec: Math.max(1, retryAfterSec) };
    }

    record.count++;
    this.saveToDisk();
    return { limited: false, retryAfterSec: 0 };
  }

  // --- TTL Cleanup ---
  public cleanupExpiredRecords(): void {
    const now = Date.now();
    const nowIso = new Date().toISOString();

    for (const [key, tok] of this.oneTimeTokens.entries()) {
      if (tok.isUsed || tok.expiresAt < nowIso) {
        this.oneTimeTokens.delete(key);
      }
    }

    for (const [key, sess] of this.sessions.entries()) {
      if (sess.isRevoked || sess.expiresAt < nowIso) {
        this.sessions.delete(key);
      }
    }

    for (const [key, record] of this.rateLimitBuckets.entries()) {
      if (record.resetsAt < now) {
        this.rateLimitBuckets.delete(key);
      }
    }

    this.saveToDisk();
  }
}

export const persistentStore = new PersistentStore();
