import { isAdOrPopupNoise, isRelevantMediaSignal } from "./memory-tiers";
/**
 * Three-window sensory runtime — Iconic | Echoic | Text
 * Improves intelligence (structured multimodal meaning) and performance
 * (sparse encode → fuse → compress → index; no raw bulk in hot path).
 */

export type WindowId = "iconic" | "echoic" | "text";

export type WindowHit = {
  id: WindowId;
  /** Why this window opened */
  reason: string;
  /** Compressed features / notes (never raw media) */
  features: string[];
  /** 0–1 salience for fusion weight */
  weight: number;
};

export type FusedMoment = {
  id: string;
  at: number;
  windows: WindowHit[];
  /** Single meaning line */
  fuse: string;
  emotionGuess?: string;
  emotionConfidence?: "high" | "medium" | "low";
  /** Topic / place grouping keys */
  groups: string[];
  /** Shortcut tags for fast recall */
  shortcuts: string[];
};

export type ThreeWindowMemory = {
  /** Recent fused moments (hot path — small) */
  hot: FusedMoment[];
  /** Distilled summaries (fermented long-term) */
  distilled: string[];
  /** Stats for transparency */
  stats: {
    iconicOpens: number;
    echoicOpens: number;
    textOpens: number;
    fuses: number;
    shortcutsUsed: number;
  };
};

export const EMPTY_THREE_WINDOW: ThreeWindowMemory = {
  hot: [],
  distilled: [],
  stats: {
    iconicOpens: 0,
    echoicOpens: 0,
    textOpens: 0,
    fuses: 0,
    shortcutsUsed: 0,
  },
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Strategic placement: only open windows that have signal */
export function openWindows(text: string): WindowHit[] {
  const hits: WindowHit[] = [];
  const t = text;

  // Text window — almost always on for chat
  const textFeatures: string[] = [];
  if (/\?/.test(t)) textFeatures.push("question");
  if (/should i|decide|stuck|help me/i.test(t)) textFeatures.push("decision-seek");
  if (/thank|appreciate|love that/i.test(t)) textFeatures.push("positive-close");
  if (t.trim().length > 0) {
    textFeatures.push(`tokens~${Math.min(200, t.trim().split(/\s+/).length)}`);
    hits.push({
      id: "text",
      reason: "language always-on for chat",
      features: textFeatures,
      weight: 0.55,
    });
  }

  // Iconic — relevant image/video only (never ad/popup noise)
  if (isAdOrPopupNoise(t)) {
    // skip media windows for advertisements / popups
  } else if (isRelevantMediaSignal(t) || /\b(iconic)\b/i.test(t)) {
    const features = ["visual-stream"];
    if (/\bvideo|clip|footage|frame\b/i.test(t)) features.push("temporal-frames");
    if (/\b(dark|night|bright|red|blue|face|room|outdoor)\b/i.test(t))
      features.push("scene-attrs");
    hits.push({
      id: "iconic",
      reason: "visual language or media reference",
      features,
      weight: 0.35,
    });
  }

  // Echoic — sound / voice / music
  if (
    /\b(sound|audio|voice|hear|music|song|tone|waveform|echoic|speech|noise|whisper|shout)\b/i.test(
      t,
    )
  ) {
    const features = ["audio-stream"];
    if (/\b(music|song|beat|melody)\b/i.test(t)) features.push("musical");
    if (/\b(voice|speech|said|tone|whisper|shout)\b/i.test(t)) features.push("vocal");
    hits.push({
      id: "echoic",
      reason: "audio language or media reference",
      features,
      weight: 0.35,
    });
  }

  // Emotion text cues boost text weight (pattern match — not felt emotion)
  if (
    /\b(spiral|panic|overwhelm|sad|angry|lonely|stressed|excited|hopeful|tired|anxious)\b/i.test(
      t,
    )
  ) {
    const textWin = hits.find((h) => h.id === "text");
    if (textWin) {
      textWin.features.push("emotion-lexicon");
      textWin.weight = Math.min(0.85, textWin.weight + 0.15);
    }
  }

  return hits;
}

function emotionFromText(text: string): {
  guess: string;
  confidence: "high" | "medium" | "low";
} {
  if (/panic|spiral|overwhelm|freaking/i.test(text))
    return { guess: "anxious/stressed", confidence: "medium" };
  if (/sad|heartbroken|crying/i.test(text)) return { guess: "sad", confidence: "medium" };
  if (/furious|angry|rage|pissed/i.test(text)) return { guess: "angry", confidence: "medium" };
  if (/lonely|alone|isolated/i.test(text)) return { guess: "lonely", confidence: "medium" };
  if (/excited|pumped|amazing/i.test(text)) return { guess: "excited", confidence: "low" };
  if (/tired|exhausted|burned out/i.test(text)) return { guess: "tired", confidence: "medium" };
  return { guess: "neutral/unclear", confidence: "low" };
}

function groupsFromText(text: string): string[] {
  const g: string[] = [];
  if (/career|job|work|boss|offer/i.test(text)) g.push("career");
  if (/money|debt|budget|rent/i.test(text)) g.push("money");
  if (/relationship|partner|family|friend/i.test(text)) g.push("relationships");
  if (/video|image|audio|music|sound|photo/i.test(text)) g.push("media");
  if (/code|build|app|api/i.test(text)) g.push("build");
  if (/math|equation|solve|ev\b/i.test(text)) g.push("math");
  if (!g.length) g.push("general");
  return g.slice(0, 4);
}

function shortcutsFromWindows(windows: WindowHit[], groups: string[]): string[] {
  const s: string[] = [];
  for (const w of windows) s.push(`w:${w.id}`);
  for (const g of groups) s.push(`g:${g}`);
  if (windows.some((w) => w.features.includes("temporal-frames"))) s.push("sc:video-pipeline");
  if (windows.some((w) => w.features.includes("emotion-lexicon"))) s.push("sc:emotion-first");
  return s.slice(0, 8);
}

export function fuseWindows(text: string, windows: WindowHit[]): FusedMoment {
  const emo = emotionFromText(text);
  const groups = groupsFromText(text);
  const openIds = windows.map((w) => w.id).join("+") || "text";
  const fuse = `Open [${openIds}] · ${emo.guess} · ${text.trim().replace(/\s+/g, " ").slice(0, 100)}`;
  return {
    id: uid(),
    at: Date.now(),
    windows,
    fuse,
    emotionGuess: emo.guess,
    emotionConfidence: emo.confidence,
    groups,
    shortcuts: shortcutsFromWindows(windows, groups),
  };
}

/** Process a turn: strategic open → fuse → hot store → optional distill */
export function processThreeWindow(
  mem: ThreeWindowMemory,
  text: string,
): { memory: ThreeWindowMemory; moment: FusedMoment; opened: WindowId[] } {
  const windows = openWindows(text);
  // PERF: pure text + low saliency — cheap fuse, skip distill batch growth churn
  const moment = fuseWindows(text, windows);
  const stats = { ...mem.stats };
  for (const w of windows) {
    if (w.id === "iconic") stats.iconicOpens++;
    if (w.id === "echoic") stats.echoicOpens++;
    if (w.id === "text") stats.textOpens++;
  }
  stats.fuses++;

  let hot = [moment, ...mem.hot].slice(0, 12);
  let distilled = [...mem.distilled];

  // Ferment / distill when hot grows: compress oldest into one line
  if (hot.length >= 10) {
    const batch = hot.slice(-6);
    const line = distillBatch(batch);
    distilled = [line, ...distilled].slice(0, 20);
    hot = hot.slice(0, 10);
    stats.shortcutsUsed++;
  }

  return {
    memory: { hot, distilled, stats },
    moment,
    opened: windows.map((w) => w.id),
  };
}

function distillBatch(batch: FusedMoment[]): string {
  const groups = new Set<string>();
  const emos = new Set<string>();
  for (const m of batch) {
    m.groups.forEach((g) => groups.add(g));
    if (m.emotionGuess) emos.add(m.emotionGuess);
  }
  return `Distilled: groups[${[...groups].join(",")}] moods[${[...emos].join(",")}] n=${batch.length}`;
}

/** Fast recall line for chat prefix — performance path */
export function threeWindowContextLine(mem: ThreeWindowMemory): string | null {
  if (!mem.hot.length && !mem.distilled.length) return null;
  const last = mem.hot[0];
  const parts: string[] = [];
  if (last) {
    parts.push(`3-win last: ${last.windows.map((w) => w.id).join("+")}`);
    if (last.emotionGuess && last.emotionGuess !== "neutral/unclear") {
      parts.push(`mood~${last.emotionGuess}`);
    }
    if (last.groups[0]) parts.push(`group:${last.groups[0]}`);
  }
  if (mem.distilled[0]) parts.push(mem.distilled[0].slice(0, 60));
  return parts.join(" · ");
}

export function formatThreeWindowExplain(moment: FusedMoment): string {
  return [
    "**3-window runtime (efficiency path)**",
    "",
    `Opened: ${moment.windows.map((w) => w.id).join(", ") || "none"}`,
    ...moment.windows.map(
      (w) => `· **${w.id}** (${w.reason}) — ${w.features.join(", ")} · weight ${w.weight}`,
    ),
    "",
    `**Fuse:** ${moment.fuse}`,
    moment.emotionGuess
      ? `**Emotion pattern:** ${moment.emotionGuess} (_${moment.emotionConfidence}_)`
      : "",
    `**Groups:** ${moment.groups.join(", ")}`,
    `**Shortcuts:** ${moment.shortcuts.join(", ")}`,
    "",
    "Raw media is not kept on the hot path — only features → fuse → card.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function isThreeWindowMetaQuery(text: string): boolean {
  return /\b(3[\s-]?window|three window|iconic.*echoic|echoic.*iconic|window runtime|fuse.*memory|shortcut.*memory)\b/i.test(
    text,
  );
}
