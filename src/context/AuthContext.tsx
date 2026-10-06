import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type {
  AuthUser,
  Institution,
  Membership,
  Role,
  Permission,
  RoleAssignment,
  AuthSession,
  PasswordResetToken,
  WorkspaceType,
  RoleCode,
} from '../types';
import {
  CURRENT_INSTITUTION,
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS_MAP,
  ROLE_NAMES,
  ROLE_WORKSPACES,
} from '../lib/authCatalog';
import { apiUrl } from '../lib/apiConfig';

export type { RoleCode, WorkspaceType };
export type AuthLifecycleStatus = 'AUTH_LOADING' | 'AUTHENTICATED' | 'UNAUTHENTICATED';

interface AuthContextType {
  currentUser: AuthUser | null;
  currentInstitution: Institution;
  currentMembership: Membership | null;
  currentRole: Role | null;
  userPermissions: string[];
  isAuthenticated: boolean;
  authStatus: AuthLifecycleStatus;
  isAuthLoading: boolean;
  hasPermission: (permissionCode: string) => boolean;
  currentWorkspace: WorkspaceType;
  authorizedWorkspaces: WorkspaceType[];
  switchWorkspace: (workspace: WorkspaceType) => void;
  login: (email: string, password?: string) => Promise<{ success: boolean; message: string; roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin'; authorizedWorkspaces?: WorkspaceType[]; user?: AuthUser }>;
  loginWithGoogle: (email: string, name?: string) => Promise<{ success: boolean; message: string; roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin'; authorizedWorkspaces?: WorkspaceType[]; user?: AuthUser }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; message: string; email?: string }>;
  loginAsDemoRole: (roleKey: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin') => Promise<{ success: boolean; message: string; roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin'; authorizedWorkspaces?: WorkspaceType[]; user?: AuthUser }>;
  resetDemoData: () => Promise<{ success: boolean; message: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string; resetToken?: string }>;
  validateResetToken: (token: string) => Promise<{ valid: boolean; email?: string; message?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  switchUser: (userId: string) => void;
  updateUserRole: (userId: string, newRoleId: string, reason: string) => void;
  updateUserProfile: (userIdOrUpdates: string | Partial<AuthUser>, maybeUpdates?: Partial<AuthUser>) => Promise<{ success: boolean; message?: string }>;
  addRoleAssignment: (email: string, roleId: string, notes?: string) => void;
  revokeSession: (sessionId: string) => void;
  allUsers: AuthUser[];
  allInstitutions: Institution[];
  allMemberships: Membership[];
  allRoleAssignments: RoleAssignment[];
  allRoles: Role[];
  allPermissions: Permission[];
  allSessions: AuthSession[];
  passwordResetTokens: PasswordResetToken[];
  roster?: any;
  [key: string]: any;
}

const AuthContext = createContext<AuthContextType | null>(null);

function dashboardRole(roleCode?: RoleCode | string): 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin' {
  switch (roleCode) {
    case 'COORDINATOR': return 'Coordinator';
    case 'FACULTY': return 'Faculty';
    case 'HOD': return 'HOD';
    case 'COLLEGE_ADMIN':
    case 'SUPER_ADMIN': return 'Admin';
    default: return 'Student';
  }
}

function fromServerUser(user: any): AuthUser {
  const roleCode = user.roleCode as RoleCode | undefined;
  const profile = user.profile && typeof user.profile === 'object' ? user.profile : {};
  return {
    id: String(user.id),
    name: String(user.name || user.email || 'User'),
    email: String(user.email || '').toLowerCase(),
    status: user.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE',
    emailVerified: true,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : new Date().toISOString(),
    department: user.department,
    avatarUrl: (profile as any).avatarUrl,
    phone: (profile as any).phone,
    officeLocation: (profile as any).officeLocation,
    officeHours: (profile as any).officeHours,
    rollNumber: (profile as any).rollNumber,
    sectionId: (profile as any).sectionId,
    subSectionId: (profile as any).subSectionId,
    crSectionId: (profile as any).crSectionId,
    facultyId: (profile as any).facultyId,
    batch: (profile as any).batch,
    specialization: (profile as any).specialization,
    notificationPreferences: (profile as any).notificationPreferences,
    authorizedWorkspaces: Array.isArray(user.authorizedWorkspaces) ? user.authorizedWorkspaces : (roleCode ? ROLE_WORKSPACES[roleCode] : ['Student']),
    isDemoUser: Boolean(user.isDemoUser),
    hasPassword: Boolean(user.hasPassword),
    roleCode,
    roleName: user.roleName || (roleCode ? ROLE_NAMES[roleCode] : 'Student'),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentRoleCode, setCurrentRoleCode] = useState<RoleCode | undefined>();
  const [authStatus, setAuthStatus] = useState<AuthLifecycleStatus>('AUTH_LOADING');
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceType>('Student');
  const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
  const [allSessions, setAllSessions] = useState<AuthSession[]>([]);

  const currentInstitution = CURRENT_INSTITUTION;
  const authorizedWorkspaces = currentUser?.authorizedWorkspaces?.length
    ? currentUser.authorizedWorkspaces
    : currentRoleCode ? ROLE_WORKSPACES[currentRoleCode] : (['Student'] as WorkspaceType[]);

  const currentRole = useMemo(
    () => (currentRoleCode ? ROLES.find((r) => r.code === currentRoleCode) ?? null : null),
    [currentRoleCode],
  );
  const userPermissions = currentRoleCode ? (ROLE_PERMISSIONS_MAP[currentRoleCode] ?? []) : [];
  const currentMembership = currentUser && currentRoleCode ? {
    id: `mem-${currentUser.id}`,
    userId: currentUser.id,
    institutionId: currentInstitution.id,
    roleId: currentRole?.id ?? 'role-student',
    status: 'ACTIVE',
    createdAt: currentUser.createdAt,
    updatedAt: new Date().toISOString(),
    assignedBy: 'server',
  } as Membership : null;

  const applyAuthUser = useCallback((raw: any) => {
    const user = fromServerUser(raw);
    const roleCode = user.roleCode as RoleCode | undefined;
    setCurrentUser(user);
    setCurrentRoleCode(roleCode);
    const workspaces: WorkspaceType[] = user.authorizedWorkspaces?.length ? (user.authorizedWorkspaces as WorkspaceType[]) : (roleCode ? ROLE_WORKSPACES[roleCode] : ['Student' as WorkspaceType]);
    setCurrentWorkspace((prev) => workspaces.includes(prev) ? prev : workspaces[0]);
    setAuthStatus('AUTHENTICATED');
    setAllUsers((prev) => [user, ...prev.filter((u) => u.id !== user.id)]);
    return user;
  }, []);

  const loadCurrentSession = useCallback(async () => {
    try {
      const resp = await fetch(apiUrl('/api/auth/me'), { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!resp.ok) {
        setCurrentUser(null);
        setCurrentRoleCode(undefined);
        setAuthStatus('UNAUTHENTICATED');
        return;
      }
      const data = await resp.json();
      if (data.authenticated && data.user) applyAuthUser(data.user);
      else {
        setCurrentUser(null);
        setCurrentRoleCode(undefined);
        setAuthStatus('UNAUTHENTICATED');
      }
    } catch {
      setCurrentUser(null);
      setCurrentRoleCode(undefined);
      setAuthStatus('UNAUTHENTICATED');
    }
  }, [applyAuthUser]);

  useEffect(() => {
    loadCurrentSession();
  }, [loadCurrentSession]);

  useEffect(() => {
    if (!currentUser || !['COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(String(currentUser.roleCode))) return;
    fetch(apiUrl('/api/admin/users?limit=200'), { credentials: 'include' })
      .then(async (r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.users) setAllUsers(data.users.map(fromServerUser));
      })
      .catch(() => {});
    fetch(apiUrl('/api/admin/sessions'), { credentials: 'include' })
      .then(async (r) => r.ok ? r.json() : null)
      .then((data) => {
        if (Array.isArray(data?.sessions)) {
          setAllSessions(data.sessions.map((s: any, i: number) => ({
            id: `server-session-${i}`,
            userId: s.userId,
            institutionId: currentInstitution.id,
            roleId: ROLES.find((r) => r.code === s.roleCode)?.id ?? 'role-student',
            token: '',
            createdAt: s.lastSignIn ? new Date(s.lastSignIn).toISOString() : new Date().toISOString(),
            expiresAt: s.expiresAt ? new Date(s.expiresAt).toISOString() : new Date().toISOString(),
            lastActiveAt: s.lastSignIn ? new Date(s.lastSignIn).toISOString() : new Date().toISOString(),
            isRevoked: false,
          })));
        }
      })
      .catch(() => {});
  }, [currentUser, currentInstitution.id]);

  const switchWorkspace = (workspace: WorkspaceType) => {
    if (authorizedWorkspaces.includes(workspace)) setCurrentWorkspace(workspace);
  };

  const login = async (email: string, password?: string) => {
    try {
      const resp = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success || !data.user) return { success: false, message: data.message || 'Invalid email or password.' };
      const user = applyAuthUser(data.user);
      return { success: true, message: data.message || 'Signed in successfully.', roleKey: dashboardRole(user.roleCode), authorizedWorkspaces: user.authorizedWorkspaces, user };
    } catch {
      return { success: false, message: 'Network error connecting to authentication service.' };
    }
  };

  const loginWithGoogle = async (_email?: string, _name?: string) => {
    window.location.assign(apiUrl('/api/auth/google/start'));
    return { success: false, message: 'Redirecting to Google sign-in…' };
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      const resp = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      });
      const data = await resp.json().catch(() => ({}));
      return { success: resp.ok && Boolean(data.success), message: data.message || (resp.ok ? 'Account created.' : 'Registration failed.'), email: data.email };
    } catch {
      return { success: false, message: 'Network error connecting to registration service.' };
    }
  };

  const loginAsDemoRole = async (roleKey: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin') => {
    try {
      const resp = await fetch(apiUrl('/api/auth/demo-login'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ roleKey }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success || !data.user) return { success: false, message: data.message || 'Demo access is unavailable.' };
      const user = applyAuthUser(data.user);
      return { success: true, message: data.message || 'Demo signed in.', roleKey: dashboardRole(user.roleCode), authorizedWorkspaces: user.authorizedWorkspaces, user };
    } catch {
      return { success: false, message: 'Network error connecting to demo service.' };
    }
  };

  const resetDemoData = async () => ({ success: false, message: 'Demo reset is disabled; use a fresh local database for deterministic test data.' });

  const requestPasswordReset = async (email: string) => {
    try {
      const resp = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await resp.json().catch(() => ({}));
      return { success: resp.ok, message: data.message || 'If an account exists, password reset instructions have been sent.', resetToken: data.resetToken };
    } catch {
      return { success: false, message: 'Could not contact the password recovery service.' };
    }
  };

  const validateResetToken = async (token: string) => {
    try {
      const resp = await fetch(apiUrl(`/api/auth/validate-token?token=${encodeURIComponent(token)}`), { credentials: 'include' });
      const data = await resp.json().catch(() => ({}));
      return { valid: Boolean(data.valid), email: data.email, message: data.message };
    } catch {
      return { valid: false, message: 'Could not reach token verification service.' };
    }
  };

  const resetPassword = async (token: string, newPassword: string) => {
    try {
      const resp = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await resp.json().catch(() => ({}));
      return { success: resp.ok && Boolean(data.success), message: data.message || 'Password reset failed.' };
    } catch {
      return { success: false, message: 'Network error resetting password.' };
    }
  };

  const logout = async () => {
    try {
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } });
    } catch {}
    setCurrentUser(null);
    setCurrentRoleCode(undefined);
    setAuthStatus('UNAUTHENTICATED');
    setCurrentWorkspace('Student');
    setAllUsers([]);
    setAllSessions([]);
  };

  const switchUser = (_userId: string) => {
    // Deliberate no-op: client-side impersonation is not an authentication feature.
  };

  const updateUserRole = async (userId: string, newRoleId: string, reason: string) => {
    const target = ROLES.find((r) => r.id === newRoleId);
    if (!target) return;
    try {
      await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(userId)}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ roleCode: target.code, profile: { roleChangeReason: reason } }),
      });
      await loadCurrentSession();
    } catch {}
  };

  const updateUserProfile = async (userIdOrUpdates: string | Partial<AuthUser>, maybeUpdates?: Partial<AuthUser>) => {
    const targetId = typeof userIdOrUpdates === 'string' ? userIdOrUpdates : currentUser?.id;
    const updates = typeof userIdOrUpdates === 'string' ? maybeUpdates : userIdOrUpdates;
    if (!targetId) return { success: false, message: 'No active user.' };
    if (targetId !== currentUser?.id) return { success: false, message: 'Profile changes can only target the current user.' };
    try {
      const resp = await fetch(apiUrl('/api/auth/profile'), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: updates?.name, profile: { ...updates } }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success || !data.user) return { success: false, message: data.message || 'Profile update failed.' };
      applyAuthUser(data.user);
      return { success: true, message: 'Profile updated.' };
    } catch {
      return { success: false, message: 'Network error updating profile.' };
    }
  };

  const addRoleAssignment = (_email: string, _roleId: string, _notes?: string) => {
    // Role assignment is server-controlled. There is intentionally no client-only assignment cache.
  };

  const revokeSession = async (sessionId: string) => {
    if (!sessionId.startsWith('server-session-')) return;
    const index = Number(sessionId.replace('server-session-', ''));
    const session = allSessions[index];
    if (!session?.userId) return;
    try {
      await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(session.userId)}/revoke-sessions`), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } catch {}
  };

  const roster = currentUser ? {
    rollNumber: currentUser.rollNumber ?? null,
    sectionId: currentUser.sectionId ?? null,
    subSectionId: currentUser.subSectionId ?? null,
    facultyId: currentUser.facultyId ?? null,
    crSectionId: currentUser.crSectionId ?? null,
    roleName: currentUser.roleName,
    roleKey: dashboardRole(currentUser.roleCode),
    authorizedWorkspaces,
  } : {
    rollNumber: null, sectionId: null, subSectionId: null, facultyId: null, crSectionId: null,
    roleName: 'Student', roleKey: 'Student', authorizedWorkspaces: ['Student'] as WorkspaceType[],
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      currentInstitution,
      currentMembership,
      currentRole,
      userPermissions,
      isAuthenticated: authStatus === 'AUTHENTICATED',
      authStatus,
      isAuthLoading: authStatus === 'AUTH_LOADING',
      hasPermission: (permissionCode: string) => userPermissions.includes(permissionCode),
      currentWorkspace,
      authorizedWorkspaces,
      switchWorkspace,
      login,
      loginWithGoogle,
      register,
      loginAsDemoRole,
      resetDemoData,
      requestPasswordReset,
      validateResetToken,
      resetPassword,
      logout,
      switchUser,
      updateUserRole,
      updateUserProfile,
      addRoleAssignment,
      revokeSession,
      allUsers,
      allInstitutions: [currentInstitution],
      allMemberships: currentMembership ? [currentMembership] : [],
      allRoleAssignments: [],
      allRoles: ROLES,
      allPermissions: PERMISSIONS,
      allSessions,
      passwordResetTokens: [],
      roster,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
