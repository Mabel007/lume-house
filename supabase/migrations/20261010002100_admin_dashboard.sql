-- Additive operational reads only; no payment confirmation or business-rule changes.
begin;
create function public.admin_dashboard_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 with stock as materialized (
  select v.id variant_id,p.name product_name,v.sku,v.inventory_policy,p.active product_active,v.active variant_active,
   i.on_hand,i.on_hand-i.allocated available_quantity
  from public.product_variants v join public.products p on p.id=v.product_id left join public.variant_inventory i on i.variant_id=v.id
 ), exhausted as materialized (
  select variant_id,product_name,sku,available_quantity from stock
  where product_active and variant_active and inventory_policy='tracked' and on_hand is not null and available_quantity=0
 ), orders as materialized (
  select id,order_reference,created_at,status,payment_status from public.orders
 ), status_totals as (
  select status,count(*) amount from orders group by status
 ), recent as (
  select * from orders where status in ('placed','confirmed','processing','ready_for_pickup','out_for_delivery') order by created_at desc,id limit 10
 ), stock_attention as (
  select * from exhausted order by product_name,variant_id limit 10
 ) select jsonb_build_object(
  'active_products',(select count(*) from public.products where active),
  'total_variants',(select count(*) from stock),
  'tracked_variants',(select count(*) from stock where inventory_policy='tracked'),
  'out_of_stock',(select count(*) from exhausted),
  'unconfigured_stock',(select count(*) from stock where product_active and variant_active and inventory_policy='tracked' and on_hand is null),
  'total_orders',(select count(*) from orders),
  'orders_placed',(select count(*) from orders where status='placed'),
  'awaiting_payment',(select count(*) from orders where payment_status='awaiting_payment'),
  'by_status',(select jsonb_object_agg(states.status,coalesce(t.amount,0)) from
   (values ('placed'),('confirmed'),('processing'),('ready_for_pickup'),('out_for_delivery'),('completed'),('cancelled')) states(status) left join status_totals t on t.status=states.status),
  'recent_orders',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc,id) from recent r),'[]'::jsonb),
  'stock_attention',coalesce((select jsonb_agg(to_jsonb(r) order by product_name,variant_id) from stock_attention r),'[]'::jsonb)
 ) into result;
 return result;
end;
$$;
revoke all on function public.admin_dashboard_v1() from public,anon,authenticated,service_role;
grant execute on function public.admin_dashboard_v1() to authenticated;
commit;
