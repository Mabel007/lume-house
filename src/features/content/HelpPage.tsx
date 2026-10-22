import { Link } from "react-router-dom";
import { ContentPage } from "../../components/ContentPage";
import { customerContent } from "../../config/customerContent";

export function HelpPage() {
  return <ContentPage
    title="Help & Contact"
    intro="A little guidance for your account, your selected pieces and your order."
    trail={[{ label: 'Shop', to: '/' }]}
  >
    <div className="help-links">
      <Link to="/account/orders"><h2>My Orders</h2><p>View your order history, details and recorded order and payment status.</p></Link>
      <Link to="/account"><h2>Account</h2><p>Sign in with Google and manage your contact and delivery defaults.</p></Link>
      <Link to="/help/delivery-pickup"><h2>Delivery & Pickup</h2><p>Supported Freetown delivery areas and free pickup in Lumley.</p></Link>
      <Link to="/help/returns-refunds"><h2>Returns & Refunds</h2><p>How to request an eligible return and report an item problem.</p></Link>
    </div>
    <section><h2>Account help</h2><p>Use the Google account you signed in with to find your saved details and orders. Lumé House does not manage a password for your Google account. Checkout edits apply to that order; they do not update your saved profile defaults.</p></section>
    <section><h2>Cancellation requests</h2><p>You may request cancellation before an order enters fulfilment, subject to Lumé House confirmation. Email your order reference and request using the contact below. Sending a request does not cancel an order.</p></section>
    <section><h2>A problem with your order?</h2><p>Include your order reference and a short description of the problem. For a damaged, defective or incorrect item, supporting information or photos may be requested. My Orders shows the information recorded for your order; it is not live courier tracking.</p><p>Placing an order does not mean payment has been confirmed. Current Orange Money/Afrimoney selection records the intended payment method; the application does not process or verify those payments.</p></section>
    <section id="contact" aria-labelledby="contact-title"><h2 id="contact-title">Get in touch</h2><p><a className="text-link" href={`mailto:${customerContent.contactEmail}`}>{customerContent.contactEmail}</a></p><p>Never send PINs, OTPs, passwords or mobile-money secrets.</p><p className="small-note">Lumé House is currently a portfolio ecommerce product by <a href="https://najbuilds.com">Naj Builds</a>.</p></section>
  </ContentPage>;
}
