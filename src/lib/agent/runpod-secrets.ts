/**
 * Load RunPod secrets (server-only).
 * Only two values needed for video:
 *   RUNPOD_API_KEY
 *   RUNPOD_VIDEO_ENDPOINT_ID
 *
 * Sources (in order): process.env, then secrets/ or "g2p run key/" files.
 * No S3 URL required for serverless video.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR_NAMES = ["secrets", "g2p run key", "g2p-run-key", "g2p_run_key", ".secrets"];

const KEY_FILES = [
  "RUNPOD_API_KEY",
  "runpod_api_key.txt",
  "runpod_api_key",
  "api_key.txt",
  "key.txt",
];

const ENDPOINT_FILES = [
  "RUNPOD_VIDEO_ENDPOINT_ID",
  "runpod_video_endpoint_id.txt",
  "runpod_video_endpoint_id",
  "endpoint_id.txt",
  "endpoint.txt",
];

function candidates(): string[] {
  const roots = [process.cwd(), "/workspace", join(process.cwd(), "..")];
  const out: string[] = [];
  for (const r of roots) {
    for (const d of DIR_NAMES) out.push(join(r, d));
  }
  return out;
}

function readOneLine(path: string): string {
  if (!existsSync(path)) return "";
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      if (/^RUNPOD_API_KEY\s*=/.test(s)) return s.split("=", 2)[1]?.trim() || "";
      if (/^RUNPOD_VIDEO_ENDPOINT_ID\s*=/.test(s))
        return s.split("=", 2)[1]?.trim() || "";
      if (s.includes("=") && /key|endpoint|id/i.test(s.split("=", 1)[0] || "")) {
        return s.split("=", 2)[1]?.trim() || "";
      }
      if (s.length >= 8) return s;
    }
  } catch {
    return "";
  }
  return "";
}

function findInDir(dir: string, names: string[]): string {
  for (const n of names) {
    const v = readOneLine(join(dir, n));
    if (v) return v;
  }
  try {
    if (!existsSync(dir)) return "";
    const files = readdirSync(dir).filter(
      (f) => !f.startsWith(".") && !/^readme/i.test(f) && !f.endsWith(".example"),
    );
    if (files.length === 1 && names === KEY_FILES) {
      return readOneLine(join(dir, files[0]));
    }
  } catch {
    /* ignore */
  }
  return "";
}

export type RunPodSecrets = {
  apiKey: string;
  endpointId: string;
  source: "env" | "file" | "mixed" | "none";
  dir?: string;
};

/** Resolve RunPod credentials: env first, then secrets files. */
export function loadRunPodSecrets(): RunPodSecrets {
  let apiKey = process.env.RUNPOD_API_KEY?.trim() || "";
  let endpointId =
    process.env.RUNPOD_VIDEO_ENDPOINT_ID?.trim() || "36t7uk060cachv";
  const fromEnvKey = !!apiKey;
  const fromEnvEp = !!endpointId;
  let dirUsed: string | undefined;

  for (const dir of candidates()) {
    if (!existsSync(dir)) continue;
    if (!apiKey) {
      const k = findInDir(dir, KEY_FILES);
      if (k) {
        apiKey = k;
        dirUsed = dir;
      }
    }
    if (!endpointId) {
      const e = findInDir(dir, ENDPOINT_FILES);
      if (e) {
        endpointId = e;
        dirUsed = dir;
      }
    }
    if (existsSync(join(dir, "runpod.env"))) {
      try {
        const full = readFileSync(join(dir, "runpod.env"), "utf8");
        for (const line of full.split(/\r?\n/)) {
          const s = line.trim();
          if (s.startsWith("RUNPOD_API_KEY=") && !apiKey) apiKey = s.slice(15).trim();
          if (s.startsWith("RUNPOD_VIDEO_ENDPOINT_ID=") && !endpointId)
            endpointId = s.slice(25).trim();
        }
        dirUsed = dirUsed || dir;
      } catch {
        /* ignore */
      }
    }
  }

  let source: RunPodSecrets["source"] = "none";
  if ((fromEnvKey || fromEnvEp) && dirUsed) source = "mixed";
  else if (fromEnvKey || fromEnvEp) source = "env";
  else if (apiKey || endpointId) source = "file";

  return { apiKey, endpointId, source, dir: dirUsed };
}
