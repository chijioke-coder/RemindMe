import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
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
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  session: null, profile: null, balanceKobo: 0, settings: null, loading: true,
  refresh: async () => {}, signOut: async () => {},
});
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [balanceKobo, setBalance] = useState(0);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    const { data: st } = await supabase.from('public_settings').select('*').maybeSingle();
    setSettings(st as PublicSettings | null);
    if (!s) {
      setProfile(null);
      setBalance(0);
      return;
    }
    const [{ data: p }, { data: w }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('wallets').select('balance_kobo').eq('user_id', s.user.id).maybeSingle(),
    ]);
    setProfile(p as Profile | null);
    setBalance(Number(w?.balance_kobo ?? 0));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(() => load(session), [load, session]);
  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  return (
    <AuthCtx.Provider value={{ session, profile, balanceKobo, settings, loading, refresh, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
