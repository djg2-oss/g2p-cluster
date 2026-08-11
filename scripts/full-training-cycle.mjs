/** Full training cycle — LOCAL bake verification + recurring drills */
const LB = process.env.LB_URL || "http://127.0.0.1:8080";
const log = [];
const pass = (name, detail) => { log.push({ name, ok: true, detail }); console.log("PASS", name, detail || ""); };
const fail = (name, detail) => { log.push({ name, ok: false, detail }); console.log("FAIL", name, detail || ""); };

async function route(text) {
  const r = await fetch(`${LB}/api/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return r.json();
}

console.log("=== G2P FULL TRAINING CYCLE ===\n");

// Phase 0–1
const p1 = [
  ["math", "solve 2x^2 + 3x - 5 = 0", "math"],
  ["life", "stuck between stable job and risky offer", "life"],
  ["build", "build a react dashboard with auth", "build"],
];
for (const [n, t, e] of p1) {
  const j = await route(t);
  j.winner === e ? pass(`Phase1 ${n}`, j.host) : fail(`Phase1 ${n}`, j.winner);
}

// Phase 2 META
{
  const j = await route("40% chance double salary vs stable job");
  j.builds?.A && j.builds?.B && j.builds?.C ? pass("Phase2 META", j.winner) : fail("Phase2 META", "missing builds");
}

// Phase 4 hosts
for (const [url, key] of [
  ["http://127.0.0.1:3001/api/health", "be1"],
  ["http://127.0.0.1:3002/api/health", "be2"],
  ["http://127.0.0.1:5173/fe/health", "fe1"],
  ["http://127.0.0.1:5174/fe/health", "fe2"],
  [`${LB}/lb/health`, "lb"],
]) {
  try {
    const j = await (await fetch(url)).json();
    j.ok ? pass(`Host ${key}`, j.host || j.role) : fail(`Host ${key}`, "not ok");
  } catch (e) {
    fail(`Host ${key}`, String(e));
  }
}

// Recurring
import { spawn } from "child_process";
function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "pipe" });
    let o = "";
    p.stdout.on("data", (d) => (o += d));
    p.stderr.on("data", (d) => (o += d));
    p.on("close", (code) => resolve({ code, o }));
  });
}
{
  const h = await run("node", ["/workspace/scripts/healthcheck.mjs"]);
  h.code === 0 ? pass("RC-D1 health", "exit 0") : fail("RC-D1 health", h.o);
  const s = await run("node", ["/workspace/scripts/routing-smoke.mjs"]);
  s.code === 0 ? pass("RC-D2 smoke", "exit 0") : fail("RC-D2 smoke", s.o);
}

const ok = log.filter((x) => x.ok).length;
const bad = log.filter((x) => !x.ok).length;
console.log(`\n=== DONE PASS ${ok} FAIL ${bad} ===`);
process.exit(bad ? 1 : 0);
