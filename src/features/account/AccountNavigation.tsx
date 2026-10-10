import { Link } from "react-router-dom";
import { BagIcon, DeliveryIcon, HelpIcon, LockIcon, PersonIcon } from "../../components/Icon";

const destinations = [
  { title: "Personal Information", description: "Your name, phone and email", to: "/account#personal-information", Icon: PersonIcon },
  { title: "Delivery Details", description: "Your defaults for the next order", to: "/account#delivery-details", Icon: DeliveryIcon },
  { title: "My Orders", description: "Order history and recorded status", to: "/account/orders", Icon: BagIcon },
  { title: "Account & Security", description: "Google sign-in and sign-out", to: "/account#account-security", Icon: LockIcon },
  { title: "Help & Support", description: "Contact, delivery and returns", to: "/account#account-help", Icon: HelpIcon },
] as const;

export function AccountNavigation() {
  return <nav className="account-navigation" aria-label="Account sections"><ul>
    {destinations.map(({ title, description, to, Icon }) => <li key={to}><Link to={to}>
      <span className="account-navigation-icon"><Icon /></span><span><strong>{title}</strong><span className="account-navigation-description">{description}</span></span><span className="account-navigation-arrow" aria-hidden="true">↗</span>
    </Link></li>)}
  </ul></nav>;
}
