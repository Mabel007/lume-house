export const adminNavigation = [
  { path: '/admin', title: 'Overview', summary: 'Your workspace', description: 'A clear place to manage the day-to-day work of Lumé House.' },
  { path: '/admin/orders', title: 'Orders', summary: 'Customer orders', description: 'Review orders and manage their fulfilment with trusted operations.' },
  { path: '/admin/products', title: 'Catalogue', summary: 'Products and variants', description: 'Manage products, variants and reviewed imagery for the storefront.' },
  { path: '/admin/inventory', title: 'Inventory', summary: 'Stock and adjustments', description: 'Review stock and record actual inventory changes.' },
  { path: '/admin/memberships', title: 'Access', summary: 'Admin memberships', description: 'Review administration memberships and their recorded history.' },
] as const;

export function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function adminSection(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return adminNavigation.find(section => section.path === path || (section.path === '/admin/orders' && /^\/admin\/orders\/[^/]+$/.test(path)));
}
