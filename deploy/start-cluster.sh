#!/bin/sh
set -eu
cd /workspace
mkdir -p /tmp/g2p-cluster

for f in /tmp/g2p-cluster/be1.pid /tmp/g2p-cluster/be2.pid /tmp/g2p-cluster/fe1.pid /tmp/g2p-cluster/fe2.pid /tmp/g2p-cluster/lb.pid; do
  if [ -f "$f" ]; then
    kill "$(cat "$f")" 2>/dev/null || true
    rm -f "$f"
  fi
done

if command -v fuser >/dev/null 2>&1; then
  fuser -k 8080/tcp 2>/dev/null || true
fi
sleep 0.4

HOST_ID=be-1 PORT=3001 PEER_URL=http://127.0.0.1:3002 \
  node /workspace/src/server/backend.mjs >>/tmp/g2p-cluster/be1.log 2>&1 &
echo $! >/tmp/g2p-cluster/be1.pid

HOST_ID=be-2 PORT=3002 PEER_URL=http://127.0.0.1:3001 \
  node /workspace/src/server/backend.mjs >>/tmp/g2p-cluster/be2.log 2>&1 &
echo $! >/tmp/g2p-cluster/be2.pid

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
echo "=== cluster health ==="
curl -s http://127.0.0.1:8080/lb/health; echo
curl -s http://127.0.0.1:3001/api/health; echo
curl -s http://127.0.0.1:3002/api/health; echo
curl -s http://127.0.0.1:5173/fe/health; echo
curl -s http://127.0.0.1:5174/fe/health; echo
echo "=== round-robin BE ==="
curl -s http://127.0.0.1:8080/api/health; echo
curl -s http://127.0.0.1:8080/api/health; echo
echo "=== route ==="
curl -s -X POST http://127.0.0.1:8080/api/route \
  -H 'content-type: application/json' \
  -d '{"text":"solve 2x^2+3x-5=0"}'; echo
