import { Outlet } from 'react-router-dom';

/** Owner navigation now lives in the sidebar, so this just shows the page. */
export default function AdminLayout() {
  return <Outlet />;
}
