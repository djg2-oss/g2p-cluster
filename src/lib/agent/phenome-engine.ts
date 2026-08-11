/**
 * Graphene Genome / Phenome — how G2P structures image, sound, and video.
 * LOCAL cognitive pack: order of compute, fusion, compressed scene cards.
 */

export type SensoryStream = "vision" | "audio" | "language";

export type SceneCard = {
  title: string;
  timeline: string;
  vision: string[];
  motion: string[];
  audio: string[];
  language: string[];
  fused: string;
  compress: string;
  orderNote: string;
};

/** Canonical processing order for multimodal media */
export const COMPUTE_ORDER = [
  "1. Demux — split video / audio / captions",
  "2. Sample vision — frames in time order (not always every frame)",
  "3. Encode vision — pixels → visual vectors; track change for motion",
  "4. Encode audio — waveform/spectrogram → audio vectors (often parallel with 3)",
  "5. Optional speech-to-text / on-screen text → language tokens",
  "6. Align by timestamp — vision@t with audio@t",
  "7. Fuse — one meaning for the moment / clip",
  "8. Compress — phenome card: keep structure, drop raw bulk",
  "9. Index by topic + location group (Graphene layers)",
] as const;

export function formatComputeOrder(): string {
  return [
    "**Video is not one sense.** Frames + sound (+ text), ordered in time.",
    "",
    "**Compute order:**",
    ...COMPUTE_ORDER,
    "",
    "Vision and audio encoding can run **in parallel**; fusion is **after** (or interleaved on a timeline).",
    "I do not feel the whole film as one human moment unless we store a phenome card.",
  ].join("\n");
}

/** Build a compressed phenome card from Companion description of media */
export function buildSceneCard(input: string): SceneCard {
  const t = input.trim().slice(0, 500);
  const hasMusic = /music|song|beat|melody|soundtrack/i.test(t);
  const hasSpeech = /speak|talk|voice|dialogue|says|said|narrat/i.test(t);
  const hasMotion = /run|walk|fly|cut|pan|zoom|move|action|fight|drive/i.test(t);
  const hasNight = /night|dark|neon/i.test(t);

  return {
    title: "Phenome scene card",
    timeline: "t0 → t_end (order preserved)",
    vision: [
      hasNight ? "Low-key / night lighting cues" : "Scene lighting from description",
      "Key objects / people named in your description",
      "Layout: foreground vs background (inferred)",
    ],
    motion: hasMotion
      ? ["Motion verbs detected — track subject path over frames", "Prefer keyframe + delta notes"]
      : ["Static or mild motion — fewer temporal samples needed"],
    audio: [
      hasSpeech ? "Speech track → words + voice cadence" : "No clear speech flagged",
      hasMusic ? "Music / rhythm layer present" : "Ambient or unspecified audio",
    ],
    language: hasSpeech
      ? ["Transcript layer when speech exists", "Align lines to timestamps"]
      : ["Language layer optional (captions / UI text)"],
    fused: `Single read: ${t.slice(0, 160)}${t.length > 160 ? "…" : ""}`,
    compress:
      "Store: subjects · actions · audio type · 1-line meaning. Drop raw pixels/samples.",
    orderNote: COMPUTE_ORDER.join(" → "),
  };
}

export function formatSceneCard(c: SceneCard): string {
  return [
    `**${c.title}**`,
    `Timeline: ${c.timeline}`,
    "",
    "**Vision (iconic):**",
    ...c.vision.map((v) => `· ${v}`),
    "",
    "**Motion:**",
    ...c.motion.map((v) => `· ${v}`),
    "",
    "**Audio (echoic):**",
    ...c.audio.map((v) => `· ${v}`),
    "",
    "**Language:**",
    ...c.language.map((v) => `· ${v}`),
    "",
    `**Fused meaning:** ${c.fused}`,
    `**Compress:** ${c.compress}`,
  ].join("\n");
}

export function isPhenomeQuery(text: string): boolean {
  const t = text;
  if (
    /\b(phenome|graphene|iconic memory|echoic|spectrogram|scene card)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(how|when|do)\b.{0,30}\b(see|hear|watch)\b.{0,40}\b(video|image|audio|sound|picture)\b/i.test(t)) {
    return true;
  }
  if (/\b(video|image|audio|sound|clip|footage)\b.{0,50}\b(see|hear|order|compute|process|pipeline|frame|at once|all 3|all three)\b/i.test(t)) {
    return true;
  }
  if (/\b(process|analyze|break down|compute)\b.{0,40}\b(video|image|audio|sound|clip|data)\b/i.test(t)) {
    return true;
  }
  if (/\b(video|clip|footage)\b.{0,40}\b(describe|scene|demux|fuse)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function phenomeReply(text: string): string {
  if (/\b(order|pipeline|how.*process|all (3|three)|at once)\b/i.test(text)) {
    return formatComputeOrder();
  }
  if (/\b(image|photo|picture|see)\b/i.test(text) && !/\bvideo\b/i.test(text)) {
    return [
      "**Iconic path (image):**",
      "Pixels → patches → visual vectors → objects/scene → language link.",
      "Optional: compress to a photo card (subjects, layout, mood) for memory.",
      "",
      formatComputeOrder().split("\n").slice(0, 3).join("\n"),
    ].join("\n");
  }
  if (/\b(sound|audio|hear|music|voice|waveform)\b/i.test(text) && !/\bvideo\b/i.test(text)) {
    return [
      "**Echoic path (sound):**",
      "Samples → (often) spectrogram → audio vectors → speech/music/events.",
      "Optional: voice cadence + content card for memory.",
      "",
      "With video, audio is encoded in parallel with frames, then time-aligned.",
    ].join("\n");
  }
  // Default: video phenome card from description
  const card = buildSceneCard(text);
  return [formatComputeOrder(), "", formatSceneCard(card)].join("\n");
}
