/** Mathematics Genius — local solvers (Phase 1–2 training) */

export type MathResult = {
  title: string;
  answer: string;
  steps: string[];
  note?: string;
};

function almostEqual(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

export function evalArithmetic(expr: string): number | null {
  let cleaned = expr
    .replace(/\s+/g, "")
    .replace(/\^/g, "**")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/gi, `(${Math.PI})`)
    .replace(/\be\b/g, `(${Math.E})`);

  cleaned = cleaned
    .replace(/sqrt\(/gi, "Math.sqrt(")
    .replace(/sin\(/gi, "Math.sin(")
    .replace(/cos\(/gi, "Math.cos(")
    .replace(/tan\(/gi, "Math.tan(")
    .replace(/log\(/gi, "Math.log10(")
    .replace(/ln\(/gi, "Math.log(")
    .replace(/abs\(/gi, "Math.abs(");

  // Only digits, operators, parens, decimal, and Math.* calls
  if (!/^(Math\.(sqrt|sin|cos|tan|log10|log|abs)\(|[0-9+\-*/%().,eE])+$/.test(cleaned)) {
    return null;
  }
  try {
    const val = Function(`"use strict"; return (${cleaned});`)() as number;
    if (typeof val !== "number" || !Number.isFinite(val)) return null;
    return val;
  } catch {
    return null;
  }
}

export function solveQuadratic(a: number, b: number, c: number): MathResult {
  const steps: string[] = [
    `Standard form: ${a}x² + ${b}x + ${c} = 0`,
    `Discriminant Δ = b² − 4ac = (${b})² − 4(${a})(${c})`,
  ];
  const d = b * b - 4 * a * c;
  steps.push(`Δ = ${d}`);
  if (almostEqual(a, 0)) {
    if (almostEqual(b, 0)) {
      return {
        title: "Degenerate equation",
        answer: almostEqual(c, 0) ? "Identity (all x)" : "No solution",
        steps,
      };
    }
    const x = -c / b;
    steps.push(`Linear: x = −c/b = ${x}`);
    return { title: "Linear solution", answer: `x = ${x}`, steps };
  }
  if (d < 0) {
    const re = -b / (2 * a);
    const im = Math.sqrt(-d) / (2 * a);
    steps.push("Δ < 0 → complex conjugate roots");
    return {
      title: "Complex roots",
      answer: `x₁ = ${re} + ${im}i ,  x₂ = ${re} − ${im}i`,
      steps,
    };
  }
  if (almostEqual(d, 0)) {
    const x = -b / (2 * a);
    steps.push("Δ = 0 → repeated real root");
    return { title: "Repeated root", answer: `x = ${x}`, steps };
  }
  const sqrtD = Math.sqrt(d);
  const x1 = (-b + sqrtD) / (2 * a);
  const x2 = (-b - sqrtD) / (2 * a);
  steps.push("Δ > 0 → two distinct real roots");
  steps.push(`x₁ = ${x1}`);
  steps.push(`x₂ = ${x2}`);
  return { title: "Two real roots", answer: `x₁ = ${x1} ,  x₂ = ${x2}`, steps };
}

export function solveLinear2(
  a1: number,
  b1: number,
  c1: number,
  a2: number,
  b2: number,
  c2: number,
): MathResult {
  const det = a1 * b2 - a2 * b1;
  const steps = [
    `System: ${a1}x + ${b1}y = ${c1}`,
    `        ${a2}x + ${b2}y = ${c2}`,
    `D = ${det}`,
  ];
  if (almostEqual(det, 0)) {
    return {
      title: "Singular system",
      answer: "No unique solution",
      steps,
    };
  }
  const x = (c1 * b2 - c2 * b1) / det;
  const y = (a1 * c2 - a2 * c1) / det;
  steps.push(`x = ${x}`, `y = ${y}`);
  return { title: "Unique solution", answer: `x = ${x} ,  y = ${y}`, steps };
}

export function diffPolynomial(expr: string): MathResult | null {
  const e = expr.replace(/\s+/g, "").toLowerCase();
  if (!/^[0-9x^+.\-]+$/.test(e)) return null;
  const terms = e.replace(/-/g, "+-").split("+").filter(Boolean);
  const out: string[] = [];
  const steps: string[] = [`f(x) = ${expr}`, "d/dx [c·xⁿ] = c·n·xⁿ⁻¹"];
  for (const t of terms) {
    if (t === "x" || t === "+x") {
      out.push("1");
      continue;
    }
    if (t === "-x") {
      out.push("-1");
      continue;
    }
    if (!t.includes("x")) {
      steps.push(`d/dx [${t}] = 0`);
      continue;
    }
    const m = t.match(/^(-?\d*\.?\d*)x(?:\^(-?\d+\.?\d*))?$/);
    if (!m) return null;
    const coef = m[1] === "" || m[1] === "-" ? (m[1] === "-" ? -1 : 1) : parseFloat(m[1]);
    const pow = m[2] === undefined ? 1 : parseFloat(m[2]);
    const newCoef = coef * pow;
    const newPow = pow - 1;
    let termStr: string;
    if (almostEqual(newPow, 0)) termStr = String(newCoef);
    else if (almostEqual(newPow, 1)) termStr = `${newCoef}x`;
    else termStr = `${newCoef}x^${newPow}`;
    out.push(termStr);
    steps.push(`d/dx [${t}] = ${termStr}`);
  }
  const answer = out.length ? out.join(" + ").replace(/\+ -/g, "− ") : "0";
  return { title: "Derivative", answer: `f'(x) = ${answer}`, steps };
}

/** Expected value: "ev 0.3*100 + 0.7*-20" or list form */
export function expectedValue(expr: string): MathResult | null {
  const m = expr.match(/ev\s+(.+)/i) || expr.match(/expected value\s+(.+)/i);
  if (!m) return null;
  const body = m[1];
  // pattern: p1*v1 + p2*v2 + ...
  const parts = body.split("+").map((s) => s.trim());
  let total = 0;
  const steps: string[] = ["EV = Σ pᵢ · vᵢ"];
  for (const part of parts) {
    const pm = part.match(/^(-?\d*\.?\d+)\s*\*\s*(-?\d*\.?\d+)$/);
    if (!pm) return null;
    const p = parseFloat(pm[1]);
    const v = parseFloat(pm[2]);
    total += p * v;
    steps.push(`${p} × ${v} = ${p * v}`);
  }
  steps.push(`EV = ${total}`);
  return { title: "Expected value", answer: String(total), steps };
}

/** Percent change */
export function percentChange(from: number, to: number): MathResult {
  const pct = ((to - from) / from) * 100;
  return {
    title: "Percent change",
    answer: `${pct.toFixed(4)}%`,
    steps: [
      `from = ${from}, to = ${to}`,
      `Δ = to − from = ${to - from}`,
      `% = (Δ / from) × 100 = ${pct}`,
    ],
  };
}

/** Compound growth: P(1+r)^n */
export function compound(P: number, r: number, n: number): MathResult {
  const fv = P * Math.pow(1 + r, n);
  return {
    title: "Compound growth",
    answer: String(fv),
    steps: [
      `FV = P(1+r)^n`,
      `P=${P}, r=${r}, n=${n}`,
      `FV = ${fv}`,
    ],
    note: "r as decimal (e.g. 0.05 for 5%)",
  };
}

function parseCoef(raw: string, def: number): number {
  const t = raw.trim();
  if (t === "" || t === "+") return def;
  if (t === "-") return -def;
  return parseFloat(t);
}

export function tryParseMathQuery(q: string): MathResult | null {
  const s = q.trim();

  const ev = expectedValue(s);
  if (ev) return ev;

  const comp = s.match(
    /compound\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/i,
  );
  if (comp) {
    return compound(parseFloat(comp[1]), parseFloat(comp[2]), parseFloat(comp[3]));
  }

  const pct = s.match(/percent change\s+(-?\d+\.?\d*)\s+(?:to\s+)?(-?\d+\.?\d*)/i);
  if (pct) {
    return percentChange(parseFloat(pct[1]), parseFloat(pct[2]));
  }

  const quad = s.match(
    /(?:solve\s+)?([+-]?\d*\.?\d*)\s*x\s*\^\s*2\s*([+-]\s*\d*\.?\d*)\s*x\s*([+-]\s*\d*\.?\d*)\s*=\s*0/i,
  );
  if (quad) {
    return solveQuadratic(
      parseCoef(quad[1], 1),
      parseCoef(quad[2].replace(/\s/g, ""), 1),
      parseCoef(quad[3].replace(/\s/g, ""), 1),
    );
  }

  const der = s.match(/(?:derivative|diff|differentiate)\s+(?:of\s+)?(.+)/i);
  if (der) {
    const r = diffPolynomial(der[1]);
    if (r) return r;
  }

  const sys = s.match(
    /(?:system|solve)\s*[:\s]*([+-]?\d*\.?\d*)\s*x\s*([+-]\s*\d*\.?\d*)\s*y\s*=\s*([+-]?\d+\.?\d*)\s*[;,\n]\s*([+-]?\d*\.?\d*)\s*x\s*([+-]\s*\d*\.?\d*)\s*y\s*=\s*([+-]?\d+\.?\d*)/i,
  );
  if (sys) {
    return solveLinear2(
      parseCoef(sys[1], 1),
      parseCoef(sys[2].replace(/\s/g, ""), 1),
      parseFloat(sys[3]),
      parseCoef(sys[4], 1),
      parseCoef(sys[5].replace(/\s/g, ""), 1),
      parseFloat(sys[6]),
    );
  }

  if (
    /^[\d\s.+\-*/^()%πpie×÷,sqrtincosalogb]+$/i.test(s) ||
    /^(calc|compute|evaluate)\b/i.test(s)
  ) {
    const expr = s.replace(/^(calc|compute|evaluate)\s*/i, "");
    const v = evalArithmetic(expr);
    if (v !== null) {
      return {
        title: "Evaluation",
        answer: String(v),
        steps: [`Expression: ${expr}`, `Result: ${v}`],
      };
    }
  }

  return null;
}

export function formatMathResult(r: MathResult): string {
  const lines = [
    `**${r.title}**`,
    "",
    `**Answer:** ${r.answer}`,
    "",
    "**Steps:**",
    ...r.steps.map((s, i) => `${i + 1}. ${s}`),
  ];
  if (r.note) lines.push("", `*${r.note}*`);
  return lines.join("\n");
}
