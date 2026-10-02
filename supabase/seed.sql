-- Reviewed local Lume House catalog. Local expansion; hosted reconciliation requires authorization.
-- Integer NLE minor units; no identities/orders. Repeats preserve existing trusted edits.
begin;
insert into public.products
  (id, name, description, price_cents, currency, image_path, category, background_color, display_order, active)
values
  ('amber-candle', 'Amber Glass Candle', 'Amber candle vessel with a fitted lid.', 25000, 'NLE', '/images/candle.svg', 'Home Fragrance', '#eee7dc', 1, true),
  ('reed-diffuser', 'Reed Diffuser', 'Glass fragrance bottle with slender reeds.', 35000, 'NLE', '/images/diffuser.svg', 'Home Fragrance', '#eee7dc', 2, true),
  ('arch-vase', 'Sandstone Vase', 'A sculptural vase in a warm sand finish.', 65000, 'NLE', '/images/vase.svg', 'Decor', '#eee7dc', 3, true),
  ('ceramic-bowl', 'Ceramic Display Bowl', 'A shallow decorative bowl in soft ivory.', 55000, 'NLE', '/images/bowl.svg', 'Decor', '#eee7dc', 4, true),
  ('linen-cushion', 'Linen-look Cushion', 'A square cushion with a textured oat cover.', 45000, 'NLE', '/images/cushion.svg', 'Soft Furnishings', '#eee7dc', 5, true),
  ('woven-throw', 'Woven Throw', 'A warm neutral throw with fringed edges.', 95000, 'NLE', '/images/throw.svg', 'Soft Furnishings', '#eee7dc', 6, true),
  ('stoneware-mug', 'Stoneware Mug', 'A rounded stoneware mug with a generous handle.', 18000, 'NLE', '/images/mug.svg', 'Tableware', '#eee7dc', 7, true),
  ('serving-board', 'Acacia Serving Board', 'A rounded wooden board for serving at the table.', 48000, 'NLE', '/images/board.svg', 'Tableware', '#eee7dc', 8, true),
  ('woven-basket', 'Woven Storage Basket', 'An open basket for everyday storage.', 75000, 'NLE', '/images/basket.svg', 'Storage', '#eee7dc', 9, true),
  ('lidded-box', 'Keepsake Box', 'A compact wooden box for small essentials.', 38000, 'NLE', '/images/box.svg', 'Storage', '#eee7dc', 10, true),
  ('catchall-tray', 'Oval Catchall Tray', 'An oval tray for keys and small daily essentials.', 22000, 'NLE', '/images/tray.svg', 'Home Accessories', '#eee7dc', 11, true),
  ('table-lamp', 'Pleated Table Lamp', 'A compact lamp with a pleated shade.', 125000, 'NLE', '/images/lamp.svg', 'Home Accessories', '#eee7dc', 12, true),
  ('pillar-holder', 'Sculptural Candle Holder', 'A softly curved stoneware holder for a taper candle.', 32000, 'NLE', '/images/holder.svg', 'Decor', '#eee7dc', 13, true),
  ('incense-dish', 'Ceramic Incense Dish', 'A low ceramic dish for a quiet daily ritual.', 16000, 'NLE', '/images/incense.svg', 'Home Fragrance', '#eee7dc', 14, true),
  ('table-runner', 'Textured Table Runner', 'A woven oat runner to soften the everyday table.', 42000, 'NLE', '/images/runner.svg', 'Soft Furnishings', '#eee7dc', 15, true),
  ('napkin-set', 'Linen-look Napkin Set', 'Four soft neutral napkins for relaxed gatherings.', 30000, 'NLE', '/images/napkins.svg', 'Tableware', '#eee7dc', 16, true),
  ('arched-mirror', 'Arched Accent Mirror', 'An arched mirror framed in warm natural wood.', 110000, 'NLE', '/images/mirror.svg', 'Decor', '#eee7dc', 17, true),
  ('ceramic-planter', 'Ribbed Ceramic Planter', 'A small ribbed planter with a matching saucer.', 40000, 'NLE', '/images/planter.svg', 'Home Accessories', '#eee7dc', 18, true),
  ('glass-carafe', 'Glass Carafe', 'A clear glass carafe with a gently rounded silhouette.', 28000, 'NLE', '/images/carafe.svg', 'Tableware', '#eee7dc', 19, true),
  ('wood-bookends', 'Wooden Bookend Pair', 'A pair of solid wood arches to keep favourite books in place.', 58000, 'NLE', '/images/bookends.svg', 'Storage', '#eee7dc', 20, true)
on conflict (id) do nothing;
commit;
