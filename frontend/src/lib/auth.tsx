'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getSchoolContext, setSchoolContext } from './api';

export type Role =
  | 'SUPER_ADMIN'
  | 'SUPPORT_ADMIN'
  | 'SCHOOL_ADMIN'
  | 'PROPRIETOR'
  | 'HEAD_TEACHER'
  | 'SECRETARY'
  | 'BURSAR'
  | 'TEACHER'
  | 'STUDENT';

export type Audience = 'nisms:school' | 'nisms:platform';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  schoolId: string | null;
  audience: Audience;
}

export interface SchoolBranding {
  id: string;
  name: string;
  logoUrl?: string | null;
  settings?: {
    motto?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    footerText?: string | null;
    currency?: string;
  } | null;
}

export interface AuthState {
  user: AuthUser | null;
  school: SchoolBranding | null;
  features: Record<string, boolean> | null;
  loading: boolean;
  /** Platform staff only: the school workspace currently being viewed. */
  schoolContext: SchoolBranding | null;
  loginSchool: (email: string, password: string) => Promise<AuthUser>;
  loginPlatform: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
  enterSchoolContext: (schoolId: string) => void;
  exitSchoolContext: () => void;
  hasFeature: (key: string) => boolean;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [school, setSchool] = useState<SchoolBranding | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  const [schoolContext, setSchoolContextState] = useState<SchoolBranding | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !localStorage.getItem('nisms_token')) {
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ user: AuthUser; school: SchoolBranding | null; features: Record<string, boolean> | null }>(
        '/api/auth/me'
      );
      setUser(data.user);
      setSchool(data.school);
      setFeatures(data.features);

      // Platform staff with an open School Context: load that school's real
      // profile and feature map so the workspace reflects the actual plan.
      if (data.user.audience === 'nisms:platform' && getSchoolContext()) {
        try {
          const ctx = await api<SchoolBranding & { features: Record<string, boolean> }>('/api/school');
          const { features: ctxFeatures, ...ctxSchool } = ctx;
          setSchoolContextState(ctxSchool);
          setFeatures(ctxFeatures);
        } catch {
          setSchoolContext(null);
          setSchoolContextState(null);
        }
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doLogin = useCallback(
    async (path: string, email: string, password: string) => {
      const data = await api<{ token: string; user: AuthUser }>(path, { method: 'POST', body: { email, password } });
      localStorage.setItem('nisms_token', data.token);
      await refresh();
      return data.user;
    },
    [refresh]
  );

  const loginSchool = useCallback(
    (email: string, password: string) => doLogin('/api/auth/login', email, password),
    [doLogin]
  );
  const loginPlatform = useCallback(
    (email: string, password: string) => doLogin('/api/admin/auth/login', email, password),
    [doLogin]
  );

  const logout = useCallback(() => {
    const wasPlatform = user?.audience === 'nisms:platform';
    localStorage.removeItem('nisms_token');
    setSchoolContext(null);
    setUser(null);
    setSchool(null);
    setFeatures(null);
    setSchoolContextState(null);
    window.location.href = wasPlatform ? '/admin/login' : '/login';
  }, [user]);

  const enterSchoolContext = useCallback((schoolId: string) => {
    setSchoolContext(schoolId);
    window.location.href = '/dashboard';
  }, []);

  const exitSchoolContext = useCallback(() => {
    setSchoolContext(null);
    setSchoolContextState(null);
    window.location.href = '/admin';
  }, []);

  const hasFeature = useCallback((key: string) => features?.[key] === true, [features]);

  const hasRole = useCallback(
    (...roles: Role[]) => {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;
      return roles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        school,
        features,
        loading,
        schoolContext,
        loginSchool,
        loginPlatform,
        logout,
        refresh,
        enterSchoolContext,
        exitSchoolContext,
        hasFeature,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function isPlatformUser(user: AuthUser | null): boolean {
  return user?.audience === 'nisms:platform';
}
