-- RLS tests for customer_addresses
-- Run with: psql -f tests/addresses-rls.test.sql
-- Requires: disposable local SQL harness (never run on production)

begin;

-- Setup: Create two test customers
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'::uuid),
  ('22222222-2222-2222-2222-222222222222'::uuid)
on conflict (id) do nothing;

-- Test 1: Customer can insert their own address
set local role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.customer_addresses (customer_id, label, street_address, area, city, zone_id)
values ('11111111-1111-1111-1111-111111111111'::uuid, 'Home', '123 Test St', 'Lumley', 'Freetown', 'zone-1');

do $$
begin
  if not exists (
    select 1 from public.customer_addresses
    where customer_id = '11111111-1111-1111-1111-111111111111'::uuid
    and label = 'Home'
  ) then
    raise exception 'TEST 1 FAILED: Customer cannot insert their own address';
  end if;
  raise notice 'TEST 1 PASSED: Customer can insert their own address';
end $$;

-- Test 2: Customer cannot insert address for another customer
do $$
begin
  begin
    insert into public.customer_addresses (customer_id, label, street_address, area, city, zone_id)
    values ('22222222-2222-2222-2222-222222222222'::uuid, 'Work', '456 Other St', 'Lumley', 'Freetown', 'zone-2');
    raise exception 'TEST 2 FAILED: Customer inserted address for another customer (RLS bypass)';
  exception when others then
    if sqlerrm like '%TEST 2 FAILED%' then
      raise;
    end if;
    raise notice 'TEST 2 PASSED: Customer cannot insert address for another customer';
  end;
end $$;

-- Populate a genuine other-owner row before negative SELECT/UPDATE checks.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into public.customer_addresses(customer_id,label,street_address,area,city,zone_id)
values(auth.uid(),'Secret','Other street','Lumley','Freetown','zone-1');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- Test 3: Customer can only select their own addresses
do $$
declare
  addr_count integer;
begin
  select count(*) into addr_count
  from public.customer_addresses
  where customer_id = '22222222-2222-2222-2222-222222222222'::uuid;
  
  if addr_count <> 0 then
    raise exception 'TEST 3 FAILED: Customer can see another customer''s addresses';
  end if;
  
  select count(*) into addr_count
  from public.customer_addresses
  where customer_id = '11111111-1111-1111-1111-111111111111'::uuid;
  
  if addr_count <> 1 then
    raise exception 'TEST 3 FAILED: Customer cannot see their own addresses';
  end if;
  
  raise notice 'TEST 3 PASSED: Customer can only select their own addresses';
end $$;

-- Test 4: Customer can update their own address
update public.customer_addresses
set street_address = '456 Updated St'
where customer_id = '11111111-1111-1111-1111-111111111111'::uuid
and label = 'Home';

do $$
begin
  if not exists (
    select 1 from public.customer_addresses
    where customer_id = '11111111-1111-1111-1111-111111111111'::uuid
    and street_address = '456 Updated St'
  ) then
    raise exception 'TEST 4 FAILED: Customer cannot update their own address';
  end if;
  raise notice 'TEST 4 PASSED: Customer can update their own address';
end $$;

-- Test 5: Customer cannot update another customer's address
do $$
begin
  begin
    update public.customer_addresses
    set street_address = 'HACKED'
    where customer_id = '22222222-2222-2222-2222-222222222222'::uuid;
    
    if found then
      raise exception 'TEST 5 FAILED: Customer updated another customer''s address (RLS bypass)';
    end if;
  exception when others then
    if sqlerrm like '%TEST 5 FAILED%' then
      raise;
    end if;
  end;
  raise notice 'TEST 5 PASSED: Customer cannot update another customer''s address';
end $$;

-- Test 6: Customer cannot change ownership via update
do $$
begin
  begin
    update public.customer_addresses
    set customer_id = '22222222-2222-2222-2222-222222222222'::uuid
    where customer_id = '11111111-1111-1111-1111-111111111111'::uuid
    and label = 'Home';
    
    if found then
      raise exception 'TEST 6 FAILED: Customer changed address ownership (RLS bypass)';
    end if;
  exception when others then
    if sqlerrm like '%TEST 6 FAILED%' then
      raise;
    end if;
  end;
  raise notice 'TEST 6 PASSED: Customer cannot change ownership via update';
end $$;

-- Test 7: Customer can delete their own address
insert into public.customer_addresses (customer_id, label, street_address, area, city, zone_id)
values ('11111111-1111-1111-1111-111111111111'::uuid, 'Work', '789 Delete Me', 'Lumley', 'Freetown', 'zone-2');

delete from public.customer_addresses
where customer_id = '11111111-1111-1111-1111-111111111111'::uuid
and label = 'Work';

do $$
begin
  if exists (
    select 1 from public.customer_addresses
    where customer_id = '11111111-1111-1111-1111-111111111111'::uuid
    and label = 'Work'
  ) then
    raise exception 'TEST 7 FAILED: Customer cannot delete their own address';
  end if;
  raise notice 'TEST 7 PASSED: Customer can delete their own address';
end $$;

-- Test 8: Customer cannot delete another customer's address
-- First, switch to customer 2 context and insert an address
set local role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

insert into public.customer_addresses (customer_id, label, street_address, area, city, zone_id)
values ('22222222-2222-2222-2222-222222222222'::uuid, 'Home', '999 Safe St', 'Lumley', 'Freetown', 'zone-1');

-- Now switch back to customer 1 and try to delete customer 2's address
set local role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  rows_affected integer;
begin
  delete from public.customer_addresses
  where customer_id = '22222222-2222-2222-2222-222222222222'::uuid;
  
  get diagnostics rows_affected = row_count;
  
  if rows_affected > 0 then
    raise exception 'TEST 8 FAILED: Customer deleted another customer''s address (RLS bypass)';
  end if;
  raise notice 'TEST 8 PASSED: Customer cannot delete another customer''s address';
end $$;

-- Test 9: Max 5 addresses per customer enforced
insert into public.customer_addresses (customer_id, label, street_address, area, city, zone_id)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Addr2', '2nd St', 'Lumley', 'Freetown', 'zone-1'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Addr3', '3rd St', 'Lumley', 'Freetown', 'zone-1'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Addr4', '4th St', 'Lumley', 'Freetown', 'zone-1'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Addr5', '5th St', 'Lumley', 'Freetown', 'zone-1');

do $$
begin
  begin
    insert into public.customer_addresses (customer_id, label, street_address, area, city, zone_id)
    values ('11111111-1111-1111-1111-111111111111'::uuid, 'Addr6', '6th St', 'Lumley', 'Freetown', 'zone-1');
    raise exception 'TEST 9 FAILED: Customer created 6th address (limit not enforced)';
  exception when others then
    if sqlerrm like '%TEST 9 FAILED%' then
      raise;
    end if;
    if sqlerrm not like '%address_limit_reached%' then
      raise exception 'TEST 9 FAILED: Wrong error message: %', sqlerrm;
    end if;
  end;
  raise notice 'TEST 9 PASSED: Max 5 addresses per customer enforced';
end $$;

-- Test 10: Unique label per customer enforced
-- Use customer 2 who has fewer addresses (only 'Work' from Test 8 setup, but that was in customer 1 context)
-- First, ensure customer 2 has at least one address
set local role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

insert into public.customer_addresses (customer_id, label, street_address, area, city, zone_id)
values ('22222222-2222-2222-2222-222222222222'::uuid, 'TestLabel', 'Test St', 'Lumley', 'Freetown', 'zone-1');

do $$
begin
  begin
    -- Try to insert duplicate label for same customer
    insert into public.customer_addresses (customer_id, label, street_address, area, city, zone_id)
    values ('22222222-2222-2222-2222-222222222222'::uuid, 'TestLabel', 'Duplicate St', 'Lumley', 'Freetown', 'zone-1');
    raise exception 'TEST 10 FAILED: Customer created duplicate label (unique constraint not enforced)';
  exception when unique_violation then
    -- SQLSTATE 23505 is unique_violation
    null; -- Expected
  when others then
    raise exception 'TEST 10 FAILED: Wrong error type: % (%)', sqlerrm, sqlstate;
  end;
  raise notice 'TEST 10 PASSED: Unique label per customer enforced';
end $$;

-- Test 11: Atomic default address switching
-- Switch to customer 2 context
set local role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select public.save_customer_address(null,'{"label":"Work","street_address":"Work St","area":"Lumley","city":"Freetown","zone_id":"zone-2","is_default":true}'::jsonb);

-- Call set_default_address with correct signature (1 argument)
select public.set_default_address(
  (select id from public.customer_addresses 
   where customer_id = '22222222-2222-2222-2222-222222222222'::uuid 
   and label = 'Home')
);

do $$
declare
  default_count integer;
begin
  select count(*) into default_count
  from public.customer_addresses
  where customer_id = '22222222-2222-2222-2222-222222222222'::uuid
  and is_default = true;
  
  if default_count <> 1 then
    raise exception 'TEST 11 FAILED: Expected 1 default address, found %', default_count;
  end if;
  
  if not exists (
    select 1 from public.customer_addresses
    where customer_id = '22222222-2222-2222-2222-222222222222'::uuid
    and label = 'Home'
    and is_default = true
  ) then
    raise exception 'TEST 11 FAILED: Home address not set as default';
  end if;
  
  raise notice 'TEST 11 PASSED: Atomic default address switching works';
end $$;

-- Cleanup
reset role;
delete from public.customer_addresses where customer_id in (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
);
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
);

rollback;
