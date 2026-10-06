import { NavLink, Route, Routes } from 'react-router-dom';
import { ProductManager } from './ProductManager';
import { InventoryManager } from './InventoryManager';
import './admin.css';
export function AdminWorkspace({ token }: { token: string }) {
  return <div className="admin-workspace"><nav aria-label="Business administration"><NavLink to="/admin" end>Dashboard</NavLink><NavLink to="/admin/products">Products</NavLink><NavLink to="/admin/inventory">Inventory</NavLink><NavLink to="/admin/orders">Orders</NavLink></nav>
    <Routes><Route index element={<section><h2>Business operations</h2><p>Manage the catalogue using trusted operations. No analytics or payment processing is shown here.</p></section>} />
      <Route path="products" element={<ProductManager token={token} />} /><Route path="inventory" element={<InventoryManager token={token} />} /><Route path="orders" element={<p>Order operations are not available yet.</p>} /><Route path="*" element={<p>Administration page not found.</p>} />
    </Routes></div>;
}
