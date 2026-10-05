import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function ContentPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <article className="wrap page-section content-page">
    <Link className="back-link" to="/help">Help & Contact</Link>
    <header className="content-heading"><p className="eyebrow">LUMÉ HOUSE / GOOD TO KNOW</p><h1>{title}</h1><p>{intro}</p></header>
    <div className="content-body">{children}</div>
    <nav className="content-related" aria-label="More from Lumé House">
      <Link to="/about#our-story">Our story</Link><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms & Conditions</Link><Link to="/">Explore the collection →</Link>
    </nav>
  </article>;
}
