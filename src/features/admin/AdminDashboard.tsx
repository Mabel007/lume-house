import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../../lib/supabase/client';
import { orderLabel, orderStates } from '../orders/orders';
import { adminReadFailure, adminRpc } from './adminRepository';
import { AdminReadState } from './AdminReadState';
import { parseDashboard, type Dashboard } from './dashboardContract';
import './adminDashboard.css';

export function DashboardContent({ data }: { data: Dashboard }) {
 const cards = [
  { label: 'Active products', value: data.active_products, description: 'Products enabled in the catalogue; archived products excluded.', to: '/admin/products' },
  { label: 'Product variants', value: data.total_variants, description: 'All variants, including inactive variants and archived products.', to: '/admin/products' },
  { label: 'Tracked variants', value: data.tracked_variants, description: 'All variants with inventory tracking, including inactive variants.', to: '/admin/inventory' },
  { label: 'Out-of-stock tracked variants', value: data.out_of_stock, description: 'Active products and variants with known available stock of zero (on hand minus allocated).', to: '/admin/inventory' },
  { label: 'Total orders', value: data.total_orders, description: 'All persisted orders, including completed and cancelled orders. Not completed sales.', to: '/admin/orders' },
  { label: 'Orders placed', value: data.orders_placed, description: 'Orders currently in the Placed operational status.', to: '/admin/orders?status=placed' },
  { label: 'Orders awaiting payment', value: data.awaiting_payment, description: 'Exact Awaiting payment state, including terminal orders. Not payment confirmation or revenue.', to: '/admin/orders' },
 ];
 return <div className="admin-dashboard-content"><div className="admin-metric-grid">{cards.map(card => <article className="admin-metric-card" key={card.label}><h3><Link to={card.to}>{card.label}</Link></h3><p className="admin-metric-value">{card.value}</p><p>{card.description}</p></article>)}</div>
  <section className="admin-dashboard-panel" aria-labelledby="dashboard-statuses"><h3 id="dashboard-statuses">Orders by operational status</h3>{!data.total_orders && <p>No orders have been placed.</p>}<dl className="admin-status-grid">{orderStates.map(status => <div key={status}><dt><Link to={`/admin/orders?status=${status}`}>{orderLabel(status)}</Link></dt><dd>{data.by_status[status]}</dd></div>)}</dl><p>Operational progress is separate from payment. This application does not process or verify Orange Money/Afrimoney payments.</p></section>
  <div className="admin-dashboard-panels"><section className="admin-dashboard-panel" aria-labelledby="dashboard-recent"><h3 id="dashboard-recent">Recent operational queue</h3><p>Newest ten non-terminal orders: Placed, Confirmed, Processing, Ready for pickup or Out for delivery. This is a bounded preview, not a priority or overdue ranking.</p>{data.recent_orders.length ? <ul>{data.recent_orders.map(order => <li key={order.id}><Link to={`/admin/orders/${encodeURIComponent(order.id)}`}>{order.order_reference}</Link><time dateTime={order.created_at}>{new Date(order.created_at).toLocaleString('en-GB')}</time><p>{orderLabel(order.status)} · {orderLabel(order.payment_status)}</p></li>)}</ul> : <p>No non-terminal orders need operational review.</p>}<Link to="/admin/orders">View all orders</Link></section>
  <section className="admin-dashboard-panel" aria-labelledby="dashboard-stock"><h3 id="dashboard-stock">Inventory attention</h3><p>Up to ten active tracked variants with known zero availability. Untracked, inactive and archived variants are excluded.</p>{data.stock_attention.length ? <ul>{data.stock_attention.map(row => <li key={row.variant_id}><strong>{row.product_name}</strong><p>SKU: {row.sku} · Available: {row.available_quantity}</p></li>)}</ul> : <p>No active tracked variants have known zero availability.</p>}{data.unconfigured_stock > 0 && <p role="status">{data.unconfigured_stock} active tracked variants have no configured balance. Review their inventory; no zero balance is assumed.</p>}<p>Low-stock reporting is deferred until a threshold is approved.</p><Link to="/admin/inventory">Review inventory</Link></section></div>
 </div>;
}
export function AdminDashboard({ token }: { token: string }) {
 const [revision, setRevision] = useState(0);
 const scope = JSON.stringify([token, revision]);
 const [state, setState] = useState<{ scope: string; data?: Dashboard; error?: string }>();
 useEffect(() => {
  let active = true;
  void adminRpc(getSupabaseClient(), token, 'admin_dashboard_v1').then(value => { const data = parseDashboard(value); if (active) setState({ scope, data }); }).catch(cause => { if (active) setState({ scope, error: adminReadFailure(cause, 'Overview metrics') }); });
  return () => { active = false; };
 }, [token, scope]);
 const current = state?.scope === scope ? state : undefined;
 return <section className="admin-dashboard"><h2>Operational overview</h2><p>Server-derived business counts and current operational queues.</p><AdminReadState loading={!current} message={!current ? 'Loading overview metrics…' : current.error} retry={() => setRevision(value => value + 1)} retryLabel="Retry overview metrics"/>{current?.data && <><button type="button" className="button" onClick={() => setRevision(value => value + 1)}>Refresh overview</button><DashboardContent data={current.data}/></>}</section>;
}
