# Local-only disposable PostgreSQL. Never uses project credentials or hosted URLs.
param([switch]$DirectOrderOnly)
$ErrorActionPreference = 'Stop'
$testRoot = $PSScriptRoot
$supabaseRoot = Split-Path $testRoot -Parent
$containerName = 'lume-foundation-sql-check'
$created = $false
function Read-Sql([string]$path) { Get-Content -LiteralPath $path -Raw -Encoding UTF8 }
function Run-Sql([string]$label, [string]$sql) {
  Write-Output "CHECK: $label"
  $sql | docker exec -i $containerName psql -U postgres -v ON_ERROR_STOP=1 -At
  if ($LASTEXITCODE -ne 0) { throw "SQL check failed: $label" }
}
function Run-DirectChecks {
  $directOrder = Read-Sql (Join-Path $supabaseRoot 'migrations/20261023002800_direct_order_contract.sql')
  $directBody = $directOrder -replace '(?m)^begin;\s*$', '' -replace '(?m)^commit;\s*$', ''
  Run-Sql 'direct source migration preserves populated orders and old retries' ((Read-Sql (Join-Path $testRoot 'direct-source-before.sql')) + $directBody + (Read-Sql (Join-Path $testRoot 'direct-source-after.sql')))
  Run-Sql 'direct-order source and trusted single-item contract' $directOrder
  Run-Sql 'direct placement, no Bag writes, replay and privilege boundary' (Read-Sql (Join-Path $testRoot 'direct-order.sql'))
  foreach($suite in @('checkout','variant-checkout','inventory')) {
    Run-Sql 'existing checkout regression after direct-order migration' (Read-Sql (Join-Path $testRoot ($suite+'.sql')))
  }
  node (Join-Path $testRoot 'direct-order-concurrency.mjs') $containerName
  if ($LASTEXITCODE -ne 0) { throw 'Direct-order two-session concurrency checks failed' }
}
try {
  docker run --detach --rm --network none --name $containerName -e POSTGRES_HOST_AUTH_METHOD=trust postgres:14.1-alpine
  if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated test container' }
  $created = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $containerName pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 200
  }
  if (-not $ready) { throw 'Local PostgreSQL did not become ready' }
  Run-Sql 'isolated Auth/role bootstrap' (Read-Sql (Join-Path $testRoot 'bootstrap.sql'))
  Run-Sql 'unchanged original migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261002000100_commerce_foundation.sql'))
  $forward = Read-Sql (Join-Path $supabaseRoot 'migrations/20261002000200_lume_house_foundation.sql')
  # Exercise the exact forward body inside rollback-only fixture transactions.
  $body = $forward -replace '(?m)^begin;\s*$', '' -replace '(?m)^commit;\s*$', ''
  $guard = @'
do $guard$
begin
  begin
    execute $migration$
'@ + $body + @'
$migration$;
  exception when raise_exception then
    if sqlerrm <> 'Existing orders require a reviewed data migration before Lume House reconciliation' then raise; end if;
    return;
  end;
  raise exception 'Expected populated-order guard to reject migration';
end;
$guard$;
'@
  Run-Sql 'populated-order refusal and rollback' ((Read-Sql (Join-Path $testRoot 'migration-guard-before.sql')) + $guard + (Read-Sql (Join-Path $testRoot 'migration-guard-after.sql')))
  Run-Sql 'legacy UUID/cart preservation and rollback' ((Read-Sql (Join-Path $testRoot 'reconciliation-before.sql')) + $body + (Read-Sql (Join-Path $testRoot 'reconciliation-after.sql')))
  Run-Sql 'forward migration' $forward
  $zones = Read-Sql (Join-Path $supabaseRoot 'migrations/20261002000300_delivery_zone_snapshots.sql')
  $zoneBody = $zones -replace '(?m)^begin;\s*$', '' -replace '(?m)^commit;\s*$', ''
  Run-Sql 'zone migration preserves legacy orders and security' ((Read-Sql (Join-Path $testRoot 'zones-before.sql')) + $zoneBody + (Read-Sql (Join-Path $testRoot 'zones-after.sql')))
  Run-Sql 'zone snapshot migration' $zones
  Run-Sql 'atomic checkout/email forward migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261002000400_atomic_checkout_email.sql'))
  $seed = Read-Sql (Join-Path $supabaseRoot 'seed.sql')
  Run-Sql 'NLE seed first run' $seed
  Run-Sql 'NLE seed repeated' $seed
  Run-Sql 'reviewed photography metadata migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261003000500_product_photography.sql'))
  Run-Sql 'additional reviewed photography metadata migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261003000600_remaining_product_photography.sql'))
  $variants = Read-Sql (Join-Path $supabaseRoot 'migrations/20261005000700_product_variant_foundation.sql')
  $variantBody = $variants -replace '(?m)^begin;\s*$', '' -replace '(?m)^commit;\s*$', ''
  Run-Sql 'variant expansion preserves legacy history and rollback' ((Read-Sql (Join-Path $testRoot 'variants-before.sql')) + $variantBody + (Read-Sql (Join-Path $testRoot 'variants-after.sql')))
  Run-Sql 'additive variant foundation' $variants
  Run-Sql 'variant ownership, constraints and compatibility' (Read-Sql (Join-Path $testRoot 'variants.sql'))
  $variantCheckout = Read-Sql (Join-Path $supabaseRoot 'migrations/20261005000800_variant_bag_checkout.sql')
  $variantCheckoutBody = $variantCheckout -replace '(?m)^begin;\s*$', '' -replace '(?m)^commit;\s*$', ''
  Run-Sql 'variant checkout expansion preserves legacy data' ((Read-Sql (Join-Path $testRoot 'variant-checkout-before.sql')) + $variantCheckoutBody + (Read-Sql (Join-Path $testRoot 'variant-checkout-after.sql')))
  Run-Sql 'variant cart and trusted checkout migration' $variantCheckout
  Run-Sql 'variant cart, merge, snapshots and checkout security' (Read-Sql (Join-Path $testRoot 'variant-checkout.sql'))
  $inventory = Read-Sql (Join-Path $supabaseRoot 'migrations/20261005000900_variant_inventory.sql')
  $inventoryBody = $inventory -replace '(?m)^begin;\s*$', '' -replace '(?m)^commit;\s*$', ''
  Run-Sql 'inventory migration preserves populated legacy history' ((Read-Sql (Join-Path $testRoot 'variant-checkout-before.sql')) + $inventoryBody + (Read-Sql (Join-Path $testRoot 'variant-checkout-after.sql')))
  Run-Sql 'inventory foundation without fabricated counts' $inventory
  Run-Sql 'finite stock allocation, ledger and security' (Read-Sql (Join-Path $testRoot 'inventory.sql'))
  if ($DirectOrderOnly) { Run-DirectChecks; return }
  Run-Sql 'ownership, constraints, historical snapshots' (Read-Sql (Join-Path $testRoot 'commerce.sql'))
  Run-Sql 'trusted atomic checkout/idempotency/email leases' (Read-Sql (Join-Path $testRoot 'checkout.sql'))
  Run-Sql 'trusted business authorization migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261006001000_business_admin.sql'))
  Run-Sql 'business authorization security' (Read-Sql (Join-Path $testRoot 'admin.sql'))
  Run-Sql 'admin products migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261006001100_admin_products.sql'))
  Run-Sql 'admin products security and history' (Read-Sql (Join-Path $testRoot 'admin-products.sql'))
  Run-Sql 'admin variants migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261006001200_admin_variants.sql'))
  Run-Sql 'admin variant safety' (Read-Sql (Join-Path $testRoot 'admin-variants.sql'))
  Run-Sql 'admin inventory migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261006001300_admin_inventory.sql'))
  Run-Sql 'admin inventory operations' (Read-Sql (Join-Path $testRoot 'admin-inventory.sql'))
  Run-Sql 'admin order lifecycle migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261006001400_admin_orders.sql'))
  Run-Sql 'admin order transitions and atomic inventory' (Read-Sql (Join-Path $testRoot 'admin-orders.sql'))
  Run-Sql 'product creation receipts migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261006001500_product_creation_receipts.sql'))
  Run-Sql 'idempotent product creation' (Read-Sql (Join-Path $testRoot 'product-creation.sql'))
  Run-Sql 'reviewed media foundation' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261006001600_product_media_foundation.sql'))
  Run-Sql 'reviewed media security' (Read-Sql (Join-Path $testRoot 'media.sql'))
  Run-Sql 'membership operations' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261006001700_admin_membership_operations.sql'))
  Run-Sql 'membership authorization and revocation' (Read-Sql (Join-Path $testRoot 'memberships.sql'))
  Run-Sql 'customer cancellation requests' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261006001800_cancellation_requests.sql'))
  Run-Sql 'cancellation request security and stock boundary' (Read-Sql (Join-Path $testRoot 'cancellation-requests.sql'))
  Run-Sql 'additive admin pagination contracts' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261010001900_admin_pagination.sql'))
  Run-Sql 'atomic bounded admin exports' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261010002000_admin_exports.sql'))
  Run-Sql 'admin pagination authorization and volume' (Read-Sql (Join-Path $testRoot 'admin-pagination.sql'))
  Run-Sql 'dashboard aggregate migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261010002100_admin_dashboard.sql'))
  Run-Sql 'dashboard counts and authorization' (Read-Sql (Join-Path $testRoot 'admin-dashboard.sql'))
  Run-Sql 'manual fulfilment additive contract' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261010002150_manual_fulfilment.sql'))
  Run-Sql 'permanent fulfilment HTTP conflict' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261012002600_fulfilment_conflict_http.sql'))
  Run-Sql 'manual fulfilment authorization and preservation' (Read-Sql (Join-Path $testRoot 'fulfilment.sql'))
  node (Join-Path $testRoot 'fulfilment-concurrency.mjs') $containerName
  if ($LASTEXITCODE -ne 0) { throw 'Fulfilment two-session concurrency checks failed' }
  Run-Sql 'additive product gallery migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261010002200_product_galleries.sql'))
  Run-Sql 'product gallery security and ordering' (Read-Sql (Join-Path $testRoot 'product-gallery.sql'))
  Run-Sql 'disposable Storage policy model' (Read-Sql (Join-Path $testRoot 'storage-media-bootstrap.sql'))
  Run-Sql 'private product Storage migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261010002300_product_media_storage.sql'))
  Run-Sql 'Storage policy denial model' (Read-Sql (Join-Path $testRoot 'storage-media.sql'))
  Run-Sql 'disabled owner/staff MVP foundation' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261011002400_business_roles_mvp.sql'))
  # admin-products tests the pre-01500 creation contract at its original position
  # above; final-schema product creation is covered by product-creation instead.
  foreach($suite in @('admin','admin-variants','admin-inventory','admin-orders','product-creation','media','memberships','cancellation-requests','admin-pagination','admin-dashboard')) {
    Run-Sql 'legacy regression with disabled role migration installed' (Read-Sql (Join-Path $testRoot ($suite+'.sql')))
  }
  Run-Sql 'owner/staff isolation and legacy bypass' (Read-Sql (Join-Path $testRoot 'business-roles.sql'))
  node (Join-Path $testRoot 'business-roles-concurrency.mjs') $containerName
  if ($LASTEXITCODE -ne 0) { throw 'Role concurrency checks failed' }
  Run-Sql 'additive filter/sort/analytics contracts' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261011002500_admin_filters_analytics.sql'))
  Run-Sql 'filter/export/analytics authorization and correctness' (Read-Sql (Join-Path $testRoot 'admin-filter-analytics.sql'))
  node (Join-Path $testRoot 'admin-filter-concurrency.mjs') $containerName
  if ($LASTEXITCODE -ne 0) { throw 'Filter/analytics read concurrency failed' }
  Run-Sql 'permanent admin HTTP conflicts' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261012002700_admin_conflict_http.sql'))
  Run-Sql 'final admin conflict and preservation regressions' (Read-Sql (Join-Path $testRoot 'admin-conflicts.sql'))
  Run-DirectChecks
  Run-Sql 'fixture rollback leaves no identities/private data' @'
do $$
begin
  if exists(select 1 from auth.users) or exists(select 1 from public.profiles)
    or exists(select 1 from public.carts) or exists(select 1 from public.orders)
    or exists(select 1 from public.order_confirmation_jobs)
    or exists(select 1 from public.business_admins)
    or exists(select 1 from public.business_admin_history)
    or exists(select 1 from public.business_roles)
    or exists(select 1 from public.business_role_history)
    or exists(select 1 from public.business_role_activation)
    or (select enabled from public.business_role_control)
    or exists(select 1 from public.order_cancellation_requests)
    or exists(select 1 from public.business_order_operations)
    or exists(select 1 from public.business_order_fulfilment)
    or exists(select 1 from public.business_fulfilment_operations)
    or exists(select 1 from public.business_product_creations)
    or exists(select 1 from public.variant_inventory)
    or exists(select 1 from public.inventory_ledger)
    or (select count(*) from public.product_variants) <> 20
    or (select count(*) from public.products where active and currency='NLE') <> 20 then
    raise exception 'Unexpected fixture persistence or seed mutation';
  end if;
end;
$$;
select 'PASS: rollback fixtures gone; twenty active NLE products remain';
select 'PASS: admin, operation and stock fixtures absent; twenty genuine default variants remain';
'@
} finally {
  if ($created) {
    docker stop $containerName
    if ($LASTEXITCODE -ne 0) { throw 'Failed to remove isolated test container' }
  }
}
