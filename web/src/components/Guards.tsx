import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <p className="muted">Loading…</p>;
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

/** Server-side security rules are the real lock; this only keeps non-owners out of the screens. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { profile, loading, session, authError, signOut } = useAuth();
  if (loading) return <p className="muted">Loading…</p>;
  if (!session) return <Navigate to="/login" state={{ from: '/admin' }} replace />;
  if (!profile) {
    return (
      <div className="panel stack">
        <h2>Could not load your account</h2>
        <p className="muted">{authError || 'Your profile was not found.'}</p>
        <button className="btn" onClick={() => signOut()}>Sign out and try again</button>
      </div>
    );
  }
  if (profile.role !== 'admin') {
    return (
      <div className="panel stack">
        <h2>Owner access only</h2>
        <p className="muted">You are signed in as {profile.email}, which is not the owner account.</p>
        <Link className="btn" to="/">Back to the store</Link>
      </div>
    );
  }
  return <>{children}</>;
}
