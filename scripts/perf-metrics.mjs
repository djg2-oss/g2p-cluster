/** Refined G2P performance metrics suite */
const LB = process.env.LB_URL || "http://127.0.0.1:8080";

async function bench(name, n, fn) {
  const times = [];
  let errors = 0;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    try {
      await fn(i);
    } catch {
      errors++;
    }
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const at = (p) => times[Math.min(times.length - 1, Math.floor((times.length - 1) * p))];
  return {
    name,
    n,
    errors,
    avg_ms: +(sum / n).toFixed(3),
    p50_ms: +at(0.5).toFixed(3),
    p95_ms: +at(0.95).toFixed(3),
    p99_ms: +at(0.99).toFixed(3),
    min_ms: +times[0].toFixed(3),
    max_ms: +times[times.length - 1].toFixed(3),
    est_rps: +(1000 / (sum / n)).toFixed(1),
  };
}

const out = { at: new Date().toISOString(), suite: [] };
out.suite.push(
  await bench("health", 40, async () => {
    await (await fetch(`${LB}/api/health`)).json();
  }),
);
out.suite.push(
  await bench("route_cached_math", 40, async () => {
    await (
      await fetch(`${LB}/api/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "solve 2x^2+3x-5=0" }),
      })
    ).json();
  }),
);
out.suite.push(
  await bench("route_unique_math", 30, async (i) => {
    await (
      await fetch(`${LB}/api/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `solve ${i}x^2+3x-5=0` }),
      })
    ).json();
  }),
);
out.suite.push(
  await bench("route_mixed", 40, async (i) => {
    const texts = ["build api", "career stuck", "hello", "derivative of x^2", "video music"];
    await (
      await fetch(`${LB}/api/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: texts[i % 5] }),
      })
    ).json();
  }),
);
const t0 = performance.now();
await Promise.all(
  Array.from({ length: 25 }, () =>
    fetch(`${LB}/api/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "solve 2x^2+3x-5=0" }),
    }).then((r) => r.json()),
  ),
);
out.concurrent_25_wall_ms = +(performance.now() - t0).toFixed(2);

try {
  out.server = await (await fetch(`${LB}/api/metrics`)).json();
} catch (e) {
  out.server = { error: String(e) };
}

console.log(JSON.stringify(out, null, 2));
