import { Link } from "react-router-dom";
import { ContentPage } from "../../components/ContentPage";
import { customerContent } from "../../config/customerContent";
import { deliveryConfig } from "../../config/fulfilment";

function ContactLink() { return <a href={`mailto:${customerContent.contactEmail}`}>{customerContent.contactEmail}</a>; }

export function DeliveryPickupPage() {
  return <ContentPage title="Delivery & Pickup" intro="Choose the arrangement that fits your order, with clear details before you place it.">
    <section><h2>Supported Freetown delivery areas</h2><p>Delivery is available for supported areas in Freetown. At checkout, choose the supported area that matches your address. The delivery fee is derived from that selection and included in the displayed total.</p><ul>{deliveryConfig.zones.filter(zone => zone.active).map(zone => <li key={zone.id}>{zone.coverage}</li>)}</ul><p>These area descriptions are provisional delivery options, not precise mapped boundaries. If you are unsure which area applies, contact us before placing your order.</p></section>
    <section><h2>Free pickup in Lumley</h2><p>Pickup in {deliveryConfig.pickupLocation} is free. Fulfilment arrangements and pickup readiness are confirmed separately. Placing an order does not mean it is ready to collect.</p></section>
    <section><h2>Your contact and delivery details</h2><p>Provide an accurate name, contact number and email. For delivery, include your street address or landmark, area and city, plus any useful delivery instructions. Check these details before placing your order.</p></section>
    <section><h2>After placement</h2><p>Placing an order does not mean payment has been confirmed. Your order and its delivery or pickup details are saved separately from your profile defaults. Fulfilment arrangements are confirmed separately; no fixed delivery time is promised here.</p><Link className="text-link" to="/account/orders">View My Orders →</Link></section>
    <section><h2>Questions about your area or pickup?</h2><p>Contact <ContactLink /> with your question and, if you have placed an order, its reference.</p></section>
  </ContentPage>;
}

export function ReturnsRefundsPage() {
  return <ContentPage title="Returns & Refunds" intro="Tell us what happened so your request can be reviewed in the context of your order.">
    <section><h2>Requesting an eligible return</h2><p>You have <strong>7 calendar days from receipt to request an eligible return</strong>. This is a return-request window, not an automatic refund guarantee. Eligibility is reviewed before a return is confirmed.</p><p>The item should generally be unused, undamaged and in its original condition, with original packaging where applicable.</p></section>
    <section><h2>Damaged, defective or incorrect items</h2><p>If an item arrives damaged, is defective or differs from what you ordered, report the problem with your order reference and a description. Supporting information or photos may be requested to help review it.</p></section>
    <section><h2>How to make a request</h2><p>Email <ContactLink /> with your order reference, the item and your reason for requesting a return. Please wait for confirmation and return arrangements before sending an item back.</p></section>
    <section><h2>Refund handling</h2><p>An approved refund depends on the actual order and payment circumstances. Placing an order does not mean payment has been confirmed. Current Orange Money/Afrimoney selection records an intended payment method; the application does not process or verify those payments, or automate their refunds.</p><p>A return request does not itself approve a refund. Any approved handling is confirmed separately.</p></section>
  </ContentPage>;
}

export function PrivacyPage() {
  return <ContentPage title="Privacy Policy" intro="How information is used in the current Lumé House application.">
    <section><h2>Signing in with Google</h2><p>Lumé House uses Google sign-in through Supabase Auth. Supabase manages the application identity and session. Lumé House does not manage a password for these Google accounts.</p></section>
    <section><h2>Optional profile information</h2><p>You can save a name, contact phone and default street address, area and city in your profile. These details can prefill checkout. Changes made at checkout apply to that order and do not silently update your profile.</p></section>
    <section><h2>Your Bag</h2><p>Guest item choices and quantities are kept in this browser tab’s session storage. When signed in, your Bag is saved with your account in Supabase. Guest choices are combined with the account Bag when you sign in.</p></section>
    <section><h2>Checkout and order history</h2><p>Checkout collects the recipient’s name, email, contact number, delivery or pickup details, optional delivery instructions and intended mobile-money method and number. Order history retains the contact, fulfilment, product and price details saved when the order was placed. Later profile or product changes do not rewrite those details.</p><p>The payer number retained in order history is limited to its masked last four digits. Current payment-method selection does not process or verify a payment.</p></section>
    <section><h2>Services used by the application</h2><p>Supabase provides authentication and data services, Google provides Google sign-in, and Vercel hosts the application. Transactional order confirmation email is sent through Resend using the email and order information supplied at checkout.</p><p>Your order remains saved if its confirmation email is delayed or fails. An order email is not payment confirmation.</p></section>
    <section><h2>Questions</h2><p>For questions about information in the current application, contact <ContactLink />. Do not send passwords, PINs, OTPs or mobile-money secrets.</p></section>
  </ContentPage>;
}

export function TermsPage() {
  return <ContentPage title="Terms & Conditions" intro="Guidance for using the current Lumé House experience and understanding an order.">
    <section><h2>Use of Lumé House</h2><p>Lumé House is currently a portfolio ecommerce product by Naj Builds. Use the application responsibly and provide accurate information when placing an order or contacting us.</p></section>
    <section><h2>Accounts</h2><p>Accounts use Google sign-in through Supabase. Use your own account and keep your Google account secure. Lumé House does not manage a password for these accounts.</p></section>
    <section><h2>Product information</h2><p>Review the description, imagery and details shown for each product. Styling props in editorial imagery are not included unless the product information says they are.</p></section>
    <section><h2>Pricing</h2><p>Prices are displayed in NLE. Current product prices and the supported delivery fee are checked securely when placing an order. If prices or selected items have changed, review the refreshed selection before trying again.</p></section>
    <section><h2>Bag</h2><p>Your Bag records shopping intent; it is not an order or a stock reservation. Guest choices are kept in this browser tab. Signed-in choices are saved to your account.</p></section>
    <section><h2>Orders</h2><p>Placing an order saves its contact, fulfilment, product and price details for your order history. Check your details before placement. Placing an order does not mean payment has been confirmed.</p></section>
    <section><h2>Payments</h2><p>Current Orange Money/Afrimoney selection records the intended payment method. The application does not process or verify those payments. Payment remains awaiting confirmation after placement; neither the placement page nor an order email confirms payment.</p></section>
    <section><h2>Delivery and pickup</h2><p>Supported Freetown delivery fees follow the area selected at checkout. Pickup in Lumley is free. Fulfilment arrangements and readiness are confirmed separately.</p><Link to="/help/delivery-pickup">Read Delivery & Pickup</Link></section>
    <section><h2>Cancellations</h2><p>You may request cancellation before an order enters fulfilment, subject to Lumé House confirmation. Sending a request does not cancel the order.</p><Link to="/help#contact">Contact us about your order</Link></section>
    <section><h2>Returns and refunds</h2><p>You have 7 calendar days from receipt to request an eligible return. Eligibility is reviewed; the request window is not an automatic refund guarantee. Refund handling depends on actual order and payment circumstances.</p><Link to="/help/returns-refunds">Read Returns & Refunds</Link></section>
    <section><h2>Acceptable use</h2><p>Do not try to access another customer’s information, interfere with the application or use it to submit misleading information.</p></section>
    <section><h2>Intellectual property</h2><p>The Lumé House name, design and content form part of this portfolio experience. Their appearance here does not grant permission to reuse them or imply ownership of third-party rights.</p></section>
    <section><h2>Privacy</h2><p>Read how the current application uses account, profile and order information.</p><Link to="/privacy">Read the Privacy Policy</Link></section>
    <section><h2>Changes</h2><p>These terms may be updated as the experience develops. Review the current information before placing an order. Changes to this page do not rewrite saved order details.</p></section>
    <section><h2>Contact</h2><p>For questions or order requests, email <ContactLink />. Never send passwords, PINs, OTPs or mobile-money secrets.</p></section>
  </ContentPage>;
}
