/**
 * Engine-V — optional third-pass verify-only (Phase C).
 * Does not draft. Scores + light correction only.
 */
import { critique, trySolveMath, ENGINE_VERSION } from "./dual-engine.mjs";

export const VERIFY_VERSION = "g2p-verify-v1";

export function buildVerify({ host, text, refined }) {
  const content = refined?.content || "";
  const w = refined?.winner || "companion";
  const crit = critique(text, content, w);
  const solved = w === "math" ? trySolveMath(text) : null;

  const flags = [];
  if (solved && content.includes(solved.answerHint)) {
    flags.push("math-answer-present");
  } else if (solved) {
    flags.push("math-answer-missing");
  }
  if (crit.quality < 0.62) flags.push("quality-below-threshold");
  if (crit.scores.safety < 1) flags.push("safety-fail");

  let finalContent = content;
  if (solved && !content.includes(solved.answer)) {
    finalContent += `\n\n**Verify engine (${host}):** confirmed ${solved.answer}`;
  }
  if (crit.holes.length && crit.quality < 0.7) {
    finalContent += `\n\n**Verify notes:** ${crit.holes.slice(0, 3).join("; ")}`;
  }

  const pass = crit.quality >= 0.72 && crit.scores.safety === 1;
  return {
    stage: "verify",
    host,
    winner: w,
    confidence: pass ? "high" : crit.quality >= 0.55 ? "medium" : "low",
    content: finalContent,
    critique: crit,
    quality: crit.quality,
    flags,
    pass,
    engine: `${ENGINE_VERSION}+${VERIFY_VERSION}`,
  };
}
