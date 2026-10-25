import { CancellationRequest } from './CancellationRequest';
import { OrderSnapshot } from './OrderSnapshot';
export { OrderSnapshot } from './OrderSnapshot';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getSupabaseClient } from '../../lib/supabase/client';
import { formatMoney } from '../../config/shop';
import { loadOrders,loadOrder,retryConfirmation,historyPageSize } from './orderRepository';
import { orderLabel,type Order,type OrderListItem } from './orders';
import { PageHeader, Breadcrumbs, type BreadcrumbItem } from '../../components/PageHeader';


export function OrderHistory({ orders }: {orders:OrderListItem[]}) {
  return (
    <ul className="order-history">
      {orders.map(order => (
        <li key={order.id}>
          <Link to={`/account/orders/${order.id}`}>
            <div className="order-reference">
              <span className="eyebrow">ORDER</span>
              <strong>{order.order_reference}</strong>
              <span className="order-date">{new Date(order.created_at).toLocaleDateString('en-GB')} · {order.fulfilment_method === 'pickup' ? 'Pickup' : 'Delivery'}</span>
            </div>
            <div className="order-statuses">
              <span className="status-pill">{orderLabel(order.status)}</span>
              <span className="status-pill payment-pill">Payment: {orderLabel(order.payment_status)}</span>
            </div>
            <div className="order-total">
              <strong>{formatMoney(order.total_cents)}</strong>
              <span className="text-link">View details <span aria-hidden="true">→</span></span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type AccountRequiredProps = {
  title?: string;
  trail?: readonly BreadcrumbItem[];
};

// Guest and session-restoring order gates keep the same navigable trail as
// the signed-in orders pages. Private order information is never used here:
// the title stays generic until an owner-scoped order has loaded.
function AccountRequired({ title = 'Your orders.', trail = [{ label: 'Home', to: '/' }, { label: 'My Account', to: '/account' }] }: AccountRequiredProps) {
  const auth = useAuth();
  return (
    <section className="wrap page-section orders-gate motion-enter">
      <Breadcrumbs title={title} ancestors={trail} />
      <p className="eyebrow">YOUR LUMÉ HOUSE</p>
      <h1>{title}</h1>
      <p className="account-intro">Your selected pieces, all in one place.</p>
      {auth.loading ? <p role="status">Restoring your session…</p> : <Link className="button" to="/account">Sign in to view your orders</Link>}
    </section>
  );
}

export function MyOrdersPage() {
  const auth = useAuth();
  const id = auth.session?.user.id;
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    if (id) {
      void loadOrders(getSupabaseClient(), page)
        .then(rows => {
          if (active) {
            setOrders(previous => (page === 0 ? rows : [...previous, ...rows]));
            setMore(rows.length === historyPageSize);
            setBusy(false);
            setError('');
          }
        })
        .catch(() => {
          if (active) {
            setBusy(false);
            setError('Your orders could not be loaded. Please retry.');
          }
        });
    }
    return () => { active = false };
  }, [id, page, revision]);

  if (!id || auth.loading) return <AccountRequired />;

  return (
    <section className="wrap page-section orders-page motion-enter">
      <PageHeader title="Orders for your home." breadcrumbLabel="My Orders" trail={[{ label: 'Home', to: '/' }, { label: 'My Account', to: '/account' }]} />
      <p className="account-intro">A record of the pieces you have chosen.</p>
      {busy && <p role="status">Loading your orders…</p>}
      {error && (
        <p role="alert">
          {error} <button onClick={() => { setBusy(true); setRevision(v => v + 1) }}>Retry</button>
        </p>
      )}
      {!busy && !error && !orders.length && (
        <p>You haven’t placed an order yet. <Link to="/">Explore the collection</Link></p>
      )}
      <OrderHistory orders={orders} />
      {more && !busy && !error && (
        <button className="button" onClick={() => { setBusy(true); setPage(v => v + 1) }}>Load more orders</button>
      )}
    </section>
  );
}

export function OrderSuccessMessage() {
  return (
    <p className="checkout-notice">
      <strong>Your order has been placed.</strong>
      Payment is awaiting confirmation. Your selected mobile-money method has not been charged or verified by Lumé House.
    </p>
  );
}

export function OrderDetailPage({ success = false }: { success?: boolean }) {
  const { orderId } = useParams();
  const auth = useAuth();
  const userId = auth.session?.user.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [emailNote, setEmailNote] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (userId && orderId) {
      void loadOrder(getSupabaseClient(), orderId)
        .then(value => {
          if (active) {
            setOrder(value);
            setBusy(false);
            setError('');
          }
        })
        .catch(() => {
          if (active) {
            setBusy(false);
            setError('Your order could not be loaded.');
          }
        });
    }
    return () => { active = false };
  }, [userId, orderId, revision]);

  if (!userId || auth.loading)
    return <AccountRequired
      title="Your order."
      trail={[
        { label: 'Home', to: '/' },
        { label: 'My Account', to: '/account' },
        { label: 'My Orders', to: '/account/orders' },
      ]}
    />;

  async function retryEmail() {
    if (!order) return;
    setEmailBusy(true);
    try {
      setEmailNote(await retryConfirmation(getSupabaseClient(), order.id));
    } catch (error) {
      setEmailNote(error instanceof Error ? error.message : 'Email could not be checked.');
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <section className="wrap page-section order-page motion-enter">
      <PageHeader
        title={order?.order_reference || 'Your order.'}
        breadcrumbLabel={order?.order_reference || 'Your order.'}
        trail={[
          { label: 'Home', to: '/' },
          { label: 'My Account', to: '/account' },
          { label: 'My Orders', to: '/account/orders' },
        ]}
      />
      {busy ? (
        <p role="status">Loading your order…</p>
      ) : error ? (
        <p role="alert">
          {error} <button onClick={() => { setBusy(true); setRevision(v => v + 1) }}>Retry</button>
        </p>
      ) : !order ? (
        <p>This order is unavailable for your account.</p>
      ) : (
        <>
          {success && <OrderSuccessMessage />}
          <OrderSnapshot order={order} />
          <CancellationRequest
            key={`${order.id}:${order.status}`}
            orderId={order.id}
            status={order.status}
            token={auth.session!.access_token}
          />
          <section className="email-information">
            <p className="eyebrow">CONFIRMATION EMAIL</p>
            <p className="small-note">Your order is saved even if the confirmation email is delayed.</p>
            <button className="text-link" disabled={emailBusy} onClick={() => void retryEmail()}>
              {emailBusy ? 'Checking email…' : 'Check / retry confirmation email'}
            </button>
            <p className="feedback" role="status">{emailNote}</p>
          </section>
          <div className="order-navigation">
            <Link className="button" to="/account/orders">My orders</Link>
            <Link className="text-link" to="/">Continue shopping</Link>
          </div>
        </>
      )}
    </section>
  );
}