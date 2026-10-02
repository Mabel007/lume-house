do $$
begin
  if to_regclass('public.profiles') is not null
    or (select data_type from information_schema.columns
      where table_schema='public' and table_name='products' and column_name='id') <> 'uuid'
    or not exists (select 1 from public.orders where first_name='Test' and currency='USD' and total_cents=2300) then
    raise exception 'Rejected migration must leave legacy schema/history unchanged';
  end if;
end;
$$;
select 'PASS: populated order history blocks migration atomically without rewriting data';
rollback;
