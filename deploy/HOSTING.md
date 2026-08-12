# Agent G2P — 2 FE + 2 BE + LB

```
        ┌─────────────┐
        │  LB :8080   │
        └──────┬──────┘
     ┌─────────┴─────────┐
     │                   │
 /api/*               UI /*
     │                   │
┌────┴────┐         ┌────┴────┐
│ BE-1    │         │ FE-1    │
│ :3001   │         │ :5173   │
└────┬────┘         └────┬────┘
┌────┴────┐         ┌────┴────┐
│ BE-2    │         │ FE-2    │
│ :3002   │         │ :5174   │  ← backup FE
└─────────┘         └─────────┘
```

## Start (local / VPS)

```bash
sh deploy/start-cluster.sh
# open http://HOST:8080
```

## Docker

```bash
docker compose up -d
```

## Roles

| Node | Port | Role |
|------|------|------|
| **lb** | 8080 | Edge — round-robin API + UI |
| **be-1** | 3001 | Backend primary |
| **be-2** | 3002 | Backend secondary |
| **fe-1** | 5173 | Frontend primary |
| **fe-2** | 5174 | Frontend backup |

## Health

- `GET /lb/health` — load balancer
- `GET /api/health` — backends (RR)
- `GET /fe/health` on each FE

## Video GPU

Not in this compose — RunPod WAN is external. See `VIDEO_RUNPOD.md`.

## Vercel

Vercel = single app deploy. Full 2×2 cluster needs VPS/Docker.
