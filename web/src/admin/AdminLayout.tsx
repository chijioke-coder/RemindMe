import { NavLink, Outlet } from 'react-router-dom';

const tabs: [string, string, boolean][] = [
  ['/admin', 'Overview', true],
  ['/admin/orders', 'Orders', false],
  ['/admin/products', 'Products', false],
  ['/admin/categories', 'Categories', false],
  ['/admin/customers', 'Customers', false],
  ['/admin/referrals', 'Referrals', false],
  ['/admin/activity', 'Activity', false],
  ['/admin/settings', 'Settings', false],
  ['/admin/test-lab', 'Test lab', false],
];

export default function AdminLayout() {
  return (
    <>
      <nav className="admin-nav">
        {tabs.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
      </nav>
      <Outlet />
    </>
  );
}
