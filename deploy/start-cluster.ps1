# Agent G2P dual-engine cluster — Windows PowerShell (no Docker required)
# Usage:  powershell -ExecutionPolicy Bypass -File deploy\start-cluster.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Test-Path (Join-Path $Root "src\server\backend.mjs"))) {
  $Root = Get-Location
}
Set-Location $Root
Write-Host "G2P cluster root: $Root"

function Start-G2PNode($Title, $EnvMap, $ScriptRel) {
  $envBlock = ($EnvMap.GetEnumerator() | ForEach-Object { "`$env:$($_.Key)='$($_.Value)';" }) -join " "
  $script = Join-Path $Root $ScriptRel
  $cmd = "$envBlock node `"$script`""
  Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoProfile", "-WindowStyle", "Minimized", "-Command", $cmd
  ) -WorkingDirectory $Root | Out-Null
  Write-Host "  started $Title"
}

# Free note: user can close minimized windows to stop

# Endpoint ID is public (your WAN worker) — baked in. API key is secret — env only.
if (-not $env:RUNPOD_VIDEO_ENDPOINT_ID) { $env:RUNPOD_VIDEO_ENDPOINT_ID = "36t7uk060cachv" }
if (-not $env:RUNPOD_VIDEO_MODE) { $env:RUNPOD_VIDEO_MODE = "run" }
$rp = @{
  RUNPOD_VIDEO_ENDPOINT_ID = $env:RUNPOD_VIDEO_ENDPOINT_ID
  RUNPOD_VIDEO_MODE = $env:RUNPOD_VIDEO_MODE
}
if ($env:RUNPOD_API_KEY) { $rp.RUNPOD_API_KEY = $env:RUNPOD_API_KEY }
if ($env:RUNPOD_LORA_JSON) { $rp.RUNPOD_LORA_JSON = $env:RUNPOD_LORA_JSON }
if ($env:RUNPOD_API_KEY) {
  Write-Host "RunPod: endpoint 36t7uk060cachv + API key present"
} else {
  Write-Host "RunPod: endpoint baked in. Still need RUNPOD_API_KEY for GPU submit."
}

function Merge-Env([hashtable]$a, [hashtable]$b) {
  $o = @{}; foreach ($k in $a.Keys) { $o[$k] = $a[$k] }; foreach ($k in $b.Keys) { $o[$k] = $b[$k] }; $o
}

Start-G2PNode "be-1 draft" (Merge-Env @{
  HOST_ID = "be-1"; PORT = "3001"; ENGINE_ROLE = "draft"
  PEER_URL = "http://127.0.0.1:3002"; VERIFY_URL = "http://127.0.0.1:3003"
  PIPELINE_CACHE_TTL_MS = "120000"
} $rp) "src\server\backend.mjs"

Start-G2PNode "be-2 refine" (Merge-Env @{
  HOST_ID = "be-2"; PORT = "3002"; ENGINE_ROLE = "refine"
  PEER_URL = "http://127.0.0.1:3001"; VERIFY_URL = "http://127.0.0.1:3003"
  PIPELINE_CACHE_TTL_MS = "120000"
} $rp) "src\server\backend.mjs"

Start-G2PNode "be-v verify" @{
  HOST_ID = "be-v"; PORT = "3003"; ENGINE_ROLE = "verify"
} "src\server\backend.mjs"

Start-G2PNode "fe-1" @{ HOST_ID = "fe-1"; PORT = "5173" } "deploy\fe\static-server.mjs"
Start-G2PNode "fe-2" @{ HOST_ID = "fe-2"; PORT = "5174" } "deploy\fe\static-server.mjs"

Start-G2PNode "lb" @{
  LB_PORT = "8080"
  BACKENDS = "http://127.0.0.1:3001,http://127.0.0.1:3002"
  FRONTENDS = "http://127.0.0.1:5173,http://127.0.0.1:5174"
} "deploy\lb\proxy.mjs"

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "Health:"
try {
  $h = Invoke-RestMethod "http://127.0.0.1:8080/lb/health"
  $h | ConvertTo-Json -Compress
  Write-Host ""
  Write-Host "OK  UI:      http://127.0.0.1:8080/"
  Write-Host "OK  Metrics: http://127.0.0.1:8080/metrics.html"
  Write-Host "OK  Pipeline test:"
  Write-Host '    Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/api/pipeline -ContentType application/json -Body ''{"text":"solve 2x^2+3x-5=0"}'''
} catch {
  Write-Host "WARN: LB not up yet. Wait 2s and run:"
  Write-Host "  Invoke-RestMethod http://127.0.0.1:8080/lb/health"
  Write-Host $_.Exception.Message
}
