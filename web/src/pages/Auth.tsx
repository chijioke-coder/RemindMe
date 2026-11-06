import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { naira } from '../lib/format';
import Icon from '../components/Icon';

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const from = (loc.state as { from?: string } | null)?.from ?? '/account';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => {
    try { return (params.get('ref') ?? localStorage.getItem('pabs_ref') ?? '').toUpperCase(); } catch { return ''; }
  });
  const [codeMsg, setCodeMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // remember an invite link so the code survives moving between pages
  useEffect(() => {
    const r = params.get('ref');
    if (r) { try { localStorage.setItem('pabs_ref', r.toUpperCase()); } catch { /* ignore */ } }
  }, [params]);

  async function checkCode(value: string) {
    if (!value.trim()) return setCodeMsg(null);
    const { data } = await supabase.rpc('check_code', { p_code: value });
    const k = (data as { kind?: string; bonus_kobo?: number } | null)?.kind;
    if (k === 'promo') setCodeMsg({ kind: 'good', text: `Promo code accepted. You will get ${naira((data as { bonus_kobo: number }).bonus_kobo)} in your wallet when you sign up.` });
    else if (k === 'referral') setCodeMsg({ kind: 'good', text: 'Invite code accepted. Welcome!' });
    else setCodeMsg({ kind: 'bad', text: 'That code is not valid. You can still sign up without it.' });
  }
  useEffect(() => { if (mode === 'signup' && code) void checkCode(code); /* eslint-disable-next-line */ }, []);

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
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: name, ref_code: code.trim() } },
      });
      setBusy(false);
      if (error) return setError(error.message);
      try { localStorage.removeItem('pabs_ref'); } catch { /* ignore */ }
      if (data.session) nav(from, { replace: true });
      else setInfo('Account created. Check your email to confirm it, then sign in.');
    }
  }

  return (
    <form className="panel auth stack" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      {mode === 'signup' && (
        <label className="f"><span>Full name</span><input className="in" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      )}
      <label className="f"><span>Email</span><input className="in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="f"><span>Password</span>
        <div style={{ position: 'relative' }}>
          <input className="in" style={{ paddingRight: 52 }} type={showPw ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} title={showPw ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, border: 0, background: 'transparent', color: 'var(--mute)', display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 10 }}>
            <Icon name={showPw ? 'eye-off' : 'eye'} />
          </button>
        </div>
      </label>
      {mode === 'signup' && (
        <label className="f"><span>Invite or promo code (optional)</span>
          <input className="in" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onBlur={(e) => void checkCode(e.target.value)} autoCapitalize="characters" /></label>
      )}
      {codeMsg && <div className={`notice ${codeMsg.kind} small`}>{codeMsg.text}</div>}
      {error && <div className="notice bad">{error}</div>}
      {info && <div className="notice good">{info}</div>}
      <button className="btn block" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      <p className="muted small">
        {mode === 'login' ? <>New here? <Link to="/signup" state={{ from }}>Create an account</Link></> : <>Already registered? <Link to="/login" state={{ from }}>Sign in</Link></>}
      </p>
    </form>
  );
}
