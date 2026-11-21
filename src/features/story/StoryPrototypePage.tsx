import { useRef } from "react";
import { Link } from "react-router-dom";
import { useProducts } from "../products/ProductContext";
import { ProductImage } from "../products/ProductImage";
import { ProductStatus } from "../products/ProductStatus";
import { cataloguePrice } from "../products/variants";
import { formatMoney } from "../../config/shop";
import { currentPanelIndex } from "./storyWalk";
import "../../story.css";

// S03-02 candidate, kept on its own route so the sideways walk can be reviewed
// before anything like it reaches the homepage. It is deliberately absent from the
// site navigation and reads the same hosted catalogue, prices and media as the shop.
export function StoryPrototypePage() {
  const { state } = useProducts();
  const panels = state.status === "ready" ? state.products.slice(0, 6) : [];
  const heading = useRef<HTMLHeadingElement>(null);

  // A focused scroll container gets no arrow-key scrolling from the browser, so
  // the row is driven here. Only the sideways pair is claimed, and Home, End and
  // Tab keep their page-wide meaning. One press moves one piece, and the glide is
  // story.css's scroll-behavior rather than an explicit option, so holding a key
  // follows the same motion preference as the rest of the site.
  function onTrackKeyDown(event: React.KeyboardEvent<HTMLOListElement>) {
    const direction =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (direction === 0) return;
    const track = event.currentTarget;
    // Stacked vertically on a phone, where the page does the scrolling: the row
    // cannot move sideways, so the arrows are left to the page.
    if (track.scrollWidth <= track.clientWidth) return;
    const panels = Array.from(track.children);
    const view = track.getBoundingClientRect();
    const step =
      currentPanelIndex(
        panels.map((panel) => {
          const box = panel.getBoundingClientRect();
          return { left: box.left, width: box.width };
        }),
        { left: view.left, width: view.width },
      ) + direction;
    const target = panels[step];
    // Already on the first or the last piece.
    if (!target) return;
    target.scrollIntoView({ block: "nearest", inline: "center" });
    event.preventDefault();
  }

  return (
    <section className="story wrap" aria-labelledby="story-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LUMÉ HOUSE / EDITORIAL PROTOTYPE</p>
          <h2 id="story-title" ref={heading} tabIndex={-1}>
            Six pieces, one at a time.
          </h2>
        </div>
        <p className="story-hint">
          One piece per panel. Scroll to move through them; focusing the row and
          using the left and right arrow keys steps through it too.
        </p>
      </div>
      <ProductStatus onRecover={() => heading.current?.focus()} />
      {panels.length > 0 && (
        <ol
          className="story-track"
          tabIndex={0}
          aria-label="Collection panels"
          onKeyDown={onTrackKeyDown}
        >
          {panels.map((product, index) => {
            const price = cataloguePrice(product);
            return (
              <li className="story-panel" key={product.id}>
                <span className="story-index">
                  {String(index + 1).padStart(2, "0")} /{" "}
                  {String(panels.length).padStart(2, "0")}
                </span>
                <div className="story-art">
                  <ProductImage product={product} />
                </div>
                <h3>{product.name}</h3>
                <p className="story-price">
                  {price.from ? "From " : ""}
                  {formatMoney(price.price)}
                </p>
                <p className="story-copy">{product.description}</p>
                <Link className="button secondary" to={`/products/${product.id}`}>
                  View {product.name}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      <p className="story-return">
        <Link className="text-link" to="/">
          Back to the shop
        </Link>
      </p>
    </section>
  );
}
