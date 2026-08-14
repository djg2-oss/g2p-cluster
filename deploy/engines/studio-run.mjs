/**
 * G2P Studio run — today's best path (no xAI).
 *
 * ANALYZE → DIRECTOR DRAFT → CRITIC → EDIT PROMPT → WAN 2.2
 * Same series idea as the dual-engine agent, applied to media.
 */
import { planVideo, runVideoJob, directorLegalBlock } from "./video-director.mjs";

export const STUDIO_RUN_VERSION = "g2p-studio-run-v1";

function critiqueShot(original, directed) {
  const holes = [];
  const d = directed || "";
  const o = original || "";
  if (!/\b(camera|orbit|pan|dolly|handheld|static|tracking|crane)\b/i.test(d)) {
    holes.push("add explicit camera move");
  }
  if (!/\b(light|lighting|key|rim|softbox|golden|neon|overcast)\b/i.test(d)) {
    holes.push("add lighting language");
  }
  if (o.split(/\s+/).length < 6) holes.push("subject too thin — keep who/what/where");
  if (!/\b(coherent|stable|consistent)\b/i.test(d)) holes.push("lock identity / coherent motion");
  return holes;
}

function editShot(directed, holes) {
  let out = directed.trim();
  if (holes.includes("add explicit camera move") && !/camera/i.test(out)) {
    out += " Smooth intentional camera motion.";
  }
  if (holes.includes("add lighting language") && !/light/i.test(out)) {
    out += " Motivated cinematic lighting.";
  }
  if (holes.includes("lock identity / coherent motion")) {
    out += " Consistent subject, no morph, coherent motion.";
  }
  return out;
}

const queue = [];
let busy = false;
const recent = [];

export function queueSnapshot() {
  return {
    version: STUDIO_RUN_VERSION,
    busy,
    waiting: queue.length,
    recent: recent.slice(-12),
  };
}

export async function runStudioJob(body = {}) {
  const text = String(body.text || body.prompt || "").trim();
  if (!text) return { ok: false, error: "text required" };

  const block = directorLegalBlock(text);
  if (block) return { ok: false, blocked: true, error: block };

  const plan = planVideo(text, body);
  if (!plan.ok) return plan;

  const holes = critiqueShot(text, plan.directedPrompt);
  const refined = editShot(plan.directedPrompt, holes);
  plan.directedPrompt = refined;
  plan.criticHoles = holes;
  plan.studioRun = STUDIO_RUN_VERSION;

  if (body.planOnly) {
    return {
      ok: true,
      submitted: false,
      plan,
      message: "Director + critic plan (no GPU).",
    };
  }

  const out = await runVideoJob(refined, { ...body, skipPlanWrap: true, prePlan: plan });
  const rec = {
    at: Date.now(),
    prompt: text.slice(0, 120),
    jobId: out.jobId || null,
    submitted: !!out.submitted,
    status: out.status || (out.submitted ? "IN_QUEUE" : "plan"),
  };
  recent.push(rec);
  if (recent.length > 40) recent.shift();
  return { ...out, plan, criticHoles: holes };
}

export function enqueueStudioJob(body) {
  return new Promise((resolve) => {
    queue.push({ body, resolve });
    drain();
  });
}

async function drain() {
  if (busy) return;
  const next = queue.shift();
  if (!next) return;
  busy = true;
  try {
    next.resolve(await runStudioJob(next.body));
  } catch (e) {
    next.resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
  } finally {
    busy = false;
    if (queue.length) setTimeout(drain, 50);
  }
}
