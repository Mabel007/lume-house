# Disposable network-disabled PostgreSQL only; never reads project env files.
$ErrorActionPreference = 'Stop'
$testRoot = $PSScriptRoot
$supabaseRoot = Split-Path $testRoot -Parent
$repoRoot = Split-Path $supabaseRoot -Parent
$containerName = 'lume-s02-slice-tests-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$created = $false
function Run-Sql([string]$label,[string]$path) {
  Write-Output "CHECK: $label"
  Get-Content -LiteralPath $path -Raw -Encoding UTF8 | docker exec -i $containerName psql -U postgres -v ON_ERROR_STOP=1 -v LUME_DISPOSABLE_TEST=1 -At
  if ($LASTEXITCODE -ne 0) { throw "SQL check failed: $label" }
}
try {
  docker run --detach --rm --network none --name $containerName -e POSTGRES_HOST_AUTH_METHOD=trust postgres:14.1-alpine
  if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated test container' }
  $created = $true
  $ready = $false
  for ($attempt=0;$attempt -lt 50;$attempt++) {
    docker exec $containerName pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready=$true;break }
    Start-Sleep -Milliseconds 200
  }
  if (-not $ready) { throw 'Local PostgreSQL did not become ready' }
  Run-Sql 'isolated Auth/roles' (Join-Path $testRoot 'bootstrap.sql')
  foreach ($migration in (Get-ChildItem (Join-Path $supabaseRoot 'migrations') -Filter '*.sql' | Sort-Object Name)) {
    if ($migration.Name -eq '20261010002300_product_media_storage.sql') {
      Run-Sql 'disposable Storage policy model' (Join-Path $testRoot 'storage-media-bootstrap.sql')
    }
    Run-Sql $migration.Name $migration.FullName
    if ($migration.Name -eq '20261002000400_atomic_checkout_email.sql') {
      Run-Sql 'reviewed local catalogue' (Join-Path $supabaseRoot 'seed.sql')
    }
  }
  Run-Sql 'address RLS and CRUD' (Join-Path $repoRoot 'tests/addresses-rls.test.sql')
  Run-Sql 'actual retry and notification security' (Join-Path $testRoot 's02-security.sql')
  Run-Sql 'migration privilege validation' (Join-Path $repoRoot 'tests/s02-migration-validation.sql')
  node (Join-Path $testRoot 's02-concurrency.mjs') $containerName
  if ($LASTEXITCODE -ne 0) { throw 'S02 two-session checks failed' }
  Write-Output 'PASS: focused S02 SQL/RLS/concurrency checks'
} finally {
  if ($created) {
    docker stop $containerName
    if ($LASTEXITCODE -ne 0) { throw 'Failed to remove isolated test container' }
  }
}
