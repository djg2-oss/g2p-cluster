/** Daily RC-D1 — LB + BE + FE health */
const LB = process.env.LB_URL || "http://127.0.0.1:8080";
const checks = [
  `${LB}/lb/health`,
  `${LB}/api/health`,
  "http://127.0.0.1:3001/api/health",
  "http://127.0.0.1:3002/api/health",
  "http://127.0.0.1:5173/fe/health",
  "http://127.0.0.1:5174/fe/health",
];

let failed = 0;
for (const url of checks) {
  try {
    const r = await fetch(url);
    const j = await r.json();
    console.log("OK", url, j.host || j.role || r.status);
  } catch (e) {
    failed++;
    console.error("FAIL", url, String(e));
  }
}
process.exit(failed ? 1 : 0);
