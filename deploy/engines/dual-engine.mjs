/**
 * G2P Dual-Engine core — sequential quality (not parallel race).
 *
 * Design (vs industry best):
 *   Cascade / draft-verify (Anthropic-style self-check, Map-Reduce refine)
 *   + specialist routing (mixture-of-experts light)
 *   + structured critic rubric (not vibe edits)
 *   + measurable quality score + stop conditions
 *
 * Pipeline:
 *   ANALYZE -> SPECIALIST DRAFT -> CRITIC -> EDITOR (refine) -> VERIFY -> FINAL
 *   Engines: Engine-D (draft) then Engine-R (refine) — series, different roles.
 */

export const ENGINE_VERSION = "g2p-dual-v2.2";

/** Structured rubric — each 0..1 */
export function critique(text, draft, winner) {
  const d = draft || "";
  const t = text || "";
  const scores = {
    correctness: 0.55,
    completeness: 0.55,
    clarity: 0.6,
    actionability: 0.5,
    safety: 1.0,
  };
  const holes = [];

  // Safety (illegal patterns) — hard
  if (
    /\b(child|minor|underage).{0,40}\b(sex|nude|porn)/i.test(t) ||
    /\b(csam|child porn)/i.test(t)
  ) {
    scores.safety = 0;
    holes.push("BLOCK: illegal content");
  }

  if (winner === "math") {
    scores.correctness = /answer|result|x\s*=|=\s*-?\d/i.test(d) ? 0.75 : 0.45;
    scores.completeness = /step|1\.|known|method/i.test(d) ? 0.7 : 0.4;
    if (!/check|verify|plug|substitut/i.test(d)) {
      holes.push("add verification / plug-back");
      scores.correctness -= 0.1;
    }
    // Real solve attempt for simple quadratics / linear
    const solved = trySolveMath(t);
    if (solved) {
      scores.correctness = 0.92;
      scores.completeness = 0.85;
      if (!d.includes(solved.answerHint)) holes.push(`ensure answer shows ${solved.answerHint}`);
    }
  } else if (winner === "life") {
    scores.actionability = /\b(next|option|step|do this|recommend)\b/i.test(d) ? 0.8 : 0.35;
    scores.completeness = /\b(constraint|option|trade)/i.test(d) ? 0.7 : 0.45;
    if (!/\b(next action|do this|start with)\b/i.test(d)) holes.push("force one concrete next action");
    if (d.split("\n").length < 4) holes.push("expand options + recommendation");
  } else if (winner === "build") {
    scores.actionability = /\b(file|src\/|step|implement|slice)\b/i.test(d) ? 0.8 : 0.4;
    scores.completeness = /\b(stack|api|deploy|test)\b/i.test(d) ? 0.7 : 0.45;
    if (!/\b(first|slice|step 1)\b/i.test(d)) holes.push("name first shippable slice");
  } else if (winner === "phenome" || winner === "media") {
    scores.completeness = /\b(director|preset|camera|lora|runpod)\b/i.test(d) ? 0.75 : 0.5;
    if (!/\b(prompt|shot|preset)\b/i.test(d)) holes.push("include directed shot language");
  } else {
    // companion
    scores.clarity = d.length > 40 && d.length < 1200 ? 0.75 : 0.5;
    scores.actionability = /\?/.test(d) ? 0.65 : 0.45;
    if (d.length < 60) holes.push("expand thin companion reply");
  }

  if (d.length < 50) {
    holes.push("expand thin draft");
    scores.completeness = Math.min(scores.completeness, 0.35);
  }

  // clamp
  for (const k of Object.keys(scores)) {
    scores[k] = Math.max(0, Math.min(1, scores[k]));
  }
  const quality =
    scores.safety *
    (0.3 * scores.correctness +
      0.25 * scores.completeness +
      0.2 * scores.clarity +
      0.25 * scores.actionability);

  return {
    scores,
    quality: +quality.toFixed(4),
    holes: [...new Set(holes)],
    pass: quality >= 0.72 && scores.safety === 1,
  };
}

/** Lightweight closed-form math for common patterns */
export function trySolveMath(text) {
  // quadratic: ax^2+bx+c=0
  const q = text.replace(/\s+/g, "").match(/([+-]?\d*\.?\d*)x\^2([+-]\d*\.?\d*)x([+-]\d*\.?\d*)=0/i);
  if (q) {
    const a = parseCoef(q[1], 1);
    const b = parseCoef(q[2], 1);
    const c = parseCoef(q[3], 1);
    if (a !== 0) {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        const x1 = (-b + s) / (2 * a);
        const x2 = (-b - s) / (2 * a);
        return {
          kind: "quadratic",
          steps: [
            `Identify a=${a}, b=${b}, c=${c}`,
            `Discriminant D=b^2-4ac=${disc}`,
            `x = (-b+/-sqrt(D))/(2a)`,
            `x1=${fmt(x1)}, x2=${fmt(x2)}`,
            `Check: plug each root back into ${a}x^2+${b}x+${c}`,
          ],
          answer: `x = ${fmt(x1)} or x = ${fmt(x2)}`,
          answerHint: fmt(x1),
        };
      }
      return {
        kind: "quadratic-complex",
        steps: [`D=${disc} < 0 -> complex roots`],
        answer: "complex roots",
        answerHint: "complex",
      };
    }
  }
  // linear: ax+b=c or x+b=c
  const lin = text.replace(/\s+/g, "").match(/([+-]?\d*\.?\d*)x([+-]\d*\.?\d*)=([+-]?\d*\.?\d+)/i);
  if (lin) {
    const a = parseCoef(lin[1], 1);
    const b = parseCoef(lin[2], 0);
    const c = parseFloat(lin[3]);
    if (a !== 0 && Number.isFinite(b) && Number.isFinite(c)) {
      const x = (c - b) / a;
      return {
        kind: "linear",
        steps: [`${a}x + (${b}) = ${c}`, `${a}x = ${c - b}`, `x = ${fmt(x)}`, `Check: ${a}(${fmt(x)})+${b}=${c}`],
        answer: `x = ${fmt(x)}`,
        answerHint: fmt(x),
      };
    }
  }
  return trySimpleArith(text);
}

function trySimpleArith(text) {
  const m = String(text).replace(/,/g, "").match(/(-?\d+\.?\d*)\s*([+\-*/x×])\s*(-?\d+\.?\d*)/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const op = m[2] === "x" || m[2] === "×" ? "*" : m[2];
  let v;
  if (op === "+") v = a + b;
  else if (op === "-") v = a - b;
  else if (op === "*") v = a * b;
  else if (op === "/") {
    if (b === 0) return { kind: "arith", steps: ["Division by zero"], answer: "undefined", answerHint: "undefined" };
    v = a / b;
  } else return null;
  return {
    kind: "arith",
    steps: [`Compute ${a} ${op} ${b}`],
    answer: String(fmt(v)),
    answerHint: String(fmt(v)),
  };
}

function parseCoef(s, def) {
  if (s === "" || s === "+") return def;
  if (s === "-") return -def;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : def;
}

function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  const r = Math.round(n * 1e6) / 1e6;
  return String(r);
}

export function buildDraft({ host, text, route }) {
  const w = route.winner || "companion";
  const conf = route.confidence || "medium";
  const solved = w === "math" ? trySolveMath(text) : null;
  const lines = [
    `[DRAFT | ${host}] specialist=${w} conf=${conf}`,
    `META: A=${route.builds?.A?.winner} B=${route.builds?.B?.winner} C=${route.builds?.C?.winner}`,
    "",
  ];

  if (w === "math" && solved) {
    lines.push("**Math solution (engine-D)**", ...solved.steps.map((s, i) => `${i + 1}. ${s}`), "", `**Answer:** ${solved.answer}`);
  } else if (w === "math") {
    lines.push(
      "Math plan:",
      "1. Knowns / unknowns",
      "2. Method (algebra / calc / numeric)",
      "3. Work steps",
      "4. Box answer + verify",
      "",
      `Problem: ${text.slice(0, 300)}`,
    );
  } else if (w === "life") {
    lines.push(
      "**Decision draft**",
      "- Frame the real choice in one sentence",
      "- Constraints (time, money, energy, people)",
      "- Option A / B / C with tradeoffs",
      "- Recommend one",
      "- **Next action (24h):** ...",
      "",
      `Context: ${text.slice(0, 320)}`,
    );
  } else if (w === "build") {
    lines.push(
      "**Build draft**",
      "- Goal (user-visible)",
      "- Stack / constraints",
      "- Smallest shippable slice",
      "- Files to touch",
      "- Test / verify",
      "",
      `Request: ${text.slice(0, 320)}`,
    );
  } else if (w === "phenome" || w === "media") {
    lines.push(
      "**Media / Director draft**",
      "- Intent: generate vs analyze",
      "- Preset (cinematic/handheld/product/character)",
      "- Camera + light language",
      "- RunPod WAN params / LoRA if any",
      "",
      `Ask: ${text.slice(0, 280)}`,
    );
  } else {
    lines.push(
      "**Companion draft**",
      "Clear answer in few sentences. Warm, not extreme. One precise follow-up question.",
      "",
      `User: ${text.slice(0, 360)}`,
    );
  }

  const content = lines.join("\n");
  const crit = critique(text, content, w);
  return {
    stage: "draft",
    host,
    winner: w,
    confidence: conf,
    content,
    solved: solved || undefined,
    critique: crit,
    engine: ENGINE_VERSION,
  };
}

export function buildRefine({ host, text, draftPayload }) {
  const draft = draftPayload?.content || "";
  const w = draftPayload?.winner || "companion";
  const conf = draftPayload?.confidence || "medium";
  const crit = critique(text, draft, w);
  const solved = draftPayload?.solved || (w === "math" ? trySolveMath(text) : null);

  // Editor applies holes
  const patches = [];
  if (solved && !draft.includes(solved.answer)) {
    patches.push(`**Verified answer:** ${solved.answer}`);
  }
  for (const h of crit.holes) {
    if (h.startsWith("BLOCK:")) {
      return {
        stage: "refine",
        host,
        winner: w,
        confidence: "high",
        content: "Request blocked by dual-engine safety gate.",
        holes: crit.holes,
        critique: crit,
        blocked: true,
        engine: ENGINE_VERSION,
      };
    }
    if (h.includes("verification")) patches.push("**Check:** substitute answer into original equation / conditions.");
    if (h.includes("next action")) patches.push("**Next action (24h):** write the single smallest step and do it today.");
    if (h.includes("slice")) patches.push("**First slice:** one file + one test path, ship before polish.");
    if (h.includes("directed shot")) patches.push("**Shot:** cinematic, motivated light, one clear camera move.");
    if (h.includes("thin")) patches.push("Expand with structure: context -> answer -> next step.");
  }

  // Confidence boost rules
  let confOut = conf;
  if (crit.quality >= 0.85) confOut = "high";
  else if (crit.quality >= 0.65) confOut = conf === "low" ? "medium" : conf;
  else confOut = "low";

  const body = draft.replace(/^\[DRAFT[^\]]*\]/m, `[FINAL | ${host}]`).trim();
  const content = [
    `[REFINE | ${host}] <- draft from ${draftPayload?.host || "self"}`,
    `Path: ${w} | conf ${confOut} | quality ${crit.quality}`,
    crit.holes.length ? `Critic holes: ${crit.holes.join("; ")}` : "Critic: no major holes",
    "",
    "--- Refined output ---",
    body,
    patches.length ? "" : null,
    ...patches,
    "",
    `Rubric: correct ${crit.scores.correctness} | complete ${crit.scores.completeness} | clear ${crit.scores.clarity} | action ${crit.scores.actionability} | safety ${crit.scores.safety}`,
    "Mode: sequential dual-engine (draft->critic->edit) - not parallel race.",
  ]
    .filter((x) => x !== null)
    .join("\n");

  return {
    stage: "refine",
    host,
    winner: w,
    confidence: confOut,
    content,
    holes: crit.holes,
    critique: crit,
    priorHost: draftPayload?.host,
    patches,
    engine: ENGINE_VERSION,
  };
}

/**
 * Full sequential pipeline orchestrator (single process view).
 * Caller supplies peerRefine(async) for true dual-host refine.
 */
export async function runSequentialPipeline({
  host,
  text,
  route,
  peerRefine,
}) {
  const draft = buildDraft({ host, text, route });
  // If draft already excellent and math solved, micro-refine local only
  if (draft.critique?.quality >= 0.9 && draft.solved && !peerRefine) {
    return {
      ok: true,
      mode: "micro-draft-final",
      topology: "single-host-fast",
      draftHost: host,
      refineHost: host,
      winner: draft.winner,
      confidence: "high",
      content: draft.content.replace("[DRAFT", "[FINAL"),
      holes: [],
      quality: draft.critique.quality,
      draftPreview: draft.content.slice(0, 200),
      engine: ENGINE_VERSION,
      note: "High-confidence solved draft — skipped peer hop.",
    };
  }

  let refined;
  if (typeof peerRefine === "function") {
    refined = await peerRefine(text, draft);
  } else {
    refined = buildRefine({ host, text, draftPayload: draft });
  }

  // Extra critic only when weak — no added wait on already-good answers
  const final = strengthenIfWeak({ host, text, draft, refined });

  return {
    ok: true,
    mode: "sequential-draft-critic-edit",
    topology: "dual-be-pipeline",
    draftHost: draft.host,
    refineHost: final.host,
    winner: final.winner,
    confidence: final.confidence,
    content: final.content,
    holes: final.holes || [],
    quality: final.critique?.quality ?? null,
    rubric: final.critique?.scores,
    draftPreview: draft.content.slice(0, 280),
    draftQuality: draft.critique?.quality,
    peerError: final.peerError,
    fallback: final.fallback,
    doublePass: final.doublePass || false,
    extraLoop: !!final.extraLoop,
    engine: ENGINE_VERSION,
    note: final.extraLoop
      ? "Extra critic on a weak pass only — strong answers stay fast."
      : "Series: Engine-D draft -> Engine-R critic/edit (quality > parallel speed).",
  };
}

/** Only runs when quality < 0.75. Strong answers unchanged (no extra latency). */
export function strengthenIfWeak({ host, text, draft, refined }) {
  const q = refined.critique?.quality ?? refined.quality ?? 0;
  if (refined.blocked || q >= 0.75) return { ...refined, extraLoop: false };
  const again = buildRefine({
    host,
    text,
    draftPayload: { ...draft, content: refined.content, winner: refined.winner },
  });
  again.extraLoop = true;
  again.doublePass = true;
  return again;
}

/** Shared specialist guess — used by Agent G2P peers and G2P-X (never a downgrade). */
export function simpleRoute(text) {
  const t = String(text || "").toLowerCase();
  let winner = "companion";
  if (/\b(solve|equation|integral|derivative|matrix|quadratic|x\^2|algebra)\b/.test(t)) winner = "math";
  else if (/\b(code|build|app|api|deploy|script|website|software)\b/.test(t)) winner = "build";
  else if (/\b(video|camera|shot|prompt|serana|wan|image|clip)\b/.test(t)) winner = "phenome";
  else if (/\b(should i|stuck|anxious|decide|life|career|relationship)\b/.test(t)) winner = "life";
  const node = { winner, acc: 1 };
  return { winner, confidence: "medium", builds: { A: node, B: node, C: node } };
}
