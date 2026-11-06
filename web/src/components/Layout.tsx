import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { naira } from '../lib/format';
import Icon from './Icon';

type Nav = { to: string; label: string; icon: string; end?: boolean; auth?: boolean };

const MAIN: Nav[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/products', label: 'Store', icon: 'store' },
  { to: '/account', label: 'My account', icon: 'user', auth: true },
  { to: '/orders', label: 'Orders', icon: 'package', auth: true },
  { to: '/wallet', label: 'Wallet', icon: 'wallet', auth: true },
  { to: '/referrals', label: 'Invite friends', icon: 'gift', auth: true },
  { to: '/support', label: 'Support', icon: 'help' },
];


export default function Layout() {
  const { profile, balanceKobo, settings, signOut, session } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('pabs_sidebar') === '1'; } catch { return false; }
  });
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const site = settings?.site_name ?? 'PaBs Media';
  const wa = settings?.support_whatsapp?.replace(/\D/g, '');

  useEffect(() => { setDrawer(false); }, [loc.pathname]);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('pabs_sidebar', next ? '1' : '0'); } catch { /* ignore */ }
  }

  const item = (n: Nav) => (
    <NavLink key={n.to} to={n.to} end={n.end} className="nav-item" title={n.label}>
      <Icon name={n.icon} />
      <span className="sb-label">{n.label}</span>
    </NavLink>
  );

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}${drawer ? ' drawer-open' : ''}`}>
      <aside className="sidebar" aria-label="Main menu">
        <div className="sb-head">
          <Link to="/" className="brand"><span className="brand-text">PaBs<b>.</b>Media</span></Link>
          <button className="sb-close only-mobile" aria-label="Close menu" onClick={() => setDrawer(false)}><Icon name="x" /></button>
        </div>

        <nav className="sb-nav">
          {MAIN.filter((n) => !n.auth || session).map(item)}
          {profile?.role === 'admin' && item({ to: '/admin', label: 'Owner dashboard', icon: 'grid' })}
        </nav>

        <div className="sb-foot">
          {session ? (
            <>
              <div className="sb-user">{profile?.email}</div>
              <button className="btn light sm sb-btn" onClick={async () => { await signOut(); nav('/'); }} title="Sign out">
                <Icon name="logout" size={18} /><span>Sign out</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn gold sm sb-btn" title="Sign in"><Icon name="login" size={18} /><span>Sign in</span></Link>
              <Link to="/signup" className="btn light sm sb-btn"><span>Create account</span></Link>
            </>
          )}
        </div>
      </aside>
      <div className="nav-scrim" onClick={() => setDrawer(false)} />

      <div className="main">
        {settings?.purchases_paused && (
          <div className="strip red">{settings.pause_reason || 'Purchases are paused for a short while.'}</div>
        )}
        <header className="topbar">
          <button className="icon-btn only-mobile" aria-label="Open menu" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
          <button className="icon-btn only-desktop" aria-label="Collapse or expand the sidebar" onClick={toggleCollapse}><Icon name="menu" /></button>
          <Link to="/" className="brand">PaBs<b style={{ color: 'var(--gold)' }}>.</b>Media</Link>
          {session ? (
            <Link to="/wallet" className="wallet-chip"><Icon name="wallet" size={17} />{naira(balanceKobo)}</Link>
          ) : (
            <Link to="/login" className="wallet-chip">Sign in</Link>
          )}
        </header>

        <main className="content"><Outlet /></main>

        <footer className="foot">
          <div className="row wrap between">
            <span>© {new Date().getFullYear()} {site}</span>
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp support</a>}
          </div>
        </footer>
      </div>
    </div>
  );
}
