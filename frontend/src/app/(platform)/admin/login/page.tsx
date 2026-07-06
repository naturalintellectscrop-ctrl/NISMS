'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Field, useSubmit } from '@/components/ui';

/**
 * Natural Intellects Platform sign-in (Application A).
 * Staff-only entry point, separate from every school portal.
 */
export default function PlatformLoginPage() {
  const { loginPlatform } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { busy, error, submit } = useSubmit(async () => {
    await loginPlatform(email, password);
    router.replace('/admin');
  });

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Natural Intellects</h1>
        <p className="sub">Control Center — staff sign-in</p>
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
