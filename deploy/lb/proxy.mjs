/**
 * Edge load balancer
 * /api/* → BE-1 / BE-2 round-robin
 * /*     → FE-1 / FE-2 round-robin
 */
import http from "node:http";

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 16,
  timeout: 5000,
});

const PORT = Number(process.env.LB_PORT || 8080);
const BES = (process.env.BACKENDS || "http://127.0.0.1:3001,http://127.0.0.1:3002")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FES = (process.env.FRONTENDS || "http://127.0.0.1:5173,http://127.0.0.1:5174")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let beI = 0;
let feI = 0;
function nextBe() {
  const u = BES[beI % BES.length];
  beI++;
  return u;
}
function nextFe() {
  const u = FES[feI % FES.length];
  feI++;
  return u;
}

function proxy(req, res, targetBase) {
  const url = new URL(req.url || "/", targetBase);
  const headers = { ...req.headers, host: url.host };
  const opts = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers,
    agent,
    timeout: 5000,
  };
  const upstream = http.request(opts, (up) => {
    res.writeHead(up.statusCode || 502, {
      ...up.headers,
      "x-lb": "g2p-edge",
      "x-upstream": targetBase,
    });
    up.pipe(res);
  });
  upstream.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "bad_gateway", target: targetBase, detail: String(err) }),
    );
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const path = req.url || "/";
  if (path.startsWith("/api/")) return proxy(req, res, nextBe());
  if (path === "/lb/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        ok: true,
        role: "load-balancer",
        backends: BES,
        frontends: FES,
        port: PORT,
      }),
    );
  }
  return proxy(req, res, nextFe());
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[lb] 0.0.0.0:${PORT} be=${BES.join(",")} fe=${FES.join(",")}`);
});
