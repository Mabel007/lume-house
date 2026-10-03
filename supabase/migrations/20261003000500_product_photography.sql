-- Reviewed owner-supplied photography; current catalog metadata only.
-- Stable IDs/prices and all historical order snapshots are preserved.
begin;
lock table public.products in share row exclusive mode;
do $$
begin
 if exists (select 1 from (values
('amber-candle','Amber Glass Candle','A warm amber glass candle vessel with a clean, simple silhouette.','/images/amber-candle.webp',25000),
('reed-diffuser','Reed Diffuser','A clear glass bottle with pale reeds and a gold-tone collar.','/images/reed-diffuser.webp',35000),
('arch-vase','Faceted Round Vase','A rounded sand-tone vase with a sculpted geometric front.','/images/arch-vase.webp',65000),
('ceramic-bowl','Pedestal Display Bowl','A soft ivory display bowl raised on a fluted foot.','/images/ceramic-bowl.webp',55000),
('linen-cushion','Textured Cushion','A soft neutral cushion with a lightly textured cover.','/images/linen-cushion.webp',45000),
('woven-throw','Fringed Woven Throw','A cream woven throw with a tactile texture and fringed edges.','/images/woven-throw.webp',95000),
('stoneware-mug','Taupe Mug','A warm taupe mug with a rounded handle and a simple profile.','/images/stoneware-mug.webp',18000),
('woven-basket','Rounded Woven Basket','A rounded woven basket for soft furnishings and everyday storage.','/images/woven-basket.webp',75000),
('lidded-box','Cream Keepsake Box','A cream rectangular box with a gold-tone edge and clasp.','/images/lidded-box.webp',38000),
('catchall-tray','Rounded Display Tray','A light-toned display tray with a rounded raised rim.','/images/catchall-tray.webp',22000),
('table-lamp','Pleated Table Lamp','A light-toned rounded base beneath a wide pleated shade.','/images/table-lamp.webp',125000),
('table-runner','Textured Table Runner','A light neutral runner for a softly layered dining table.','/images/table-runner.webp',42000),
('arched-mirror','Gold-tone Arched Mirror','A tall arched mirror with a slim gold-tone frame.','/images/arched-mirror.webp',110000),
('wood-bookends','Curved Wooden Bookends','Two curved wooden supports with rounded bases for an orderly shelf.','/images/wood-bookends.webp',58000)
 ) as expected(id,name,description,image_path,price) left join public.products p on p.id=expected.id
 where p.id is null or p.price_cents<>expected.price or p.currency<>'NLE' or not p.active) then
 raise exception 'Photography reconciliation requires reviewed existing products/prices';
 end if;
end; $$;
update public.products p set name=v.name,description=v.description,image_path=v.image_path
from (values
('amber-candle','Amber Glass Candle','A warm amber glass candle vessel with a clean, simple silhouette.','/images/amber-candle.webp',25000),
('reed-diffuser','Reed Diffuser','A clear glass bottle with pale reeds and a gold-tone collar.','/images/reed-diffuser.webp',35000),
('arch-vase','Faceted Round Vase','A rounded sand-tone vase with a sculpted geometric front.','/images/arch-vase.webp',65000),
('ceramic-bowl','Pedestal Display Bowl','A soft ivory display bowl raised on a fluted foot.','/images/ceramic-bowl.webp',55000),
('linen-cushion','Textured Cushion','A soft neutral cushion with a lightly textured cover.','/images/linen-cushion.webp',45000),
('woven-throw','Fringed Woven Throw','A cream woven throw with a tactile texture and fringed edges.','/images/woven-throw.webp',95000),
('stoneware-mug','Taupe Mug','A warm taupe mug with a rounded handle and a simple profile.','/images/stoneware-mug.webp',18000),
('woven-basket','Rounded Woven Basket','A rounded woven basket for soft furnishings and everyday storage.','/images/woven-basket.webp',75000),
('lidded-box','Cream Keepsake Box','A cream rectangular box with a gold-tone edge and clasp.','/images/lidded-box.webp',38000),
('catchall-tray','Rounded Display Tray','A light-toned display tray with a rounded raised rim.','/images/catchall-tray.webp',22000),
('table-lamp','Pleated Table Lamp','A light-toned rounded base beneath a wide pleated shade.','/images/table-lamp.webp',125000),
('table-runner','Textured Table Runner','A light neutral runner for a softly layered dining table.','/images/table-runner.webp',42000),
('arched-mirror','Gold-tone Arched Mirror','A tall arched mirror with a slim gold-tone frame.','/images/arched-mirror.webp',110000),
('wood-bookends','Curved Wooden Bookends','Two curved wooden supports with rounded bases for an orderly shelf.','/images/wood-bookends.webp',58000)
) as v(id,name,description,image_path,price) where p.id=v.id;
commit;
