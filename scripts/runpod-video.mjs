#!/usr/bin/env node
/**
 * Optimized RunPod WAN client (async + optional wait).
 *
 *   $env:RUNPOD_API_KEY="..."
 *   $env:RUNPOD_VIDEO_ENDPOINT_ID="36t7uk060cachv"
 *   $env:RUNPOD_VIDEO_MODE="run"
 *   node scripts/runpod-video.mjs "cinematic ocean sunset"
 *   node scripts/runpod-video.mjs --wait "cinematic ocean sunset"
 *   node scripts/runpod-video.mjs --status JOB_ID
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const KEY_FOLDERS = ["secrets", "g2p run key", "g2p-run-key", "g2p_run_key", ".secrets"];
const KEY_NAMES = ["RUNPOD_API_KEY", "runpod_api_key", "runpod_api_key.txt", "api_key", "api_key.txt", "key", "key.txt"];
const EP_NAMES = ["RUNPOD_VIDEO_ENDPOINT_ID", "runpod_video_endpoint_id", "runpod_video_endpoint_id.txt", "endpoint_id", "endpoint_id.txt", "endpoint", "endpoint.txt"];

function readLine(p) {
  try {
    if (!existsSync(p) || !statSync(p).isFile()) return "";
    return (
      readFileSync(p, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#")) || ""
    );
  } catch {
    return "";
  }
}

function find(names, allowSingle = false) {
  for (const root of [process.cwd(), "/workspace"]) {
    for (const folder of KEY_FOLDERS) {
      const dir = resolve(root, folder);
      if (!existsSync(dir)) continue;
      for (const n of names) {
        const v = readLine(join(dir, n));
        if (v) return v;
      }
      if (allowSingle) {
        const files = readdirSync(dir).filter((n) => !n.startsWith(".") && !n.endsWith(".md"));
        const only = files
          .map((n) => join(dir, n))
          .filter((p) => {
            try {
              return statSync(p).isFile();
            } catch {
              return false;
            }
          });
        if (only.length === 1) {
          const v = readLine(only[0]);
          if (v) return v;
        }
      }
    }
  }
  return "";
}

function normalizeEndpoint(raw) {
  let s = String(raw || "").trim();
  let path = /runsync/i.test(s) ? "runsync" : "run";
  s = s.replace(/^https?:\/\/api\.runpod\.ai\/v2\//i, "");
  s = s.replace(/^https?:\/\/[^/]+\//i, "");
  s = s.replace(/\/(runsync|run|status)(\/.*)?$/i, "");
  s = s.replace(/^\/+|\/+$/g, "");
  const mode = process.env.RUNPOD_VIDEO_MODE?.trim().toLowerCase();
  if (mode === "runsync" || mode === "sync") path = "runsync";
  if (mode === "run" || mode === "async") path = "run";
  return { id: s, path };
}

function extractVideoRef(data) {
  if (!data || typeof data !== "object") return undefined;
  for (const key of ["video_url", "url", "video", "mp4", "result"]) {
    if (typeof data[key] === "string" && data[key].length > 8) return data[key];
  }
  if (typeof data.output === "string" && data.output.length > 8) return data.output;
  if (data.output && typeof data.output === "object") return extractVideoRef(data.output);
  return undefined;
}

const apiKey = process.env.RUNPOD_API_KEY?.trim() || find(KEY_NAMES, true);
const endpointId = process.env.RUNPOD_VIDEO_ENDPOINT_ID?.trim() || find(EP_NAMES, false);

const args = process.argv.slice(2);
const wait = args.includes("--wait");
const statusIdx = args.indexOf("--status");
const statusId = statusIdx >= 0 ? args[statusIdx + 1] : null;
const prompt = args.filter((a, i) => a !== "--wait" && a !== "--status" && i !== statusIdx + 1).join(" ").trim();

if (!apiKey || !endpointId) {
  console.error("Missing RUNPOD_API_KEY and/or RUNPOD_VIDEO_ENDPOINT_ID");
  process.exit(1);
}

const { id: endpointIdClean, path: runPath } = normalizeEndpoint(endpointId);
if (!endpointIdClean) {
  console.error("Invalid endpoint id");
  process.exit(1);
}
const base = `https://api.runpod.ai/v2/${endpointIdClean}`;
const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

if (statusId) {
  const st = await fetch(`${base}/status/${statusId}`, { headers });
  const sj = await st.json().catch(() => ({}));
  console.log(JSON.stringify({ ...sj, video: extractVideoRef(sj) }, null, 2));
  process.exit(sj.status === "FAILED" ? 1 : 0);
}

if (!prompt) {
  console.error(`Usage:
  node scripts/runpod-video.mjs "prompt"
  node scripts/runpod-video.mjs --wait "prompt"
  node scripts/runpod-video.mjs --status JOB_ID
`);
  process.exit(1);
}

let lora;
try {
  if (process.env.RUNPOD_LORA_JSON) lora = JSON.parse(process.env.RUNPOD_LORA_JSON);
} catch {
  /* ignore */
}

const input = {
  prompt,
  positive_prompt: prompt,
  negative_prompt:
    process.env.RUNPOD_NEGATIVE ||
    "blurry, low quality, watermark, text overlay, worst quality, jpeg artifacts",
  width: Number(process.env.RUNPOD_WIDTH || 480),
  height: Number(process.env.RUNPOD_HEIGHT || 832),
  length: Number(process.env.RUNPOD_LENGTH || 81),
  steps: Number(process.env.RUNPOD_STEPS || 10),
  cfg: Number(process.env.RUNPOD_CFG || 2),
};
if (lora) {
  input.lora_pairs = lora;
  input.loras = lora;
}
if (process.env.RUNPOD_IMAGE_URL) input.image_url = process.env.RUNPOD_IMAGE_URL;

const runRes = await fetch(`${base}/${runPath}`, {
  method: "POST",
  headers,
  body: JSON.stringify({ input }),
});
const runJson = await runRes.json().catch(() => ({}));
if (!runRes.ok) {
  console.error("Run failed:", runRes.status, runJson);
  process.exit(1);
}

const jobId = runJson.id;
const inlineVideo = extractVideoRef(runJson);
console.log(
  JSON.stringify(
    {
      submitted: true,
      jobId,
      status: runJson.status,
      mode: runPath,
      video: inlineVideo || null,
      endpoint: endpointIdClean,
    },
    null,
    2,
  ),
);

if ((!wait && runPath !== "runsync") || !jobId) process.exit(0);

let delay = 2000;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, delay));
  delay = Math.min(delay + 1000, 8000);
  const st = await fetch(`${base}/status/${jobId}`, { headers });
  const sj = await st.json().catch(() => ({}));
  const vid = extractVideoRef(sj);
  console.log(`[${i + 1}] status=${sj.status}${vid ? " video=yes" : ""}`);
  if (sj.status === "COMPLETED") {
    console.log(JSON.stringify({ ...sj, video: vid }, null, 2));
    process.exit(0);
  }
  if (sj.status === "FAILED" || sj.status === "CANCELLED" || sj.status === "TIMED_OUT") {
    console.error(JSON.stringify(sj, null, 2));
    process.exit(1);
  }
}
console.error("Timed out; poll later:");
console.error(`  node scripts/runpod-video.mjs --status ${jobId}`);
process.exit(2);
