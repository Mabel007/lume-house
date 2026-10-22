import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHeader, type BreadcrumbItem } from "./PageHeader";

export function ContentPage({ title, intro, children, trail }: { title: string; intro: string; children: ReactNode; trail?: readonly BreadcrumbItem[] }) {
  return (
    <article className="wrap page-section content-page">
      <PageHeader title={title} description={intro} trail={trail} />
      <div className="content-body">{children}</div>
      <nav className="content-related" aria-label="More from Lumé House">
        <Link to="/about#our-story">Our story</Link><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms & Conditions</Link><Link to="/">Explore the collection →</Link>
      </nav>
    </article>
  );
}
