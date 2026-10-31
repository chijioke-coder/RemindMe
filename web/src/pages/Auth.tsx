import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? '/account';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setError('Email or password is wrong.');
      void supabase.rpc('log_activity', { p_action: 'login', p_meta: {} });
      nav(from, { replace: true });
    } else {
      if (password.length < 8) { setBusy(false); return setError('Use a password with at least 8 characters.'); }
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      setBusy(false);
      if (error) return setError(error.message);
      if (data.session) nav(from, { replace: true });
      else setInfo('Account created. Check your email to confirm it, then sign in.');
    }
  }

  return (
    <form className="panel auth stack" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
      {mode === 'signup' && (
        <label className="f"><span>Full name</span><input className="in" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      )}
      <label className="f"><span>Email</span><input className="in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="f"><span>Password</span><input className="in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      {error && <div className="notice bad">{error}</div>}
      {info && <div className="notice good">{info}</div>}
      <button className="btn block" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      <p className="muted small">
        {mode === 'login' ? <>New here? <Link to="/signup" state={{ from }}>Create an account</Link></> : <>Already registered? <Link to="/login" state={{ from }}>Sign in</Link></>}
      </p>
    </form>
  );
}
