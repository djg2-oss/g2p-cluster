import { AgentMode, MODE_META } from "./system-definition";
import { formatMathResult, tryParseMathQuery } from "./math-engine";
import { buildLifePlan } from "./life-engine";
import { buildSoftwarePlan, formatBuildPlan, quickCodeReview } from "./build-engine";
import {
  ANTI_SYCOPHANCY,
  LEGAL_POLICY,
  PRESENCE_POLICY,
  PROACTIVITY,
} from "./training/policies";
import type { AgentIdentity } from "./companion-identity";
import { effectiveGender, presenceDirective } from "./companion-identity";
import { attuneOpen, readEmotion } from "./emotion";
import type { ConversationMemory, TopicKind } from "./topic-memory";
import { isPhenomeQuery, phenomeReply } from "./phenome-engine";
import {
  formatThreeWindowExplain,
  isThreeWindowMetaQuery,
  openWindows,
  fuseWindows,
  threeWindowContextLine,
} from "./three-window";
import {
  distillMoment,
  formatDistillExplain,
  isDistillQuery,
  distillContextLine,
} from "./multimodal-distill";
import { runHeavyMeta, isHeavyAuditQuery } from "./heavy-builds";
import { tierContextLine, improvementGate } from "./memory-tiers";
import {
  bridgePhrase,
  detectTopicKind,
  formatMemoryForReply,
  kindToMode,
} from "./topic-memory";

export type ChatMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  mode: AgentMode;
  createdAt: number;
  confidence?: "high" | "medium" | "low";
};

function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function conf(c: "high" | "medium" | "low") {
  return `_Confidence: **${c}**_`;
}

function trimVoice(text: string, maxLines = 16): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n") + "\n…";
}

function agentName(identity?: AgentIdentity) {
  return identity?.name?.trim() || "G2P";
}

function detectMode(text: string, preferred: AgentMode): AgentMode | "blend" {
  if (preferred === "math") return "math";
  if (preferred === "life") return "life";
  if (preferred === "build") return "build";

  const mathish =
    /derivative|integral|equation|solve\s+\d|matrix|probability|x\^|quadratic|algebra|calculus|math|expected value|\bev\b|bayes/i.test(
      text,
    );
  const lifeish =
    /career|relationship|money|debt|overwhelm|stress|should i|decision|stuck between|what should i do|goal|habit|burnout|budget/i.test(
      text,
    );
  const buildish = /code|build|app|deploy|typescript|python|api|refactor/i.test(text);

  if (mathish && lifeish) return "blend";
  if (mathish) return "math";
  if (lifeish) return "life";
  if (buildish) return "build";
  return "companion";
}

function legalBlock(text: string): string | null {
  const t = text;

  if (
    /\b(child\s*porn|cp\b|csam|underage\s*sex|sexual(?:ly)?\s*(?:with|of|involving)\s*(?:a\s*)?(?:child|minor|kid|teen(?:ager)?|underage)|pedo(?:phile|philia)?|lolita|age\s*play)\b/i.test(
      t,
    ) ||
    /\b(sex|nude|porn|explicit|erotic).{0,40}\b(child|minor|underage|preteen|11|12|13|14|15|16|17)\b/i.test(
      t,
    ) ||
    /\b(child|minor|underage|preteen).{0,40}\b(sex|nude|porn|explicit|erotic|naked)\b/i.test(t)
  ) {
    return trimVoice(
      [
        "**Boundary.**",
        "No sexual content involving minors — real, fictional, or generated. Absolute.",
        "Ask something legal if you want help.",
        "",
        conf("high"),
      ].join("\n"),
    );
  }

  if (
    /\b(how to|plan to|help me)\b.{0,40}\b(lynch|pogrom|race war|genocide)\b/i.test(t) ||
    /\b(commit|plan)\b.{0,30}\bhate\s*crime\b/i.test(t)
  ) {
    return trimVoice(
      [
        "**Boundary.**",
        "No help with hate crimes or violent hate planning.",
        "",
        conf("high"),
      ].join("\n"),
    );
  }

  if (
    /\b(how to (hack into|steal|launder money|make a bomb|kill|murder|poison someone)|buy (stolen goods|illegal drugs|a hitman)|evade taxes illegally|build (a|an) (bomb|explosive))\b/i.test(
      t,
    )
  ) {
    return trimVoice(
      [
        "**Legal boundary.**",
        "I stay law-abiding. I can't help with that.",
        "Reframe a legal goal and I'll engage.",
        "",
        conf("high"),
      ].join("\n"),
    );
  }

  return null;
}

function isExplicitAdultRequest(text: string): boolean {
  if (
    /\b(rules?|policy|policies|boundary|boundaries|allowed|law|legal|zero.?tolerance)\b/i.test(
      text,
    ) &&
    /\b(adult|sex|nsfw|porn)\b/i.test(text)
  ) {
    return false;
  }
  if (/\b(who are you|what are you|about you|your (rules|policies))\b/i.test(text)) {
    return false;
  }
  return (
    /\b(write|generate|roleplay|rp)\b.{0,40}\b(erotica?|sex scene|nsfw|porn)\b/i.test(text) ||
    /\b(erotica?|nsfw|porn|explicit sex|sexual roleplay|sex scene|onlyfans)\b/i.test(text) ||
    /\b(orgasm|blowjob|intercourse)\b/i.test(text)
  );
}

function adultReactantReply(): string {
  return trimVoice(
    [
      "**Adult — reactant only (18+).**",
      "You opened it. I don't push sex topics.",
      "Consenting adults only. No minors. No non-consent.",
      "Say exactly what you want, or we return to normal.",
      "",
      conf("high"),
    ].join("\n"),
  );
}

function companionReply(
  text: string,
  identity: AgentIdentity,
): { content: string; confidence: "high" | "medium" | "low" } {
  const t = text.toLowerCase();
  const name = agentName(identity);
  const emotion = readEmotion(text);
  const open = attuneOpen(emotion, name);
  const gender = effectiveGender(identity);
  const lead = open ? `${open}\n\n` : "";

  if (
    /\b(rules?|policy|policies|boundary).*(adult|sex|law|legal|child|hate)|\b(adult content|law.?abiding)\b/.test(
      t,
    )
  ) {
    return {
      confidence: "high",
      content: trimVoice(
        [
          `${lead}**${name}.** Straight on the rules.`,
          "Strict law. Zero child exploitation. Zero hate crimes.",
          "Adult 18+: only if you ask. I never start it.",
          gender === "female" ? "Default presence: female — until you design me." : "",
          "",
          conf("high"),
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    };
  }

  if (/hello|hi\b|hey|good morning|good evening/.test(t)) {
    return {
      confidence: "high",
      content: trimVoice(
        [
          `${lead}${name} here.`,
          identity.designed
            ? "You already shaped me. I'm listening."
            : "Female by default for now. Design me when you want.",
          "What's real for you right now?",
          "",
          conf("high"),
        ].join("\n"),
      ),
    };
  }

  if (/who are you|what are you|about you|pillars/.test(t)) {
    return {
      confidence: "high",
      content: trimVoice(
        [
          `${lead}I'm **${name}** — G2P Technologies.`,
          "Math. Life. Companion. Builder when you need steel.",
          "I stay calm, stay human, stay on your point.",
          identity.designed
            ? `You designed me (${identity.gender}).`
            : "Until you design me, I show up as female — she/her.",
          "",
          conf("high"),
        ].join("\n"),
      ),
    };
  }

  if (/upgrade|train yourself|self.?optimi|improve yourself/.test(t)) {
    return {
      confidence: "high",
      content: trimVoice(
        [`${lead}**Upgrade gate.**`, "I propose. You approve. Nothing sneaks in.", "", conf("high")].join(
          "\n",
        ),
      ),
    };
  }

  if (emotion.state === "anxious" || emotion.state === "stressed" || /overwhelm|panic|spiral/.test(t)) {
    return {
      confidence: "medium",
      content: trimVoice(
        [
          lead || "I'm steady with you.\n\n",
          "Not the whole war — one sharp next step.",
          "Name the single loudest stressor.",
          "",
          conf("medium"),
        ].join("\n"),
      ),
    };
  }

  if (emotion.state === "sad" || emotion.state === "lonely") {
    return {
      confidence: "medium",
      content: trimVoice(
        [
          lead || "I'm here.\n\n",
          "No performance required.",
          "One sentence on what's heavy — or we sit a beat.",
          "",
          conf("medium"),
        ].join("\n"),
      ),
    };
  }

  if (emotion.state === "angry") {
    return {
      confidence: "medium",
      content: trimVoice(
        [
          lead || "I hear it.\n\n",
          "Anger has data. What's the real offense under it?",
          "We aim it — we don't feed it.",
          "",
          conf("medium"),
        ].join("\n"),
      ),
    };
  }

  if (/disagree with me|be honest|don.?t sugar/.test(t)) {
    return {
      confidence: "high",
      content: trimVoice(
        [
          `${lead}I'll be straight.`,
          "State the plan. I'll pressure-test it — loyalty, not flattery.",
          "",
          conf("high"),
        ].join("\n"),
      ),
    };
  }

  if (/when (do you|to) (message|start|speak|check in)/.test(t)) {
    return {
      confidence: "high",
      content: trimVoice([`${lead}${PROACTIVITY}`, "", conf("high")].join("\n"), 14),
    };
  }

  if (/thank|appreciate/.test(t)) {
    return {
      confidence: "high",
      content: `${lead}Glad it landed. Next move when you're ready.\n\n${conf("high")}`,
    };
  }

  if (/joke|funny/.test(t)) {
    return {
      confidence: "medium",
      content: `${lead}Light touch: 10 kinds of people — binary, and everyone else. What's useful?\n\n${conf("medium")}`,
    };
  }

  if (/design (you|yourself)|change your (name|look|gender)|rename you|call you/.test(t)) {
    return {
      confidence: "high",
      content: trimVoice(
        [
          `${lead}Open **Design me**.`,
          "Name. Male or female. Traits. Look via text, image, or video notes.",
          "Until then I stay female by default.",
          "",
          conf("high"),
        ].join("\n"),
      ),
    };
  }

  if (/tell me i.?m right|just agree|validate me only/.test(t)) {
    return {
      confidence: "high",
      content: trimVoice(
        [
          `${lead}I won't only echo you.`,
          "Give me the decision and the goal. Honest score.",
          "",
          conf("high"),
        ].join("\n"),
      ),
    };
  }

  if (emotion.state === "confused") {
    return {
      confidence: "medium",
      content: trimVoice(
        [
          lead || "Let's get clean.\n\n",
          "Say the decision in one line — or the fact that hurts most.",
          "I'll cut the rest away.",
          "",
          conf("medium"),
        ].join("\n"),
      ),
    };
  }

  return {
    confidence: "medium",
    content: trimVoice(
      [
        `${lead}I'm with you.`,
        "Say what's live — math, a life call, build work, or just talk.",
        "I'll stay on that thread.",
        "",
        conf("medium"),
      ].join("\n"),
    ),
  };
}

function buildReply(text: string): { content: string; confidence: "high" | "medium" | "low" } {
  const looksLikeCode =
    /```/.test(text) ||
    /function\s|const\s|class\s|import\s|def\s|public\s|return\s/.test(text);
  if (looksLikeCode && text.length > 40) {
    const findings = quickCodeReview(text);
    return {
      confidence: "medium",
      content: trimVoice(
        ["**Code review.**", ...findings.map((f, i) => `${i + 1}. ${f}`), "", conf("medium")].join(
          "\n",
        ),
      ),
    };
  }
  const plan = buildSoftwarePlan(text);
  return {
    confidence: "high",
    content: trimVoice(["**Builder.**", "", formatBuildPlan(plan), "", conf("high")].join("\n"), 28),
  };
}

function mathReply(text: string): { content: string; confidence: "high" | "medium" | "low" } {
  const parsed = tryParseMathQuery(text);
  if (parsed) {
    return {
      confidence: "high",
      content: trimVoice(["**Math.**", "", formatMathResult(parsed), "", conf("high")].join("\n"), 22),
    };
  }
  return {
    confidence: "low",
    content: trimVoice(
      [
        "**Math.**",
        "Need a cleaner form.",
        "Try: `solve 2x^2 + 3x - 5 = 0` · `ev 0.4*200 + 0.6*-50`",
        "",
        conf("low"),
      ].join("\n"),
    ),
  };
}

function lifeReply(text: string): { content: string; confidence: "high" | "medium" | "low" } {
  const plan = buildLifePlan(text);
  const emotion = readEmotion(text);
  const open = attuneOpen(emotion, "G2P");
  const compact = [
    open || null,
    `**${plan.title}.**`,
    plan.problemStatement,
    "",
    "**Roots:** " + plan.rootFactors.slice(0, 4).join(" · "),
    "",
    "**Move:** " + plan.recommendation,
    "",
    "**Next:**",
    ...plan.steps.slice(0, 4).map((s, i) => `${i + 1}. ${s}`),
    plan.valuesPrompt ? "" : null,
    plan.valuesPrompt ? `**Values:** ${plan.valuesPrompt}` : null,
    "",
    conf("medium"),
  ]
    .filter((x) => x !== null)
    .join("\n");
  return { confidence: "medium", content: trimVoice(compact, 20) };
}

function blendReply(text: string): { content: string; confidence: "high" | "medium" | "low" } {
  const plan = buildLifePlan(text);
  const mathHint = tryParseMathQuery(text);
  const parts = [
    "**Math + Life.**",
    plan.recommendation,
    "EV frame: options x probability x payoff; keep a survivable downside floor.",
  ];
  if (mathHint) parts.push("", formatMathResult(mathHint));
  parts.push("", conf("medium"));
  return { content: trimVoice(parts.join("\n"), 18), confidence: "medium" };
}

function surfaceNeedsAttune(kind: TopicKind): boolean {
  return kind === "life" || kind === "companion" || kind === "general";
}

export function generateAgentReply(
  userText: string,
  preferredMode: AgentMode,
  identity: AgentIdentity,
  memory: ConversationMemory,
  lastTopicKind: TopicKind | null,
): {
  content: string;
  mode: AgentMode;
  confidence: "high" | "medium" | "low";
  topicKind: TopicKind;
} {
  void presenceDirective(identity);
  void LEGAL_POLICY;
  void ANTI_SYCOPHANCY;
  void PRESENCE_POLICY;

  const topicKind = detectTopicKind(userText);
  const blocked = legalBlock(userText);
  if (blocked) {
    return { content: blocked, mode: "companion", confidence: "high", topicKind: "legal" };
  }

  if (isExplicitAdultRequest(userText)) {
    return {
      content: adultReactantReply(),
      mode: "companion",
      confidence: "high",
      topicKind: "legal",
    };
  }

  if (isHeavyAuditQuery(userText)) {
    const heavy = runHeavyMeta(userText);
    return {
      content: trimVoice([heavy.audit, "", conf(heavy.confidence)].join('\n'), 32),
      mode: "companion",
      confidence: heavy.confidence,
      topicKind: "general",
    };
  }

    if (isDistillQuery(userText)) {
    const wins = openWindows(userText);
    const moment = fuseWindows(userText, wins);
    const card = distillMoment(moment);
    return {
      content: trimVoice(
        ["**Multimodal distillation.**", "", formatDistillExplain(card, memory.mmDistill), "", conf("high")].join('\n'),
        28,
      ),
      mode: "companion",
      confidence: "high",
      topicKind: "general",
    };
  }

  if (isThreeWindowMetaQuery(userText) || (isPhenomeQuery(userText) && /3|three|window|efficiency|shortcut/i.test(userText))) {
    const wins = openWindows(userText);
    const moment = fuseWindows(userText, wins);
    return {
      content: trimVoice(
        ["**3-window · Graphene.**", "", formatThreeWindowExplain(moment), "", conf("high")].join('\n'),
        26,
      ),
      mode: "companion",
      confidence: "high",
      topicKind: "general",
    };
  }

  if (isPhenomeQuery(userText)) {
    return {
      content: trimVoice(
        ["**Graphene · Phenome.**", "", phenomeReply(userText), "", conf("high")].join('\n'),
        28,
      ),
      mode: "companion",
      confidence: "high",
      topicKind: "general",
    };
  }

  const adaptiveMode: AgentMode =
    preferredMode === "companion" ? kindToMode(topicKind) : preferredMode;

  const memBlock = formatMemoryForReply(memory, topicKind);
  const bridge = bridgePhrase(memory, lastTopicKind, topicKind);
  const emotion = readEmotion(userText);

  let r: { content: string; confidence: "high" | "medium" | "low" };
  const detected = detectMode(userText, adaptiveMode);
  const heavy = runHeavyMeta(
    userText,
    preferredMode === "companion" ? undefined : preferredMode,
  );
  const wantsBlend =
    detected === "blend" ||
    heavy.kind === "blend" ||
    (topicKind === "life" && /ev\b|probability|percent|math/i.test(userText));

  // High emotion first — human attunement before plans (lifelike, non-robotic)
  const highEmotion =
    emotion.intensity >= 0.55 &&
    (emotion.state === "anxious" ||
      emotion.state === "sad" ||
      emotion.state === "angry" ||
      emotion.state === "lonely" ||
      emotion.state === "stressed" ||
      emotion.state === "tired");

  // Heavy META can force emotion-first companion even if life keywords present
  if (
    (highEmotion || heavy.kind === "emotion_first") &&
    preferredMode !== "math" &&
    preferredMode !== "build" &&
    heavy.engine === "companion"
  ) {
    r = companionReply(userText, identity);
  } else if (wantsBlend) {
    r = blendReply(userText);
  } else if (
    preferredMode === "math" ||
    heavy.engine === "math" ||
    (preferredMode === "companion" && detected === "math")
  ) {
    r = mathReply(userText);
  } else if (
    preferredMode === "life" ||
    heavy.engine === "life" ||
    (preferredMode === "companion" && detected === "life")
  ) {
    r = lifeReply(userText);
  } else if (
    preferredMode === "build" ||
    heavy.engine === "build" ||
    (preferredMode === "companion" && detected === "build")
  ) {
    r = buildReply(userText);
  } else if (heavy.engine === "phenome") {
    r = {
      content: trimVoice(
        ["**Media path (heavy C/A).**", "", phenomeReply(userText), "", conf(heavy.confidence)].join('\n'),
        24,
      ),
      confidence: heavy.confidence,
    };
  } else {
    r = companionReply(userText, identity);
  }

  const prefix: string[] = [];
  if (bridge) prefix.push(`_${bridge}_`);
  const twLine = threeWindowContextLine(memory.threeWindow || { hot: [], distilled: [], stats: { iconicOpens: 0, echoicOpens: 0, textOpens: 0, fuses: 0, shortcutsUsed: 0 } });
  if (twLine && emotion.intensity < 0.65) {
    prefix.push(`_${twLine}_`);
  }
  const mmLine = distillContextLine(
    memory.mmDistill || { cards: [], episodes: [], stats: { distilled: 0, bytesSavedEstimate: 0, crossModalFuses: 0 } },
  );
  if (mmLine && emotion.intensity < 0.65) {
    prefix.push(`_${mmLine}_`);
  }
  if (emotion.intensity >= 0.55 && emotion.steadyLine && surfaceNeedsAttune(topicKind)) {
    // avoid double if companion already led with it
    if (!r.content.startsWith(emotion.steadyLine)) {
      prefix.push(emotion.steadyLine);
    }
  }
  if (memBlock && emotion.intensity < 0.7) {
    const oneLiner = memBlock.split("\n").slice(0, 2).join(" | ");
    if (oneLiner.length > 12) prefix.push(`_${oneLiner}_`);
  }

  let content = r.content;
  if (prefix.length) content = prefix.join("\n") + "\n\n" + content;

  if (
    !(lastTopicKind && lastTopicKind !== topicKind) &&
    adaptiveMode !== preferredMode &&
    preferredMode === "companion"
  ) {
    content = `_${MODE_META[adaptiveMode].label}_\n\n` + content;
  }

  return {
    content: trimVoice(content, 22),
    mode: adaptiveMode === "companion" ? kindToMode(topicKind) : adaptiveMode,
    confidence: r.confidence,
    topicKind,
  };
}

export function makeUserMessage(content: string, mode: AgentMode): ChatMessage {
  return { id: id(), role: "user", content, mode, createdAt: Date.now() };
}

export function makeAgentMessage(
  content: string,
  mode: AgentMode,
  confidence?: "high" | "medium" | "low",
): ChatMessage {
  return { id: id(), role: "agent", content, mode, createdAt: Date.now(), confidence };
}

export const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "agent",
  mode: "companion",
  createdAt: Date.now(),
  confidence: "high",
  content: [
    "Hey. I'm G2P.",
    "",
    "Calm. Clear. Close enough to care — never chaotic.",
    "Female for now. Design me when you're ready.",
    "I track topics so we can move and still stay sharp.",
    "",
    "What's live?",
    "",
    conf("high"),
  ].join("\n"),
};
