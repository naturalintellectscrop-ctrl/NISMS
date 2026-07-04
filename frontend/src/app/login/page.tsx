'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Field, useSubmit } from '@/components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { busy, error, submit } = useSubmit(async () => {
    const user = await login(email, password);
    router.replace(user.role === 'SUPER_ADMIN' || user.role === 'SUPPORT_ADMIN' ? '/admin' : '/dashboard');
  });

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>NISMS</h1>
        <p className="sub">Natural Intellects School Management System</p>
        <form onSubmit={submit}>
          <Field label="Email address">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
