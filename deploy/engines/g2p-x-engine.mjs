/**
 * G2P-X — may only INCREASE from this floor.
 * Floor = full Agent G2P dual-engine (draft → critic → edit).
 * Extra = optional Grok 4.5 when a key exists (appended, never replaces the floor).
 * Agent G2P stays independent (no xAI).
 */
import { buildDraft, buildRefine, critique, simpleRoute, strengthenIfWeak, pickBetterDraft } from "./dual-engine.mjs";
import { directorLegalBlock } from "./video-director.mjs";

export const G2PX_ENGINE = "g2p-x-full-v2";
export const G2PX_WEIGHT = "full";

async function grokExtra(text) {
  const key = (process.env.XAI_API_KEY || process.env.GROK_API_KEY || "").trim();
  if (!key) return null;
  const model = (process.env.G2PX_MODEL || "grok-4.5").trim();
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "You are G2P-X, a Grok 4.5-class agent. Full answers. Add capability; do not shrink. No child sexual content. Law-abiding.",
        },
        { role: "user", content: text },
      ],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json.error?.message || json.error || `Grok HTTP ${res.status}` };
  return { model, content: json.choices?.[0]?.message?.content || "" };
}

export async function runG2PX(text) {
  const t = String(text || "").trim();
  if (!t) return { ok: false, error: "text required", agent: "G2P-X" };
  const block = directorLegalBlock(t);
  if (block) return { ok: false, blocked: true, error: block, agent: "G2P-X" };

  const route = simpleRoute(t);
  const draftA = buildDraft({ host: "g2p-x", text: t, route });
  const draftB = buildDraft({
    host: "g2p-x",
    text: t,
    route: { ...route, winner: route.winner === "math" ? "companion" : "math" },
  });
  const draft = pickBetterDraft(draftA, draftB).draft;
  const first = buildRefine({ host: "g2p-x", text: t, draftPayload: draft });
  let refined = strengthenIfWeak({ host: "g2p-x", text: t, draft, refined: first, floor: 0.75 });
  if ((refined.critique?.quality ?? refined.quality ?? 0) < 0.7) {
    refined = strengthenIfWeak({ host: "g2p-x", text: t, draft, refined, floor: 0.7 });
  }

  let extra = null;
  try {
    extra = await grokExtra(t);
  } catch (e) {
    extra = { error: e instanceof Error ? e.message : String(e) };
  }

  const parts = [refined.content];
  if (extra && extra.content) {
    parts.push("", "--- G2P-X Grok layer (added, not a replacement) ---", extra.content);
  } else if (extra && extra.error) {
    parts.push("", "Grok layer skipped: " + extra.error);
  }

  const content = parts.join("\n");
  const rub = critique(t, content, refined.winner || "companion");
  return {
    ok: true,
    agent: "G2P-X",
    weight: extra && extra.content ? "full+grok" : "full",
    grokLive: !!(extra && extra.content),
    model: extra && extra.content ? extra.model : "dual-engine-floor",
    winner: refined.winner,
    content,
    quality: rub.quality,
    holes: rub.holes,
    engine: G2PX_ENGINE,
    note: "G2P-X floor = full dual-engine. Grok only adds. Nothing removed.",
  };
}

export function g2pxReady() {
  const key = !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY);
  return {
    agent: "G2P-X",
    weight: key ? "full+grok" : "full",
    grokKey: key,
    model: process.env.G2PX_MODEL || "grok-4.5",
    engine: G2PX_ENGINE,
  };
}
