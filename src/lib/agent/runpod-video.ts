/**
 * RunPod video — optional side path only.
 * Core agent intelligence does NOT use this for math/life/build.
 * Env (server only): RUNPOD_API_KEY, RUNPOD_VIDEO_ENDPOINT_ID
 */

export const RUNPOD_VIDEO_ENV = {
  apiKey: "RUNPOD_API_KEY",
  endpointId: "RUNPOD_VIDEO_ENDPOINT_ID",
} as const;

/** True only when Companion clearly wants generated video (not "video memory" talk). */
export function isVideoGenerateIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (
    /\b(how do you|how does|memory|iconic|echoic|see video|process video|understand)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return (
    /\b(generate|create|make|render|produce|shoot|direct)\b.{0,40}\b(video|clip|footage|animation|cinematic)\b/i.test(
      t,
    ) ||
    /\b(video|clip)\b.{0,40}\b(generate|create|make|render|of|showing|about)\b/i.test(t) ||
    /\b(wan|runpod|director)\b.{0,30}\b(video|clip)\b/i.test(t) ||
    /\b(video director|direct a (video|shot|clip))\b/i.test(t)
  );
}

/** Pull a usable prompt from the user message. */
export function extractVideoPrompt(text: string): string {
  const cleaned = text
    .replace(
      /\b(please|can you|could you|generate|create|make|render|produce|a|an|the|video|clip|footage|of|showing|about|direct)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 8 ? cleaned : text.trim().slice(0, 500);
}

export type RunPodVideoResult =
  | {
      ok: true;
      jobId: string;
      status: string;
      videoUrl?: string;
      director?: {
        preset: string;
        mode: string;
        directedPrompt: string;
        draft: boolean;
        notes: string[];
      };
    }
  | {
      ok: false;
      error: string;
      missingEnv?: string[];
    };

export function videoIntentReply(result: RunPodVideoResult, prompt: string): string {
  if (!result.ok) {
    if (result.missingEnv?.length) {
      return [
        "Video path is ready, but server env is incomplete.",
        `Set: ${result.missingEnv.join(", ")}`,
        "Vercel → Settings → Environment Variables → Redeploy.",
        "Core agent (code, business, memory) is unchanged.",
      ].join("\n");
    }
    return `Video request failed: ${result.error}\nCore agent tasks are unaffected.`;
  }
  const d = result.director;
  const lines = [
    "**G2P Video Director → RunPod**",
    d
      ? `Preset **${d.preset}** · mode **${d.mode}** · ${d.draft ? "draft" : "final"}`
      : "Director plan applied on server.",
    "",
    d?.directedPrompt
      ? `Directed: ${d.directedPrompt.slice(0, 280)}${d.directedPrompt.length > 280 ? "…" : ""}`
      : `Source: ${prompt.slice(0, 200)}`,
    "",
    `Job: \`${result.jobId}\` · **${result.status}**`,
  ];
  if (result.videoUrl) lines.push(`Video: ${result.videoUrl}`);
  else
    lines.push(
      `Still rendering — poll: node scripts/runpod-video.mjs --status ${result.jobId}`,
    );
  if (d?.notes?.length) {
    lines.push("", ...d.notes.slice(0, 4).map((n) => `· ${n}`));
  }
  lines.push("", "Core genius stack (code/business/memory) untouched.");
  return lines.join("\n");
}
