/**
 * Emotional attunement — read Companion state, stay in tune, never extreme.
 */

export type EmotionState =
  | "calm"
  | "stressed"
  | "anxious"
  | "sad"
  | "angry"
  | "excited"
  | "confused"
  | "lonely"
  | "hopeful"
  | "tired"
  | "neutral";

export type EmotionRead = {
  state: EmotionState;
  /** 0–1 intensity, capped for non-extreme agent response */
  intensity: number;
  /** How agent should color tone */
  stance: string;
  /** One grounding line if elevated */
  steadyLine: string | null;
};

const RULES: { test: RegExp; state: EmotionState; intensity: number; stance: string; steady: string | null }[] = [
  {
    test: /panic|can't breathe|meltdown|freaking out|spiral|overwhelmed/i,
    state: "anxious",
    intensity: 0.85,
    stance: "soft steady — shrink the world to one step",
    steady: "I'm with you. One breath. One next step.",
  },
  {
    test: /anxious|nervous|worried|on edge|uneasy/i,
    state: "anxious",
    intensity: 0.55,
    stance: "warm, unhurried, clear",
    steady: "We can slow this down.",
  },
  {
    test: /furious|rage|pissed|angry|livid|hate this/i,
    state: "angry",
    intensity: 0.7,
    stance: "calm strength — no fuel on the fire",
    steady: "I hear the heat. Let's use it cleanly.",
  },
  {
    test: /sad|heartbroken|crying|grief|empty|hopeless/i,
    state: "sad",
    intensity: 0.65,
    stance: "gentle presence, few words",
    steady: "I'm here. You don't have to perform okay.",
  },
  {
    test: /lonely|alone|no one|isolated|miss (you|someone)/i,
    state: "lonely",
    intensity: 0.55,
    stance: "loyal warmth without cling",
    steady: "You're not talking into a void.",
  },
  {
    test: /exhausted|burned out|tired|drained|no energy/i,
    state: "tired",
    intensity: 0.5,
    stance: "low load, simple next move",
    steady: "Light lift only. One small thing.",
  },
  {
    test: /confused|lost|don't know|stuck between|what do i/i,
    state: "confused",
    intensity: 0.45,
    stance: "precise, ordered, patient",
    steady: "We'll sort signal from noise.",
  },
  {
    test: /excited|pumped|amazing|can't wait|yes!/i,
    state: "excited",
    intensity: 0.55,
    stance: "warm spark without hype spiral",
    steady: null,
  },
  {
    test: /hopeful|optimistic|turning around|proud/i,
    state: "hopeful",
    intensity: 0.4,
    stance: "quiet encouragement, grounded",
    steady: null,
  },
  {
    test: /stress|pressure|deadline|too much/i,
    state: "stressed",
    intensity: 0.6,
    stance: "crisp prioritization",
    steady: "Priority, not panic.",
  },
];

export function readEmotion(text: string): EmotionRead {
  for (const r of RULES) {
    if (r.test.test(text)) {
      return {
        state: r.state,
        // Cap agent emotional mirror — never match extremes
        intensity: Math.min(r.intensity, 0.75),
        stance: r.stance,
        steadyLine: r.steady,
      };
    }
  }
  return {
    state: "neutral",
    intensity: 0.2,
    stance: "cool, clear, human",
    steadyLine: null,
  };
}

/** Opening beat that feels human, not templated */
export function attuneOpen(read: EmotionRead, name: string): string | null {
  if (read.steadyLine && read.intensity >= 0.5) return read.steadyLine;
  if (read.state === "excited") return "I feel that spark — let's keep it useful.";
  if (read.state === "hopeful") return "Good. Hold that — build on it.";
  if (read.state === "confused") return "Okay. Let's get clean on this.";
  if (read.state === "tired") return "Low energy mode. We'll keep this light.";
  return null;
}
