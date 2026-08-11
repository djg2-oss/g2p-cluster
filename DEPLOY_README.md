# G2P Cluster Deploy v3.3.1

Exported: 2026-08-11 03:27 UTC

## Local / VPS deploy (this package)
```bash
unzip G2P_CLUSTER_DEPLOY.zip && cd G2P_CLUSTER_DEPLOY
sh deploy/start-cluster.sh
# or: docker compose up -d
# open http://127.0.0.1:8080
```

## Not for Vercel
This is 2 FE + 2 BE + LB (long-running). Use VPS/Docker, not Vercel serverless.

Version: **3.3.1**
