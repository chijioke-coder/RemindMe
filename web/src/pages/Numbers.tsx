import { Navigate } from 'react-router-dom';

/** virtual numbers now live on the shop page, together with everything else */
export default function Numbers() {
  return <Navigate to="/products?tab=numbers" replace />;
}
