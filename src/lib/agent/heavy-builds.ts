/**
 * G2P Heavy Processing Builds — three algorithmic envelopes
 *
 * Not a new neural net weight file. These are heavier *control laws*
 * around the existing engines: maximize useful I/O, raise accuracy via
 * multi-hypothesis scoring, iteration, and sparse graph message-passing.
 *
 * BUILD A — Bayesian Ensemble Router (accuracy via posterior selection)
 * BUILD B — Fixed-Point Refinement Loop (accuracy via convergence)
 * BUILD C — Sparse Hierarchical Graph (throughput + structured recall)
 *
 * META — weighted fusion of A/B/C with confidence gates
 */

import { readEmotion, type EmotionRead } from "./emotion";
import { detectTopicKind, type TopicKind } from "./topic-memory";
import { openWindows, type WindowHit } from "./three-window";

// ─── Shared types ───────────────────────────────────────────────

export type BuildId = "A_bayes" | "B_fixedpoint" | "C_graph" | "META";

export type Hypothesis = {
  id: string;
  kind: TopicKind | "blend" | "emotion_first" | "legal";
  engine: "math" | "life" | "build" | "companion" | "phenome" | "legal";
  /** prior P(h) from mode lock / user preference */
  prior: number;
  /** likelihood P(data|h) from feature match */
  likelihood: number;
  /** posterior ∝ prior * likelihood (normalized later) */
  posterior: number;
  reasons: string[];
};

export type BuildTrace = {
  build: BuildId;
  hypotheses: Hypothesis[];
  selected: Hypothesis;
  iterations: number;
  accuracyScore: number;
  ioEfficiency: number;
  notes: string[];
};

export type HeavyResult = {
  primary: BuildTrace;
  alternatives: BuildTrace[];
  /** recommended engine for chat-engine */
  engine: Hypothesis["engine"];
  kind: Hypothesis["kind"];
  confidence: "high" | "medium" | "low";
  /** human-readable audit */
  audit: string;
};

// ─── Feature extraction (input maximization → compact features) ─

export type InputFeatures = {
  textLen: number;
  tokenEst: number;
  hasMath: boolean;
  hasLife: boolean;
  hasBuild: boolean;
  hasMedia: boolean;
  hasQuestion: boolean;
  hasDecision: boolean;
  emotion: EmotionRead;
  topic: TopicKind;
  windows: WindowHit[];
  /** Shannon-ish surprise proxy: rare combo of flags */
  entropyProxy: number;
};

export function extractFeatures(text: string, modeBias: number[] = []): InputFeatures {
  const t = text;
  const tokenEst = Math.max(1, t.trim().split(/\s+/).length);
  const hasMath =
    /derivative|integral|equation|solve\s+\d|x\^|quadratic|algebra|calculus|\bev\b|matrix|probability|percent/i.test(
      t,
    );
  const hasLife =
    /career|relationship|money|debt|should i|decision|stuck|goal|habit|stress|overwhelm|budget/i.test(
      t,
    );
  const hasBuild = /code|build|app|deploy|typescript|python|api|refactor|function\s/i.test(t);
  const hasMedia = /video|image|audio|camera|music|song|sound|frame|clip/i.test(t);
  const hasQuestion = /\?/.test(t) || /^(what|why|how|when|which|who)\b/i.test(t.trim());
  const hasDecision = /should i|vs\.?|or not|decide|pick between/i.test(t);
  const emotion = readEmotion(t);
  const topic = detectTopicKind(t);
  // PERF: only open windows when media/sensory keywords present
  const windows =
    hasMedia || /\b(iconic|echoic|sound|hear|see|visual)\b/i.test(t)
      ? openWindows(t)
      : ([{ id: "text" as const, reason: "text-only fast", features: ["lang"], weight: 0.55 }] as WindowHit[]);

  const flags = [hasMath, hasLife, hasBuild, hasMedia, hasQuestion, hasDecision].filter(Boolean)
    .length;
  const entropyProxy = Math.min(1, flags / 6 + (emotion.intensity > 0.5 ? 0.15 : 0));

  void modeBias;
  return {
    textLen: t.length,
    tokenEst,
    hasMath,
    hasLife,
    hasBuild,
    hasMedia,
    hasQuestion,
    hasDecision,
    emotion,
    topic,
    windows,
    entropyProxy,
  };
}

// ─── BUILD A: Bayesian Ensemble Router ──────────────────────────
/**
 * Scientific basis: Bayes rule for model selection.
 *   P(h|x) ∝ P(x|h) P(h)
 * Maximize expected accuracy by picking argmax posterior, not first regex hit.
 */

function buildHypotheses(f: InputFeatures, preferredEngine?: string): Hypothesis[] {
  const hyps: Hypothesis[] = [];

  const push = (
    id: string,
    kind: Hypothesis["kind"],
    engine: Hypothesis["engine"],
    prior: number,
    likelihood: number,
    reasons: string[],
  ) => {
    hyps.push({
      id,
      kind,
      engine,
      prior,
      likelihood,
      posterior: prior * likelihood,
      reasons,
    });
  };

  // Priors: slight bias to preferred mode if locked
  const pref = preferredEngine || "";
  const bias = (eng: string) => (pref === eng ? 1.25 : 1);

  push(
    "h_math",
    "math",
    "math",
    0.18 * bias("math"),
    f.hasMath ? 0.92 : f.topic === "math" ? 0.7 : 0.08,
    f.hasMath ? ["math lexicon"] : ["low math signal"],
  );
  push(
    "h_life",
    "life",
    "life",
    0.2 * bias("life"),
    f.hasLife ? 0.9 : f.hasDecision ? 0.75 : f.topic === "life" ? 0.65 : 0.12,
    f.hasLife || f.hasDecision ? ["life/decision lexicon"] : ["low life signal"],
  );
  push(
    "h_build",
    "build",
    "build",
    0.15 * bias("build"),
    f.hasBuild ? 0.9 : f.topic === "build" ? 0.7 : 0.1,
    f.hasBuild ? ["code lexicon"] : ["low build signal"],
  );
  push(
    "h_emotion",
    "emotion_first",
    "companion",
    0.16,
    f.emotion.intensity >= 0.55 ? 0.95 : f.emotion.intensity >= 0.35 ? 0.45 : 0.1,
    [`emotion=${f.emotion.state} i=${f.emotion.intensity.toFixed(2)}`],
  );
  push(
    "h_media",
    "general",
    "phenome",
    0.12,
    f.hasMedia ? 0.88 : f.windows.some((w) => w.id !== "text") ? 0.6 : 0.1,
    f.hasMedia ? ["media lexicon"] : ["text-only windows"],
  );
  push(
    "h_blend",
    "blend",
    "life",
    0.1,
    f.hasMath && f.hasLife ? 0.93 : f.hasMath && f.hasDecision ? 0.8 : 0.05,
    f.hasMath && (f.hasLife || f.hasDecision) ? ["math×life co-activation"] : ["no blend"],
  );
  push(
    "h_companion",
    "companion",
    "companion",
    0.14 * bias("companion"),
    !f.hasMath && !f.hasLife && !f.hasBuild && !f.hasMedia ? 0.7 : 0.25,
    ["default continuity prior"],
  );

  // Normalize posteriors
  const sum = hyps.reduce((s, h) => s + h.posterior, 0) || 1;
  for (const h of hyps) h.posterior = h.posterior / sum;
  hyps.sort((a, b) => b.posterior - a.posterior);
  return hyps;
}

export function runBuildA(text: string, preferredEngine?: string, features?: InputFeatures): BuildTrace {
  const f = features ?? extractFeatures(text);
  const hypotheses = buildHypotheses(f, preferredEngine);
  const selected = hypotheses[0];
  // Accuracy proxy: top posterior mass + margin over #2
  const margin = selected.posterior - (hypotheses[1]?.posterior || 0);
  const accuracyScore = Math.min(1, selected.posterior + margin * 0.5);
  // I/O efficiency: features used / tokens (higher = more meaning per token)
  const signals =
    [f.hasMath, f.hasLife, f.hasBuild, f.hasMedia, f.hasQuestion, f.hasDecision].filter(Boolean)
      .length + (f.emotion.intensity > 0.3 ? 1 : 0);
  const ioEfficiency = Math.min(1, signals / Math.max(3, f.tokenEst / 8));

  return {
    build: "A_bayes",
    hypotheses,
    selected,
    iterations: 1,
    accuracyScore,
    ioEfficiency,
    notes: [
      "Bayes model selection: argmax P(h|x)",
      `top=${selected.id} P=${selected.posterior.toFixed(3)} margin=${margin.toFixed(3)}`,
      ...selected.reasons,
    ],
  };
}

// ─── BUILD B: Fixed-Point Refinement Loop ───────────────────────
/**
 * Scientific basis: iterative maps x_{n+1} = T(x_n) until ||x_{n+1}-x_n|| < ε
 * Each iteration re-scores with residual features the previous pick ignored.
 * Raises accuracy on ambiguous multi-intent inputs.
 */

export function runBuildB(text: string, preferredEngine?: string, maxIter = 4, features?: InputFeatures): BuildTrace {
  const f0 = features ?? extractFeatures(text);
  let hypotheses = buildHypotheses(f0, preferredEngine);
  let selected = hypotheses[0];
  const notes: string[] = ["Fixed-point refinement loop"];
  let iterations = 0;
  let prevId = "";

  for (let i = 0; i < maxIter; i++) {
    iterations++;
    // Residual: boost under-selected high-signal engines
    const residualBoost: Record<string, number> = {};
    if (f0.hasMath && selected.engine !== "math") residualBoost.math = 0.35;
    if (f0.hasLife && selected.engine !== "life") residualBoost.life = 0.3;
    if (f0.emotion.intensity >= 0.55 && selected.engine !== "companion")
      residualBoost.companion = 0.4;
    if (f0.hasMedia && selected.engine !== "phenome") residualBoost.phenome = 0.3;
    if (f0.hasMath && f0.hasLife && selected.kind !== "blend") residualBoost.life = 0.25;

    // Soft update posteriors
    for (const h of hypotheses) {
      const b = residualBoost[h.engine] || residualBoost[h.kind === "blend" ? "life" : ""] || 0;
      if (b) {
        h.posterior *= 1 + b;
        h.reasons.push(`iter${i + 1} residual +${b}`);
      }
    }
    const sum = hypotheses.reduce((s, h) => s + h.posterior, 0) || 1;
    for (const h of hypotheses) h.posterior /= sum;
    hypotheses.sort((a, b) => b.posterior - a.posterior);
    selected = hypotheses[0];

    const delta = prevId === selected.id ? 0 : 1;
    notes.push(`iter ${i + 1}: ${selected.id} P=${selected.posterior.toFixed(3)}`);
    if (prevId === selected.id && i > 0) {
      notes.push(`converged at iter ${i + 1} (fixed point)`);
      break;
    }
    // also converge if mass concentrated
    if (selected.posterior >= 0.55 && i > 0) {
      notes.push("converged: posterior mass ≥ 0.55");
      break;
    }
    prevId = selected.id;
    void delta;
  }

  const margin = selected.posterior - (hypotheses[1]?.posterior || 0);
  const accuracyScore = Math.min(1, 0.15 + selected.posterior + margin * 0.4 + iterations * 0.03);
  const ioEfficiency = Math.min(1, 0.4 + iterations * 0.1);

  return {
    build: "B_fixedpoint",
    hypotheses,
    selected,
    iterations,
    accuracyScore,
    ioEfficiency,
    notes,
  };
}

// ─── BUILD C: Sparse Hierarchical Graph ─────────────────────────
/**
 * Scientific basis: sparse message passing on a small factor graph.
 * Nodes: TEXT, MATH, LIFE, BUILD, EMO, MEDIA, OUT
 * Edges only when co-activated → O(k) not O(n²). Maximizes throughput
 * while preserving accuracy via gated aggregation.
 */

type GraphNode = {
  id: string;
  activation: number;
  messages: number;
};

export function runBuildC(text: string, features?: InputFeatures): BuildTrace {
  const f = features ?? extractFeatures(text);
  const nodes: Record<string, GraphNode> = {
    TEXT: { id: "TEXT", activation: Math.min(1, f.tokenEst / 40), messages: 0 },
    MATH: { id: "MATH", activation: f.hasMath ? 0.9 : 0.05, messages: 0 },
    LIFE: { id: "LIFE", activation: f.hasLife || f.hasDecision ? 0.85 : 0.08, messages: 0 },
    BUILD: { id: "BUILD", activation: f.hasBuild ? 0.88 : 0.05, messages: 0 },
    EMO: { id: "EMO", activation: f.emotion.intensity, messages: 0 },
    MEDIA: {
      id: "MEDIA",
      activation: f.hasMedia ? 0.85 : f.windows.length > 1 ? 0.4 : 0.05,
      messages: 0,
    },
    OUT: { id: "OUT", activation: 0, messages: 0 },
  };

  // Sparse edges: only fire if both ends active enough
  const edges: [string, string, number][] = [
    ["TEXT", "MATH", 0.5],
    ["TEXT", "LIFE", 0.5],
    ["TEXT", "BUILD", 0.5],
    ["TEXT", "EMO", 0.6],
    ["TEXT", "MEDIA", 0.45],
    ["MATH", "LIFE", 0.7], // blend bridge
    ["EMO", "LIFE", 0.65],
    ["MEDIA", "OUT", 0.8],
    ["MATH", "OUT", 0.85],
    ["LIFE", "OUT", 0.85],
    ["BUILD", "OUT", 0.85],
    ["EMO", "OUT", 0.9],
  ];

  let messagesPassed = 0;
  // Two rounds of message passing
  for (let round = 0; round < 2; round++) {
    for (const [a, b, w] of edges) {
      if (nodes[a].activation < 0.2 && nodes[b].activation < 0.2) continue; // sparse skip
      const msg = nodes[a].activation * w * (0.7 + 0.3 * nodes[b].activation);
      nodes[b].activation = Math.min(1, nodes[b].activation + msg * 0.35);
      nodes[b].messages += 1;
      messagesPassed++;
    }
  }

  // Map OUT contributions
  const scores = {
    math: nodes.MATH.activation,
    life: nodes.LIFE.activation,
    build: nodes.BUILD.activation,
    companion: nodes.EMO.activation * 0.9 + (1 - nodes.MATH.activation) * 0.1,
    phenome: nodes.MEDIA.activation,
  };

  // blend if math+life both high
  let engine: Hypothesis["engine"] = "companion";
  let kind: Hypothesis["kind"] = "companion";
  if (scores.math > 0.55 && scores.life > 0.5) {
    engine = "life";
    kind = "blend";
  } else {
    const ranked = (Object.entries(scores) as [Hypothesis["engine"], number][]).sort(
      (a, b) => b[1] - a[1],
    );
    engine = ranked[0][0];
    kind =
      engine === "math"
        ? "math"
        : engine === "life"
          ? "life"
          : engine === "build"
            ? "build"
            : engine === "phenome"
              ? "general"
              : scores.companion > 0.55
                ? "emotion_first"
                : "companion";
  }

  const selected: Hypothesis = {
    id: `graph_${engine}`,
    kind,
    engine,
    prior: 1,
    likelihood: (engine in scores ? scores[engine as keyof typeof scores] : 0.5),
    posterior: (engine in scores ? scores[engine as keyof typeof scores] : 0.5),
    reasons: [
      `msg_passed=${messagesPassed}`,
      `MATH=${nodes.MATH.activation.toFixed(2)} LIFE=${nodes.LIFE.activation.toFixed(2)} EMO=${nodes.EMO.activation.toFixed(2)}`,
    ],
  };

  const hypotheses = Object.entries(scores).map(([eng, sc]) => ({
    id: `g_${eng}`,
    kind: eng as Hypothesis["kind"],
    engine: eng as Hypothesis["engine"],
    prior: 1,
    likelihood: sc,
    posterior: sc,
    reasons: [] as string[],
  }));
  hypotheses.sort((a, b) => b.posterior - a.posterior);

  // Sparse efficiency: messages / possible dense messages
  const densePossible = edges.length * 2;
  const ioEfficiency = Math.min(1, 0.3 + (1 - messagesPassed / Math.max(densePossible, 1)) * 0.5 + 0.2);
  const accuracyScore = Math.min(1, 0.2 + (engine in scores ? scores[engine as keyof typeof scores] : 0.5));

  return {
    build: "C_graph",
    hypotheses,
    selected,
    iterations: 2,
    accuracyScore,
    ioEfficiency,
    notes: [
      "Sparse hierarchical message passing",
      `edges fired ~${messagesPassed}/${densePossible}`,
      ...selected.reasons,
    ],
  };
}

// ─── META: Weighted fusion of A/B/C ─────────────────────────────
/**
 * Ensemble: weight each build by its accuracyScore * ioEfficiency.
 * Vote on engine; break ties with highest individual posterior.
 */

export function runHeavyMeta(text: string, preferredEngine?: string): HeavyResult {
  // PERF: single feature extraction shared by A/B/C (was 3×)
  const f = extractFeatures(text);

  // PERF: fast path — one dominant signal, skip full ensemble
  const signals = [
    f.hasMath && "math",
    f.hasBuild && "build",
    f.hasLife && "life",
    f.hasMedia && "phenome",
    f.emotion.intensity >= 0.55 && "companion",
  ].filter(Boolean) as string[];
  const unique = [...new Set(signals)];
  if (unique.length === 1 && !preferredEngine) {
    const only = unique[0] as Hypothesis["engine"];
    const A = runBuildA(text, preferredEngine, f);
    const hyp: Hypothesis = {
      id: `fast_${only}`,
      kind:
        only === "math"
          ? "math"
          : only === "life"
            ? "life"
            : only === "build"
              ? "build"
              : only === "phenome"
                ? "general"
                : "emotion_first",
      engine: only,
      prior: 1,
      likelihood: 0.9,
      posterior: 0.9,
      reasons: ["fast-path single signal"],
    };
    const primary: BuildTrace = {
      build: "META",
      hypotheses: [hyp],
      selected: hyp,
      iterations: 1,
      accuracyScore: 0.88,
      ioEfficiency: 0.95,
      notes: ["PERF fast-path", `signal=${only}`],
    };
    return {
      primary,
      alternatives: [A],
      engine: only,
      kind: hyp.kind,
      confidence: "high",
      audit: ["**Heavy META (fast-path)**", "", `Single signal → **${only}** · conf=high`].join('\n'),
    };
  }

  const A = runBuildA(text, preferredEngine, f);
  const B = runBuildB(text, preferredEngine, 3, f); // max 3 iters
  const C = runBuildC(text, f);

  const builds = [A, B, C];
  const engineVotes: Record<string, number> = {};
  for (const b of builds) {
    const w = b.accuracyScore * (0.5 + 0.5 * b.ioEfficiency);
    engineVotes[b.selected.engine] = (engineVotes[b.selected.engine] || 0) + w;
  }
  const ranked = Object.entries(engineVotes).sort((a, b) => b[1] - a[1]);
  const engine = ranked[0][0] as Hypothesis["engine"];

  const agreeing = builds.filter((b) => b.selected.engine === engine);
  const primary = agreeing.sort((a, b) => b.accuracyScore - a.accuracyScore)[0] || A;

  const confNum = primary.accuracyScore;
  const confidence: HeavyResult["confidence"] =
    confNum >= 0.72 ? "high" : confNum >= 0.45 ? "medium" : "low";

  const kind = primary.selected.kind;

  const audit = [
    "**Heavy processing META**",
    "",
    `A Bayes → ${A.selected.engine} (acc ${A.accuracyScore.toFixed(2)} io ${A.ioEfficiency.toFixed(2)})`,
    `B Fixed-point → ${B.selected.engine} ×${B.iterations} (acc ${B.accuracyScore.toFixed(2)})`,
    `C Sparse graph → ${C.selected.engine} (acc ${C.accuracyScore.toFixed(2)} io ${C.ioEfficiency.toFixed(2)})`,
    "",
    `**Vote winner:** ${engine} · kind=${kind} · conf=${confidence}`,
    `Votes: ${ranked.map(([e, v]) => `${e}:${v.toFixed(2)}`).join(" · ")}`,
  ].join('\n');

  return {
    primary: { ...primary, build: "META", notes: [...primary.notes, "meta-ensemble"] },
    alternatives: builds,
    engine,
    kind,
    confidence,
    audit,
  };
}

export function isHeavyAuditQuery(text: string): boolean {
  return /\b(heavy build|build a|build b|build c|bayes router|fixed.?point|sparse graph|processing meta|how (are|do) you (route|process)|algorithmic|weighted model)\b/i.test(
    text,
  );
}
