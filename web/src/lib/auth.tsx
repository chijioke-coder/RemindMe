import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Profile = { id: string; email: string; full_name: string | null; role: 'customer' | 'admin'; is_suspended: boolean };
export type PublicSettings = { site_name: string; announcement: string | null; support_whatsapp: string | null; purchases_paused: boolean; pause_reason: string | null };

type Ctx = {
  session: Session | null;
  profile: Profile | null;
  balanceKobo: number;
  settings: PublicSettings | null;
  loading: boolean;
  authError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  session: null, profile: null, balanceKobo: 0, settings: null, loading: true, authError: null,
  refresh: async () => {}, signOut: async () => {},
});
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [balanceKobo, setBalance] = useState(0);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const lastUser = useRef<string | null | undefined>(undefined);

  const load = useCallback(async (s: Session | null) => {
    try {
      const { data: st } = await supabase.from('public_settings').select('*').maybeSingle();
      setSettings(st as PublicSettings | null);
      if (!s) {
        setProfile(null);
        setBalance(0);
        setAuthError(null);
        return;
      }
      const [p, w] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
        supabase.from('wallets').select('balance_kobo').eq('user_id', s.user.id).maybeSingle(),
      ]);
      setAuthError(p.error?.message ?? null);
      setProfile((p.data as Profile | null) ?? null);
      setBalance(Number(w.data?.balance_kobo ?? 0));
    } catch (e) {
      setAuthError(String(e));
    }
  }, []);

  useEffect(() => {
    const safety = setTimeout(() => setLoading(false), 6000);
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      const id = s?.user.id ?? null;
      const changed = lastUser.current === undefined || id !== lastUser.current;
      lastUser.current = id;
      if (changed) setLoading(true);
      // Run the queries outside this callback: calling Supabase inside it can deadlock the sign-in lock.
      setTimeout(async () => {
        await load(s);
        setLoading(false);
      }, 0);
    });
    return () => {
      clearTimeout(safety);
      sub.subscription.unsubscribe();
    };
  }, [load]);

  // keep the wallet balance fresh without a page reload: every 5 seconds while the tab is visible,
  // and straight away when the person comes back to the tab
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data } = await supabase.from('wallets').select('balance_kobo').eq('user_id', uid).maybeSingle();
      if (data) setBalance(Number(data.balance_kobo));
    };
    const timer = setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [session?.user.id]);

  const refresh = useCallback(() => load(session), [load, session]);
  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  return (
    <AuthCtx.Provider value={{ session, profile, balanceKobo, settings, loading, authError, refresh, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
