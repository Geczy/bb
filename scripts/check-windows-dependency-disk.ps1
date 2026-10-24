$ErrorActionPreference = 'Stop'
$source = Join-Path $env:GITHUB_WORKSPACE '.github/actions/windows-dependency-cache/disk.ps1'
$original = @{}
foreach ($name in @('RUNNER_TEMP', 'GITHUB_ENV', 'GITHUB_OUTPUT')) { $original[$name] = [Environment]::GetEnvironmentVariable($name) }
$fixture = Join-Path $env:RUNNER_TEMP 'dependency-disk-fixture'
New-Item -ItemType Directory -Path $fixture | Out-Null
$env:RUNNER_TEMP = $fixture
$env:GITHUB_ENV = Join-Path $fixture 'env'
$env:GITHUB_OUTPUT = Join-Path $fixture 'output'
$disk = Join-Path $fixture 'bb-dependencies.vhdx'
function Reset-Output {
  Remove-Item $env:GITHUB_ENV, $env:GITHUB_OUTPUT -ErrorAction SilentlyContinue
}
function Assert-Fallback {
  if ((Get-Content $env:GITHUB_OUTPUT -Raw).Trim() -ne 'active=false') { throw 'Expected inactive disk' }
  if (Test-Path $env:GITHUB_ENV) { throw 'Fallback exported pnpm paths' }
}
try {
  & $source create
  if ((Get-Content $env:GITHUB_OUTPUT -Raw).Trim() -ne 'active=true') { throw 'Create failed' }
  New-Item -ItemType Directory -Path 'P:\store', 'P:\virtual-store' | Out-Null
  Set-Content 'P:\virtual-store\sentinel' 'preserved'
  & $source detach
  Reset-Output
  & $source mount
  if ((Get-Content $env:GITHUB_OUTPUT -Raw).Trim() -ne 'active=true') { throw 'Remount failed' }
  if ((Get-Content 'P:\virtual-store\sentinel' -Raw).Trim() -ne 'preserved') { throw 'Disk contents lost' }
  $exports = Get-Content $env:GITHUB_ENV
  if ('npm_config_store_dir=P:\store' -notin $exports -or 'npm_config_virtual_store_dir=P:\virtual-store' -notin $exports) { throw 'Missing pnpm paths' }
  Write-Host 'Create, detach, and remount passed'
  Reset-Output
  & $source mount
  Assert-Fallback
  if (!(Get-DiskImage -ImagePath $disk).Attached) { throw 'Occupied drive was detached' }
  Write-Host 'Occupied drive fallback passed'
  Remove-Item 'P:\store', 'P:\virtual-store' -Recurse
  & $source detach
  Reset-Output
  & $source mount
  Assert-Fallback
  if ((Get-DiskImage -ImagePath $disk).Attached) { throw 'Incomplete image remained mounted' }
  Write-Host 'Missing store fallback passed'
  Remove-Item $disk
  Set-Content $disk 'invalid disk image'
  Reset-Output
  & $source mount
  Assert-Fallback
  if (Test-Path 'P:\') { throw 'Invalid image was mounted' }
  Write-Host 'Corrupt image fallback passed'
} finally {
  foreach ($name in $original.Keys) { [Environment]::SetEnvironmentVariable($name, $original[$name]) }
}
