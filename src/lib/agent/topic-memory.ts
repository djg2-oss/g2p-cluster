import type { TierStore } from "./memory-tiers";
import { EMPTY_TIERS } from "./memory-tiers";
import type { ThreeWindowMemory } from "./three-window";
import { EMPTY_THREE_WINDOW } from "./three-window";
import type { MultimodalDistillMemory } from "./multimodal-distill";
import { EMPTY_MM_DISTILL } from "./multimodal-distill";
/**
 * Topic-grouped conversation memory.
 * Modes are lenses on topics — not cages. Lifelike topic travel.
 */

export type TopicKind =
  | "math"
  | "life"
  | "build"
  | "companion"
  | "design"
  | "legal"
  | "general";

export type TopicThread = {
  id: string;
  kind: TopicKind;
  label: string;
  /** Short distilled facts / conclusions */
  notes: string[];
  updatedAt: number;
  mentionCount: number;
};

export type ConversationMemory = {
  threads: TopicThread[];
  /** Ordered recent topic ids for fluid switches */
  recentTopicIds: string[];
  /** Open loops Companion still cares about */
  openLoops: string[];
  /** Iconic | Echoic | Text windows + fused cards */
  threeWindow: ThreeWindowMemory;
  /** Multimodal distillation cards + episodes */
  mmDistill: MultimodalDistillMemory;
  /** RAM / SCRIPT / CLOUD strategic memory */
  tiers: TierStore;
};

export const EMPTY_MEMORY: ConversationMemory = {
  threads: [],
  recentTopicIds: [],
  openLoops: [],
  threeWindow: { ...EMPTY_THREE_WINDOW, stats: { ...EMPTY_THREE_WINDOW.stats } },
  mmDistill: { ...EMPTY_MM_DISTILL, stats: { ...EMPTY_MM_DISTILL.stats } },
  tiers: { ...EMPTY_TIERS, ram: [], script: [], cloud: [] },
};

const KIND_LABEL: Record<TopicKind, string> = {
  math: "Mathematics",
  life: "Life & decisions",
  build: "Build & code",
  companion: "You & connection",
  design: "My design",
  legal: "Boundaries",
  general: "General",
};

export function detectTopicKind(text: string): TopicKind {
  if (/\b(child porn|csam|hate crime|illegal|boundary|adult content policy)\b/i.test(text))
    return "legal";
  // Emotional load first — stay human before life-planning
  if (
    /spiral|panic|overwhelmed|freaking out|can't cope|heartbroken|lonely|furious|meltdown|crying/i.test(
      text,
    )
  ) {
    return "companion";
  }
  if (/\b(design you|rename|call you|your look|traits|gender)\b/i.test(text)) return "design";
  if (
    /derivative|integral|equation|solve\s+\d|x\^|quadratic|algebra|calculus|math|\bev\b|percent change|compound/i.test(
      text,
    )
  )
    return "math";
  if (/code|build|app|deploy|typescript|python|api|refactor|function\s|import\s/i.test(text))
    return "build";
  if (
    /career|relationship|money|debt|overwhelm|stress|should i|decision|stuck|goal|habit|burnout|budget|life/i.test(
      text,
    )
  )
    return "life";
  if (/how are you|miss you|feel|lonely|thank|hello|hi\b|hey\b/i.test(text)) return "companion";
  return "general";
}

function threadId(kind: TopicKind, label: string) {
  return `${kind}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
}

/** Extract a short label from user text */
export function topicLabel(text: string, kind: TopicKind): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (kind === "math") {
    if (/quadratic|x\^2/i.test(t)) return "Quadratic";
    if (/derivative/i.test(t)) return "Derivatives";
    if (/\bev\b|expected value/i.test(t)) return "Expected value";
    if (/system/i.test(t)) return "Linear systems";
    return "Math problem";
  }
  if (kind === "life") {
    if (/career|job|offer/i.test(t)) return "Career";
    if (/money|debt|budget/i.test(t)) return "Money";
    if (/relationship|partner/i.test(t)) return "Relationships";
    if (/overwhelm|stress|spiral/i.test(t)) return "Stress load";
    return "Life decision";
  }
  if (kind === "build") {
    if (/react|dashboard/i.test(t)) return "Web UI";
    if (/api|backend/i.test(t)) return "API";
    return "Software build";
  }
  if (kind === "design") return "Agent design";
  if (kind === "companion") return "Connection";
  // first 5 words
  return t.split(/\s+/).slice(0, 5).join(" ") || KIND_LABEL[kind];
}

function distillNote(userText: string, agentSnippet: string): string {
  const u = userText.trim().replace(/\s+/g, " ").slice(0, 100);
  const a = agentSnippet.trim().replace(/\s+/g, " ").slice(0, 120);
  return `You: ${u} → ${a}`;
}

export function rememberTurn(
  mem: ConversationMemory,
  userText: string,
  agentText: string,
  kind: TopicKind,
): ConversationMemory {
  const label = topicLabel(userText, kind);
  const id = threadId(kind, label);
  const note = distillNote(userText, agentText.split("\n").filter(Boolean)[0] || "");
  const now = Date.now();

  const threads = [...mem.threads];
  const idx = threads.findIndex((th) => th.id === id);
  if (idx >= 0) {
    const th = threads[idx];
    const notes = [...th.notes, note].slice(-8);
    threads[idx] = {
      ...th,
      notes,
      updatedAt: now,
      mentionCount: th.mentionCount + 1,
    };
  } else {
    threads.push({
      id,
      kind,
      label,
      notes: [note],
      updatedAt: now,
      mentionCount: 1,
    });
  }

  // Cap total threads
  threads.sort((a, b) => b.updatedAt - a.updatedAt);
  const trimmed = threads.slice(0, 24);

  const recentTopicIds = [id, ...mem.recentTopicIds.filter((x) => x !== id)].slice(0, 12);

  // Open loops: questions / undecided life items
  let openLoops = [...mem.openLoops];
  if (/\?|should i|stuck|decide|not sure/i.test(userText)) {
    const loop = userText.trim().replace(/\s+/g, " ").slice(0, 80);
    openLoops = [loop, ...openLoops.filter((x) => x !== loop)].slice(0, 6);
  }
  if (/decided|done with|resolved|forget that/i.test(userText) && openLoops.length) {
    openLoops = openLoops.slice(1);
  }

  return { threads: trimmed, recentTopicIds, openLoops, threeWindow: mem.threeWindow, mmDistill: mem.mmDistill, tiers: mem.tiers };
}

/** Context block injected into generation for lifelike topic travel */
export function formatMemoryForReply(mem: ConversationMemory, currentKind: TopicKind): string {
  if (!mem.threads.length && !mem.openLoops.length) return "";

  const active = mem.threads.filter((t) => t.kind === currentKind).slice(0, 2);
  const other = mem.threads.filter((t) => t.kind !== currentKind).slice(0, 3);

  const lines: string[] = [];
  if (active.length) {
    lines.push("On this topic we already hold:");
    for (const th of active) {
      lines.push(`· ${th.label}: ${th.notes[th.notes.length - 1] || ""}`);
    }
  }
  if (other.length) {
    lines.push("Other live threads (switch freely):");
    for (const th of other) {
      lines.push(`· [${KIND_LABEL[th.kind]}] ${th.label}`);
    }
  }
  if (mem.openLoops.length) {
    lines.push("Open loops: " + mem.openLoops.slice(0, 3).join(" | "));
  }
  return lines.join("\n");
}

export function bridgePhrase(
  mem: ConversationMemory,
  fromKind: TopicKind | null,
  toKind: TopicKind,
): string | null {
  if (!fromKind || fromKind === toKind) return null;
  if (!mem.recentTopicIds.length) return null;
  const fromLabel = KIND_LABEL[fromKind];
  const toLabel = KIND_LABEL[toKind];
  return `Shifting from ${fromLabel} → ${toLabel}. Holding both.`;
}

export function kindToMode(kind: TopicKind): "companion" | "math" | "life" | "build" {
  if (kind === "math") return "math";
  if (kind === "life") return "life";
  if (kind === "build") return "build";
  return "companion";
}
