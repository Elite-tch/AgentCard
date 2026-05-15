// Auth gate: email + password login (default), magic link (alternative),
// and email + password sign-up. Uses better-auth client SDK.
// On success we redirect to the dashboard overview.

'use client';

import { useState } from 'react';
import { Button } from '../_ui/Button';
import { Input } from '../_ui/Input';
import { Wordmark } from '@/app/components/Wordmark';
import { authClient } from '@/lib/auth-client';

type Stage = 'login' | 'signup' | 'magic' | 'magic-sent';

export function AuthGate() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithPassword() {
    setError(null);
    setBusy(true);
    try {
      const { error: authError } = await authClient.signIn.email({
        email,
        password,
      });
      if (authError) {
        console.log(authError);
        throw new Error(authError.message || 'Invalid credentials');
      }
      window.location.href = '/dashboard/overview';
    } catch (err) {
      console.log(err);
      setError((err as Error).message || 'Failed to sign in');
    } finally {
      setBusy(false);
    }
  }

  async function signUp() {
    setError(null);
    setBusy(true);
    try {
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }
      const { error: authError } = await authClient.signUp.email({
        email,
        password,
        name: name || email.split('@')[0] || "operator",
      });
      if (authError) throw new Error(authError.message || 'Failed to create account');
      window.location.href = '/dashboard/overview';
    } catch (err) {
      setError((err as Error).message || 'Failed to create account');
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    setError(null);
    setBusy(true);
    try {
      const { error: authError } = await authClient.signIn.magicLink({
        email,
        callbackURL: '/dashboard/overview',
      });
      if (authError) throw new Error(authError.message || 'Failed to send magic link');
      setStage('magic-sent');
    } catch (err) {
      setError((err as Error).message || 'Failed to send link');
    } finally {
      setBusy(false);
    }
  }

  function switchStage(next: Stage) {
    setError(null);
    setPassword('');
    setName('');
    setStage(next);
  }

  const linkStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--fg-dim)',
    fontSize: '0.72rem',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '2rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          style={{
            marginBottom: '0.5rem',
            color: 'var(--fg)',
          }}
        >
          <Wordmark height={22} />
        </div>
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--fg-dim)',
            marginBottom: '1.5rem',
          }}
        >
          {stage === 'signup'
            ? 'Create your operator account'
            : 'Sign in to your operator dashboard'}
        </div>

        {/* ── Login (default) ─────────────────────────────────── */}
        {stage === 'login' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && email && password) signInWithPassword();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
          >
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !email || !password}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '0.25rem',
              }}
            >
              <button
                type="button"
                onClick={() => switchStage('magic')}
                style={linkStyle}
              >
                Use magic link
              </button>
              <button
                type="button"
                onClick={() => switchStage('signup')}
                style={linkStyle}
              >
                Create account
              </button>
            </div>
          </form>
        )}

        {/* ── Sign Up ─────────────────────────────────────────── */}
        {stage === 'signup' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && email && password) signUp();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
          >
            <Input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !email || !password}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {busy ? 'Creating account…' : 'Create account'}
            </Button>

            <button
              type="button"
              onClick={() => switchStage('login')}
              style={linkStyle}
            >
              ← Back to sign in
            </button>
          </form>
        )}

        {/* ── Magic Link ──────────────────────────────────────── */}
        {stage === 'magic' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && email) sendMagicLink();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
          >
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !email}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {busy ? 'Sending…' : 'Send sign-in link'}
            </Button>

            <button
              type="button"
              onClick={() => switchStage('login')}
              style={linkStyle}
            >
              ← Back to password sign in
            </button>
          </form>
        )}

        {/* ── Magic Link Sent ─────────────────────────────────── */}
        {stage === 'magic-sent' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--fg-dim)',
                lineHeight: 1.5,
              }}
            >
              Check your inbox — we sent a sign-in link to{' '}
              <strong style={{ color: 'var(--fg)' }}>{email}</strong>
            </div>
            <button
              type="button"
              onClick={() => switchStage('login')}
              style={linkStyle}
            >
              ← Back to sign in
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: '0.85rem',
              fontSize: '0.72rem',
              color: 'var(--red)',
              padding: '0.55rem 0.7rem',
              background: 'var(--red-muted)',
              border: '1px solid var(--red-border)',
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
