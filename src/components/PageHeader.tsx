import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function PageHeader({ title, description, breadcrumb, actions }: { title: string; description?: string; breadcrumb?: { label: string; to: string }; actions?: ReactNode }) {
  return <header className="ui-page-header">
    <div>{breadcrumb && <nav aria-label="Breadcrumb"><Link to={breadcrumb.to}>{breadcrumb.label}</Link><span aria-hidden="true"> / </span><span aria-current="page">{title}</span></nav>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="ui-page-actions">{actions}</div>}
  </header>;
}
