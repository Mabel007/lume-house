import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { CartProvider } from "./features/cart/CartProvider";
import { Layout } from "./components/Layout";
import { ShopPage } from "./features/products/ShopPage";
import { CartPage } from "./features/cart/CartPage";
import "./styles.css";
import { ProductProvider } from "./features/products/ProductProvider";
import { AuthProvider } from "./features/auth/AuthProvider";
import { CustomerAccount, CustomerCheckout, CustomerOrders,CustomerOrder } from "./features/auth/CustomerRoutes";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
      <ProductProvider>
        <CartProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<ShopPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CustomerCheckout />} />
              <Route path="/account" element={<CustomerAccount />} />
              <Route path="/account/orders" element={<CustomerOrders />} />
              <Route path="/account/orders/:orderId" element={<CustomerOrder />} />
              <Route path="/orders/:orderId/success" element={<CustomerOrder success />} />
              <Route path="/auth/callback" element={<CustomerAccount />} />
              <Route
                path="*"
                element={
                  <section className="empty-state">
                    <p className="eyebrow">404</p>
                    <h1>A little off the beaten path.</h1>
                    <p>That page doesn’t exist.</p>
                    <Link className="button" to="/">
                      Back to the shop
                    </Link>
                  </section>
                }
              />
            </Route>
          </Routes>
        </CartProvider>
      </ProductProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
