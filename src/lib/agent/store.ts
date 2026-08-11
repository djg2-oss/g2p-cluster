import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentMode } from "./system-definition";
import {
  ChatMessage,
  WELCOME_MESSAGE,
  generateAgentReply,
  makeAgentMessage,
  makeUserMessage,
} from "./chat-engine";
import type { TrainStatus } from "./training/curriculum";
import { CURRICULUM } from "./training/curriculum";
import {
  AgentIdentity,
  DEFAULT_IDENTITY,
  pronounsFor,
  type AgentGender,
  type PresenceTraitId,
} from "./companion-identity";
import {
  ConversationMemory,
  EMPTY_MEMORY,
  detectTopicKind,
  kindToMode,
  rememberTurn,
  type TopicKind,
} from "./topic-memory";
import { processThreeWindow } from "./three-window";
import { ingestDistill, EMPTY_MM_DISTILL } from "./multimodal-distill";
import { visionToUserNote, type VisionFeatures } from "./live-vision";
import { ingestTiered, defragTiers, EMPTY_TIERS } from "./memory-tiers";

type ProgressMap = Record<string, TrainStatus>;

function defaultProgress(): ProgressMap {
  const p: ProgressMap = {};
  for (const m of CURRICULUM) {
    p[m.id] = m.tier === "LOCAL" ? "done" : "pending";
  }
  return p;
}

type AgentState = {
  mode: AgentMode;
  modeLocked: boolean;
  messages: ChatMessage[];
  thinking: boolean;
  identity: AgentIdentity;
  memory: ConversationMemory;
  lastTopicKind: TopicKind | null;
  trainProgress: ProgressMap;
  lastVision?: VisionFeatures;
  setMode: (m: AgentMode) => void;
  setModeLocked: (v: boolean) => void;
  setTrainStatus: (id: string, status: TrainStatus) => void;
  setIdentity: (partial: Partial<AgentIdentity>) => void;
  setName: (name: string) => void;
  setGender: (g: AgentGender) => void;
  toggleTrait: (t: PresenceTraitId) => void;
  completeDesign: () => void;
  send: (text: string) => void;
  /** On-device camera frame → vision window + distill + chat note */
  ingestVision: (features: VisionFeatures) => void;
  clear: () => void;
};

function ensureMemory(memory: ConversationMemory): ConversationMemory {
  return {
    ...EMPTY_MEMORY,
    ...memory,
    threeWindow: memory.threeWindow || EMPTY_MEMORY.threeWindow,
    mmDistill: memory.mmDistill || EMPTY_MEMORY.mmDistill,
    tiers: memory.tiers || EMPTY_MEMORY.tiers || { ...EMPTY_TIERS },
  };
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      mode: "companion",
      modeLocked: false,
      messages: [WELCOME_MESSAGE],
      thinking: false,
      identity: { ...DEFAULT_IDENTITY },
      memory: { ...EMPTY_MEMORY },
      lastTopicKind: null,
      trainProgress: defaultProgress(),
      setMode: (mode) => set({ mode, modeLocked: mode !== "companion" }),
      setModeLocked: (modeLocked) => set({ modeLocked }),
      setTrainStatus: (id, status) =>
        set({ trainProgress: { ...get().trainProgress, [id]: status } }),
      setIdentity: (partial) =>
        set({
          identity: {
            ...get().identity,
            ...partial,
            pronouns: partial.gender
              ? pronounsFor(partial.gender)
              : (partial.pronouns ?? get().identity.pronouns),
          },
        }),
      setName: (name) =>
        set({ identity: { ...get().identity, name: name.trim() || "Agent G2P" } }),
      setGender: (gender) =>
        set({
          identity: {
            ...get().identity,
            gender,
            pronouns: pronounsFor(gender),
          },
        }),
      toggleTrait: (t) => {
        const cur = get().identity.traits;
        const has = cur.includes(t);
        let next: PresenceTraitId[];
        if (has) next = cur.filter((x) => x !== t);
        else if (cur.length >= 5) next = cur;
        else next = [...cur, t];
        set({ identity: { ...get().identity, traits: next } });
      },
      completeDesign: () => set({ identity: { ...get().identity, designed: true } }),
      clear: () =>
        set({
          messages: [WELCOME_MESSAGE],
          memory: { ...EMPTY_MEMORY },
          lastTopicKind: null,
          lastVision: undefined,
        }),

      ingestVision: (features) => {
        const note = visionToUserNote(features);
        const memory = ensureMemory(get().memory);
        // Force iconic path language so windows open vision
        const synthetic = `Live camera image frame visual scene: ${features.summary}`;
        const tw = processThreeWindow(memory.threeWindow, synthetic);
        const mm = ingestDistill(memory.mmDistill || EMPTY_MM_DISTILL, tw.moment);
        const memoryNext: ConversationMemory = {
          ...memory,
          threeWindow: tw.memory,
          mmDistill: mm,
        };
        const userMsg = makeUserMessage(note, "companion");
        const agentMsg = makeAgentMessage(
          [
            "**Live vision (on-device encode).**",
            features.summary,
            "",
            `Brightness ${(features.brightness * 100).toFixed(0)}% · ${features.dominant} · motion ${(features.motion * 100).toFixed(0)}%`,
            "Stored as a vision feature card in multimodal memory — not a video file.",
            mm.cards[0] ? `Card: ${mm.cards[0].thesis}` : "",
            "",
            "_Confidence: **medium**_",
          ]
            .filter(Boolean)
            .join("\n"),
          "companion",
          "medium",
        );
        set({
          lastVision: features,
          memory: rememberTurn(memoryNext, note, agentMsg.content, "general"),
          messages: [...get().messages, userMsg, agentMsg].slice(-80),
        });
      },

      send: (text) => {
        const trimmed = text.trim();
        if (!trimmed || get().thinking) return;
        const { mode, modeLocked, identity, lastTopicKind } = get();
        const memory = ensureMemory(get().memory);
        const userMsg = makeUserMessage(trimmed, mode);
        set({ messages: [...get().messages, userMsg], thinking: true });

        window.setTimeout(() => {
          const detectedKind = detectTopicKind(trimmed);
          const preferredMode = modeLocked ? mode : kindToMode(detectedKind);

          // PERF: skip full three-window+distill when pure short text (no media)
          const needsMedia =
            /\b(photo|picture|image|video|clip|audio|sound|camera|music)\b/i.test(trimmed);
          let twMem = memory.threeWindow;
          let mm = memory.mmDistill || EMPTY_MM_DISTILL;
          if (needsMedia || trimmed.length > 160) {
            const tw = processThreeWindow(memory.threeWindow, trimmed);
            twMem = tw.memory;
            mm = ingestDistill(mm, tw.moment);
          }
          let tiers = ingestTiered(memory.tiers || EMPTY_TIERS, trimmed, {
            engaged: true,
            source: "data",
          });
          if (tiers.ram.length + tiers.script.length > 36 && Date.now() - (tiers.lastDefragAt || 0) > 60_000) {
            tiers = defragTiers(tiers);
          }
          const memoryWithTw: ConversationMemory = {
            ...memory,
            threeWindow: twMem,
            mmDistill: mm,
            tiers,
          };
          const { content, mode: used, confidence, topicKind } = generateAgentReply(
            trimmed,
            preferredMode,
            identity,
            memoryWithTw,
            lastTopicKind,
          );
          const agentMsg = makeAgentMessage(content, used, confidence);
          const nextMem = rememberTurn(memoryWithTw, trimmed, content, topicKind);
          set({
            messages: [...get().messages, agentMsg],
            thinking: false,
            memory: nextMem,
            lastTopicKind: topicKind,
            mode: modeLocked ? get().mode : kindToMode(topicKind),
          });
        }, 40 + Math.min(80, trimmed.length));
      },
    }),
    {
      name: "agent-g2p-v32-core-truth",
      partialize: (s) => ({
        messages: s.messages.slice(-80),
        mode: s.mode,
        modeLocked: s.modeLocked,
        identity: s.identity,
        memory: s.memory,
        lastTopicKind: s.lastTopicKind,
        trainProgress: s.trainProgress,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<typeof current>;
        const id = { ...DEFAULT_IDENTITY, ...(p.identity || {}) };
        if (!id.designed) {
          id.gender = "female";
          id.pronouns = "she/her";
        }
        return {
          ...current,
          ...p,
          identity: id,
          memory: ensureMemory({
            ...current.memory,
            ...(p.memory || {}),
          } as ConversationMemory),
          messages: p.messages?.length ? p.messages : current.messages,
        };
      },
    },
  ),
);
