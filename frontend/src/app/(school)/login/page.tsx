'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Field, useSubmit } from '@/components/ui';

/**
 * School Management System sign-in (Application B).
 * Platform accounts fail here with the same generic message as bad
 * credentials — this application does not acknowledge the platform exists.
 */
export default function SchoolLoginPage() {
  const { loginSchool } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { busy, error, submit } = useSubmit(async () => {
    await loginSchool(email, password);
    router.replace('/dashboard');
  });

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>School Portal</h1>
        <p className="sub">Sign in to your school management system</p>
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
