#!/bin/sh
set -eu
cd /workspace
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/lb/health; then
  exit 0
fi
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/api/health; then
  exit 0
fi
sh /workspace/deploy/start-cluster.sh >>/tmp/app-startup.log 2>&1 &
