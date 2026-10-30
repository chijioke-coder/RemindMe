import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <p className="muted">Loading…</p>;
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

/** Server-side RLS is the real lock; this only keeps non-admins out of the screens. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { profile, loading, session } = useAuth();
  if (loading) return <p className="muted">Loading…</p>;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
