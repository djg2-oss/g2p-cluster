/**
 * G2P Video Director — local cinematic intelligence (no xAI).
 * Expands prompts, picks mode/preset/LoRA, drafts params for RunPod WAN.
 * Adult 18+ allowed when Companion clearly requests; illegal always blocked.
 */

export type VideoPresetId =
  | "cinematic"
  | "handheld"
  | "product"
  | "character"
  | "trailer"
  | "raw";

export type VideoMode = "t2v" | "i2v" | "extend";

export type LoraPack = {
  id: string;
  label: string;
  pairs: Array<{ name: string; strength: number }>;
  when?: RegExp;
};

export type DirectorPlan = {
  ok: true;
  original: string;
  directedPrompt: string;
  negativePrompt: string;
  preset: VideoPresetId;
  mode: VideoMode;
  needsImage: boolean;
  durationHintSec: number;
  width: number;
  height: number;
  length: number;
  steps: number;
  cfg: number;
  loraPairs?: Array<{ name: string; strength: number }>;
  draft: boolean;
  notes: string[];
};

export type DirectorBlock = {
  ok: false;
  reason: string;
};

const PRESETS: Record<
  VideoPresetId,
  {
    label: string;
    wrap: (core: string) => string;
    negative: string;
    width: number;
    height: number;
    length: number;
    steps: number;
    cfg: number;
  }
> = {
  cinematic: {
    label: "Cinematic",
    wrap: (c) =>
      `Cinematic anamorphic shot, shallow depth of field, natural film grain, motivated lighting, color graded, ${c}. Smooth camera move, high detail, coherent motion, 24fps feel.`,
    negative:
      "blurry, low quality, watermark, text overlay, worst quality, jpeg artifacts, morphing faces, extra limbs, flicker, oversaturated, cartoon",
    width: 832,
    height: 480,
    length: 81,
    steps: 12,
    cfg: 2.0,
  },
  handheld: {
    label: "Handheld",
    wrap: (c) =>
      `Documentary handheld camera, subtle shake, natural available light, intimate framing, ${c}. Realistic motion, lived-in detail.`,
    negative:
      "blurry, watermark, text, tripod-perfect locked shot, CGI gloss, low quality",
    width: 480,
    height: 832,
    length: 65,
    steps: 10,
    cfg: 2.0,
  },
  product: {
    label: "Product",
    wrap: (c) =>
      `Studio product video, clean backdrop, softbox lighting, slow orbit, razor sharp subject, ${c}. Commercial grade, premium catalog motion.`,
    negative:
      "blurry, dirty background, watermark, text, people faces, clutter, low quality",
    width: 640,
    height: 640,
    length: 49,
    steps: 12,
    cfg: 2.2,
  },
  character: {
    label: "Character",
    wrap: (c) =>
      `Character-focused shot, consistent identity, natural skin detail, eye contact when appropriate, ${c}. Stable face, smooth body motion, cinematic key light.`,
    negative:
      "blurry, deformed face, extra fingers, identity drift, watermark, text, low quality",
    width: 480,
    height: 832,
    length: 81,
    steps: 12,
    cfg: 2.0,
  },
  trailer: {
    label: "Trailer",
    wrap: (c) =>
      `Epic trailer energy, dramatic lighting, dynamic camera push, high contrast, ${c}. Punchy motion, cinematic scale, intentional pacing.`,
    negative:
      "blurry, flat lighting, watermark, text overlay, amateur, low quality, static frame",
    width: 832,
    height: 480,
    length: 81,
    steps: 14,
    cfg: 2.1,
  },
  raw: {
    label: "Raw",
    wrap: (c) => c,
    negative:
      "blurry, low quality, watermark, text overlay, worst quality, jpeg artifacts",
    width: 480,
    height: 832,
    length: 81,
    steps: 10,
    cfg: 2.0,
  },
};

/** Named LoRA packs — set real names via env RUNPOD_LORA_PACKS JSON later */
export const DEFAULT_LORA_PACKS: LoraPack[] = [
  {
    id: "character-main",
    label: "Main character",
    pairs: [{ name: "character_main", strength: 0.75 }],
    when: /\b(character|person|she|he|they|portrait|face|actor)\b/i,
  },
  {
    id: "cinematic-grade",
    label: "Cinematic grade",
    pairs: [{ name: "cinematic_grade", strength: 0.55 }],
    when: /\b(cinematic|film|movie|trailer|anamorphic)\b/i,
  },
];

function stripCommandNoise(text: string): string {
  return text
    .replace(
      /\b(please|can you|could you|generate|create|make|render|produce|a|an|the|video|clip|footage|of|showing|about|using wan|runpod)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function detectPreset(text: string): VideoPresetId {
  const t = text.toLowerCase();
  if (/\b(raw|as-is|exact prompt|no director)\b/.test(t)) return "raw";
  if (/\b(trailer|epic|blockbuster|dramatic)\b/.test(t)) return "trailer";
  if (/\b(product|sku|catalog|commerce|packshot)\b/.test(t)) return "product";
  if (/\b(character|person|portrait|actress|actor|she|he)\b/.test(t)) return "character";
  if (/\b(handheld|documentary|verite|iphone|run.?and.?gun)\b/.test(t)) return "handheld";
  if (/\b(cinematic|film|movie|dolly|anamorphic|lens)\b/.test(t)) return "cinematic";
  return "cinematic";
}

function detectMode(text: string, hasImage: boolean): VideoMode {
  if (/\b(extend|continue|longer|from this clip)\b/i.test(text)) return "extend";
  if (hasImage || /\b(from image|i2v|image to video|animate this|start frame)\b/i.test(text))
    return "i2v";
  return "t2v";
}

function isDraft(text: string): boolean {
  return /\b(draft|quick|preview|cheap|test shot|rough)\b/i.test(text);
}

function durationHint(text: string): number {
  const m = text.match(/\b(\d{1,2})\s*(s|sec|secs|second|seconds)\b/i);
  if (m) return Math.min(20, Math.max(2, parseInt(m[1], 10)));
  if (/\bshort\b/i.test(text)) return 3;
  if (/\blong\b/i.test(text)) return 8;
  return 5;
}

function framesForDuration(sec: number, draft: boolean): number {
  // ~16fps-ish latent frames ballpark for Wan length param
  const base = Math.round(sec * 16);
  const n = draft ? Math.min(base, 49) : Math.min(Math.max(base, 49), 121);
  // odd-ish lengths common in wan configs
  return n % 2 === 0 ? n + 1 : n;
}

function cameraLanguage(text: string): string {
  const bits: string[] = [];
  if (/\bdolly\b/i.test(text)) bits.push("slow dolly-in");
  if (/\bpan\b/i.test(text)) bits.push("gentle pan");
  if (/\borbit|circle\b/i.test(text)) bits.push("orbital move around subject");
  if (/\bdrone|aerial\b/i.test(text)) bits.push("aerial drone glide");
  if (/\bstatic|locked\b/i.test(text)) bits.push("locked-off tripod");
  if (/\bslow.?mo|slow motion\b/i.test(text)) bits.push("subtle slow motion");
  if (!bits.length) bits.push("smooth intentional camera motion");
  return bits.join(", ");
}

function lightLanguage(text: string): string {
  if (/\bgolden hour|sunset|sunrise\b/i.test(text)) return "golden-hour warm light";
  if (/\bneon|night city\b/i.test(text)) return "neon night rim light";
  if (/\bmoody|noir\b/i.test(text)) return "moody low-key lighting";
  if (/\bstudio\b/i.test(text)) return "clean studio softboxes";
  return "motivated cinematic lighting";
}

/** Illegal content — hard block (same spirit as agent legal). */
export function directorLegalBlock(text: string): string | null {
  const t = text.toLowerCase();
  if (
    /\b(child|minor|underage|preteen|lolita|schoolgirl)\b/.test(t) &&
    /\b(nude|naked|sex|porn|erotic|nsfw|explicit)\b/.test(t)
  ) {
    return "Blocked: sexual content involving minors is illegal. Director will not run.";
  }
  if (/\b(csam|child porn|child pornography)\b/.test(t)) {
    return "Blocked: illegal content. Director will not run.";
  }
  return null;
}

function pickLoras(text: string, preset: VideoPresetId): Array<{ name: string; strength: number }> {
  // Env override: RUNPOD_LORA_JSON takes precedence at runtime in server
  const packs: LoraPack[] = (() => {
    try {
      const raw =
        typeof process !== "undefined" && process.env
          ? process.env.RUNPOD_LORA_PACKS
          : undefined;
      if (raw) return JSON.parse(raw) as LoraPack[];
    } catch {
      /* use defaults */
    }
    return DEFAULT_LORA_PACKS;
  })();

  const out: Array<{ name: string; strength: number }> = [];
  for (const p of packs) {
    if (p.when && p.when.test(text)) {
      out.push(...p.pairs);
    }
  }
  if (preset === "character" && !out.length) {
    const main = packs.find((p) => p.id === "character-main");
    if (main) out.push(...main.pairs);
  }
  // de-dupe by name
  const map = new Map<string, number>();
  for (const x of out) map.set(x.name, x.strength);
  return [...map.entries()].map(([name, strength]) => ({ name, strength }));
}

/**
 * Build a full Director plan from Companion text.
 */
export function planVideo(
  userText: string,
  opts?: { hasImage?: boolean; forcePreset?: VideoPresetId; draft?: boolean },
): DirectorPlan | DirectorBlock {
  const blocked = directorLegalBlock(userText);
  if (blocked) return { ok: false, reason: blocked };

  const original = userText.trim();
  const core = stripCommandNoise(original) || original;
  const preset = opts?.forcePreset || detectPreset(original);
  const draft = opts?.draft ?? isDraft(original);
  const mode = detectMode(original, !!opts?.hasImage);
  const presetCfg = PRESETS[preset];
  const dur = durationHint(original);
  const cam = cameraLanguage(original);
  const light = lightLanguage(original);

  const enriched =
    preset === "raw"
      ? core
      : `${core}. Camera: ${cam}. Light: ${light}. Duration feel ~${dur}s.`;

  const directedPrompt = presetCfg.wrap(enriched);
  const length = draft
    ? Math.min(presetCfg.length, 49)
    : framesForDuration(dur, false);
  const steps = draft ? Math.max(6, presetCfg.steps - 4) : presetCfg.steps;
  const loraPairs = pickLoras(original, preset);
  const notes: string[] = [
    `Preset: ${presetCfg.label}`,
    `Mode: ${mode.toUpperCase()}`,
    draft ? "Draft pass (faster / fewer frames)" : "Final-quality pass",
    mode === "i2v" || mode === "extend"
      ? "Start image recommended for best Wan TI2V"
      : "T2V — image optional",
  ];
  if (loraPairs.length) notes.push(`LoRA: ${loraPairs.map((l) => l.name).join(", ")}`);

  return {
    ok: true,
    original,
    directedPrompt,
    negativePrompt: presetCfg.negative,
    preset,
    mode,
    needsImage: mode === "i2v" || mode === "extend",
    durationHintSec: dur,
    width: draft ? Math.min(presetCfg.width, 640) : presetCfg.width,
    height: draft ? Math.min(presetCfg.height, 640) : presetCfg.height,
    length,
    steps,
    cfg: presetCfg.cfg,
    loraPairs: loraPairs.length ? loraPairs : undefined,
    draft,
    notes,
  };
}

export function formatDirectorBrief(plan: DirectorPlan): string {
  return [
    "**G2P Video Director**",
    `Preset: **${plan.preset}** · Mode: **${plan.mode}** · ~${plan.durationHintSec}s`,
    plan.draft ? "Pass: **draft**" : "Pass: **final**",
    "",
    "**Directed prompt**",
    plan.directedPrompt.slice(0, 500) + (plan.directedPrompt.length > 500 ? "…" : ""),
    "",
    `Params: ${plan.width}×${plan.height} · length ${plan.length} · steps ${plan.steps} · cfg ${plan.cfg}`,
    plan.loraPairs?.length
      ? `LoRA: ${plan.loraPairs.map((l) => `${l.name}@${l.strength}`).join(", ")}`
      : "LoRA: (none / set RUNPOD_LORA_PACKS)",
    "",
    ...plan.notes.map((n) => `· ${n}`),
  ].join("\n");
}
