import { AdminRouteDraftBlocker } from './AdminForm';
import { useAdminDraftNavigation } from './adminFormBehavior';
import { useContext, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, UNSAFE_DataRouterContext } from 'react-router-dom';
import { adminNavigation, adminSection } from '../../config/adminNavigation';
import { useAuth } from '../auth/AuthContext';
import { ProductManager } from './ProductManager';
import { InventoryManager } from './InventoryManager';
import { OrderManager, AdminOrderDetailPage } from './OrderManager';
import { MembershipManager } from './MembershipManager';
import { AdminProfile } from './AdminProfile';
import { AdminDashboard } from './AdminDashboard';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function AdminWorkspace({ token, role='legacy' }: { token: string; role?:'legacy'|'owner' }) {
  const workspace=useRef<HTMLDivElement>(null);const routerContext=useContext(UNSAFE_DataRouterContext);useAdminDraftNavigation(workspace,Boolean(routerContext));
  const { pathname } = useLocation();
  const section = adminSection(pathname);
  const { session, signOut, error } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [confirmOut,setConfirmOut]=useState(false);
  async function leave() {
    setSigningOut(true);
    try { await signOut(); } finally { setSigningOut(false); }
  }
  return <div className="admin-workspace" ref={workspace}>{routerContext&&<AdminRouteDraftBlocker root={workspace}/>}
    <aside className="admin-sidebar">
      <p className="admin-sidebar-label">Workspace</p>
      <nav className="admin-navigation" aria-label="Business administration">
        <ul>{adminNavigation.map(item => <li key={item.path}><NavLink to={item.path} end={item.path !== '/admin/orders'}>
          <span className="admin-nav-title">{item.title}</span><span className="admin-nav-summary">{item.summary}</span>
        </NavLink></li>)}</ul>
      </nav>
      <p className="admin-sidebar-note">One workspace for your business.</p>
    </aside>
    <div className="admin-content">
      <header className="admin-page-heading">
        <div><p className="eyebrow">Lumé House / Business</p><h1>{section?.title ?? 'Administration page not found'}</h1><p className="admin-page-description">{section?.description ?? 'Choose a section from the administration navigation.'}</p></div>
        <div className="admin-session"><span className="admin-account-label">{role==='owner'?'Owner':'Administrator'}</span><span className="admin-account-email">{session?.user.email ?? 'Authorized account'}</span><button className="admin-sign-out" data-admin-leave="true" disabled={signingOut} onClick={() => setConfirmOut(true)}>{signingOut ? 'Signing out…' : 'Sign Out'}</button></div>
      </header>
      {error && <p role="alert" className="admin-session-error">{error}</p>}
      {confirmOut&&<ConfirmDialog title="Sign out of administration?" description="Save your work before ending this session." confirmLabel="Sign out" onCancel={()=>setConfirmOut(false)} onConfirm={()=>{setConfirmOut(false);void leave();}}/>}
      <div className="admin-screen">
        <Routes>
          <Route index element={<AdminDashboard token={token} />} />
          <Route path="products" element={<ProductManager token={token} />} />
          <Route path="inventory" element={<InventoryManager token={token} />} />
          <Route path="orders" element={<OrderManager token={token} />} />
          <Route path="orders/:orderId" element={<AdminOrderDetailPage token={token} />} />
          <Route path="memberships" element={<MembershipManager token={token} />} />
          <Route path="profile" element={<AdminProfile token={token} role={role} />} />
          <Route path="*" element={<section><h2>Choose another section</h2><p>This administration page does not exist.</p><Link className="text-link" to="/admin">Back to Overview</Link></section>} />
        </Routes>
      </div>
    </div>
  </div>;
}
