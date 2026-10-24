import { ProductDetailsPage } from "./features/products/ProductDetailsPage";
import { DirectCheckoutPage } from './features/checkout/DirectCheckoutPage';
import { AdminPage } from "./features/admin/AdminPage";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, createRoutesFromElements, Link, Route, RouterProvider } from "react-router-dom";
import { CartProvider } from "./features/cart/CartProvider";
import { CurrencyProvider } from "./features/currency/CurrencyProvider";
import { Layout } from "./components/Layout";
import { ShopPage } from "./features/products/ShopPage";
import { CartPage } from "./features/cart/CartPage";
import "./styles.css";
import { ProductProvider } from "./features/products/ProductProvider";
import { AuthProvider } from "./features/auth/AuthProvider";
import { NotificationProvider } from "./components/NotificationProvider";
import { AuthCallback, CustomerAccount, CustomerCheckout, CustomerOrders,CustomerOrder } from "./features/auth/CustomerRoutes";
import { AboutPage } from "./features/content/AboutPage";
import { HelpPage } from "./features/content/HelpPage";
import { DeliveryPickupPage, ReturnsRefundsPage, PrivacyPage, TermsPage } from "./features/content/PolicyPages";
import "./typography.css";
import "./refinement.css";

const router = createBrowserRouter(createRoutesFromElements(
            <Route element={<AuthProvider><ProductProvider><CartProvider><CurrencyProvider><NotificationProvider><Layout /></NotificationProvider></CurrencyProvider></CartProvider></ProductProvider></AuthProvider>}>
              <Route path="/" element={<ShopPage />} />
              <Route path="/admin/*" element={<AdminPage />} />
              <Route path="/products/:productId" element={<ProductDetailsPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/help/delivery-pickup" element={<DeliveryPickupPage />} />
              <Route path="/help/returns-refunds" element={<ReturnsRefundsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CustomerCheckout />} />
              <Route path="/checkout/buy-now" element={<DirectCheckoutPage />} />
              <Route path="/account" element={<CustomerAccount />} />
              <Route path="/account/orders" element={<CustomerOrders />} />
              <Route path="/account/orders/:orderId" element={<CustomerOrder />} />
              <Route path="/orders/:orderId/success" element={<CustomerOrder success />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
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
));
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);
