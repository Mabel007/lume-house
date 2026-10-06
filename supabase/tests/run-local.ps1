# Local-only disposable PostgreSQL. Never uses project credentials or hosted URLs.
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
  Run-Sql 'ownership, constraints, historical snapshots' (Read-Sql (Join-Path $testRoot 'commerce.sql'))
  Run-Sql 'trusted atomic checkout/idempotency/email leases' (Read-Sql (Join-Path $testRoot 'checkout.sql'))
  Run-Sql 'trusted business authorization migration' (Read-Sql (Join-Path $supabaseRoot 'migrations/20261006001000_business_admin.sql'))
  Run-Sql 'business authorization security' (Read-Sql (Join-Path $testRoot 'admin.sql'))
  Run-Sql 'fixture rollback leaves no identities/private data' @'
do $$
begin
  if exists(select 1 from auth.users) or exists(select 1 from public.profiles)
    or exists(select 1 from public.carts) or exists(select 1 from public.orders)
    or exists(select 1 from public.order_confirmation_jobs)
    or (select count(*) from public.products where active and currency='NLE') <> 20 then
    raise exception 'Unexpected fixture persistence or seed mutation';
  end if;
end;
$$;
select 'PASS: rollback fixtures gone; twenty active NLE products remain';
'@
} finally {
  if ($created) {
    docker stop $containerName
    if ($LASTEXITCODE -ne 0) { throw 'Failed to remove isolated test container' }
  }
}
