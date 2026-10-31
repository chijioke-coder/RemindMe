import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { naira } from '../lib/format';

export default function Layout() {
  const { profile, balanceKobo, settings, signOut, session } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const close = () => setOpen(false);
  const site = settings?.site_name ?? 'PaBs Media';
  const wa = settings?.support_whatsapp?.replace(/\D/g, '');

  const links = (
    <>
      <NavLink to="/" end onClick={close}>Home</NavLink>
      <NavLink to="/products" onClick={close}>Products</NavLink>
      {session && <NavLink to="/account" onClick={close}>My account</NavLink>}
      {session && <NavLink to="/orders" onClick={close}>Orders</NavLink>}
      {session && <NavLink to="/wallet" onClick={close}>Wallet</NavLink>}
      <NavLink to="/support" onClick={close}>Support</NavLink>
      {profile?.role === 'admin' && <NavLink to="/admin" onClick={close}>Owner dashboard</NavLink>}
    </>
  );

  return (
    <>
      {settings?.announcement && <div className="strip">{settings.announcement}</div>}
      {settings?.purchases_paused && (
        <div className="strip red">{settings.pause_reason || 'Purchases are paused for a short while.'}</div>
      )}
      <header className="topbar">
        <div className="shell">
          <Link to="/" className="brand">PaBs<b>.</b>Media</Link>
          <nav className="nav">{links}</nav>
          {session ? (
            <Link to="/wallet" className="wallet-chip">{naira(balanceKobo)}</Link>
          ) : (
            <Link to="/login" className="wallet-chip">Sign in</Link>
          )}
          <button className="burger" aria-label="Menu" onClick={() => setOpen(!open)}>{open ? '×' : '≡'}</button>
        </div>
        {open && (
          <div className="drawer">
            {links}
            {session ? (
              <button className="link" onClick={async () => { close(); await signOut(); nav('/'); }}>Sign out</button>
            ) : (
              <>
                <Link to="/login" onClick={close}>Sign in</Link>
                <Link to="/signup" onClick={close}>Create account</Link>
              </>
            )}
          </div>
        )}
      </header>
      <main className="shell page"><Outlet /></main>
      <footer className="foot">
        <div className="shell row wrap between">
          <span>© {new Date().getFullYear()} {site}</span>
          <span className="row" style={{ gap: 16 }}>
            {session && <button className="btn sm ghost" style={{ color: '#fff', borderColor: '#3b4a57' }} onClick={() => signOut().then(() => nav('/'))}>Sign out</button>}
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp support</a>}
          </span>
        </div>
      </footer>
    </>
  );
}
