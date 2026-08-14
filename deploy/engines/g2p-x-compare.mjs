/**
 * G2P-X — compare / critic agent.
 * Independent G2P Technologies role. Not Grok. Not xAI. Not grok-g2p-x 1.5.
 */
import { critique, ENGINE_VERSION } from "./dual-engine.mjs";
import { planVideo, directorLegalBlock } from "./video-director.mjs";

export const G2PX_VERSION = "g2p-x-compare-v1";

export function compareG2PX(body = {}) {
  const goal = String(body.goal || body.text || "").trim();
  const a = String(body.a || body.left || body.original || "").trim();
  const b = String(body.b || body.right || body.candidate || "").trim();

  const block = directorLegalBlock(goal + " " + a + " " + b);
  if (block) return { ok: false, blocked: true, error: block, agent: "G2P-X" };

  const target = b || a || goal;
  const plan = goal ? planVideo(goal, { kind: body.kind || "t2v" }) : null;
  const rub = critique(goal || a, target, "phenome");

  const notes = [];
  if (a && b) {
    if (b.length > a.length * 1.2) notes.push("B is more specified than A.");
    if (/camera|orbit|pan|light/i.test(b) && !/camera|orbit|pan|light/i.test(a)) {
      notes.push("B adds camera/light language A lacked.");
    }
    if (a === b) notes.push("A and B are identical — no delta.");
  }
  if (plan && plan.directedPrompt) {
    notes.push("Director would lock: " + plan.preset + " · " + plan.width + "x" + plan.height);
  }

  return {
    ok: true,
    agent: "G2P-X",
    affiliated: "G2P Technologies only",
    grok: false,
    xai: false,
    version: G2PX_VERSION,
    engine: ENGINE_VERSION,
    rubric: rub.scores,
    quality: rub.quality,
    holes: rub.holes,
    winner: b && rub.quality >= 0.6 ? "B" : a ? "A" : "plan",
    directed: plan && plan.directedPrompt,
    notes,
    summary:
      rub.holes.length === 0
        ? "G2P-X: shot language is complete enough to send to WAN."
        : "G2P-X holes: " + rub.holes.join("; "),
  };
}
