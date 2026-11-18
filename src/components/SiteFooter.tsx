import { Link } from "react-router-dom";
import { shop } from "../config/shop";
import { customerContent } from "../config/customerContent";
import { hngEvaluation } from "../config/hngEvaluation";
import { LockIcon } from "./Icon";

const groups = [
  { title: "Shop", links: [["Shop All", "/"], ["Cart", "/cart"]] },
  { title: "About", links: [["Our Story", "/about#our-story"], ["Our Values", "/about#our-values"]] },
  { title: "Help", links: [["Help & Contact", "/help"], ["My Orders", "/account/orders"], ["Delivery & Pickup", "/help/delivery-pickup"], ["Returns & Refunds", "/help/returns-refunds"]] },
  { title: "Legal", links: [["Privacy Policy", "/privacy"], ["Terms & Conditions", "/terms"]] },
] as const;

export function SiteFooter({ showStaffLogin = hngEvaluation.showStaffLogin }: { showStaffLogin?: boolean } = {}) {
  return <footer className="wrap site-footer commerce-footer">
    <div className="footer-content">
      <div className="footer-brand">
        <Link className="brand" to="/">{shop.name}<span className="brand-dot" aria-hidden="true">✳</span></Link>
        <p className="footer-tagline">{shop.tagline}</p>
        <p>A modern Sierra Leonean home and lifestyle store for considered everyday spaces.</p>
        <p>Lumé House is a portfolio ecommerce product by Naj Builds.</p>
        <a href={`mailto:${customerContent.contactEmail}`}>{customerContent.contactEmail}</a>
      </div>
      <nav className="footer-links" aria-label="Footer navigation">
        {groups.map(group => <section key={group.title} aria-labelledby={`footer-${group.title.toLowerCase()}`}>
          <h2 id={`footer-${group.title.toLowerCase()}`}>{group.title}</h2>
          <ul>{group.links.map(([label, to]) => <li key={to}><Link to={to}>{label}</Link></li>)}</ul>
        </section>)}
      </nav>
    </div>
    <div className="footer-bottom">
      <p>© {new Date().getFullYear()} Lumé House. All rights reserved.</p>
      <p>Built by <a href="https://najbuilds.com">Naj Builds</a></p>
      {showStaffLogin && <div className="footer-staff-access"><Link to="/admin" aria-describedby="staff-access-description"><LockIcon />Staff Login</Link><p id="staff-access-description">For authorized store personnel</p></div>}
    </div>
  </footer>;
}
