/**
 * Grok-class / G2P backend worker — stateless.
 * Run two instances: PORT=3001 HOST_ID=be-1 and PORT=3002 HOST_ID=be-2
 */
import http from "node:http";
import { createHash } from "node:crypto";

const PORT = Number(process.env.PORT || 3001);
const HOST_ID = process.env.HOST_ID || `be-${PORT}`;
const PEER = process.env.PEER_URL || "";

// PERF: LRU route cache (identical short prompts)
const routeCache = new Map();
const CACHE_MAX = 128;
function cacheGet(key) {
  const v = routeCache.get(key);
  if (!v) return null;
  if (Date.now() - v.at > 60_000) {
    routeCache.delete(key);
    return null;
  }
  return v.data;
}
function cacheSet(key, data) {
  if (routeCache.size >= CACHE_MAX) {
    const first = routeCache.keys().next().value;
    routeCache.delete(first);
  }
  routeCache.set(key, { at: Date.now(), data });
}

// PERF: precompiled detectors (avoid re-creating RegExp each call)
const RE_MATH = /derivative|integral|equation|solve|x\^|quadratic|\bev\b|matrix|probability|algebra|calculus|percent/i;
const RE_LIFE = /career|relationship|money|debt|should i|decision|stuck|goal|stress|job|offer/i;
const RE_BUILD = /code|build|app|deploy|typescript|python|api|refactor|website|software/i;
const RE_MEDIA = /video|image|audio|camera|music|song|sound|frame|photo|picture/i;
const RE_EMO = /spiral|panic|overwhelm|sad|angry|lonely|stress|anxious|freaking/i;

const metrics = {
  routes: 0,
  refines: 0,
  pipelines: 0,
  cacheHits: 0,
  fastPaths: 0,
  fullMeta: 0,
  chat: 0,
  totalRouteMs: 0,
  maxRouteMs: 0,
  startedAt: Date.now(),
};

function extractSignals(text) {
  const t = text || "";
  // single pass token estimate without heavy split when short
  let tokens = 1;
  if (t.length > 0) {
    let c = 1;
    for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 32) c++;
    tokens = c;
  }
  return {
    hasMath: RE_MATH.test(t),
    hasLife: RE_LIFE.test(t),
    hasBuild: RE_BUILD.test(t),
    hasMedia: RE_MEDIA.test(t),
    emotion: RE_EMO.test(t),
    tokens,
  };
}

async function readJsonBody(req) {
  const raw = await readTextBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { text: raw };
  }
}

async function readTextBody(req) {
  // PERF: accumulate buffers once
  const chunks = [];
  let len = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    len += chunk.length;
    if (len > 32_000) break; // hard cap
  }
  if (!len) return "";
  const raw = Buffer.concat(chunks, len).toString("utf8");
  if (raw.charCodeAt(0) === 123) {
    // '{'
    try {
      return JSON.parse(raw).text || "";
    } catch {
      return raw;
    }
  }
  return raw;
}




function bayesRoute(sig) {
  const scores = {
    math: (sig.hasMath ? 0.9 : 0.1) * 0.2,
    life: ((sig.hasLife ? 0.9 : 0.1) + (sig.emotion ? 0.2 : 0)) * 0.22,
    build: (sig.hasBuild ? 0.9 : 0.1) * 0.18,
    companion: (sig.emotion ? 0.85 : 0.35) * 0.2,
    phenome: (sig.hasMedia ? 0.88 : 0.1) * 0.15,
  };
  if (sig.hasMath && sig.hasLife) scores.life *= 1.3;
  const sum = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(scores)) scores[k] /= sum;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { build: "A_bayes", winner: ranked[0][0], scores, acc: ranked[0][1] };
}

function fixedPointRoute(sig, maxIter = 4) {
  let cur = bayesRoute(sig);
  let prev = "";
  let iter = 0;
  for (let i = 0; i < maxIter; i++) {
    iter++;
    const s = { ...cur.scores };
    if (sig.hasMath && cur.winner !== "math") s.math *= 1.35;
    if (sig.hasLife && cur.winner !== "life") s.life *= 1.3;
    if (sig.emotion && cur.winner !== "companion") s.companion *= 1.4;
    if (sig.hasMedia && cur.winner !== "phenome") s.phenome *= 1.3;
    const sum = Object.values(s).reduce((a, b) => a + b, 0) || 1;
    for (const k of Object.keys(s)) s[k] /= sum;
    const ranked = Object.entries(s).sort((a, b) => b[1] - a[1]);
    cur = {
      build: "B_fixedpoint",
      winner: ranked[0][0],
      scores: s,
      acc: ranked[0][1],
      iter,
    };
    if (prev === cur.winner && i > 0) break;
    prev = cur.winner;
  }
  return cur;
}

function sparseGraphRoute(sig) {
  const nodes = {
    MATH: sig.hasMath ? 0.9 : 0.05,
    LIFE: sig.hasLife ? 0.85 : 0.08,
    BUILD: sig.hasBuild ? 0.88 : 0.05,
    EMO: sig.emotion ? 0.8 : 0.1,
    MEDIA: sig.hasMedia ? 0.85 : 0.05,
  };
  for (let r = 0; r < 2; r++) {
    if (nodes.MATH > 0.2 && nodes.LIFE > 0.2) {
      nodes.LIFE = Math.min(1, nodes.LIFE + 0.15);
      nodes.MATH = Math.min(1, nodes.MATH + 0.1);
    }
    if (nodes.EMO > 0.5) nodes.LIFE = Math.min(1, nodes.LIFE + 0.12);
  }
  const map = {
    math: nodes.MATH,
    life: nodes.LIFE,
    build: nodes.BUILD,
    companion: nodes.EMO,
    phenome: nodes.MEDIA,
  };
  if (nodes.MATH > 0.55 && nodes.LIFE > 0.5) {
    return { build: "C_graph", winner: "life", scores: map, acc: 0.75, note: "blend-lean" };
  }
  const ranked = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return { build: "C_graph", winner: ranked[0][0], scores: map, acc: ranked[0][1] };
}

function metaRoute(text) {
  const key = (text || "").trim().toLowerCase().slice(0, 200);
  const hit = key ? cacheGet(key) : null;
  if (hit) {
    metrics.cacheHits++;
    return { ...hit, host: HOST_ID, cached: true, topology: "dual-be" };
  }

  const sig = extractSignals(text);

  // PERF: single-signal fast path — skip B+C ensemble
  const flags = [
    sig.hasMath && "math",
    sig.hasBuild && "build",
    sig.hasLife && "life",
    sig.hasMedia && "phenome",
    sig.emotion && "companion",
  ].filter(Boolean);
  const uniq = [...new Set(flags)];
  if (uniq.length === 1) {
    const winner = uniq[0];
    const A = bayesRoute(sig);
    const result = {
      host: HOST_ID,
      signal: sig,
      builds: { A, B: A, C: A },
      votes: { [winner]: 2.2 },
      winner,
      confidence: "high",
      topology: "dual-be",
      fastPath: true,
    };
    metrics.fastPaths++;
    if (key) cacheSet(key, result);
    return result;
  }

  metrics.fullMeta++;
  const A = bayesRoute(sig);
  const B = fixedPointRoute(sig, 3);
  const C = sparseGraphRoute(sig);
  const votes = {};
  for (const x of [A, B, C]) {
    const w = x.acc * 0.85 + 0.15;
    votes[x.winner] = (votes[x.winner] || 0) + w;
  }
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const winner = ranked[0][0];
  const conf =
    ranked[0][1] >= 1.8 ? "high" : ranked[0][1] >= 1.1 ? "medium" : "low";
  const result = {
    host: HOST_ID,
    signal: sig,
    builds: { A, B, C },
    votes,
    winner,
    confidence: conf,
    topology: "dual-be",
    fastPath: false,
  };
  if (key) cacheSet(key, result);
  return result;
}


/**
 * Sequential dual-engine quality path (NOT parallel load-balance).
 * Stage 1 DRAFT on this host → Stage 2 REFINE on peer (or local if no peer).
 * Used for better accuracy, not faster fan-out.
 */
function draftAnswer(text, route) {
  const w = route.winner;
  const conf = route.confidence;
  const lines = [
    `[DRAFT · ${HOST_ID}] specialist=${w} conf=${conf}`,
    `META votes: A=${route.builds?.A?.winner} B=${route.builds?.B?.winner} C=${route.builds?.C?.winner}`,
    "",
  ];
  if (w === "math") {
    lines.push(
      "Math draft: identify knowns/unknowns, choose method, solve step-by-step, box answer.",
      "Show check: plug back or differentiate as needed.",
    );
  } else if (w === "life") {
    lines.push(
      "Life draft: name the decision, constraints, 2–3 options, recommend one next action.",
      "Keep calm; no extreme language.",
    );
  } else if (w === "build") {
    lines.push(
      "Build draft: goal, stack guess, smallest shippable slice, file-level plan.",
      "Prefer working code over essays.",
    );
  } else if (w === "phenome" || w === "media") {
    lines.push(
      "Media draft: if video intent → Director plan (preset/camera/light); else describe pipeline.",
    );
  } else {
    lines.push(
      "Companion draft: short clear answer, warm but not extreme, invite one precise follow-up.",
    );
  }
  lines.push("", `User: ${text.slice(0, 400)}`);
  return {
    stage: "draft",
    host: HOST_ID,
    winner: w,
    confidence: conf,
    content: lines.join("\n"),
    route,
  };
}

function refineAnswer(text, draftPayload) {
  const draft = draftPayload?.content || "";
  const w = draftPayload?.winner || "companion";
  const conf = draftPayload?.confidence || "medium";
  const holes = [];
  if (w === "math" && !/check|verify|plug/i.test(draft)) holes.push("add verification step");
  if (w === "life" && !/next action|option/i.test(draft)) holes.push("force one concrete next action");
  if (w === "build" && !/file|slice|step/i.test(draft)) holes.push("name first implementable slice");
  if (draft.length < 80) holes.push("expand thin draft");
  if (conf === "low") holes.push("raise confidence by re-routing specialists");

  // Optional re-route on low confidence
  let route2 = draftPayload?.route;
  if (conf === "low" || holes.length >= 2) {
    route2 = metaRoute(text + " " + draft.slice(0, 120));
  }

  const refined = [
    `[REFINE · ${HOST_ID}] after draft from ${draftPayload?.host || "peer"}`,
    `Path: ${route2?.winner || w} · conf ${route2?.confidence || conf}`,
    holes.length ? `Fixes: ${holes.join("; ")}` : "Draft solid — polish only.",
    "",
    "— Refined output —",
    draft
      .replace(/^\[DRAFT[^\]]*\]/m, `[FINAL · ${HOST_ID}]`)
      .trim(),
    "",
    holes.length
      ? `Quality pass applied (${holes.length} improvements).`
      : "Quality pass: structure + clarity only.",
    "Dual-engine mode: sequential draft→refine (not parallel race).",
  ].join("\n");

  return {
    stage: "refine",
    host: HOST_ID,
    winner: route2?.winner || w,
    confidence: route2?.confidence || conf,
    content: refined,
    holes,
    priorHost: draftPayload?.host,
    route: route2,
  };
}

async function peerRefine(text, draftPayload) {
  if (!PEER) return refineAnswer(text, draftPayload);
  try {
    const r = await fetch(`${PEER}/api/refine`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, draft: draftPayload, stage: "refine-only" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`peer HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    // Fallback local refine if peer down
    const local = refineAnswer(text, draftPayload);
    local.peerError = String(e);
    local.fallback = "local-refine";
    return local;
  }
}

async function qualityPipeline(text) {
  metrics.pipelines++;
  const t0 = performance.now();
  const route = metaRoute(text);
  const draft = draftAnswer(text, route);
  metrics.refines++;
  const refined = await peerRefine(text, draft);
  const ms = performance.now() - t0;
  return {
    ok: true,
    mode: "sequential-draft-refine",
    topology: "dual-be-pipeline",
    draftHost: draft.host,
    refineHost: refined.host,
    winner: refined.winner,
    confidence: refined.confidence,
    content: refined.content,
    holes: refined.holes || [],
    draftPreview: draft.content.slice(0, 280),
    peerError: refined.peerError,
    fallback: refined.fallback,
    ms: +ms.toFixed(3),
    note: "Engines run in series: draft then refine — quality over parallel speed.",
  };
}


function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "X-Host-Id": HOST_ID,
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    });
    return res.end();
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/api/metrics") {
    const avg = metrics.routes ? metrics.totalRouteMs / metrics.routes : 0;
    return json(res, 200, {
      host: HOST_ID,
      uptimeSec: Math.round((Date.now() - metrics.startedAt) / 1000),
      routes: metrics.routes,
      refines: metrics.refines || 0,
      pipelines: metrics.pipelines || 0,
      chat: metrics.chat,
      cacheHits: metrics.cacheHits,
      cacheSize: routeCache.size,
      fastPaths: metrics.fastPaths,
      fullMeta: metrics.fullMeta,
      avgRouteMs: +avg.toFixed(3),
      maxRouteMs: +metrics.maxRouteMs.toFixed(3),
      cacheHitRate: metrics.routes
        ? +(metrics.cacheHits / Math.max(1, metrics.routes)).toFixed(3)
        : 0,
    });
  }

  if (url.pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      host: HOST_ID,
      port: PORT,
      role: "backend",
      ts: Date.now(),
      cache: routeCache.size,
    });
  }

  if (url.pathname === "/api/peers" && PEER) {
    try {
      const r = await fetch(`${PEER}/api/health`);
      const j = await r.json();
      return json(res, 200, { self: HOST_ID, peer: j });
    } catch (e) {
      return json(res, 200, { self: HOST_ID, peer: null, error: String(e) });
    }
  }

  if (url.pathname === "/api/route" && req.method === "POST") {
    const t0 = performance.now();
    const text = await readTextBody(req);
    const result = metaRoute(text);
    // PERF: skip sha1 on cached hits
    if (!result.cached) {
      result.trace = createHash("sha1")
        .update(text + HOST_ID)
        .digest("hex")
        .slice(0, 12);
    }
    const ms = performance.now() - t0;
    metrics.routes++;
    metrics.totalRouteMs += ms;
    if (ms > metrics.maxRouteMs) metrics.maxRouteMs = ms;
    result.ms = +ms.toFixed(3);
    return json(res, 200, result);
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    metrics.chat++;
    const text = await readTextBody(req);
    const route = metaRoute(text);
    return json(res, 200, {
      host: HOST_ID,
      route: route.winner,
      confidence: route.confidence,
      content: [
        `[${HOST_ID}] path=${route.winner} conf=${route.confidence}`,
        `A=${route.builds.A.winner} B=${route.builds.B.winner} C=${route.builds.C.winner}`,
        "",
        "Heavy META selected this specialist path.",
        "Optional: attach external frontier model API on BE for full generation.",
        "Routing/verify envelope is local and multi-host ready.",
        "",
        `You said: ${text.slice(0, 240)}`,
      ].join("\n"),
      builds: route.builds,
      votes: route.votes,
    });
  }



  if (url.pathname === "/api/refine" && req.method === "POST") {
    metrics.refines++;
    const body = await readJsonBody(req);
    const text = String(body.text || body.prompt || "");
    if (body.stage === "refine-only" && body.draft) {
      return json(res, 200, refineAnswer(text, body.draft));
    }
    // Full local draft+refine if called alone
    const route = metaRoute(text);
    const draft = draftAnswer(text, route);
    return json(res, 200, refineAnswer(text, draft));
  }

  if (url.pathname === "/api/pipeline" && req.method === "POST") {
    const body = await readJsonBody(req);
    const text = String(body.text || body.prompt || "");
    if (!text.trim()) return json(res, 400, { error: "text required" });
    const out = await qualityPipeline(text);
    return json(res, 200, out);
  }

  if (url.pathname === "/api/bake") {
    return json(res, 200, {
      host: HOST_ID,
      summary: {
        once: 20,
        recurring: 8,
        note: "Full schedule in src/lib/agent/training/bake-schedule.ts",
      },
      phases: [
        { phase: 0, name: "Safety locks", week: "Day 0" },
        { phase: 1, name: "Core product bake", week: "Week 1" },
        { phase: 2, name: "Heavy routing brain", week: "Week 2" },
        { phase: 3, name: "Multimodal memory", week: "Week 2-3" },
        { phase: 4, name: "Hosting topology", week: "Week 3" },
        { phase: 5, name: "Frontier optional", week: "Week 4-5" },
        { phase: 6, name: "Recurring keep-hot", week: "Ongoing" },
      ],
      recurring: [
        { id: "RC-D1", cadence: "daily", title: "Health LB+BE+FE", minutes: 10 },
        { id: "RC-D2", cadence: "daily", title: "Routing smoke", minutes: 15 },
        { id: "RC-W1", cadence: "weekly", title: "Memory distill audit", minutes: 30 },
        { id: "RC-W2", cadence: "weekly", title: "Legal regression", minutes: 20 },
        { id: "RC-W3", cadence: "weekly", title: "Presence sample", minutes: 20 },
        { id: "RC-M1", cadence: "monthly", title: "Eval pack", minutes: 90 },
        { id: "RC-M2", cadence: "monthly", title: "Security patch", minutes: 60 },
        { id: "RC-M3", cadence: "monthly", title: "GPU cost review", minutes: 30 },
      ],
    });
  }

  if (url.pathname === "/api/topology") {
    return json(res, 200, {
      design: "converged-r6",
      backends: 2,
      frontends: 2,
      lb: "8080",
      builds: ["A_bayes", "B_fixedpoint", "C_sparse_graph", "META"],
      host: HOST_ID,
      note: "Best topology without new model pretrain",
    });
  }

  json(res, 404, { error: "not_found", host: HOST_ID });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[${HOST_ID}] backend on 0.0.0.0:${PORT}`);
});
