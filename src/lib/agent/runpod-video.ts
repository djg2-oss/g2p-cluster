/**
 * RunPod video — optional side path only.
 * Core agent intelligence does NOT use this.
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
  // Exclude phenome / memory questions
  if (
    /\b(how do you|how does|memory|iconic|echoic|see video|process video|understand)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return (
    /\b(generate|create|make|render|produce|shoot)\b.{0,40}\b(video|clip|footage|animation|cinematic)\b/i.test(
      t,
    ) ||
    /\b(video|clip)\b.{0,40}\b(generate|create|make|render|of|showing|about)\b/i.test(t) ||
    /\b(wan|runpod)\b.{0,30}\b(video|clip)\b/i.test(t)
  );
}

/** Pull a usable prompt from the user message. */
export function extractVideoPrompt(text: string): string {
  const cleaned = text
    .replace(
      /\b(please|can you|could you|generate|create|make|render|produce|a|an|the|video|clip|footage|of|showing|about)\b/gi,
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
  const lines = [
    "**Video job submitted** (RunPod — side path only).",
    `Prompt: ${prompt.slice(0, 200)}`,
    `Job: ${result.jobId} · status: ${result.status}`,
  ];
  if (result.videoUrl) lines.push(`URL: ${result.videoUrl}`);
  else lines.push("Poll status on RunPod dashboard or re-ask with job id when ready.");
  lines.push("Coding, business, marketing, iconic/echoic memory — unaffected.");
  return lines.join("\n");
}
