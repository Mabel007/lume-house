import { formatMoney } from '../../config/shop';
import { OrderSummary } from '../checkout/OrderSummary';
import { variantLabel } from '../products/variants';
import { orderLabel, type Order } from './orders';
import './orderPresentation.css';

export function OrderSnapshot({ order, context = 'customer' }: { order: Order; context?: 'customer' | 'admin' }) {
  const Heading = context === 'admin' ? 'h3' : 'h2';
  const pickup = order.fulfilment_method === 'pickup';
  return <div className="checkout-grid order-detail-grid order-snapshot">
    <div className="order-detail-content">
      <p className="order-date"><time dateTime={order.created_at}>{new Date(order.created_at).toLocaleString('en-GB')}</time></p>
      <section className="order-state-group"><Heading>Operational status</Heading><p className="status-pill">Order: {orderLabel(order.status)}</p><p>{pickup ? 'Pickup fulfilment uses ready for pickup before completion.' : 'Delivery fulfilment uses out for delivery before completion.'} Completion describes fulfilment, not payment settlement.</p></section>
      <Heading className="detail-title">{context === 'admin' ? 'Ordered items' : 'Your selected pieces'}</Heading>
      <ul className="order-items">{order.order_items.map((item,index)=><li key={index}><strong>{item.product_name}{item.variant_options && variantLabel({options:item.variant_options}) && <small className="order-item-options">{variantLabel({options:item.variant_options})}</small>}{context === 'admin' && item.variant_sku && <small className="order-item-options">SKU: {item.variant_sku}</small>}</strong><span>{item.quantity} × {formatMoney(item.unit_price_cents)}</span><span>{formatMoney(item.quantity*item.unit_price_cents)}</span></li>)}</ul>
      <div className="order-information">
        <section className="detail-group"><Heading>Fulfilment — {pickup ? 'Pickup' : 'Delivery'}</Heading><p>{order.full_name}<br/>{order.customer_phone}<br/>{order.customer_email}</p>{pickup ? <p>{order.pickup_location}</p> : <p>{order.delivery_street_address}<br/>{order.delivery_area}, {order.delivery_city}<br/>{order.delivery_zone_label}{order.delivery_instructions && <><br/>{order.delivery_instructions}</>}</p>}</section>
        <section className="detail-group"><Heading>Payment status</Heading><p className="status-pill payment-pill">Payment: {orderLabel(order.payment_status)}</p><p>Selected method: {order.payment_provider === 'orange' ? 'Orange Money' : 'Afrimoney'}{order.payment_phone_last4 && <> · number ending {order.payment_phone_last4}</>}</p>
          {order.payment_status === 'awaiting_payment' && <p>Payment is awaiting confirmation. The selected method has not been charged or verified by this application.</p>}
          <p>This application does not process or verify mobile-money payments. The stored payment state is separate from fulfilment. Cancellation does not issue a refund.</p>
        </section>
      </div>
    </div>
    <aside className="summary order-summary"><Heading>Order summary</Heading><OrderSummary subtotal={order.subtotal_cents} deliveryFee={order.delivery_fee_cents}/></aside>
  </div>;
}
