/**
 * Strategic memory placement — improves model without bloat.
 * tiers: RAM (hot) | SCRIPT (host durable localStorage/scripts) | CLOUD (optional future sync)
 * Media: only relevant picture/video signals — never ad/popup noise.
 */

export type MemoryTier = "ram" | "script" | "cloud";

export type TieredNote = {
  id: string;
  tier: MemoryTier;
  at: number;
  group: string;
  usefulness: number; // 0–1
  text: string;
  source: "text" | "iconic" | "echoic" | "data";
};

export type TierStore = {
  ram: TieredNote[]; // hot engagement window
  script: TieredNote[]; // host-persisted durable notes
  cloud: TieredNote[]; // reserved; empty unless Companion enables sync
  engagedUntil: number;
  lastDefragAt: number;
};

export const EMPTY_TIERS: TierStore = {
  ram: [],
  script: [],
  cloud: [],
  engagedUntil: 0,
  lastDefragAt: 0,
};

const AD_NOISE =
  /\b(sponsored|buy now|click here|limited offer|subscribe now|popup|pop-up|advertisement|ad\s*banner|cookie banner)\b/i;

/** True only for genuine picture/video content — not ads/popups */
export function isRelevantMediaSignal(text: string): boolean {
  if (AD_NOISE.test(text)) return false;
  return /\b(photo|picture|image|screenshot|frame|video|clip|footage|camera|i see|looks like|visual of)\b/i.test(
    text,
  );
}

export function isAdOrPopupNoise(text: string): boolean {
  return AD_NOISE.test(text);
}

function uid() {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function usefulnessScore(text: string, source: TieredNote["source"]): number {
  let u = 0.4;
  if (source === "iconic" || source === "echoic") u += 0.15;
  if (/\b(decide|goal|deadline|remember|important|always|never)\b/i.test(text)) u += 0.25;
  if (/\b(code|api|deploy|architecture|business|design)\b/i.test(text)) u += 0.2;
  if (text.length < 12) u -= 0.2;
  if (isAdOrPopupNoise(text)) u = 0;
  return Math.max(0, Math.min(1, u));
}

function groupOf(text: string): string {
  if (/\b(code|app|api|deploy|website|software|design)\b/i.test(text)) return "build";
  if (/\b(business|price|offer|client|revenue)\b/i.test(text)) return "business";
  if (/\b(video|image|photo|camera|audio|sound)\b/i.test(text)) return "media";
  if (/\b(math|equation|solve)\b/i.test(text)) return "math";
  if (/\b(career|money|relationship|stress)\b/i.test(text)) return "life";
  return "general";
}

/**
 * Engagement window: while Companion is active, keep notes in RAM;
 * periodically promote high-usefulness to SCRIPT (host).
 * When not engaged, only store if usefulness ≥ threshold.
 */
export function ingestTiered(
  store: TierStore,
  text: string,
  opts?: { source?: TieredNote["source"]; engaged?: boolean },
): TierStore {
  const source = opts?.source ?? "text";
  const engaged = opts?.engaged ?? Date.now() < store.engagedUntil;
  const now = Date.now();
  let next: TierStore = {
    ...store,
    ram: [...store.ram],
    script: [...store.script],
    cloud: [...store.cloud],
  };

  if (opts?.engaged) {
    next.engagedUntil = now + 5 * 60 * 1000; // 5 min engagement window
  }

  if (isAdOrPopupNoise(text)) {
    return next; // never store ad/popup noise
  }

  // Media path only when real picture/video present
  let src = source;
  if (isRelevantMediaSignal(text)) {
    if (/\b(sound|audio|voice|music)\b/i.test(text)) src = "echoic";
    else src = "iconic";
  }

  const u = usefulnessScore(text, src);
  const active = engaged || now < next.engagedUntil;

  // Background engagement: light RAM sample every so often
  if (active && u < 0.25) {
    return next;
  }
  // Not engaged: only strategic high-value
  if (!active && u < 0.55) {
    return next;
  }

  const note: TieredNote = {
    id: uid(),
    tier: active ? "ram" : "script",
    at: now,
    group: groupOf(text),
    usefulness: u,
    text: text.trim().slice(0, 280),
    source: src,
  };

  if (note.tier === "ram") {
    next.ram = [note, ...next.ram].slice(0, 24);
  } else {
    next.script = [note, ...next.script].slice(0, 80);
  }

  // Periodic promote: high usefulness RAM → SCRIPT (host durable)
  if (active && next.ram.length >= 8) {
    const promote = next.ram.filter((n) => n.usefulness >= 0.7).slice(0, 3);
    if (promote.length) {
      next.script = [
        ...promote.map((n) => ({ ...n, tier: "script" as const })),
        ...next.script,
      ].slice(0, 80);
    }
  }

  return next;
}

/** Defragment: group by topic, drop low usefulness, merge near-duplicates */
export function defragTiers(store: TierStore): TierStore {
  const now = Date.now();
  const defragList = (list: TieredNote[]) => {
    const byGroup = new Map<string, TieredNote[]>();
    for (const n of list) {
      if (n.usefulness < 0.2) continue;
      const g = n.group;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(n);
    }
    const out: TieredNote[] = [];
    for (const [, arr] of byGroup) {
      arr.sort((a, b) => b.usefulness - a.usefulness || b.at - a.at);
      const seen = new Set<string>();
      for (const n of arr) {
        const key = n.text.slice(0, 48).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(n);
      }
    }
    return out.sort((a, b) => b.at - a.at);
  };

  return {
    ram: defragList(store.ram).slice(0, 16),
    script: defragList(store.script).slice(0, 64),
    cloud: store.cloud, // only if Companion enables later
    engagedUntil: store.engagedUntil,
    lastDefragAt: now,
  };
}

export function tierContextLine(store: TierStore): string | null {
  const top = [...store.ram, ...store.script]
    .sort((a, b) => b.usefulness - a.usefulness)
    .slice(0, 3);
  if (!top.length) return null;
  return `mem[${top.map((n) => `${n.tier}:${n.group}`).join(",")}]`;
}

/** Improvement gate: never make things worse */
export function improvementGate(opts: {
  benefit: string;
  risk: string;
  regressionRisk: "low" | "medium" | "high";
  measurable?: string;
}): { ok: boolean; reason: string } {
  if (opts.regressionRisk === "high") {
    return { ok: false, reason: "Blocked: high regression risk — would make things worse." };
  }
  if (!opts.benefit.trim()) {
    return { ok: false, reason: "Blocked: no clear benefit." };
  }
  return {
    ok: true,
    reason: `Pass: benefit="${opts.benefit}" risk="${opts.risk}" measure=${opts.measurable || "pending"} — still requires Companion YES for self-mod.`,
  };
}
