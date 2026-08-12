# Video GPU — optimized RunPod path

## Best order (do in this sequence)

### Step 1 — Agent G2P core (foundation)
- Deploy / run Agent G2P (Vercel or local)
- **No** API key required for math / life / build / memory
- Confirm chat works before stressing GPU

### Step 2 — RunPod WAN + LoRA (GPU) ← optimize & prove here
```powershell
$env:RUNPOD_API_KEY = "your_secret"
$env:RUNPOD_VIDEO_ENDPOINT_ID = "36t7uk060cachv"
$env:RUNPOD_VIDEO_MODE = "run"
```

Submit (async — returns fast):
```powershell
node scripts\runpod-video.mjs "cinematic ocean sunset"
```

Poll:
```powershell
node scripts\runpod-video.mjs --status JOB_ID
```

Wait until done:
```powershell
node scripts\runpod-video.mjs --wait "cinematic ocean sunset"
```

Optional LoRA (when worker supports it):
```powershell
$env:RUNPOD_LORA_JSON = '[{"name":"your_lora","strength":0.8}]'
```

Optional image-to-video:
```powershell
$env:RUNPOD_IMAGE_URL = "https://example.com/start-frame.jpg"
```

### Step 3 — Dual backends + backup frontend (later)
```bash
sh deploy/start-cluster.sh
# or: docker compose up -d
```
Gives 2 BE + 2 FE + LB. Does not replace RunPod GPU.

---

## Why this order
1. Core agent stable first  
2. GPU proven second (you already hit IN_QUEUE)  
3. HA topology last (ops, not intelligence)

## Architecture
```
Agent G2P → RunPod 36t7uk060cachv → WAN 2.2 + LoRA
```
Railway cinematic host = optional, not required.

## Optimizations in client
- Async `/run` default (chat never blocks on GPU)
- Endpoint ID normalizer (strips `/runsync` mistakes)
- Backoff status polling (2s → 8s)
- Flexible video URL extraction
- WAN defaults (480×832, length 81, steps 10)
- Optional LoRA via `RUNPOD_LORA_JSON`
- Optional start image via `RUNPOD_IMAGE_URL`
- Quality-only negative prompt (not a non-explicit ban)
