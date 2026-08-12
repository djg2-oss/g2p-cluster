# All three next steps — best order

## Order (do not skip)

| # | Step | Status in repo |
|---|------|----------------|
| **1** | Video path (Director + RunPod) | Wired in cluster |
| **2** | Full dual-engine chat UI | Edge UI multi-turn |
| **3** | Always-on host (VPS) + optional Vercel UI | Docs below |

---

## 1) Video (on your PC — after cluster is up)

Set keys **before** start (same PowerShell window as start, or System env):

```powershell
$env:RUNPOD_API_KEY = "your_secret"
$env:RUNPOD_VIDEO_ENDPOINT_ID = "36t7uk060cachv"
$env:RUNPOD_VIDEO_MODE = "run"
powershell -ExecutionPolicy Bypass -File .\deploy\start-cluster.ps1
```

In UI http://127.0.0.1:8080/ say:

```text
generate a video of cinematic ocean sunset dolly
```

Or:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8080/api/video" -ContentType "application/json" -Body '{"text":"cinematic ocean sunset"}'
```

Poll:

```powershell
node scripts\runpod-video.mjs --status YOUR_JOB_ID
```

Without keys: you still get a **Director plan** (no GPU charge).

---

## 2) Full chat UI (done in this pack)

Open **http://127.0.0.1:8080/**

- Multi-turn chat (localStorage memory)
- Dual-engine pipeline (draft → refine)
- Optional verify checkbox
- Auto video side-path on generate-video language

---

## 3) Always-on host (VPS) + optional Vercel

### A. VPS (DigitalOcean / Hetzner / Linode — Ubuntu)

```bash
sudo apt update && sudo apt install -y git nodejs npm
# or install Node 22 via nodesource
git clone https://github.com/djg2-oss/g2p-cluster.git
cd g2p-cluster
export RUNPOD_API_KEY=...
export RUNPOD_VIDEO_ENDPOINT_ID=36t7uk060cachv
export RUNPOD_VIDEO_MODE=run
# Docker if available:
docker compose up -d
# OR:
bash deploy/start-cluster.sh
```

Open firewall port **8080**.  
Your public API: `http://YOUR_VPS_IP:8080`

Optional systemd: run `deploy/start-cluster.sh` on boot.

### B. Vercel (UI only — agent site)

1. Import `djg2-oss/g2p-cluster` or agent app repo  
2. Framework: Vite / Other  
3. Env:
   - `VITE_CLUSTER_API=https://your-vps-or-domain:8080`  
   - Do **not** put `RUNPOD_API_KEY` in Vercel client env (browser-exposed).  
     Keep GPU keys only on VPS backends.

4. Deploy  

If Vercel hosts only static FE, point fetch URLs to the VPS cluster.

### C. Security note

- Put **Caddy/Nginx** TLS in front of :8080 on VPS  
- Restrict RunPod key to server env only  
- Optional API key header later  

---

## Checklist

- [ ] Local cluster healthy  
- [ ] Chat UI works  
- [ ] Video plan works without key  
- [ ] Video job works with RunPod key  
- [ ] VPS cluster 24/7  
- [ ] Optional Vercel front → VPS API  
