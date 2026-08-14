/**
 * Learned specialist weights — ADD only.
 * High-quality outcomes raise a specialist's prior.
 * Nothing drops below 1.0. Not a new Grok. Better routing for G2P 1.5-class.
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "g2p-weights.json");
const FLOOR = 1;
const CAP = 2.5;
const STEP = 0.04;

const DEFAULTS = { math: 1, life: 1, build: 1, companion: 1, phenome: 1 };

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { ...DEFAULTS, ...j.weights };
  } catch {
    return { ...DEFAULTS };
  }
}

let weights = load();

export function getWeights() {
  return { ...weights };
}

export function applyWeights(votes) {
  const out = { ...votes };
  for (const k of Object.keys(out)) {
    out[k] = (out[k] || 0) * (weights[k] || FLOOR);
  }
  return out;
}

export function recordOutcome(winner, quality) {
  const w = String(winner || "");
  if (!w || !(w in DEFAULTS)) return getWeights();
  const q = Number(quality);
  if (!Number.isFinite(q) || q < 0.72) return getWeights();
  const next = Math.min(CAP, (weights[w] || FLOOR) + STEP);
  if (next <= (weights[w] || FLOOR)) return getWeights();
  weights = { ...weights, [w]: +next.toFixed(4) };
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(
      FILE,
      JSON.stringify({ weights, updatedAt: Date.now(), rule: "increase-only" }, null, 2),
    );
  } catch {
    /* still use in-memory */
  }
  return getWeights();
}
