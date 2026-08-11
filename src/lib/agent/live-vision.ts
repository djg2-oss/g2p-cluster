/**
 * On-device live vision sampling.
 * Encoder runs in the Companion's browser (desktop or phone camera) —
 * not on a remote server. Frames → features → multimodal memory cards.
 */

export type VisionFeatures = {
  at: number;
  width: number;
  height: number;
  /** 0–1 mean luminance */
  brightness: number;
  /** rough RGB dominance */
  dominant: "warm" | "cool" | "neutral" | "dark" | "bright";
  /** 0–1 change vs previous frame */
  motion: number;
  /** short human-readable feature line */
  summary: string;
};

export type LiveVisionState = {
  active: boolean;
  framesSampled: number;
  last?: VisionFeatures;
  facingMode: "user" | "environment";
};

export const EMPTY_LIVE_VISION: LiveVisionState = {
  active: false,
  framesSampled: 0,
  facingMode: "user",
};

/** Sample one video frame from a canvas; optional prev for motion */
export function encodeFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  prev?: ImageData | null,
): { features: VisionFeatures; imageData: ImageData } {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  // subsample for speed
  const step = 16 * 4;
  for (let i = 0; i < d.length; i += step) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n++;
  }
  r /= n;
  g /= n;
  b /= n;
  const brightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  let dominant: VisionFeatures["dominant"] = "neutral";
  if (brightness < 0.18) dominant = "dark";
  else if (brightness > 0.82) dominant = "bright";
  else if (r > g + 12 && r > b + 8) dominant = "warm";
  else if (b > r + 10 && b >= g) dominant = "cool";

  let motion = 0;
  if (prev && prev.data.length === d.length) {
    let diff = 0;
    let m = 0;
    const mstep = 32 * 4;
    for (let i = 0; i < d.length; i += mstep) {
      diff += Math.abs(d[i] - prev.data[i]) + Math.abs(d[i + 1] - prev.data[i + 1]);
      m++;
    }
    motion = Math.min(1, diff / (m * 255 * 2));
  }

  const summary = [
    `${width}x${height}`,
    `bright ${(brightness * 100).toFixed(0)}%`,
    dominant,
    motion > 0.12 ? `motion ${(motion * 100).toFixed(0)}%` : "still",
  ].join(" · ");

  return {
    features: {
      at: Date.now(),
      width,
      height,
      brightness,
      dominant,
      motion,
      summary,
    },
    imageData,
  };
}

export function visionToUserNote(f: VisionFeatures): string {
  return `Live camera frame: ${f.summary}. (On-device encode — features only, not raw stream stored.)`;
}
