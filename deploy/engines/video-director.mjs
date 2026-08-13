/**
 * G2P Video Director (JS) — local, no xAI.
 * Used by cluster backends for /api/video-plan and /api/video.
 */
export const DIRECTOR_VERSION = "g2p-director-v1";

/** Public endpoint — not a secret. Override with RUNPOD_VIDEO_ENDPOINT_ID if you change workers. */
export const DEFAULT_VIDEO_ENDPOINT_ID = "36t7uk060cachv";
export const DEFAULT_VIDEO_MODE = "run";

export function directorLegalBlock(text) {
  const t = (text || "").toLowerCase();
  if (
    /\b(child|minor|underage|preteen|lolita|schoolgirl)\b/.test(t) &&
    /\b(nude|naked|sex|porn|erotic|nsfw|explicit)\b/.test(t)
  ) {
    return "Blocked: sexual content involving minors is illegal.";
  }
  if (/\b(csam|child porn|child pornography)\b/.test(t)) {
    return "Blocked: illegal content.";
  }
  return null;
}

function stripNoise(text) {
  return text
    .replace(
      /\b(please|can you|could you|generate|create|make|render|produce|a|an|the|video|clip|footage|of|showing|about|using wan|runpod|direct)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function detectPreset(text) {
  const t = text.toLowerCase();
  if (/\b(raw|exact prompt|no director)\b/.test(t)) return "raw";
  if (/\b(trailer|epic|blockbuster)\b/.test(t)) return "trailer";
  if (/\b(product|catalog|packshot)\b/.test(t)) return "product";
  if (/\b(character|portrait|person|actor|serana|figure)\b/.test(t)) return "character";
  if (/\b(handheld|documentary)\b/.test(t)) return "handheld";
  if (/\b(orbit|circle|pan|dolly)\b/.test(t)) return "cinematic";
  return "cinematic";
}

const PRESETS = {
  cinematic: {
    wrap: (c) =>
      `Cinematic anamorphic shot, shallow depth of field, film grain, motivated lighting, ${c}. Smooth camera, coherent motion, 24fps feel.`,
    negative:
      "blurry, low quality, watermark, text overlay, worst quality, morphing faces, flicker",
    width: 832,
    height: 480,
    length: 81,
    steps: 12,
    cfg: 2.0,
  },
  handheld: {
    wrap: (c) =>
      `Documentary handheld camera, subtle shake, natural light, ${c}. Realistic motion.`,
    negative: "blurry, watermark, text, low quality, CGI gloss",
    width: 480,
    height: 832,
    length: 65,
    steps: 10,
    cfg: 2.0,
  },
  product: {
    wrap: (c) =>
      `Studio product video, clean backdrop, softbox light, slow orbit, ${c}. Commercial grade.`,
    negative: "blurry, watermark, text, clutter, low quality",
    width: 640,
    height: 640,
    length: 49,
    steps: 12,
    cfg: 2.2,
  },
  character: {
    wrap: (c) =>
      `Character-focused shot, consistent identity, natural detail, ${c}. Stable face, smooth motion.`,
    negative: "blurry, deformed face, identity drift, watermark, text",
    width: 480,
    height: 832,
    length: 81,
    steps: 12,
    cfg: 2.0,
  },
  trailer: {
    wrap: (c) =>
      `Epic trailer energy, dramatic light, dynamic camera push, ${c}. Punchy motion.`,
    negative: "blurry, flat lighting, watermark, text, amateur, low quality",
    width: 832,
    height: 480,
    length: 81,
    steps: 14,
    cfg: 2.1,
  },
  raw: {
    wrap: (c) => c,
    negative: "blurry, low quality, watermark, text overlay",
    width: 480,
    height: 832,
    length: 81,
    steps: 10,
    cfg: 2.0,
  },
};

export function planVideo(userText, opts = {}) {
  const blocked = directorLegalBlock(userText);
  if (blocked) return { ok: false, reason: blocked };

  const original = (userText || "").trim();
  const core = stripNoise(original) || original;
  const preset = opts.forcePreset || detectPreset(original);
  const draft = opts.draft ?? /\b(draft|quick|preview)\b/i.test(original);
  const cfg = PRESETS[preset] || PRESETS.cinematic;

  let cam = "smooth intentional camera motion";
  if (/\b(dolly|push in)\b/i.test(original)) cam = "slow dolly-in";
  else if (/\b(orbit|circle|circl)\b/i.test(original)) cam = "orbiting camera circling subject";
  else if (/\b(pan|pans)\b/i.test(original)) cam = "cinematic pan in and out";

  const light = /\b(sunset|sunrise|golden)\b/i.test(original)
    ? "golden-hour warm light"
    : "motivated cinematic lighting";
  const enriched =
    preset === "raw" ? core : `${core}. Camera: ${cam}. Light: ${light}.`;
  const directedPrompt = cfg.wrap(enriched);

  let lora;
  try {
    if (process.env.RUNPOD_LORA_JSON) lora = JSON.parse(process.env.RUNPOD_LORA_JSON);
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    original,
    directedPrompt,
    negativePrompt: process.env.RUNPOD_NEGATIVE || cfg.negative,
    preset,
    mode: opts.hasImage || opts.imageUrl ? "i2v" : "t2v",
    needsImage: !!(opts.hasImage || opts.imageUrl),
    width: draft ? Math.min(cfg.width, 640) : cfg.width,
    height: draft ? Math.min(cfg.height, 640) : cfg.height,
    length: draft ? Math.min(cfg.length, 49) : cfg.length,
    steps: draft ? Math.max(6, cfg.steps - 4) : cfg.steps,
    cfg: cfg.cfg,
    loraPairs: lora,
    draft,
    notes: [
      `Preset: ${preset}`,
      draft ? "Draft pass" : "Final pass",
      "GPU: RunPod WAN when RUNPOD_API_KEY set",
    ],
    director: DIRECTOR_VERSION,
  };
}

/** True when user wants a generated video (not just media Q&A). */
export function isVideoIntent(text) {
  const t = (text || "").trim();
  if (!t) return false;

  if (
    /\b(how do you|what is|explain|memory|iconic|echoic|understand)\b/i.test(t) &&
    !/\b(generate|create|make|render|shoot|film|video|clip)\b/i.test(t)
  ) {
    return false;
  }

  if (
    /\b(generate|create|make|render|produce|shoot|direct|film|animate)\b/i.test(t) &&
    /\b(video|clip|footage|cinematic|scene|shot|animation|i2v|t2v)\b/i.test(t)
  ) {
    return true;
  }

  if (/\b(video|clip|footage)\b/i.test(t)) return true;

  if (/\b(wan|runpod|text-to-video|image-to-video|i2v|t2v)\b/i.test(t)) return true;

  const camera = /\b(camera|dolly|pans?|orbit|circles?|circl\w*|tracking|push in|pull back|zoom|crane|gimbal|handheld)\b/i.test(
    t,
  );
  const motion = /\b(walking|walks|walk by|running|turns|spinning|panning|showing off|posing)\b/i.test(
    t,
  );
  const film = /\b(cinematic|footage|scene|shot|figure|character|serana|lora|body)\b/i.test(t);

  if (camera && (motion || film)) return true;
  if (
    /\b(have|make|show)\b.+\b(walking|walk by|standing|posing)\b/i.test(t) &&
    /\b(camera|pans?|circle|figure|body|cinematic)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

function normalizeEndpoint(raw) {
  let s = String(raw || "").trim();
  let path = /runsync/i.test(s) ? "runsync" : "run";
  s = s.replace(/^https?:\/\/api\.runpod\.ai\/v2\//i, "");
  s = s.replace(/^https?:\/\/[^/]+\//i, "");
  s = s.replace(/\/(runsync|run|status)(\/.*)?$/i, "");
  s = s.replace(/^\/+|\/+$/g, "");
  const mode = (
    process.env.RUNPOD_VIDEO_MODE?.trim() || DEFAULT_VIDEO_MODE
  ).toLowerCase();
  if (mode === "runsync" || mode === "sync") path = "runsync";
  if (mode === "run" || mode === "async") path = "run";
  return { id: s || DEFAULT_VIDEO_ENDPOINT_ID, path };
}

/** Submit to RunPod if env configured; always returns director plan. */
export async function runVideoJob(userText, opts = {}) {
  const plan = planVideo(userText, opts);
  if (!plan.ok) return plan;

  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  const epRaw =
    process.env.RUNPOD_VIDEO_ENDPOINT_ID?.trim() ||
    process.env.RUNPOD_ENDPOINT_ID?.trim() ||
    DEFAULT_VIDEO_ENDPOINT_ID;
  if (!apiKey) {
    return {
      ok: true,
      submitted: false,
      plan,
      endpoint: DEFAULT_VIDEO_ENDPOINT_ID,
      message:
        "Director plan ready. Endpoint is already in code (36t7uk060cachv). Only RUNPOD_API_KEY is missing — set that, restart cluster, then click Video.",
    };
  }

  const { id, path } = normalizeEndpoint(epRaw);
  const base = `https://api.runpod.ai/v2/${id}`;
  const input = {
    prompt: plan.directedPrompt,
    positive_prompt: plan.directedPrompt,
    negative_prompt: plan.negativePrompt,
    width: plan.width,
    height: plan.height,
    length: plan.length,
    steps: plan.steps,
    cfg: plan.cfg,
  };
  if (plan.loraPairs) {
    input.lora_pairs = plan.loraPairs;
    input.loras = plan.loraPairs;
  }
  if (opts.imageUrl) input.image_url = opts.imageUrl;

  try {
    const runRes = await fetch(`${base}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });
    const runJson = await runRes.json().catch(() => ({}));
    if (!runRes.ok) {
      return {
        ok: false,
        plan,
        error: runJson.error || runJson.detail || `RunPod HTTP ${runRes.status}`,
      };
    }
    return {
      ok: true,
      submitted: true,
      plan,
      jobId: runJson.id,
      status: runJson.status || "IN_QUEUE",
      endpoint: id,
      mode: path,
      message: "Video job submitted to RunPod WAN.",
    };
  } catch (e) {
    return { ok: false, plan, error: e instanceof Error ? e.message : String(e) };
  }
}
