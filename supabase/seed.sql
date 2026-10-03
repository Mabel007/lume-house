-- Reviewed Lumé House NLE catalog; no customer/order fixtures.
insert into public.products (id,name,description,price_cents,currency,image_path,category,background_color,display_order,active)
values
  ('amber-candle', 'Amber Glass Candle', 'A warm amber glass candle vessel with a clean, simple silhouette.', 25000, 'NLE', '/images/amber-candle.webp', 'Home Fragrance', '#eee7dc', 1, true),
  ('reed-diffuser', 'Reed Diffuser', 'A clear glass bottle with pale reeds and a gold-tone collar.', 35000, 'NLE', '/images/reed-diffuser.webp', 'Home Fragrance', '#eee7dc', 2, true),
  ('arch-vase', 'Faceted Round Vase', 'A rounded sand-tone vase with a sculpted geometric front.', 65000, 'NLE', '/images/arch-vase.webp', 'Decor', '#eee7dc', 3, true),
  ('ceramic-bowl', 'Pedestal Display Bowl', 'A soft ivory display bowl raised on a fluted foot.', 55000, 'NLE', '/images/ceramic-bowl.webp', 'Decor', '#eee7dc', 4, true),
  ('linen-cushion', 'Textured Cushion', 'A soft neutral cushion with a lightly textured cover.', 45000, 'NLE', '/images/linen-cushion.webp', 'Soft Furnishings', '#eee7dc', 5, true),
  ('woven-throw', 'Fringed Woven Throw', 'A cream woven throw with a tactile texture and fringed edges.', 95000, 'NLE', '/images/woven-throw.webp', 'Soft Furnishings', '#eee7dc', 6, true),
  ('stoneware-mug', 'Taupe Mug', 'A warm taupe mug with a rounded handle and a simple profile.', 18000, 'NLE', '/images/stoneware-mug.webp', 'Tableware', '#eee7dc', 7, true),
  ('serving-board', 'Wooden Serving Board', 'A warm wooden serving board with a rounded handle and visible grain.', 48000, 'NLE', '/images/serving-board.webp', 'Tableware', '#eee7dc', 8, true),
  ('woven-basket', 'Rounded Woven Basket', 'A rounded woven basket for soft furnishings and everyday storage.', 75000, 'NLE', '/images/woven-basket.webp', 'Storage', '#eee7dc', 9, true),
  ('lidded-box', 'Cream Keepsake Box', 'A cream rectangular box with a gold-tone edge and clasp.', 38000, 'NLE', '/images/lidded-box.webp', 'Storage', '#eee7dc', 10, true),
  ('catchall-tray', 'Rounded Display Tray', 'A light-toned display tray with a rounded raised rim.', 22000, 'NLE', '/images/catchall-tray.webp', 'Home Accessories', '#eee7dc', 11, true),
  ('table-lamp', 'Pleated Table Lamp', 'A light-toned rounded base beneath a wide pleated shade.', 125000, 'NLE', '/images/table-lamp.webp', 'Home Accessories', '#eee7dc', 12, true),
  ('pillar-holder', 'Sculptural Candle Holder', 'A flowing cream candle holder with three raised taper supports.', 32000, 'NLE', '/images/pillar-holder.webp', 'Decor', '#eee7dc', 13, true),
  ('incense-dish', 'Ceramic Incense Dish', 'A shallow textured dish with a central support for an incense stick.', 16000, 'NLE', '/images/incense-dish.webp', 'Home Fragrance', '#eee7dc', 14, true),
  ('table-runner', 'Textured Table Runner', 'A light neutral runner for a softly layered dining table.', 42000, 'NLE', '/images/table-runner.webp', 'Soft Furnishings', '#eee7dc', 15, true),
  ('napkin-set', 'Neutral Napkin Pair', 'Two soft neutral napkins, rolled and tied for a considered table setting.', 30000, 'NLE', '/images/napkin-set.webp', 'Tableware', '#eee7dc', 16, true),
  ('arched-mirror', 'Gold-tone Arched Mirror', 'A tall arched mirror with a slim gold-tone frame.', 110000, 'NLE', '/images/arched-mirror.webp', 'Decor', '#eee7dc', 17, true),
  ('ceramic-planter', 'Ribbed Ceramic Planter', 'An ivory ribbed planter with a matching shallow saucer.', 40000, 'NLE', '/images/ceramic-planter.webp', 'Home Accessories', '#eee7dc', 18, true),
  ('glass-carafe', 'Glass Carafe', 'A clear glass carafe with a gently curved waist and a cork-style stopper.', 28000, 'NLE', '/images/glass-carafe.webp', 'Tableware', '#eee7dc', 19, true),
  ('wood-bookends', 'Curved Wooden Bookends', 'Two curved wooden supports with rounded bases for an orderly shelf.', 58000, 'NLE', '/images/wood-bookends.webp', 'Storage', '#eee7dc', 20, true)
on conflict (id) do nothing;
