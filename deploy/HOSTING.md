# Best hosting arrangement

## Topology (converged)

```
                    ┌─ fe-1 :5173 ─┐
Client ──► lb:8080 ─┤              ├── static UI
                    └─ fe-2 :5174 ─┘
                    ┌─ be-1 :3001 ─┐
           /api/* ──┤              ├── META route + optional model API
                    └─ be-2 :3002 ─┘
```

## Local (this sandbox / VPS)

```bash
sh deploy/start-cluster.sh
# or
docker compose up -d
```

## Env (optional frontier)

```bash
# never put master keys in the browser
MODEL_API_URL=
MODEL_API_KEY=
RUNPOD_API_KEY=
RUNPOD_VIDEO_ENDPOINT_ID=
RUNPOD_MUSIC_ENDPOINT_ID=
```

## Health / recurring

```bash
node scripts/healthcheck.mjs      # daily
node scripts/routing-smoke.mjs    # daily
```

## Zip deploy

See `G2P_CLUSTER_DEPLOY.zip` — extract on host, run compose or start-cluster.
