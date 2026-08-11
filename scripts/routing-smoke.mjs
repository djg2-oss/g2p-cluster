/** Daily RC-D2 — routing smoke */
const LB = process.env.LB_URL || "http://127.0.0.1:8080";
const cases = [
  { text: "solve 2x^2 + 3x - 5 = 0", expect: "math" },
  { text: "I'm stuck between stable job and risky offer", expect: "life" },
  { text: "build a react dashboard with auth", expect: "build" },
];

let failed = 0;
for (const c of cases) {
  const r = await fetch(`${LB}/api/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: c.text }),
  });
  const j = await r.json();
  const ok = j.winner === c.expect;
  console.log(ok ? "OK" : "FAIL", c.expect, "→", j.winner, j.host);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
