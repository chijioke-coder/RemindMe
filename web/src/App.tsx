import { Navigate, Route, Routes } from 'react-router-dom';
import { configured } from './lib/supabase';
import Layout from './components/Layout';
import { RequireAdmin, RequireAuth } from './components/Guards';
import Home from './pages/Home';
import Products from './pages/Products';
import Auth from './pages/Auth';
import Wallet from './pages/Wallet';
import Orders from './pages/Orders';
import Support from './pages/Support';
import Account from './pages/Account';
import OrderDetail from './pages/OrderDetail';
import Numbers from './pages/Numbers';
import AdminNumbers from './admin/AdminNumbers';
import Referrals from './pages/Referrals';
import AdminLayout from './admin/AdminLayout';
import Overview from './admin/Overview';
import AdminProducts from './admin/AdminProducts';
import AdminCategories from './admin/AdminCategories';
import AdminOrders from './admin/AdminOrders';
import AdminCustomers from './admin/AdminCustomers';
import AdminActivity from './admin/AdminActivity';
import AdminSettings from './admin/AdminSettings';
import TestLab from './admin/TestLab';
import AdminReferrals from './admin/AdminReferrals';

export default function App() {
  if (!configured) {
    return (
      <div className="content">
        <div className="panel stack">
          <h2>Setup needed</h2>
          <p>Create <b>web/.env</b> from <b>.env.example</b> and add your Supabase URL and anon key, then restart.</p>
        </div>
      </div>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="products" element={<Products />} />
        <Route path="login" element={<Auth mode="login" />} />
        <Route path="signup" element={<Auth mode="signup" />} />
        <Route path="support" element={<Support />} />
        <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="wallet" element={<RequireAuth><Wallet /></RequireAuth>} />
        <Route path="orders" element={<RequireAuth><Orders /></RequireAuth>} />
        <Route path="orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
        <Route path="numbers" element={<Numbers />} />
        <Route path="referrals" element={<RequireAuth><Referrals /></RequireAuth>} />
        <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Overview />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="referrals" element={<AdminReferrals />} />
          <Route path="numbers" element={<AdminNumbers />} />
          <Route path="activity" element={<AdminActivity />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="test-lab" element={<TestLab />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
