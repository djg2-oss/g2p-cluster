/**
 * Multimodal distillation for Agent G2P
 *
 * Two senses of "distillation" we use:
 * 1) Runtime memory: fuse iconic|echoic|text → compact card (performance + recall)
 * 2) Cognitive: teacher-rich multimodal moment → student-small reusable summary
 *
 * Improves intelligence (cross-modal meaning) and performance (tiny hot memory).
 */

import type { FusedMoment, ThreeWindowMemory, WindowHit } from "./three-window";

export type DistillLevel = "raw_fuse" | "event_card" | "episode" | "identity_hint";

export type MultimodalCard = {
  id: string;
  level: DistillLevel;
  at: number;
  /** Cross-modal one-liner */
  thesis: string;
  /** Per-modality residues kept after compression */
  iconic?: string;
  echoic?: string;
  text?: string;
  emotion?: string;
  groups: string[];
  /** Tokens of compressed meaning (approx) — lower is better for hot path */
  cost: number;
  shortcuts: string[];
};

export type MultimodalDistillMemory = {
  /** Highest-value cards in active use */
  cards: MultimodalCard[];
  /** Ultra-short episode rollups */
  episodes: string[];
  stats: {
    distilled: number;
    bytesSavedEstimate: number;
    crossModalFuses: number;
  };
};

export const EMPTY_MM_DISTILL: MultimodalDistillMemory = {
  cards: [],
  episodes: [],
  stats: { distilled: 0, bytesSavedEstimate: 0, crossModalFuses: 0 },
};

function uid() {
  return `mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function win(windows: WindowHit[], id: string): WindowHit | undefined {
  return windows.find((w) => w.id === id);
}

/** Teacher → student: rich fuse moment → small multimodal card */
export function distillMoment(moment: FusedMoment): MultimodalCard {
  const ic = win(moment.windows, "iconic");
  const ec = win(moment.windows, "echoic");
  const tx = win(moment.windows, "text");
  const modalities = [ic, ec, tx].filter(Boolean).length;
  const cross = modalities >= 2;

  const iconic = ic
    ? ic.features.filter((f) => f !== "visual-stream").slice(0, 3).join("+") || "visual"
    : undefined;
  const echoic = ec
    ? ec.features.filter((f) => f !== "audio-stream").slice(0, 3).join("+") || "audio"
    : undefined;
  const text = tx
    ? tx.features.filter((f) => !f.startsWith("tokens")).slice(0, 4).join("+") || "lang"
    : undefined;

  // Thesis: cross-modal compression (intelligence)
  const parts: string[] = [];
  if (iconic) parts.push(`see:${iconic}`);
  if (echoic) parts.push(`hear:${echoic}`);
  if (text) parts.push(`say:${text}`);
  if (moment.emotionGuess && moment.emotionGuess !== "neutral/unclear") {
    parts.push(`feel~${moment.emotionGuess}`);
  }
  const thesis =
    parts.length > 0
      ? parts.join(" · ")
      : moment.fuse.slice(0, 80);

  // Cost model: raw text ~ long; card ~ short (performance)
  const rawCost = Math.min(400, moment.fuse.length + modalities * 40);
  const cost = Math.max(12, Math.min(64, thesis.length + moment.groups.length * 4));

  return {
    id: uid(),
    level: cross ? "event_card" : "raw_fuse",
    at: moment.at,
    thesis,
    iconic,
    echoic,
    text,
    emotion: moment.emotionGuess,
    groups: moment.groups,
    cost,
    shortcuts: [
      ...moment.shortcuts.slice(0, 6),
      cross ? "sc:cross-modal" : "sc:uni-modal",
      `sc:save~${Math.max(0, rawCost - cost)}`,
    ],
  };
}

/** Stack cards into an episode line (second-stage distill / ferment) */
export function distillEpisode(cards: MultimodalCard[]): string {
  const groups = new Set<string>();
  const moods = new Set<string>();
  let see = 0,
    hear = 0,
    say = 0;
  for (const c of cards) {
    c.groups.forEach((g) => groups.add(g));
    if (c.emotion && c.emotion !== "neutral/unclear") moods.add(c.emotion);
    if (c.iconic) see++;
    if (c.echoic) hear++;
    if (c.text) say++;
  }
  return `Episode: g[${[...groups].slice(0, 4).join(",")}] m[${[...moods].slice(0, 3).join(",")}] mod(see${see}/hear${hear}/say${say}) n=${cards.length}`;
}

export function ingestDistill(
  state: MultimodalDistillMemory,
  moment: FusedMoment,
): MultimodalDistillMemory {
  const card = distillMoment(moment);
  const modalities = [card.iconic, card.echoic, card.text].filter(Boolean).length;
  let cards = [card, ...state.cards].slice(0, 24);
  let episodes = [...state.episodes];
  let distilled = state.stats.distilled + 1;
  let bytesSavedEstimate =
    state.stats.bytesSavedEstimate + Math.max(0, 120 - card.cost);
  let crossModalFuses = state.stats.crossModalFuses + (modalities >= 2 ? 1 : 0);

  // Second-stage: every 8 cards → episode rollup, drop oldest bulk from hot cards
  if (cards.length >= 8 && cards.length % 4 === 0) {
    const batch = cards.slice(0, 8);
    episodes = [distillEpisode(batch), ...episodes].slice(0, 16);
    // Keep newest 6 cards hot after ferment
    cards = cards.slice(0, 6);
    distilled += 1;
    bytesSavedEstimate += 80;
  }

  return {
    cards,
    episodes,
    stats: { distilled, bytesSavedEstimate, crossModalFuses },
  };
}

export function formatDistillExplain(card: MultimodalCard, state?: MultimodalDistillMemory): string {
  const lines = [
    "**Multimodal distillation**",
    "",
    "Teacher: full iconic + echoic + text signals for a moment.",
    "Student: one small card — thesis + optional residues.",
    "",
    `**Level:** ${card.level}`,
    `**Thesis:** ${card.thesis}`,
    card.iconic ? `· iconic → ${card.iconic}` : "· iconic → (closed)",
    card.echoic ? `· echoic → ${card.echoic}` : "· echoic → (closed)",
    card.text ? `· text → ${card.text}` : "· text → (closed)",
    card.emotion ? `· emotion pattern → ${card.emotion}` : "",
    `· groups → ${card.groups.join(", ")}`,
    `· card cost ~${card.cost} (hot-path units)`,
    "",
    "Order: open windows → encode → align → fuse → **distill** → index by group.",
    "Hot path never keeps raw pixels/samples — only cards + episode lines.",
  ];
  if (state) {
    lines.push(
      "",
      `**Memory:** ${state.cards.length} cards · ${state.episodes.length} episodes · saved~${state.stats.bytesSavedEstimate} · cross-modal fuses ${state.stats.crossModalFuses}`,
    );
    if (state.episodes[0]) lines.push(`**Latest episode:** ${state.episodes[0]}`);
  }
  return lines.filter(Boolean).join("\n");
}

export function distillContextLine(state: MultimodalDistillMemory): string | null {
  if (!state.cards.length && !state.episodes.length) return null;
  const c = state.cards[0];
  const parts: string[] = [];
  if (c) parts.push(`mm:${c.thesis.slice(0, 70)}`);
  if (state.episodes[0]) parts.push(state.episodes[0].slice(0, 50));
  return parts.join(" · ");
}

export function isDistillQuery(text: string): boolean {
  return /\b(multimodal\s*distill|distillation|distill(ed|ing)?\s+(memory|modal|multimodal)|teacher\s*student\s*modal)\b/i.test(
    text,
  );
}
