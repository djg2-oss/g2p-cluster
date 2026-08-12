# Stop G2P cluster Node processes started for this project
Write-Host "Stopping node processes for G2P cluster (backend / static-server / proxy)..."
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -match 'backend\.mjs|static-server\.mjs|proxy\.mjs'
  } |
  ForEach-Object {
    Write-Host "  kill PID $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
Write-Host "Done."
