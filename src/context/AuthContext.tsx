import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthUser, Institution, Role, WorkspaceType } from '../types';
import { INSTITUTIONS, ROLES } from '../lib/authData';
import { api, ApiError, SESSION_EXPIRED_EVENT } from '../lib/api';

export type RoleCode = 'SUPER_ADMIN' | 'COLLEGE_ADMIN' | 'COORDINATOR' | 'HOD' | 'FACULTY' | 'CLASS_REPRESENTATIVE' | 'STUDENT';

/** Server user (src/server/auth.ts publicUser) flattened into the AuthUser shape the screens use. */
export type CurrentUser = AuthUser & {
  roleCode: RoleCode;
  roleName: string;
  hasPassword: boolean;
  googleLinked: boolean;
};

export interface RosterContext {
  facultyId: string | null;
  sectionId: string | null;
  subSectionId: string | null;
  rollNumber: string | null;
  crSectionId: string | null;
}

export interface AuthConfig {
  googleEnabled: boolean;
  demoEnabled: boolean;
  allowedDomains: string[];
}

type Result = { success: boolean; message?: string };

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  authConfig: AuthConfig | null;
  currentUser: CurrentUser | null;
  currentRole: Role | null;
  currentInstitution: Institution;
  roster: RosterContext | null;
  authorizedWorkspaces: WorkspaceType[];
  currentWorkspace: WorkspaceType;
  switchWorkspace: (workspace: WorkspaceType) => void;
  login: (email: string, password: string) => Promise<Result>;
  loginAsDemoRole: (roleKey: string) => Promise<Result>;
  startGoogleLogin: () => void;
  requestPasswordReset: (email: string) => Promise<Result>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserProfile: (updates: Partial<AuthUser>) => Promise<Result>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<Result>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const WORKSPACE_KEY = 'intellischedule.workspace';
const PROFILE_FIELDS = ['phone', 'officeLocation', 'officeHours', 'specialization', 'notificationPreferences'] as const;

function toCurrentUser(u: any): CurrentUser {
  return {
    ...(u.profile ?? {}),
    id: u.id,
    email: u.email,
    name: u.name,
    status: u.status,
    emailVerified: true,
    createdAt: u.createdAt,
    updatedAt: u.createdAt,
    lastLoginAt: u.lastLoginAt ?? '',
    department: u.department,
    authorizedWorkspaces: u.authorizedWorkspaces,
    isDemoUser: u.isDemoUser,
    ssoProvider: u.googleLinked ? 'Google (thapar.edu)' : 'Email & password',
    roleCode: u.roleCode,
    roleName: u.roleName,
    hasPassword: u.hasPassword,
    googleLinked: u.googleLinked,
  };
}

const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [roster, setRoster] = useState<RosterContext | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceType>('Student');

  const authorizedWorkspaces = currentUser?.authorizedWorkspaces ?? [];

  const applySession = useCallback((user: any | null, rosterCtx: RosterContext | null = null) => {
    if (!user) {
      setCurrentUser(null);
      setRoster(null);
      return;
    }
    const cu = toCurrentUser(user);
    setCurrentUser(cu);
    setRoster(rosterCtx);
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(WORKSPACE_KEY);
    } catch {}
    const ws = cu.authorizedWorkspaces ?? [];
    setCurrentWorkspace(saved && ws.includes(saved as WorkspaceType) ? (saved as WorkspaceType) : ws[0] ?? 'Student');
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api('/api/me');
      applySession(me.user, me.roster);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) applySession(null);
      else throw err;
    }
  }, [applySession]);

  useEffect(() => {
    Promise.all([api<AuthConfig>('/api/auth/config').then(setAuthConfig), refreshUser()])
      .catch(() => {})
      .finally(() => setIsLoading(false));
    const onExpired = () => applySession(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [refreshUser, applySession]);

  const switchWorkspace = useCallback(
    (ws: WorkspaceType) => {
      if (!authorizedWorkspaces.includes(ws)) return;
      setCurrentWorkspace(ws);
      try {
        sessionStorage.setItem(WORKSPACE_KEY, ws);
      } catch {}
    },
    [authorizedWorkspaces],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<Result> => {
      try {
        await api('/api/auth/login', { body: { email, password } });
        await refreshUser();
        return { success: true };
      } catch (err) {
        return { success: false, message: message(err) };
      }
    },
    [refreshUser],
  );

  const loginAsDemoRole = useCallback(
    async (roleKey: string): Promise<Result> => {
      try {
        await api('/api/auth/demo-login', { body: { roleKey } });
        await refreshUser();
        return { success: true };
      } catch (err) {
        return { success: false, message: message(err) };
      }
    },
    [refreshUser],
  );

  const startGoogleLogin = useCallback(() => {
    window.location.assign('/api/auth/google/start');
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<Result> => {
    try {
      const r = await api('/api/auth/forgot-password', { body: { email } });
      return { success: true, message: r.message };
    } catch (err) {
      return { success: false, message: message(err) };
    }
  }, []);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    try {
      sessionStorage.removeItem(WORKSPACE_KEY);
    } catch {}
    applySession(null);
  }, [applySession]);

  const updateUserProfile = useCallback(async (updates: Partial<AuthUser>): Promise<Result> => {
    const profile: Record<string, unknown> = {};
    for (const k of PROFILE_FIELDS) if (k in updates) profile[k] = (updates as any)[k];
    try {
      const r = await api('/api/auth/profile', { method: 'PATCH', body: { name: updates.name, profile } });
      setCurrentUser(toCurrentUser(r.user));
      return { success: true, message: 'Profile saved.' };
    } catch (err) {
      return { success: false, message: message(err) };
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<Result> => {
    try {
      const r = await api('/api/auth/change-password', { body: { currentPassword, newPassword } });
      return { success: true, message: r.message };
    } catch (err) {
      return { success: false, message: message(err) };
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated: Boolean(currentUser),
      authConfig,
      currentUser,
      currentRole: currentUser ? ROLES.find((r) => r.code === currentUser.roleCode) ?? null : null,
      currentInstitution: INSTITUTIONS[0],
      roster,
      authorizedWorkspaces,
      currentWorkspace,
      switchWorkspace,
      login,
      loginAsDemoRole,
      startGoogleLogin,
      requestPasswordReset,
      logout,
      refreshUser,
      updateUserProfile,
      changePassword,
    }),
    [isLoading, authConfig, currentUser, roster, authorizedWorkspaces, currentWorkspace, switchWorkspace, login, loginAsDemoRole, startGoogleLogin, requestPasswordReset, logout, refreshUser, updateUserProfile, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
