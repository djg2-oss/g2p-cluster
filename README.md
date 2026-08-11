# G2P Cluster v3.3.1

Agent G2P + dual FE/BE cluster pack.

## Vercel (Agent UI)

1. Import this repo in Vercel  
2. Build: `npm run build`  
3. Deploy  

Note: full 2 FE + 2 BE + LB needs Docker/VPS (`docker compose up -d` or `sh deploy/start-cluster.sh`), not serverless.

## Local cluster

```bash
sh deploy/start-cluster.sh
# open http://127.0.0.1:8080
```

## Docker

```bash
docker compose up -d
```
