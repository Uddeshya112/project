import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import {
  AuthUser,
  Institution,
  Membership,
  Role,
  Permission,
  RoleAssignment,
  AuthSession,
  PasswordResetToken,
  WorkspaceType,
  RoleCode
} from '../types';

export type { RoleCode };
export type { WorkspaceType };
import {
  INSTITUTIONS,
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS_MAP,
  USERS,
  INITIAL_MEMBERSHIPS,
  INITIAL_ROLE_ASSIGNMENTS,
  INITIAL_SESSIONS
} from '../lib/authData';
import { api, SESSION_EXPIRED_EVENT } from '../lib/api';
import { apiUrl } from '../lib/apiConfig';

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

  // Workspace Multi-Role State
  currentWorkspace: WorkspaceType;
  authorizedWorkspaces: WorkspaceType[];
  switchWorkspace: (workspace: WorkspaceType) => void;

  // Real REST Backend Operations
  login: (email: string, password?: string) => Promise<{
    success: boolean;
    message: string;
    roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin';
    authorizedWorkspaces?: WorkspaceType[];
    user?: AuthUser;
  }>;
  loginWithGoogle: (email: string, name?: string) => Promise<{
    success: boolean;
    message: string;
    roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin';
    authorizedWorkspaces?: WorkspaceType[];
    user?: AuthUser;
  }>;
  register: (name: string, email: string, password: string) => Promise<{
    success: boolean;
    message: string;
    email?: string;
  }>;
  loginAsDemoRole: (roleKey: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin') => Promise<{
    success: boolean;
    message: string;
    roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin';
    authorizedWorkspaces?: WorkspaceType[];
    user?: AuthUser;
  }>;
  resetDemoData: () => Promise<{ success: boolean; message: string }>;
  requestPasswordReset: (email: string) => Promise<{
    success: boolean;
    message: string;
    resetToken?: string;
  }>;
  validateResetToken: (token: string) => Promise<{
    valid: boolean;
    email?: string;
    message?: string;
  }>;
  resetPassword: (token: string, newPassword: string) => Promise<{
    success: boolean;
    message: string;
  }>;

  logout: () => void;
  switchUser: (userId: string) => void;
  updateUserRole: (userId: string, newRoleId: string, reason: string) => void;
  updateUserProfile: (userIdOrUpdates: string | Partial<AuthUser>, maybeUpdates?: Partial<AuthUser>) => Promise<{ success: boolean; message?: string }>;
  addRoleAssignment: (email: string, roleId: string, notes?: string) => void;
  revokeSession: (sessionId: string) => void;

  // Database Tables
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [allInstitutions] = useState<Institution[]>(INSTITUTIONS);
  const [currentInstitution] = useState<Institution>(INSTITUTIONS[0]);

  const [allUsers, setAllUsers] = useState<AuthUser[]>(USERS);
  const [allMemberships, setAllMemberships] = useState<Membership[]>(INITIAL_MEMBERSHIPS);
  const [allRoleAssignments, setAllRoleAssignments] = useState<RoleAssignment[]>(INITIAL_ROLE_ASSIGNMENTS);
  const [allRoles] = useState<Role[]>(ROLES);
  const [allPermissions] = useState<Permission[]>(PERMISSIONS);
  const [allSessions, setAllSessions] = useState<AuthSession[]>(INITIAL_SESSIONS);
  const [passwordResetTokens] = useState<PasswordResetToken[]>([]);

  // Active authenticated user & session lifecycle
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthLifecycleStatus>('AUTH_LOADING');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceType>('Student');
  const [authorizedWorkspaces, setAuthorizedWorkspaces] = useState<WorkspaceType[]>(['Student']);

  const switchWorkspace = (ws: WorkspaceType) => {
    if (authorizedWorkspaces.includes(ws)) {
      setCurrentWorkspace(ws);
    }
  };

  const currentUser = useMemo(() => {
    if (!currentUserId) return null;
    return allUsers.find(u => u.id === currentUserId) || null;
  }, [allUsers, currentUserId]);

  // Sync user's authorized workspaces when user changes
  useEffect(() => {
    if (currentUser?.authorizedWorkspaces && currentUser.authorizedWorkspaces.length > 0) {
      setAuthorizedWorkspaces(currentUser.authorizedWorkspaces);
      if (!currentUser.authorizedWorkspaces.includes(currentWorkspace)) {
        setCurrentWorkspace(currentUser.authorizedWorkspaces[0]);
      }
    }
  }, [currentUser]);

  const applyServerUser = useCallback((data: any) => {
    if (!data?.user) return false;
    const roleCode = String(data.user.roleCode || data.roleCode || 'STUDENT') as RoleCode;
    const roleName = String(data.user.roleName || data.roleName || roleCode);
    const workspaces: WorkspaceType[] = Array.isArray(data.user.authorizedWorkspaces)
      ? data.user.authorizedWorkspaces
      : roleCode === 'COORDINATOR' ? ['Coordinator', 'Faculty'] : roleCode === 'FACULTY' ? ['Faculty'] : ['Student'];
    const existing = allUsers.find(u => u.id === data.user.id || u.email.toLowerCase() === String(data.user.email).toLowerCase());
    const nextUser: AuthUser = {
      ...(existing || { status: 'ACTIVE', emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(), authorizedWorkspaces: workspaces }),
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      department: data.user.department,
      authorizedWorkspaces: workspaces,
    };
    setAllUsers(prev => existing ? prev.map(u => u.id === existing.id || u.email.toLowerCase() === nextUser.email.toLowerCase() ? nextUser : u) : [nextUser, ...prev]);
    setCurrentUserId(nextUser.id);
    setAuthorizedWorkspaces(workspaces);
    setCurrentWorkspace(prev => workspaces.includes(prev) ? prev : workspaces[0]);
    setAllMemberships(prev => [
      {
        id: `mem-${nextUser.id}`,
        userId: nextUser.id,
        institutionId: currentInstitution.id,
        roleId: roleCode === 'COORDINATOR' ? 'role-coordinator' : roleCode === 'FACULTY' ? 'role-faculty' : roleCode === 'HOD' ? 'role-hod' : roleCode === 'COLLEGE_ADMIN' || roleCode === 'SUPER_ADMIN' ? 'role-admin' : roleCode === 'CLASS_REPRESENTATIVE' ? 'role-cr' : 'role-student',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        assignedBy: 'server-auth',
      },
      ...prev.filter(m => m.userId !== nextUser.id),
    ]);
    setIsAuthenticated(true);
    setAuthStatus('AUTHENTICATED');
    return true;
  }, [allUsers, currentInstitution]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      setAuthStatus('AUTH_LOADING');
      try {
        const data = await api('/api/auth/me');
        if (active && data.authenticated && data.user) {
          applyServerUser(data);
        } else if (active) {
          setIsAuthenticated(false); setAuthStatus('UNAUTHENTICATED'); setCurrentUserId(null);
        }
      } catch {
        if (active) { setIsAuthenticated(false); setAuthStatus('UNAUTHENTICATED'); setCurrentUserId(null); }
      }
    };
    void init();
    const onExpired = () => {
      setCurrentUserId(null);
      setIsAuthenticated(false);
      setAuthStatus('UNAUTHENTICATED');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => { active = false; window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired); };
  }, [applyServerUser]);
  const currentMembership = useMemo(() => {
    if (!currentUser) return null;
    return allMemberships.find(
      m => m.userId === currentUser.id && m.institutionId === currentInstitution.id && m.status === 'ACTIVE'
    ) || null;
  }, [allMemberships, currentUser, currentInstitution]);

  const currentRole = useMemo(() => {
    if (!currentMembership) return null;
    return allRoles.find(r => r.id === currentMembership.roleId) || null;
  }, [allRoles, currentMembership]);

  const userPermissions = useMemo(() => {
    if (!currentMembership) return [];
    return ROLE_PERMISSIONS_MAP[currentMembership.roleId] || [];
  }, [currentMembership]);

  const hasPermission = (permissionCode: string) => {
    return userPermissions.includes(permissionCode);
  };

  /**
   * Helper to map Role Code to Timetable Dashboard Key
   */
  const resolveRoleKey = (roleCode: string): 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin' => {
    switch (roleCode) {
      case 'COORDINATOR':
        return 'Coordinator';
      case 'FACULTY':
        return 'Faculty';
      case 'HOD':
        return 'HOD';
      case 'COLLEGE_ADMIN':
      case 'SUPER_ADMIN':
        return 'Admin';
      case 'CLASS_REPRESENTATIVE':
      case 'STUDENT':
      default:
        return 'Student';
    }
  };

  /** Backend-authoritative password login. Session is stored in an httpOnly cookie. */
  const login = async (
    email: string,
    password?: string
  ): Promise<{
    success: boolean;
    message: string;
    roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin';
    authorizedWorkspaces?: WorkspaceType[];
    user?: AuthUser;
  }> => {
    if (!password) return { success: false, message: 'Password is required.' };
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { email: email.trim().toLowerCase(), password } });
      if (!data.success || !data.user) return { success: false, message: data.message || 'Invalid email or password.' };
      applyServerUser(data);
      return {
        success: true,
        message: data.message || `Welcome, ${data.user.name}`,
        roleKey: resolveRoleKey(data.user.roleCode),
        authorizedWorkspaces: data.user.authorizedWorkspaces,
      };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Network error connecting to authentication service.' };
    }
  };

  /** Server-side Google OAuth. The browser receives only the secure session cookie. */
  const loginWithGoogle = async (
    _email: string,
    _name?: string
  ): Promise<{
    success: boolean;
    message: string;
    roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin';
    authorizedWorkspaces?: WorkspaceType[];
    user?: AuthUser;
  }> => {
    if (typeof window !== 'undefined') window.location.assign(apiUrl('/api/auth/google/start'));
    return { success: true, message: 'Redirecting to Google sign-in.' };
  };

  /**
   * REST Backend Register (POST /api/auth/register) - Strictly Authoritative
   * Registration policy: Registration creates the user account in Supabase Auth,
   * but does NOT automatically authenticate or issue an application session.
   * The user must explicitly sign in on the login screen.
   */
  const register = async (
    name: string,
    email: string,
    password: string
  ): Promise<{
    success: boolean;
    message: string;
    email?: string;
  }> => {
    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      });

      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data.success) {
        setIsAuthenticated(false);
        setCurrentUserId(null);

        return {
          success: true,
          message: data.message || 'Account created successfully. Please sign in with your email and password.',
          email: data.email || email.trim().toLowerCase(),
        };
      } else {
        setIsAuthenticated(false);
        setCurrentUserId(null);
        return {
          success: false,
          message:
            data.message ||
            (resp.status === 403
              ? "This staff account has not been pre-authorized. Please contact the Dean's Office."
              : resp.status === 409
              ? 'An account with this email already exists. Please sign in instead.'
              : resp.status === 400
              ? 'Invalid registration request or weak password.'
              : 'Registration could not be completed. Please try again later.'),
        };
      }
    } catch {
      setIsAuthenticated(false);
      setCurrentUserId(null);
      return {
        success: false,
        message: 'Unable to connect to registration service.',
      };
    }
  };

  /** Public demo authentication is disabled. */
  const loginAsDemoRole = async (
    _roleKey: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin'
  ): Promise<{
    success: boolean;
    message: string;
    roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin';
    authorizedWorkspaces?: WorkspaceType[];
    user?: AuthUser;
  }> => ({ success: false, message: 'Demo authentication is disabled.' });

  const resetDemoData = async (): Promise<{ success: boolean; message: string }> => ({
    success: false,
    message: 'Demo data reset is disabled.',
  });

  /** Backend-only password reset request; the server never reveals account existence. */
  const requestPasswordReset = async (email: string): Promise<{
    success: boolean;
    message: string;
    resetToken?: string;
  }> => {
    try {
      const data = await api('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim().toLowerCase() },
      });
      return { success: Boolean(data.success), message: data.message || 'If an account exists for this email, password-reset instructions have been sent.', resetToken: data.resetToken };
    } catch (err) {
      return { success: true, message: err instanceof Error ? err.message : 'If an account exists for this email, password-reset instructions have been sent.' };
    }
  };

  const validateResetToken = async (token: string): Promise<{ valid: boolean; email?: string; message?: string }> => {
    try { return await api('/api/auth/validate-token?token=' + encodeURIComponent(token)); }
    catch (err) { return { valid: false, message: err instanceof Error ? err.message : 'Could not validate reset token.' }; }
  };

  const resetPassword = async (token: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    try {
      return await api('/api/auth/reset-password', { method: 'POST', body: { token, newPassword } });
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Network error resetting password.' };
    }
  };

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch {}
    setIsAuthenticated(false);
    setAuthStatus('UNAUTHENTICATED');
    setCurrentUserId(null);
    setAuthorizedWorkspaces(['Student']);
    setCurrentWorkspace('Student');
  };

  const switchUser = (userId: string) => {
    setCurrentUserId(userId);
    setIsAuthenticated(true);
  };

  const updateUserRole = (userId: string, newRoleId: string, reason: string) => {
    setAllMemberships(prev =>
      prev.map(m =>
        m.userId === userId && m.institutionId === currentInstitution.id
          ? { ...m, roleId: newRoleId, updatedAt: new Date().toISOString() }
          : m
      )
    );
  };

  const updateUserProfile = async (userIdOrUpdates: string | Partial<AuthUser>, maybeUpdates?: Partial<AuthUser>) => {
    let targetUserId = currentUserId;
    let updates = maybeUpdates;
    if (typeof userIdOrUpdates === 'string') {
      targetUserId = userIdOrUpdates;
    } else {
      updates = userIdOrUpdates;
    }
    if (!targetUserId) return { success: false, message: 'No active user' };
    setAllUsers(prev =>
      prev.map(u => (u.id === targetUserId ? { ...u, ...updates, updatedAt: new Date().toISOString() } : u))
    );
    return { success: true, message: 'Profile updated' };
  };

  const addRoleAssignment = (email: string, roleId: string, notes?: string) => {
    const newAssignment: RoleAssignment = {
      id: `ra-${Date.now().toString().slice(-4)}`,
      institutionId: currentInstitution.id,
      email: email.toLowerCase().trim(),
      roleId,
      status: 'PRE_AUTHORIZED',
      notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setAllRoleAssignments(prev => [newAssignment, ...prev]);
  };

  const revokeSession = (sessionId: string) => {
    setAllSessions(prev =>
      prev.map(s => (s.id === sessionId ? { ...s, isRevoked: true } : s))
    );
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentInstitution,
        currentMembership,
        currentRole,
        userPermissions,
        isAuthenticated,
        authStatus,
        isAuthLoading: authStatus === 'AUTH_LOADING',
        hasPermission,
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
        allInstitutions,
        allMemberships,
        allRoleAssignments,
        allRoles,
        allPermissions,
        allSessions,
        passwordResetTokens,
        roster: currentUser ? {
          rollNumber: currentUser.rollNumber ?? '102303999',
          sectionId: currentUser.sectionId ?? 'sec-csea',
          subSectionId: currentUser.subSectionId ?? 'sub-sec-csea-1'
        } : {
          rollNumber: '102303999',
          sectionId: 'sec-csea',
          subSectionId: 'sub-sec-csea-1'
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
