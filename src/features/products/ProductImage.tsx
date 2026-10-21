import type { Product } from "./products";
import {useState} from 'react';

// Stable frame for local artwork now and a cohesive owned photography set later.
export function ProductImage({
  product,
  priority = false,
  onLoad,
  onError,
}: {
  product: Product;
  priority?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const [failed,setFailed]=useState('');
  if(failed===product.image)return <span role="img" aria-label={`Image unavailable for ${product.name}`}>Image unavailable</span>;
  return (
    <img
      src={product.image}
      onLoad={onLoad}
      onError={()=>{setFailed(product.image);onError?.();}}
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
