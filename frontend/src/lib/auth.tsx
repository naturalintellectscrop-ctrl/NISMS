'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

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

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  schoolId: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  school: { id: string; name: string; logoUrl?: string | null } | null;
  features: Record<string, boolean> | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
  hasFeature: (key: string) => boolean;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [school, setSchool] = useState<AuthState['school']>(null);
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !localStorage.getItem('nisms_token')) {
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ user: AuthUser; school: AuthState['school']; features: Record<string, boolean> | null }>('/api/auth/me');
      setUser(data.user);
      setSchool(data.school);
      setFeatures(data.features);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ token: string; user: AuthUser; features: Record<string, boolean> | null }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    localStorage.setItem('nisms_token', data.token);
    setUser(data.user);
    setFeatures(data.features);
    await new Promise((r) => setTimeout(r, 0));
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('nisms_token');
    localStorage.removeItem('nisms_active_school');
    setUser(null);
    setSchool(null);
    setFeatures(null);
    window.location.href = '/login';
  }, []);

  const hasFeature = useCallback(
    (key: string) => {
      // Platform admins bypass feature gating in the UI; backend still enforces.
      if (user && (user.role === 'SUPER_ADMIN' || user.role === 'SUPPORT_ADMIN')) return true;
      return features?.[key] === true;
    },
    [features, user]
  );

  const hasRole = useCallback(
    (...roles: Role[]) => {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;
      return roles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, school, features, loading, login, logout, refresh, hasFeature, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
