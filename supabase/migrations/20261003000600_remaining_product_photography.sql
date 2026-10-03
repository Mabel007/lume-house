-- Additional inspected owner-supplied images; immutable history and prices unchanged.
begin;
lock table public.products in share row exclusive mode;
do $$ begin
if exists(select 1 from (values
('serving-board','Wooden Serving Board','A warm wooden serving board with a rounded handle and visible grain.','/images/serving-board.webp',48000),
('pillar-holder','Sculptural Candle Holder','A flowing cream candle holder with three raised taper supports.','/images/pillar-holder.webp',32000),
('incense-dish','Ceramic Incense Dish','A shallow textured dish with a central support for an incense stick.','/images/incense-dish.webp',16000),
('napkin-set','Neutral Napkin Pair','Two soft neutral napkins, rolled and tied for a considered table setting.','/images/napkin-set.webp',30000),
('ceramic-planter','Ribbed Ceramic Planter','An ivory ribbed planter with a matching shallow saucer.','/images/ceramic-planter.webp',40000),
('glass-carafe','Glass Carafe','A clear glass carafe with a gently curved waist and a cork-style stopper.','/images/glass-carafe.webp',28000)
) as v(id,name,description,image_path,price) left join public.products p on p.id=v.id where p.id is null or p.currency<>'NLE' or not p.active or p.price_cents<>v.price) then raise exception 'Additional photography requires reviewed existing products/prices'; end if;
end; $$;
update public.products p set name=v.name,description=v.description,image_path=v.image_path from (values
('serving-board','Wooden Serving Board','A warm wooden serving board with a rounded handle and visible grain.','/images/serving-board.webp',48000),
('pillar-holder','Sculptural Candle Holder','A flowing cream candle holder with three raised taper supports.','/images/pillar-holder.webp',32000),
('incense-dish','Ceramic Incense Dish','A shallow textured dish with a central support for an incense stick.','/images/incense-dish.webp',16000),
('napkin-set','Neutral Napkin Pair','Two soft neutral napkins, rolled and tied for a considered table setting.','/images/napkin-set.webp',30000),
('ceramic-planter','Ribbed Ceramic Planter','An ivory ribbed planter with a matching shallow saucer.','/images/ceramic-planter.webp',40000),
('glass-carafe','Glass Carafe','A clear glass carafe with a gently curved waist and a cork-style stopper.','/images/glass-carafe.webp',28000)
) as v(id,name,description,image_path,price) where p.id=v.id;
commit;
