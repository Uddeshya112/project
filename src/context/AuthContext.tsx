import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  AuthUser,
  Institution,
  Membership,
  Role,
  Permission,
  RoleAssignment,
  AuthSession,
  PasswordResetToken,
  WorkspaceType
} from '../types';
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

interface AuthContextType {
  currentUser: AuthUser | null;
  currentInstitution: Institution;
  currentMembership: Membership | null;
  currentRole: Role | null;
  userPermissions: string[];
  isAuthenticated: boolean;
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
  updateUserProfile: (userId: string, updates: Partial<AuthUser>) => void;
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

  // Active authenticated user
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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

  // Verify active session on mount
  useEffect(() => {
    const verifyCurrentSession = async () => {
      try {
        const resp = await fetch('/api/auth/me');
        if (resp.ok) {
          const data = await resp.json();
          if (data.authenticated && data.user) {
            let user = allUsers.find(u => u.id === data.user.id || u.email.toLowerCase() === data.user.email.toLowerCase());
            if (!user) {
              user = {
                id: data.user.id,
                name: data.user.name,
                email: data.user.email,
                status: 'ACTIVE',
                emailVerified: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString(),
                department: data.user.department,
                authorizedWorkspaces: data.authorizedWorkspaces,
              };
              setAllUsers(prev => [user!, ...prev]);
            }
            setCurrentUserId(data.user.id);
            setIsAuthenticated(true);
            if (data.authorizedWorkspaces && Array.isArray(data.authorizedWorkspaces)) {
              setAuthorizedWorkspaces(data.authorizedWorkspaces);
              if (!data.authorizedWorkspaces.includes(currentWorkspace)) {
                setCurrentWorkspace(data.authorizedWorkspaces[0]);
              }
            }
            return;
          }
        }
      } catch {
        // Not authenticated
      }
      setIsAuthenticated(false);
      setCurrentUserId(null);
    };
    verifyCurrentSession();
  }, []);

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

  /**
   * REST Backend Login (POST /api/auth/login) - Strictly Authoritative
   */
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
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data.success && data.user) {
        let user = allUsers.find(u => u.id === data.user.id || u.email.toLowerCase() === email.trim().toLowerCase());
        if (!user) {
          user = {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            status: 'ACTIVE',
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            department: data.user.department,
            authorizedWorkspaces: data.authorizedWorkspaces,
          };
          setAllUsers(prev => [user!, ...prev]);
        }

        setCurrentUserId(user.id);

        if (data.authorizedWorkspaces && Array.isArray(data.authorizedWorkspaces)) {
          setAuthorizedWorkspaces(data.authorizedWorkspaces);
          setCurrentWorkspace(data.authorizedWorkspaces[0]);
        }

        setIsAuthenticated(true);
        if (data.token) {
          localStorage.setItem('auth_token', data.token);
        }

        return {
          success: true,
          message: data.message,
          roleKey: data.role as 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin',
          authorizedWorkspaces: data.authorizedWorkspaces,
          user,
        };
      } else {
        setIsAuthenticated(false);
        setCurrentUserId(null);
        return {
          success: false,
          message: data.message || 'Invalid institutional credentials. Please check your email and password.',
        };
      }
    } catch {
      setIsAuthenticated(false);
      setCurrentUserId(null);
      return {
        success: false,
        message: 'Network error connecting to authentication service.',
      };
    }
  };

  /**
   * Google Workspace Sign-In (POST /api/auth/google/signin)
   */
  const loginWithGoogle = async (
    email: string,
    name?: string
  ): Promise<{
    success: boolean;
    message: string;
    roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin';
    authorizedWorkspaces?: WorkspaceType[];
    user?: AuthUser;
  }> => {
    try {
      const resp = await fetch('/api/auth/google/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), name }),
      });

      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data.success && data.user) {
        let user = allUsers.find(u => u.id === data.user.id || u.email.toLowerCase() === email.trim().toLowerCase());
        if (!user) {
          user = {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            status: 'ACTIVE',
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            department: data.user.department,
            authorizedWorkspaces: data.authorizedWorkspaces,
          };
          setAllUsers(prev => [user!, ...prev]);
        }

        setCurrentUserId(user.id);

        if (data.authorizedWorkspaces && Array.isArray(data.authorizedWorkspaces)) {
          setAuthorizedWorkspaces(data.authorizedWorkspaces);
          setCurrentWorkspace(data.authorizedWorkspaces[0]);
        }

        setIsAuthenticated(true);
        if (data.token) {
          localStorage.setItem('auth_token', data.token);
        }

        return {
          success: true,
          message: data.message,
          roleKey: data.role as 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin',
          authorizedWorkspaces: data.authorizedWorkspaces,
          user,
        };
      } else {
        setIsAuthenticated(false);
        setCurrentUserId(null);
        return {
          success: false,
          message: data.message || 'Google authentication failed.',
        };
      }
    } catch {
      setIsAuthenticated(false);
      setCurrentUserId(null);
      return {
        success: false,
        message: 'Could not connect to Google authentication provider.',
      };
    }
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

  /**
   * One-Click Secure Demo Authentication
   */
  const loginAsDemoRole = async (
    roleKey: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin'
  ): Promise<{
    success: boolean;
    message: string;
    roleKey?: 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin';
    authorizedWorkspaces?: WorkspaceType[];
    user?: AuthUser;
  }> => {
    try {
      const resp = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ roleKey }),
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success && data.user) {
        let user = allUsers.find(u => u.id === data.user.id || u.email.toLowerCase() === data.user.email.toLowerCase());
        if (!user) {
          user = {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            status: 'ACTIVE',
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            department: data.user.department,
            authorizedWorkspaces: data.authorizedWorkspaces,
            isDemoUser: true,
          };
          setAllUsers(prev => [user!, ...prev]);
        }

        setCurrentUserId(user.id);

        if (data.authorizedWorkspaces && Array.isArray(data.authorizedWorkspaces)) {
          setAuthorizedWorkspaces(data.authorizedWorkspaces);
          setCurrentWorkspace(data.authorizedWorkspaces[0]);
        }

        setIsAuthenticated(true);
        if (data.token) {
          localStorage.setItem('auth_token', data.token);
        }

        return {
          success: true,
          message: data.message,
          roleKey: data.role as 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin',
          authorizedWorkspaces: data.authorizedWorkspaces,
          user,
        };
      } else {
        setIsAuthenticated(false);
        setCurrentUserId(null);
        return {
          success: false,
          message: data.message || 'Demo authentication failed.',
        };
      }
    } catch {
      setIsAuthenticated(false);
      setCurrentUserId(null);
      return {
        success: false,
        message: 'Could not connect to demo authentication service.',
      };
    }
  };

  /**
   * Reset Demo Data
   */
  const resetDemoData = async (): Promise<{ success: boolean; message: string }> => {
    try {
      await fetch('/api/demo/reset', { method: 'POST' });
    } catch {
      // ignore
    }
    return {
      success: true,
      message: 'Demo dataset restored to initial state.',
    };
  };

  /**
   * REST Backend Forgot Password (POST /api/auth/forgot-password)
   */
  const requestPasswordReset = async (
    email: string
  ): Promise<{
    success: boolean;
    message: string;
    resetToken?: string;
  }> => {
    try {
      const resp = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await resp.json();
      return {
        success: true,
        message: data.message || 'If an account exists for this email, a password reset link has been sent.',
        resetToken: data.resetToken,
      };
    } catch {
      return {
        success: true,
        message: 'If an account exists for this email, a password reset link has been sent.',
      };
    }
  };

  /**
   * REST Backend Validate Token (GET /api/auth/validate-token)
   */
  const validateResetToken = async (
    token: string
  ): Promise<{ valid: boolean; email?: string; message?: string }> => {
    try {
      const resp = await fetch(`/api/auth/validate-token?token=${encodeURIComponent(token)}`);
      const data = await resp.json();
      return {
        valid: data.valid,
        email: data.email,
        message: data.message,
      };
    } catch {
      return { valid: false, message: 'Could not reach token verification service.' };
    }
  };

  /**
   * REST Backend Reset Password (POST /api/auth/reset-password)
   */
  const resetPassword = async (
    token: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const resp = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await resp.json();
      return {
        success: data.success,
        message: data.message,
      };
    } catch {
      return {
        success: false,
        message: 'Network error resetting password.',
      };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setIsAuthenticated(false);
    setCurrentUserId(null);
    setAuthorizedWorkspaces(['Student']);
    setCurrentWorkspace('Student');
    
    // Clear user tokens from storage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('app_session_token');
    sessionStorage.clear();
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

  const updateUserProfile = (userId: string, updates: Partial<AuthUser>) => {
    setAllUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, ...updates, updatedAt: new Date().toISOString() } : u))
    );
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
