param([ValidateSet('create', 'mount', 'detach')][string]$Operation)
$ErrorActionPreference = 'Stop'
$disk = Join-Path $env:RUNNER_TEMP 'bb-dependencies.vhdx'
if ($Operation -ne 'detach' -and (Test-Path 'P:\')) { throw 'Benchmark drive P: already exists' }
$commands = @()
if ($Operation -eq 'create') {
  if (Test-Path $disk) { throw 'Benchmark disk already exists' }
  $commands += "create vdisk file=`"$disk`" maximum=8192 type=expandable"
}
$commands += "select vdisk file=`"$disk`""
if ($Operation -eq 'detach') {
  $commands += 'detach vdisk'
} else {
  $commands += 'attach vdisk'
  if ($Operation -eq 'create') {
    $commands += 'create partition primary'
    $commands += 'format fs=ntfs quick label=bb-dependencies'
  } else {
    $commands += 'select partition 1'
  }
  $commands += 'assign letter=P'
}
$script = Join-Path $env:RUNNER_TEMP 'bb-dependency-disk.txt'
$commands | Set-Content $script
& diskpart /s $script
if ($LASTEXITCODE -ne 0) { throw "Diskpart exited $LASTEXITCODE" }
if ($Operation -ne 'detach') {
  if (!(Test-Path 'P:\')) { throw 'Benchmark disk was not mounted' }
  New-Item -ItemType Directory -Path 'P:\node_modules' -Force | Out-Null
  New-Item -ItemType Junction -Path (Join-Path $PWD 'node_modules') -Target 'P:\node_modules' | Out-Null
  'npm_config_store_dir=P:\store' | Out-File -Append $env:GITHUB_ENV
}
