import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type BreadcrumbItem = { label: string; to: string };

export function Breadcrumbs({ title, ancestors }: { title: string; ancestors: readonly BreadcrumbItem[] }) {
  if (!ancestors.length) return null;
  return <nav aria-label="Breadcrumb">
    <ol className="breadcrumb-list">
      {/* Sibling keys combine destination and label: the Product Details
          trail legitimately holds two ancestors today (Home and Shop both
          point to "/"), so destination alone is not a stable unique sibling
          key. */}
      {ancestors.map(item => <li key={`${item.to}:${item.label}`}>
        <Link to={item.to}>{item.label}</Link>
        <span className="breadcrumb-separator" aria-hidden="true"> / </span>
      </li>)}
      <li><span aria-current="page">{title}</span></li>
    </ol>
  </nav>;
}

export function PageHeader({ title, description, breadcrumb, trail, breadcrumbLabel, actions }: {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem;
  trail?: readonly BreadcrumbItem[];
  /** Breadcrumb label for the current page when it differs from the visible h1. */
  breadcrumbLabel?: string;
  actions?: ReactNode;
}) {
  const ancestors = trail ?? (breadcrumb ? [breadcrumb] : []);
  return <header className="ui-page-header">
    <div>
      <Breadcrumbs title={breadcrumbLabel ?? title} ancestors={ancestors} />
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="ui-page-actions">{actions}</div>}
  </header>;
}
