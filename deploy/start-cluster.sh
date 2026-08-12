#!/bin/sh
# Agent G2P: 2BE (draft/refine) + optional BE-V (verify) + 2FE + LB
set -eu
cd /workspace
mkdir -p /tmp/g2p-cluster

for f in /tmp/g2p-cluster/be1.pid /tmp/g2p-cluster/be2.pid /tmp/g2p-cluster/bev.pid /tmp/g2p-cluster/fe1.pid /tmp/g2p-cluster/fe2.pid /tmp/g2p-cluster/lb.pid; do
  if [ -f "$f" ]; then
    kill "$(cat "$f")" 2>/dev/null || true
    rm -f "$f"
  fi
done

# free ports if held by prior node workers (best-effort)
if command -v fuser >/dev/null 2>&1; then
  fuser -k 8080/tcp 3001/tcp 3002/tcp 3003/tcp 5173/tcp 5174/tcp 2>/dev/null || true
fi
sleep 0.4

HOST_ID=be-1 PORT=3001 ENGINE_ROLE=draft \
  PEER_URL=http://127.0.0.1:3002 VERIFY_URL=http://127.0.0.1:3003 \
  PIPELINE_CACHE_TTL_MS=120000 \
  node /workspace/src/server/backend.mjs >>/tmp/g2p-cluster/be1.log 2>&1 &
echo $! >/tmp/g2p-cluster/be1.pid

HOST_ID=be-2 PORT=3002 ENGINE_ROLE=refine \
  PEER_URL=http://127.0.0.1:3001 VERIFY_URL=http://127.0.0.1:3003 \
  PIPELINE_CACHE_TTL_MS=120000 \
  node /workspace/src/server/backend.mjs >>/tmp/g2p-cluster/be2.log 2>&1 &
echo $! >/tmp/g2p-cluster/be2.pid

# Engine-V (verify-only hop)
HOST_ID=be-v PORT=3003 ENGINE_ROLE=verify \
  PEER_URL= \
  node /workspace/src/server/backend.mjs >>/tmp/g2p-cluster/bev.log 2>&1 &
echo $! >/tmp/g2p-cluster/bev.pid

HOST_ID=fe-1 PORT=5173 node /workspace/deploy/fe/static-server.mjs >>/tmp/g2p-cluster/fe1.log 2>&1 &
echo $! >/tmp/g2p-cluster/fe1.pid

HOST_ID=fe-2 PORT=5174 node /workspace/deploy/fe/static-server.mjs >>/tmp/g2p-cluster/fe2.log 2>&1 &
echo $! >/tmp/g2p-cluster/fe2.pid

LB_PORT=8080 \
BACKENDS=http://127.0.0.1:3001,http://127.0.0.1:3002 \
FRONTENDS=http://127.0.0.1:5173,http://127.0.0.1:5174 \
  node /workspace/deploy/lb/proxy.mjs >>/tmp/g2p-cluster/lb.log 2>&1 &
echo $! >/tmp/g2p-cluster/lb.pid

sleep 1
echo "=== cluster health (2BE + V + 2FE + LB) ==="
curl -s http://127.0.0.1:8080/lb/health; echo
curl -s http://127.0.0.1:3001/api/health; echo
curl -s http://127.0.0.1:3002/api/health; echo
curl -s http://127.0.0.1:3003/api/health; echo
curl -s http://127.0.0.1:5173/fe/health; echo
curl -s http://127.0.0.1:5174/fe/health; echo
echo "=== pipeline (draft→refine) ==="
curl -s -X POST http://127.0.0.1:8080/api/pipeline \
  -H 'content-type: application/json' \
  -d '{"text":"solve 2x^2+3x-5=0"}' | head -c 400; echo
echo "=== pipeline + verify ==="
curl -s -X POST 'http://127.0.0.1:8080/api/pipeline?verify=1' \
  -H 'content-type: application/json' \
  -d '{"text":"solve 2x^2+3x-5=0"}' | head -c 400; echo
echo "=== metrics be-1 ==="
curl -s http://127.0.0.1:3001/api/metrics; echo
