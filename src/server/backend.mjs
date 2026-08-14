/**
 * Grok-class / G2P backend worker — stateless.
 * Run two instances: PORT=3001 HOST_ID=be-1 and PORT=3002 HOST_ID=be-2
 */
import http from "node:http";
import { createHash } from "node:crypto";
import {
  buildDraft,
  buildRefine,
  runSequentialPipeline,
  ENGINE_VERSION,
} from "../../deploy/engines/dual-engine.mjs";
import { buildVerify, VERIFY_VERSION } from "../../deploy/engines/verify-engine.mjs";
import {
  planVideo,
  runVideoJob,
  isVideoIntent,
  DIRECTOR_VERSION,
  pollVideoJob,
  studioReady,
} from "../../deploy/engines/video-director.mjs";
import {
  runStudioJob,
  enqueueStudioJob,
  queueSnapshot,
  STUDIO_RUN_VERSION,
} from "../../deploy/engines/studio-run.mjs";
import { compareG2PX, G2PX_VERSION } from "../../deploy/engines/g2p-x-compare.mjs";
import { runG2PX, g2pxReady, G2PX_ENGINE } from "../../deploy/engines/g2p-x-engine.mjs";

const PORT = Number(process.env.PORT || 3001);
const HOST_ID = process.env.HOST_ID || `be-${PORT}`;
const PEER = process.env.PEER_URL || "";
/** draft | refine | verify | auto */
const ENGINE_ROLE = (process.env.ENGINE_ROLE || "auto").toLowerCase();
const VERIFY_URL = process.env.VERIFY_URL || ""; // optional Engine-V
const PIPELINE_CACHE_TTL_MS = Number(process.env.PIPELINE_CACHE_TTL_MS || 120_000);

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
  verifies: 0,
  cacheHits: 0,
  pipelineCacheHits: 0,
  fastPaths: 0,
  fullMeta: 0,
  chat: 0,
  totalRouteMs: 0,
  maxRouteMs: 0,
  pipelineMs: [], // ring for p50/p95
  qualities: [],
  startedAt: Date.now(),
};

const pipelineCache = new Map();
const PIPELINE_CACHE_MAX = 64;
function pipelineCacheGet(key) {
  const v = pipelineCache.get(key);
  if (!v) return null;
  if (Date.now() - v.at > PIPELINE_CACHE_TTL_MS) {
    pipelineCache.delete(key);
    return null;
  }
  metrics.pipelineCacheHits++;
  return v.data;
}
function pipelineCacheSet(key, data) {
  if (pipelineCache.size >= PIPELINE_CACHE_MAX) {
    const first = pipelineCache.keys().next().value;
    pipelineCache.delete(first);
  }
  pipelineCache.set(key, { at: Date.now(), data });
}
function pushSample(arr, n, max = 200) {
  arr.push(n);
  if (arr.length > max) arr.shift();
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
}

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

async function readRawBody(req) {
  const chunks = [];
  let len = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    len += chunk.length;
    if (len > 32_000) break;
  }
  if (!len) return "";
  return Buffer.concat(chunks, len).toString("utf8");
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { text: raw };
  }
}

async function readTextBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return "";
  if (raw.charCodeAt(0) === 123) {
    try {
      const j = JSON.parse(raw);
      return j.text || j.prompt || "";
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

  // Always 3-way vote — accuracy over speed
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



/** @deprecated local names — use dual-engine module */
function draftAnswer(text, route) {
  return buildDraft({ host: HOST_ID, text, route });
}

function refineAnswer(text, draftPayload) {
  return buildRefine({ host: HOST_ID, text, draftPayload });
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
    const j = await r.json();
    return j;
  } catch (e) {
    const local = refineAnswer(text, draftPayload);
    local.peerError = String(e);
    local.fallback = "local-refine";
    return local;
  }
}


async function qualityPipeline(text, opts = {}) {
  metrics.pipelines++;
  const t0 = performance.now();
  const cacheKey = createHash("sha1").update(String(text).trim().toLowerCase()).digest("hex");
  if (!opts.noCache) {
    const hit = pipelineCacheGet(cacheKey);
    if (hit) {
      return { ...hit, cached: true, ms: +(performance.now() - t0).toFixed(3) };
    }
  }

  const route = metaRoute(text);
  const out = await runSequentialPipeline({
    host: HOST_ID,
    text,
    route,
    peerRefine: async (txt, draft) => {
      metrics.refines++;
      if (ENGINE_ROLE === "refine" && !PEER) return refineAnswer(txt, draft);
      return peerRefine(txt, draft);
    },
  });

  // Verify hop only when requested (?verify=1 / body.verify) — not every call
  const wantVerify = opts.verify === true;

  if (wantVerify) {
    metrics.verifies++;
    try {
      if (VERIFY_URL && ENGINE_ROLE !== "verify") {
        const r = await fetch(`${VERIFY_URL}/api/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, refined: out }),
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) {
          const v = await r.json();
          out.content = v.content || out.content;
          out.quality = v.quality ?? out.quality;
          out.verifyHost = v.host;
          out.verified = true;
          out.flags = v.flags;
        } else {
          out.verifyError = `verify HTTP ${r.status}`;
        }
      } else {
        const v = buildVerify({ host: HOST_ID, text, refined: out });
        out.content = v.content;
        out.quality = v.quality;
        out.verifyHost = HOST_ID;
        out.verified = true;
        out.flags = v.flags;
      }
    } catch (e) {
      out.verifyError = String(e);
    }
  }

  out.ms = +(performance.now() - t0).toFixed(3);
  out.engine = out.engine || ENGINE_VERSION;
  out.role = ENGINE_ROLE;
  pushSample(metrics.pipelineMs, out.ms);
  if (typeof out.quality === "number") pushSample(metrics.qualities, out.quality);
  if (!opts.noCache && out.ok !== false) pipelineCacheSet(cacheKey, out);
  return out;
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
    const pms = metrics.pipelineMs || [];
    const qs = metrics.qualities || [];
    return json(res, 200, {
      host: HOST_ID,
      role: ENGINE_ROLE,
      engine: ENGINE_VERSION,
      verify: VERIFY_VERSION,
      uptimeSec: Math.round((Date.now() - metrics.startedAt) / 1000),
      routes: metrics.routes,
      refines: metrics.refines || 0,
      pipelines: metrics.pipelines || 0,
      verifies: metrics.verifies || 0,
      chat: metrics.chat,
      cacheHits: metrics.cacheHits,
      pipelineCacheHits: metrics.pipelineCacheHits || 0,
      pipelineCacheSize: pipelineCache.size,
      cacheSize: routeCache.size,
      fastPaths: metrics.fastPaths,
      fullMeta: metrics.fullMeta,
      avgRouteMs: +avg.toFixed(3),
      maxRouteMs: +metrics.maxRouteMs.toFixed(3),
      cacheHitRate: metrics.routes
        ? +(metrics.cacheHits / Math.max(1, metrics.routes)).toFixed(3)
        : 0,
      pipeline: {
        count: pms.length,
        p50Ms: +percentile(pms, 50).toFixed(3),
        p95Ms: +percentile(pms, 95).toFixed(3),
        maxMs: pms.length ? Math.max(...pms) : 0,
        qualityMean: qs.length ? +(qs.reduce((a, b) => a + b, 0) / qs.length).toFixed(4) : null,
        qualityP50: qs.length ? +percentile(qs, 50).toFixed(4) : null,
      },
      peer: PEER || null,
      verifyUrl: VERIFY_URL || null,
    });
  }

  if (url.pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      host: HOST_ID,
      port: PORT,
      role: "backend",
      engineRole: ENGINE_ROLE,
      ts: Date.now(),
      cache: routeCache.size,
      pipelineCache: pipelineCache.size,
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
    const route = metaRoute(text);
    const draft = draftAnswer(text, route);
    return json(res, 200, refineAnswer(text, draft));
  }

  if (url.pathname === "/api/verify" && req.method === "POST") {
    metrics.verifies++;
    const body = await readJsonBody(req);
    const text = String(body.text || "");
    const refined = body.refined || body.draft || {
      content: body.content || "",
      winner: body.winner || "companion",
    };
    return json(res, 200, buildVerify({ host: HOST_ID, text, refined }));
  }

  if (url.pathname === "/api/pipeline" && req.method === "POST") {
    const body = await readJsonBody(req);
    const text = String(body.text || body.prompt || "");
    if (!text.trim()) return json(res, 400, { error: "text required" });
    // Auto video side-path when companion asks for generated video
    if (body.autoVideo !== false && isVideoIntent(text)) {
      const v = await runVideoJob(text, {
        imageUrl: body.imageUrl || body.image_url,
        draft: body.draft === true,
      });
      return json(res, 200, {
        ok: v.ok !== false,
        mode: "video-director-sidepath",
        topology: "dual-be-pipeline+runpod",
        winner: "media",
        confidence: v.submitted ? "high" : "medium",
        content: v.ok === false
          ? `Video failed: ${v.error}`
          : [
              "**G2P Video Director**",
              v.plan ? `Preset: ${v.plan.preset} | ${v.plan.draft ? "draft" : "final"}` : "",
              v.plan ? `Directed: ${v.plan.directedPrompt.slice(0, 400)}` : "",
              v.submitted
                ? `Job: ${v.jobId} | status: ${v.status}`
                : v.message || "Plan only (set RunPod env to submit).",
              v.jobId ? `Poll: node scripts/runpod-video.mjs --status ${v.jobId}` : "",
            ].filter(Boolean).join("\n"),
        video: v,
        quality: v.submitted ? 0.8 : 0.65,
        ms: 0,
        engine: DIRECTOR_VERSION,
      });
    }
    const verify =
      body.verify === true ||
      body.verify === "1" ||
      url.searchParams.get("verify") === "1";
    const out = await qualityPipeline(text, {
      verify,
      noCache: body.noCache === true,
    });
    return json(res, 200, out);
  }

  if (url.pathname === "/api/video-plan" && req.method === "POST") {
    const body = await readJsonBody(req);
    const text = String(body.text || body.prompt || "");
    if (!text.trim()) return json(res, 400, { error: "text required" });
    const plan = planVideo(text, {
      hasImage: !!(body.imageUrl || body.image_url),
      draft: body.draft === true,
    });
    return json(res, 200, { host: HOST_ID, director: DIRECTOR_VERSION, ...plan });
  }

  if (url.pathname === "/api/video" && req.method === "POST") {
    const body = await readJsonBody(req);
    const text = String(body.text || body.prompt || "");
    if (!text.trim()) return json(res, 400, { error: "text required" });
    const out = await runVideoJob(text, {
      hasImage: !!(body.imageUrl || body.image_url || body.imageBase64 || body.image_base64),
      imageUrl: body.imageUrl || body.image_url,
      imageBase64: body.imageBase64 || body.image_base64,
      videoUrl: body.videoUrl || body.video_url,
      draft: body.draft === true,
      adult: body.adult === true,
      kind: body.kind || body.mode,
      forcePreset: body.preset,
      width: body.width,
      height: body.height,
      length: body.length,
      steps: body.steps,
      cfg: body.cfg,
      durationSec: body.durationSec || body.duration,
      negativePrompt: body.negativePrompt || body.negative,
      seed: body.seed,
    });
    return json(res, out.ok === false ? 400 : 200, { host: HOST_ID, ...out });
  }

  if (
    (url.pathname === "/api/video/status" || url.pathname === "/api/video-status") &&
    (req.method === "GET" || req.method === "POST")
  ) {
    let jobId = url.searchParams.get("id") || url.searchParams.get("jobId") || "";
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      jobId = String(body.jobId || body.id || jobId);
    }
    const out = await pollVideoJob(jobId);
    return json(res, out.ok === false ? 400 : 200, { host: HOST_ID, ...out });
  }

  if (url.pathname === "/api/studio" && req.method === "GET") {
    return json(res, 200, {
      host: HOST_ID,
      director: DIRECTOR_VERSION,
      studioRun: STUDIO_RUN_VERSION,
      queue: queueSnapshot(),
      g2px: g2pxReady(),
      ...studioReady(),
    });
  }

  if (url.pathname === "/api/studio/run" && req.method === "POST") {
    const body = await readJsonBody(req);
    const out = body.queue === false ? await runStudioJob(body) : await enqueueStudioJob(body);
    return json(res, out.ok === false ? 400 : 200, { host: HOST_ID, ...out });
  }

  if (url.pathname === "/api/studio/queue" && req.method === "GET") {
    return json(res, 200, { host: HOST_ID, ...queueSnapshot() });
  }

  if (
    (url.pathname === "/api/g2p-x/compare" || url.pathname === "/api/compare") &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    const out = compareG2PX(body);
    return json(res, out.ok === false ? 400 : 200, { host: HOST_ID, g2px: G2PX_VERSION, ...out });
  }

  if (url.pathname === "/api/g2p-x/ask" && req.method === "POST") {
    const body = await readJsonBody(req);
    const out = await runG2PX(body.text || body.prompt || "");
    return json(res, out.ok === false ? 400 : 200, { host: HOST_ID, ...out });
  }

  if (url.pathname === "/api/agents/compare" && req.method === "POST") {
    const body = await readJsonBody(req);
    const text = String(body.text || body.prompt || "");
    if (!text.trim()) return json(res, 400, { error: "text required" });
    const [g2p, x] = await Promise.all([
      qualityPipeline(text, { verify: body.verify === true, noCache: true }),
      runG2PX(text),
    ]);
    const gq = Number(g2p.quality || 0);
    const xq = Number(x.quality || 0);
    return json(res, 200, {
      host: HOST_ID,
      ok: true,
      text,
      agentG2P: { weight: "full", ...g2p },
      g2pX: x,
      winner: gq >= xq ? "Agent G2P" : "G2P-X",
      note: "Agent G2P = full independent dual-engine. G2P-X = same floor + optional Grok. G2P-X only increases.",
      g2pxReady: g2pxReady(),
    });
  }

  if (url.pathname === "/api/bake") {
    return json(res, 200, {
      host: HOST_ID,
      engine: ENGINE_VERSION,
      phases: ["safety", "core", "routing", "multimodal", "hosting", "verify", "recurring"],
    });
  }

  if (url.pathname === "/api/topology") {
    return json(res, 200, {
      design: "g2p-dual-v2.1+verify",
      backends: ["be-1 draft", "be-2 refine", "be-v verify"],
      frontends: 2,
      lb: "8080",
      host: HOST_ID,
      role: ENGINE_ROLE,
      engine: ENGINE_VERSION,
    });
  }

  json(res, 404, { error: "not_found", host: HOST_ID });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[${HOST_ID}] backend on 0.0.0.0:${PORT} role=${ENGINE_ROLE}`);
});
