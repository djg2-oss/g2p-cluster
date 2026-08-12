/**
 * Server-only RunPod video runner (WAN 2.2 + LoRA optimized).
 * Primary GPU path — no Railway required.
 * Env: RUNPOD_API_KEY, RUNPOD_VIDEO_ENDPOINT_ID
 * Optional: RUNPOD_VIDEO_MODE=run|runsync, RUNPOD_LORA_JSON, RUNPOD_NEGATIVE
 */
import { createServerFn } from "@tanstack/react-start";
import { extractVideoPrompt, type RunPodVideoResult } from "./runpod-video";
import { loadRunPodSecrets } from "./runpod-secrets";
import { planVideo, type DirectorPlan } from "./video-director";

export type VideoGenOpts = {
  waitMs?: number;
  imageBase64?: string;
  imageUrl?: string;
  negativePrompt?: string;
  /** e.g. [{ name: "my_lora", strength: 0.8 }] */
  loraPairs?: Array<{ name?: string; path?: string; strength?: number }>;
  width?: number;
  height?: number;
  length?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
};

function normalizeEndpointId(raw: string): { id: string; path: "run" | "runsync" } {
  let s = raw.trim();
  let path: "run" | "runsync" = "run";
  if (/runsync/i.test(s)) path = "runsync";
  s = s.replace(/^https?:\/\/api\.runpod\.ai\/v2\//i, "");
  s = s.replace(/^https?:\/\/[^/]+\//i, "");
  s = s.replace(/\/(runsync|run|status)(\/.*)?$/i, "");
  s = s.replace(/^\/+|\/+$/g, "");
  const mode = process.env.RUNPOD_VIDEO_MODE?.trim().toLowerCase();
  if (mode === "runsync" || mode === "sync") path = "runsync";
  if (mode === "run" || mode === "async") path = "run";
  return { id: s, path };
}

function defaultNegative(): string {
  return (
    process.env.RUNPOD_NEGATIVE?.trim() ||
    "blurry, low quality, watermark, text overlay, worst quality, jpeg artifacts"
  );
}

function envLoraPairs(): VideoGenOpts["loraPairs"] {
  const raw = process.env.RUNPOD_LORA_JSON?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as VideoGenOpts["loraPairs"];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Pull video URL / base64 hint from varied worker output shapes */
function extractVideoRef(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  for (const key of ["video_url", "url", "video", "mp4", "result"]) {
    const v = d[key];
    if (typeof v === "string" && v.length > 8) return v;
  }
  const output = d.output;
  if (typeof output === "string" && output.length > 8) return output;
  if (output && typeof output === "object") {
    return extractVideoRef(output);
  }
  return undefined;
}

function buildInput(prompt: string, opts?: VideoGenOpts): Record<string, unknown> {
  const inputPrompt = extractVideoPrompt(prompt);
  const lora = opts?.loraPairs ?? envLoraPairs();
  const input: Record<string, unknown> = {
    prompt: inputPrompt,
    positive_prompt: inputPrompt,
    negative_prompt: opts?.negativePrompt || defaultNegative(),
    // WAN-friendly defaults (worker ignores unknown keys)
    width: opts?.width ?? 480,
    height: opts?.height ?? 832,
    length: opts?.length ?? 81,
    steps: opts?.steps ?? 10,
    cfg: opts?.cfg ?? 2.0,
  };
  if (opts?.seed != null) input.seed = opts.seed;
  let img = opts?.imageBase64;
  if (img?.startsWith("data:")) img = img.split(",", 1)[1];
  if (img) input.image_base64 = img;
  if (opts?.imageUrl) input.image_url = opts.imageUrl;
  if (lora?.length) {
    input.lora_pairs = lora;
    input.loras = lora; // alternate key some workers use
  }
  return input;
}

async function pollStatus(
  base: string,
  apiKey: string,
  jobId: string,
  waitMs: number,
): Promise<{ status: string; videoUrl?: string; error?: string }> {
  const deadline = Date.now() + waitMs;
  let delay = 2000;
  let status = "IN_QUEUE";
  let videoUrl: string | undefined;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay + 1000, 8000); // backoff 2s → 8s
    const st = await fetch(`${base}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const sj = (await st.json().catch(() => ({}))) as Record<string, unknown>;
    status = String(sj.status || status);
    videoUrl = extractVideoRef(sj) || videoUrl;
    if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" || status === "TIMED_OUT") {
      if (status !== "COMPLETED") {
        return {
          status,
          error: String(sj.error || sj.detail || `RunPod job ${status}`),
        };
      }
      return { status, videoUrl };
    }
  }
  return { status, videoUrl, error: videoUrl ? undefined : "Poll timeout — job still running on RunPod" };
}

export async function runPodVideoGenerate(
  prompt: string,
  opts?: VideoGenOpts & { useDirector?: boolean },
): Promise<RunPodVideoResult & { director?: DirectorPlan }> {
  const secrets = loadRunPodSecrets();
  const missing: string[] = [];
  if (!secrets.apiKey) missing.push("RUNPOD_API_KEY");
  if (!secrets.endpointId) missing.push("RUNPOD_VIDEO_ENDPOINT_ID");
  if (missing.length) {
    return { ok: false, error: "Missing secrets", missingEnv: missing };
  }

  const { apiKey, endpointId: rawEndpoint } = secrets;
  const { id: endpointId, path: runPath } = normalizeEndpointId(rawEndpoint);
  if (!endpointId) {
    return { ok: false, error: "Invalid RUNPOD_VIDEO_ENDPOINT_ID" };
  }
  const base = `https://api.runpod.ai/v2/${endpointId}`;
  const useDirector = opts?.useDirector !== false;
  let director: DirectorPlan | undefined;
  let effectivePrompt = prompt;
  let mergedOpts: VideoGenOpts = { ...opts };
  if (useDirector) {
    const plan = planVideo(prompt, {
      hasImage: !!(opts?.imageBase64 || opts?.imageUrl),
    });
    if (!plan.ok) {
      return { ok: false, error: plan.reason };
    }
    director = plan;
    effectivePrompt = plan.directedPrompt;
    mergedOpts = {
      ...mergedOpts,
      negativePrompt: mergedOpts.negativePrompt || plan.negativePrompt,
      width: mergedOpts.width ?? plan.width,
      height: mergedOpts.height ?? plan.height,
      length: mergedOpts.length ?? plan.length,
      steps: mergedOpts.steps ?? plan.steps,
      cfg: mergedOpts.cfg ?? plan.cfg,
      loraPairs: mergedOpts.loraPairs ?? plan.loraPairs,
    };
  }
  const input = buildInput(effectivePrompt, mergedOpts);

  try {
    const runRes = await fetch(`${base}/${runPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });

    const runJson = (await runRes.json().catch(() => ({}))) as Record<string, unknown>;

    if (!runRes.ok) {
      return {
        ok: false,
        error:
          String(runJson.error || runJson.detail || runJson.title || "") ||
          `RunPod HTTP ${runRes.status}`,
      };
    }

    let videoUrl = extractVideoRef(runJson);
    let status = String(runJson.status || "IN_QUEUE");
    const jobId = String(runJson.id || "");

    // runsync may complete inline
    if (videoUrl && (status === "COMPLETED" || runPath === "runsync")) {
      return { ok: true, jobId: jobId || "sync", status: status || "COMPLETED", videoUrl };
    }

    if (!jobId) {
      return { ok: false, error: "No job id from RunPod" };
    }

    const waitMs = opts?.waitMs ?? 0;
    if (waitMs > 0 && !videoUrl) {
      const polled = await pollStatus(base, apiKey, jobId, waitMs);
      status = polled.status;
      videoUrl = polled.videoUrl || videoUrl;
      if (polled.error && !videoUrl) {
        return { ok: false, error: polled.error };
      }
    }

    return { ok: true, jobId, status, videoUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const generateVideoFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      prompt: string;
      waitMs?: number;
      imageBase64?: string;
      imageUrl?: string;
      negativePrompt?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    // Agent path: async default (waitMs 0) so chat stays fast
    return runPodVideoGenerate(data.prompt, {
      waitMs: data.waitMs ?? 0,
      imageBase64: data.imageBase64,
      imageUrl: data.imageUrl,
      negativePrompt: data.negativePrompt,
      useDirector: true,
    });
  });
