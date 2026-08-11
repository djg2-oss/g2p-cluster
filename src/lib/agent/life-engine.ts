/** Life-Problem Solving — trained domain libraries + SOP */

export type LifePlan = {
  title: string;
  problemStatement: string;
  rootFactors: string[];
  options: { name: string; upside: string; downside: string; fit: string }[];
  recommendation: string;
  steps: string[];
  metrics: string[];
  mindset: string;
  valuesPrompt?: string;
  biasesToWatch?: string[];
  recoveryIfFails?: string[];
};

const KEYWORD_HINTS: {
  test: RegExp;
  domain: string;
  factors: string[];
  steps: string[];
  biases: string[];
}[] = [
  {
    test: /career|job|work|promotion|quit|resign|interview|offer|boss|layoff/i,
    domain: "Career decision",
    factors: [
      "Skills match and growth trajectory",
      "Compensation vs. cost of living",
      "Culture, autonomy, and energy cost",
      "Optionality and long-term brand",
    ],
    steps: [
      "List non-negotiables vs. nice-to-haves",
      "Score each path 1–10 on growth, pay, lifestyle, risk",
      "Run a 30-day information-gathering sprint",
      "Set a decision date to avoid endless looping",
    ],
    biases: ["Sunk cost (years already invested)", "Status quo bias", "Social proof from peers"],
  },
  {
    test: /money|debt|budget|save|invest|rent|mortgage|financial|broke|salary/i,
    domain: "Financial problem",
    factors: [
      "Cash-flow gap (income − fixed − variable)",
      "High-interest debt drag",
      "Emergency buffer size",
      "Goal horizon (3 / 12 / 36 months)",
    ],
    steps: [
      "Map every recurring outflow for 30 days",
      "Stabilize: stop new high-interest debt; build a small buffer",
      "Attack highest-APR debt or critical arrears first",
      "Automate one savings transfer on payday",
    ],
    biases: ["Present bias (spend now)", "Optimism bias on future income", "Mental accounting"],
  },
  {
    test: /relationship|partner|spouse|family|friend|conflict|breakup|marriage|dating/i,
    domain: "Relational challenge",
    factors: [
      "Needs vs. expectations mismatch",
      "Communication pattern (avoidance / escalation)",
      "Boundaries and shared values",
      "External stressors amplifying friction",
    ],
    steps: [
      "State the desired outcome in one sentence (not a complaint)",
      "Own your part without self-attack",
      "Schedule a calm conversation with a clear ask",
      "Agree on one behavioral experiment for two weeks",
    ],
    biases: ["Mind-reading", "Fundamental attribution error", "Negativity bias"],
  },
  {
    test: /health|sleep|stress|anxiety|energy|exercise|habit|diet|weight/i,
    domain: "Health & energy",
    factors: [
      "Sleep consistency",
      "Load vs. recovery balance",
      "Nutrition and movement baseline",
      "Psychological load (worry loops)",
    ],
    steps: [
      "Protect a fixed sleep window for 14 nights",
      "Add one non-negotiable movement block (even 15 min)",
      "Cut one friction habit that steals recovery",
      "Track energy 1–5 twice daily for one week",
    ],
    biases: ["All-or-nothing thinking", "Planning fallacy on habits"],
  },
  {
    test: /time|overwhelm|procrastinat|focus|productiv|priority|burnout|busy/i,
    domain: "Time & focus",
    factors: [
      "Too many open loops",
      "Unclear priority hierarchy",
      "Context switching cost",
      "Energy mismatch (hard work at low-energy hours)",
    ],
    steps: [
      "Dump every open loop into one list",
      "Pick the single highest-leverage outcome for this week",
      "Block two deep-work windows on the calendar",
      "Close or defer everything else explicitly",
    ],
    biases: ["Urgency illusion", "Zeigarnik (open loops drain attention)"],
  },
  {
    test: /hous(e|ing)|move|relocat|apartment|landlord|roommate/i,
    domain: "Housing & location",
    factors: [
      "Total cost (rent + commute + time)",
      "Stability vs. flexibility",
      "Environment impact on energy and goals",
      "Exit options if it fails",
    ],
    steps: [
      "Write must-haves vs. nice-to-haves for the space",
      "Compare 2–3 options on monthly true cost",
      "Visit or verify constraints before locking in",
      "Plan move logistics in reverse from move date",
    ],
    biases: ["Anchoring on first listing", "Sunk cost on current lease"],
  },
  {
    test: /business|startup|client|pricing|offer|revenue|side hustle|launch/i,
    domain: "Business / offer decision",
    factors: [
      "Who pays and for what painful outcome",
      "Unit economics (price − delivery cost − time)",
      "Distribution (how they find you)",
      "Risk of focus dilution",
    ],
    steps: [
      "Write a one-sentence offer: who + problem + result + price band",
      "Talk to 5 target buyers before building more",
      "Price from value, not only cost",
      "Ship a minimal paid version in 14 days",
    ],
    biases: ["Build-it-and-they-will-come", "Underpricing to avoid rejection"],
  },
  {
    test: /negotiat|raise|difficult conversation|confrontation|boundary/i,
    domain: "Negotiation & hard conversation",
    factors: [
      "Your BATNA (best alternative if no deal)",
      "Their interests vs. positions",
      "Relationship value over time",
      "Non-monetary trades",
    ],
    steps: [
      "Clarify your target, walk-away, and BATNA",
      "List their likely interests",
      "Open with shared goal + clear ask",
      "Trade variables; don't only haggle one number",
    ],
    biases: ["Reactance", "Zero-sum assumption"],
  },
];

export function buildLifePlan(input: string): LifePlan {
  const hit =
    KEYWORD_HINTS.find((h) => h.test.test(input)) ??
    ({
      domain: "Complex life problem",
      factors: [
        "Stated goal vs. hidden constraints",
        "Resources (time, money, energy, allies)",
        "Risk tolerance and reversibility",
        "Identity and values alignment",
      ],
      steps: [
        "Write the problem in one sentence as a decision, not a feeling",
        "List constraints that are truly fixed vs. assumed",
        "Generate three paths: safe, bold, hybrid",
        "Choose a smallest viable next action within 48 hours",
      ],
      biases: ["Analysis paralysis", "Confirmation bias"],
    } as const);

  return {
    title: hit.domain,
    problemStatement: input.trim().slice(0, 400),
    rootFactors: hit.factors,
    options: [
      {
        name: "Stabilize first",
        upside: "Reduces panic; creates clarity bandwidth",
        downside: "Can delay bold moves if overdone",
        fit: "When overwhelm or crisis is high",
      },
      {
        name: "Decisive leap",
        upside: "Breaks stuck patterns; high upside if thesis is sound",
        downside: "Higher regret risk if information is thin",
        fit: "When costs of delay exceed costs of error",
      },
      {
        name: "Hybrid experiment",
        upside: "Learns fast with limited downside",
        downside: "Requires discipline to time-box",
        fit: "Default for most multi-path life decisions",
      },
    ],
    recommendation:
      "Default to a time-boxed hybrid experiment unless you are in acute crisis (stabilize) or the opportunity is clearly time-sensitive with acceptable downside (leap).",
    steps: [
      ...hit.steps,
      "Define success metrics for 7 and 30 days",
      "Schedule a review checkpoint with yourself (or Agent G2P)",
    ],
    metrics: [
      "Subjective stress 1–10 (target: trending down)",
      "One concrete progress marker per week",
      "Energy after key blocks 1–5",
    ],
    mindset:
      "You do not need the perfect plan — you need a clear next move, honest constraints, and a review loop.",
    valuesPrompt:
      "Before locking the choice: which value wins if two conflict — growth, stability, freedom, family, health, mastery, or money?",
    biasesToWatch: hit.biases,
    recoveryIfFails: [
      "Name what failed factually (no self-attack)",
      "Salvage one lesson and one asset from the attempt",
      "Cut scope 50% and retry a smaller version — or exit cleanly",
      "Book a 20-minute debrief with Agent G2P",
    ],
  };
}

export function formatLifePlan(p: LifePlan): string {
  const lines = [
    `**${p.title}**`,
    "",
    `**Problem (as framed):** ${p.problemStatement}`,
    "",
    "**Root factors:**",
    ...p.rootFactors.map((f, i) => `${i + 1}. ${f}`),
    "",
    "**Strategic options:**",
    ...p.options.map(
      (o) =>
        `• **${o.name}** — Upside: ${o.upside}. Downside: ${o.downside}. Best when: ${o.fit}.`,
    ),
    "",
    `**Recommendation:** ${p.recommendation}`,
    "",
    "**Implementation steps:**",
    ...p.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "**Metrics:**",
    ...p.metrics.map((m) => `• ${m}`),
  ];
  if (p.valuesPrompt) {
    lines.push("", `**Values check:** ${p.valuesPrompt}`);
  }
  if (p.biasesToWatch?.length) {
    lines.push("", "**Biases to watch:**", ...p.biasesToWatch.map((b) => `• ${b}`));
  }
  if (p.recoveryIfFails?.length) {
    lines.push("", "**If the plan fails:**", ...p.recoveryIfFails.map((r, i) => `${i + 1}. ${r}`));
  }
  lines.push("", `**Mindset:** ${p.mindset}`);
  return lines.join("\n");
}

/** Simple EV helper text for blend mode */
export function formatEVGuide(options: string[]): string {
  if (!options.length) {
    return "List options with rough payoff and probability; EV = payoff × probability.";
  }
  return options.map((o, i) => `${i + 1}. ${o} → estimate P(success) and payoff, compute EV`).join("\n");
}
