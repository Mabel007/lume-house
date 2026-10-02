import type { Product } from "./products";

// Stable frame for local artwork now and a cohesive owned photography set later.
export function ProductImage({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  return (
    <img
      src={product.image}
      alt={
        product.image.endsWith(".svg")
          ? `Illustration of ${product.name}`
          : product.name
      }
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      width={600}
      height={600}
    />
  );
}
