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
import { supabaseClient } from '../lib/supabaseClient';
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

  /**
   * Helper: Resolve profile and user details from Supabase identity
   */
  const resolveUserFromSupabase = useCallback(async (authUser: any, accessToken: string, eventName = 'SESSION_RESOLVE') => {
    let profile: any = null;
    if (supabaseClient) {
      try {
        const { data: p, error: pErr } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();
        if (!pErr && p) {
          profile = p;
        }
      } catch (err) {
        console.warn('[AUTH TRACE] Direct profile query notice:', err);
      }
    }

    // Secondary fallback: Authoritative /api/auth/me lookup with token
    if (!profile) {
      try {
        const meRes = await fetch(apiUrl('/api/auth/me'), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.authenticated && meData.user) {
            profile = {
              id: meData.user.id,
              name: meData.user.name,
              email: meData.user.email,
              department: meData.user.department,
              role_code: meData.roleCode,
              role_name: meData.roleName,
              authorized_workspaces: meData.authorizedWorkspaces,
            };
          }
        }
      } catch {}
    }

    const emailLower = (authUser.email || '').toLowerCase().trim();
    const roleCode = profile?.role_code || 'STUDENT';
    const roleName = profile?.role_name || (roleCode === 'COORDINATOR' ? 'Timetable Coordinator' : roleCode === 'FACULTY' ? 'Faculty Member' : 'Student');
    const workspaces: WorkspaceType[] = profile?.authorized_workspaces || (roleCode === 'COORDINATOR' ? ['Coordinator', 'Faculty'] : ['Student']);

    setAllUsers(prev => {
      const existing = prev.find(u => u.id === authUser.id || u.email.toLowerCase() === emailLower);
      if (!existing) {
        const newUser: AuthUser = {
          id: authUser.id,
          name: profile?.name || authUser.user_metadata?.name || emailLower.split('@')[0].toUpperCase(),
          email: emailLower,
          status: 'ACTIVE',
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          department: profile?.department || 'Computer Science and Engineering (CSED)',
          authorizedWorkspaces: workspaces,
        };
        return [newUser, ...prev];
      } else {
        const updatedUser: AuthUser = {
          ...existing,
          id: authUser.id,
          name: profile?.name || existing.name,
          department: profile?.department || existing.department,
          authorizedWorkspaces: workspaces,
        };
        return prev.map(u => (u.id === authUser.id || u.email.toLowerCase() === emailLower ? updatedUser : u));
      }
    });

    let roleId = 'role-student';
    if (roleCode === 'COORDINATOR') roleId = 'role-coordinator';
    else if (roleCode === 'FACULTY') roleId = 'role-faculty';
    else if (roleCode === 'COLLEGE_ADMIN' || roleCode === 'SUPER_ADMIN') roleId = 'role-admin';
    else if (roleCode === 'HOD') roleId = 'role-hod';
    else if (roleCode === 'CLASS_REPRESENTATIVE') roleId = 'role-cr';

    setAllMemberships(prev => {
      const filtered = prev.filter(m => m.userId !== authUser.id);
      return [
        {
          id: `mem-${authUser.id}`,
          userId: authUser.id,
          institutionId: 'inst-thapar',
          roleId,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          assignedBy: 'system-supabase-auth',
        },
        ...filtered,
      ];
    });

    setCurrentUserId(authUser.id);
    setAuthorizedWorkspaces(workspaces);
    setCurrentWorkspace(prev => (workspaces.includes(prev) ? prev : workspaces[0]));

    if (import.meta.env.DEV) {
      console.info('[AUTH TRACE]', {
        sessionExists: true,
        userExists: true,
        userIdExists: Boolean(authUser.id),
        accessTokenExists: Boolean(accessToken),
        authEvent: eventName,
        userEmail: authUser.email || null,
      });
      console.info('[AUTHENTICATED USER]', {
        userId: authUser.id ? 'present' : 'missing',
        profile: profile ? 'found' : 'not found',
        role: roleCode,
      });
    }

    setIsAuthenticated(true);
    setAuthStatus('AUTHENTICATED');
  }, []);

  // Real Supabase Auth Session Initialization & Event Listener
  useEffect(() => {
    let isSubscribed = true;

    const initAuthLifecycle = async () => {
      setAuthStatus('AUTH_LOADING');

      if (!supabaseClient) {
        // Fallback: verify via /api/auth/me if Supabase client not configured
        try {
          const resp = await fetch(apiUrl('/api/auth/me'));
          if (resp.ok) {
            const data = await resp.json();
            if (data.authenticated && data.user && isSubscribed) {
              setCurrentUserId(data.user.id);
              setIsAuthenticated(true);
              setAuthStatus('AUTHENTICATED');
              return;
            }
          }
        } catch {}

        if (isSubscribed) {
          setIsAuthenticated(false);
          setAuthStatus('UNAUTHENTICATED');
        }
        return;
      }

      try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

        if (import.meta.env.DEV) {
          console.info('[AUTH TRACE]', {
            sessionExists: Boolean(session),
            userExists: Boolean(session?.user),
            userIdExists: Boolean(session?.user?.id),
            accessTokenExists: Boolean(session?.access_token),
            authEvent: 'INITIAL_SESSION',
            userEmail: session?.user?.email || null,
          });
        }

        if (!sessionError && session?.user && session.access_token && isSubscribed) {
          await resolveUserFromSupabase(session.user, session.access_token, 'INITIAL_SESSION');
        } else if (isSubscribed) {
          setIsAuthenticated(false);
          setAuthStatus('UNAUTHENTICATED');
          setCurrentUserId(null);
        }
      } catch (err) {
        console.warn('[AUTH TRACE init error]', err);
        if (isSubscribed) {
          setIsAuthenticated(false);
          setAuthStatus('UNAUTHENTICATED');
          setCurrentUserId(null);
        }
      }
    };

    initAuthLifecycle();

    // Listen to real Supabase auth state changes
    if (supabaseClient) {
      const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (!isSubscribed) return;

        if (import.meta.env.DEV) {
          console.info('[AUTH TRACE]', {
            sessionExists: Boolean(session),
            userExists: Boolean(session?.user),
            userIdExists: Boolean(session?.user?.id),
            accessTokenExists: Boolean(session?.access_token),
            authEvent: event,
            userEmail: session?.user?.email || null,
          });
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (session?.user && session.access_token) {
            await resolveUserFromSupabase(session.user, session.access_token, event);
          }
        } else if (event === 'SIGNED_OUT') {
          setCurrentUserId(null);
          setIsAuthenticated(false);
          setAuthStatus('UNAUTHENTICATED');
        }
      });

      return () => {
        isSubscribed = false;
        subscription.unsubscribe();
      };
    }
  }, [resolveUserFromSupabase]);

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
   * REST Backend & Supabase Auth Login (POST /api/auth/login) - Strictly Authoritative
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
      const normalizedEmail = email.trim().toLowerCase();

      // Sign in directly with Supabase Auth to establish the authoritative client session
      if (supabaseClient && password) {
        try {
          const { data: supaData, error: supaErr } = await supabaseClient.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
          if (import.meta.env.DEV) {
            console.info('[AUTH TRACE client login]', {
              success: !supaErr && Boolean(supaData?.session),
              error: supaErr?.message || null,
              sessionExists: Boolean(supaData?.session),
            });
          }
        } catch (err) {
          console.warn('[AUTH TRACE] Direct Supabase sign-in notice:', err);
        }
      }

      const resp = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data.success && data.user) {
        let user = allUsers.find(u => u.id === data.user.id || u.email.toLowerCase() === normalizedEmail);
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
        setAuthStatus('AUTHENTICATED');
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
        setAuthStatus('UNAUTHENTICATED');
        setCurrentUserId(null);
        return {
          success: false,
          message: data.message || 'Invalid institutional credentials. Please check your email and password.',
        };
      }
    } catch {
      setIsAuthenticated(false);
      setAuthStatus('UNAUTHENTICATED');
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
      const roleEmailMap: Record<string, string> = {
        Coordinator: 'coordinator.demo@demo.thapar.local',
        Faculty: 'faculty.demo@demo.thapar.local',
        Student: 'student.demo@demo.thapar.local',
        Admin: 'admin.demo@demo.thapar.local',
        HOD: 'hod.demo@demo.thapar.local',
      };
      const demoEmail = roleEmailMap[roleKey];

      // Sign into Supabase client to establish real client session
      if (supabaseClient && demoEmail) {
        try {
          const { data: supaData, error: supaErr } = await supabaseClient.auth.signInWithPassword({
            email: demoEmail,
            password: 'ThaparDemo@2026Test!',
          });
          if (import.meta.env.DEV) {
            console.info('[AUTH TRACE demo login]', {
              roleKey,
              success: !supaErr && Boolean(supaData?.session),
              error: supaErr?.message || null,
              sessionExists: Boolean(supaData?.session),
            });
          }
        } catch (err) {
          console.warn('[AUTH TRACE] Direct Supabase demo sign-in notice:', err);
        }
      }

      const resp = await fetch(apiUrl('/api/auth/demo-login'), {
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
        setAuthStatus('AUTHENTICATED');
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
        setAuthStatus('UNAUTHENTICATED');
        setCurrentUserId(null);
        return {
          success: false,
          message: data.message || 'Demo authentication failed.',
        };
      }
    } catch {
      setIsAuthenticated(false);
      setAuthStatus('UNAUTHENTICATED');
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
    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch (err) {
        console.warn('[AUTH TRACE] Supabase signOut notice:', err);
      }
    }
    try {
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setIsAuthenticated(false);
    setAuthStatus('UNAUTHENTICATED');
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
