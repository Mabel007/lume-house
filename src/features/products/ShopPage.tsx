import { Link } from "react-router-dom";
import { requiresOptions, variantAvailable, cataloguePrice } from "./variants";
import { useRef, useState, useCallback, useEffect } from "react";
import type { Product } from "./products";
import { useProducts } from "./ProductContext";
import { ProductStatus } from "./ProductStatus";
import { formatMoney, shop } from "../../config/shop";
import { useCart } from "../cart/CartContext";
import { defaultVariant, MAX_QUANTITY } from "../cart/cart";
import { bagAddedText, bagAddFailedText } from "../cart/bagFeedback";
import { BagNotice, type BagNoticeMessage } from "../../components/BagNotice";
import { ProductImage } from "./ProductImage";
import {searchProducts} from './search';

export function ShopPage() {
  const [category, setCategory] = useState("All pieces");
  const [query,setQuery]=useState('');
  const searchInput=useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<BagNoticeMessage | null>(null);
  const noticeSeq = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const [addingId, setAddingId] = useState<string | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);
  const { items, dispatch, status: cartStatus } = useCart();
  const { state, refresh } = useProducts();
  const products = state.status === "ready" ? state.products : [];
  const categories = [
    "All pieces",
    ...new Set(products.map((product) => product.category)),
  ];
  const activeCategory = categories.includes(category)
    ? category
    : "All pieces";
  const visible=searchProducts(products,query,activeCategory);
  async function addToBag(product: Product, variantId: string) {
    const name=product.name;
    noticeSeq.current+=1;
    const operation=noticeSeq.current;
    setAddingId(product.id);
    const outcome=await dispatch({type:"add",productId:product.id,variantId});
    if(!alive.current||operation!==noticeSeq.current)return;
    setAddingId(null);
    if(outcome.kind==="confirmed")setNotice({id:operation,tone:"success",text:bagAddedText(1,name,"")});
    else if(outcome.kind==="rejected")setNotice({id:operation,tone:"failure",text:bagAddFailedText(name)});
  }
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow">LUMÉ HOUSE / HOME & LIFESTYLE</p>
          <h1>{shop.heroTitle}</h1>
          <p className="hero-description">{shop.heroDescription}</p>
          <a href="#collection" className="button">
            Explore the collection <span aria-hidden="true">↗</span>
          </a>
          <p className="hero-note">Objects for the small, good moments.</p>
        </div>
        <div className="hero-art">
          <img
            src="/images/a-place-for-the-everyday.webp"
            alt="Vases, greenery and candles arranged on a wooden tray in a warm neutral living room"
            fetchPriority="high"
          />
          <span className="art-label">A place for the everyday.</span>
          <span className="art-index">L / H — 01</span>
        </div>
      </section>
      {state.status === "ready" && products.length > 0 && (
        <>
          <section className="lume-edit wrap" aria-labelledby="edit-title">
            <div className="edit-copy">
              <p className="eyebrow">THE LUMÉ EDIT</p>
              <h2 id="edit-title">
                A softer kind
                <br />
                of everyday.
              </h2>
              <p>
                Warm wood. Quiet curves. The texture of a well-loved room. Start
                with a few pieces that make your space feel like you.
              </p>
              <a className="text-link" href="#collection">
                Discover the collection →
              </a>
            </div>
            <div className="edit-pieces">
              {["arch-vase", "woven-throw"]
                .map((id) => products.find((p) => p.id === id))
                .filter((p) => p !== undefined)
                .map((product) => (
                  <figure key={product.id}>
                    <div className="product-image">
                      <ProductImage product={product} />
                    </div>
                    <figcaption>
                      {product.name}
                      <span>{cataloguePrice(product).from?'From ':''}{formatMoney(product.price)}</span>
                    </figcaption>
                  </figure>
                ))}
            </div>
          </section>
          <section
            className="collection-links wrap"
            aria-labelledby="category-title"
          >
            <p className="eyebrow">MAKE ROOM FOR WHAT YOU LOVE</p>
            <h2 id="category-title">Shop by collection</h2>
            <div>
              {categories
                .filter((value) => value !== "All pieces")
                .map((value, index) => (
                  <a
                    key={value}
                    href="#collection"
                    onClick={() => setCategory(value)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {value}
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
            </div>
          </section>
        </>
      )}
      <section
        className="collection wrap"
        id="collection"
        aria-labelledby="collection-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">THOUGHTFULLY CHOSEN, SIMPLY ENJOYED</p>
            <h2 id="collection-title">Pieces to live with.</h2>
          </div>
          {state.status === "ready" && (
            <p>{products.length} considered pieces</p>
          )}
        </div>
        <ProductStatus />
        {state.status === "ready" && products.length > 0 && (
          <>
            <div className="product-search">
              <label htmlFor="product-search">Search the collection</label>
              <input ref={searchInput} id="product-search" name="product-search" type="search" maxLength={200} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Name, collection or description" autoComplete="off" />
              {query.length>0&&<button className="remove-button" onClick={()=>{setQuery('');searchInput.current?.focus();}}>Clear search</button>}
            </div>
            <div className="collection-toolbar">
              <div className="filters" aria-label="Filter products">
                {categories.map((value) => (
                  <button
                    key={value}
                    aria-pressed={activeCategory === value}
                    onClick={() => setCategory(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <span className="currency-note">Prices in {shop.currency}</span>
                <button className="remove-button" onClick={refresh}>
                  Refresh products
                </button>
              </div>
            </div>
            <p className="collection-results" role="status">{visible.length} {visible.length===1?'piece':'pieces'} found{activeCategory!=='All pieces'?` in ${activeCategory}`:''}.</p>
            {visible.length===0&&<div className="catalogue-no-results"><h3>No pieces found.</h3><p>Try a different search or collection.</p><button className="button" onClick={()=>{setQuery('');setCategory('All pieces');searchInput.current?.focus();}}>Reset search &amp; filters</button></div>}
            <div className="product-grid">
              {visible.map((product, index) => {
                const variant=defaultVariant(product);
                const displayPrice=cataloguePrice(product);
                const quantity =
                  items.find((item) => item.variantId===variant?.id || !item.variantId && item.productId === product.id)
                    ?.quantity ?? 0;
                return (
                  <article className="product-card" key={product.id}>
                    <div
                      className="product-image"
                      style={{ backgroundColor: product.color }}
                    >
                      <ProductImage product={product} />
                      <span className="product-index">
                        {String(products.indexOf(product) + 1).padStart(2, "0")}
                      </span>
                      {index === 0 && activeCategory === "All pieces" && (
                        <span className="product-badge">
                          Collection highlight
                        </span>
                      )}
                    </div>
                    <p className="product-category">{product.category}</p>
                    <div className="flex items-start justify-between gap-3">
                      <h3><Link to={`/products/${encodeURIComponent(product.id)}`}>{product.name}</Link></h3>
                      <span className="price">
                        {displayPrice.from?'From ':''}{formatMoney(displayPrice.price)}
                      </span>
                    </div>
                    <p className="product-description">{product.description}</p>
                    {requiresOptions(product.variants) ? <Link className="add-button" to={`/products/${encodeURIComponent(product.id)}`}>Choose options <span aria-hidden="true">→</span></Link> : <button
                      className="add-button"
                      disabled={!variantAvailable(variant) || quantity >= MAX_QUANTITY || cartStatus === "loading" || cartStatus === "saving" || cartStatus === "error" || cartStatus === "checking-out" || addingId === product.id}
                      onClick={() => { void addToBag(product, variant!.id); }}
                      aria-label={`Add ${product.name} to Bag`}
                    >
                      {addingId === product.id
                        ? "Adding…"
                        : quantity >= MAX_QUANTITY
                          ? "Quantity limit reached"
                          : quantity > 0
                            ? `Add another · ${quantity} in Bag`
                            : "Add to Bag"}
                      <span aria-hidden="true">+</span>
                    </button>}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
      <section className="closing-note wrap">
        <span aria-hidden="true">✳</span>
        <p>
          Less ordinary.
          <br />
          <em>More everyday.</em>
        </p>
        <div>
          Home & lifestyle in Freetown.
          <br />
          Pickup in Lumley.
          <br />
          Delivery in supported Freetown areas.
        </div>
      </section>
      <BagNotice message={notice} onExpire={clearNotice} />
    </>
  );
}
