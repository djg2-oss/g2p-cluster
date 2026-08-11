import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, FlipHorizontal2, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encodeFrame, type VisionFeatures } from "@/lib/agent/live-vision";
import { useAgentStore } from "@/lib/agent/store";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function LiveCamera({ open, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevFrame = useRef<ImageData | null>(null);
  const timerRef = useRef<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [last, setLast] = useState<VisionFeatures | null>(null);
  const [auto, setAuto] = useState(false);
  const ingestVision = useAgentStore((s) => s.ingestVision);

  const stop = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    prevFrame.current = null;
    setLive(false);
    setAuto(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera API not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
      setLive(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Permission denied or no camera.";
      setError(msg);
      setLive(false);
    }
  }, [facing, stop]);

  const sampleOnce = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !live) return null;
    const w = Math.min(320, v.videoWidth || 320);
    const h = Math.min(240, v.videoHeight || 240);
    if (!v.videoWidth) return null;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    const { features, imageData } = encodeFrame(ctx, w, h, prevFrame.current);
    prevFrame.current = imageData;
    setLast(features);
    return features;
  }, [live]);

  const pushToAgent = useCallback(
    (f: VisionFeatures) => {
      ingestVision(f);
    },
    [ingestVision],
  );

  useEffect(() => {
    if (!open) stop();
    return () => stop();
  }, [open, stop]);

  useEffect(() => {
    if (!auto || !live) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = window.setInterval(() => {
      const f = sampleOnce();
      if (f && f.motion > 0.08) pushToAgent(f);
    }, 2500);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [auto, live, sampleOnce, pushToAgent]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Live camera"
        className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] sm:rounded-[var(--radius-xl)]"
      >
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--color-fg)]">Live camera</h2>
          <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">
            Desktop or phone browser. Encode runs on your device. Features only — you control start/stop.
          </p>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div
            className={cn(
              "relative aspect-video overflow-hidden rounded-[var(--radius-md)] bg-black",
              !live && "flex items-center justify-center",
            )}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn("h-full w-full object-cover", !live && "hidden")}
            />
            {!live && (
              <span className="text-[12px] text-[var(--color-fg-subtle)]">Camera off</span>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {error && (
            <p className="text-[12px] text-[var(--color-danger,#e07a6a)]">{error}</p>
          )}
          {last && (
            <p className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--color-fg-muted)]">
              {last.summary}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!live ? (
              <Button type="button" onClick={() => void start()}>
                <Camera className="size-4" />
                Allow camera
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={stop}>
                <CameraOff className="size-4" />
                Stop
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!live}
              onClick={() => {
                const f = sampleOnce();
                if (f) pushToAgent(f);
              }}
            >
              <Scan className="size-4" />
              Sample frame
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFacing((f) => (f === "user" ? "environment" : "user"));
                if (live) void start();
              }}
            >
              <FlipHorizontal2 className="size-4" />
              {facing === "user" ? "Front" : "Back"}
            </Button>
          </div>

          <label className="flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
            <input
              type="checkbox"
              checked={auto}
              disabled={!live}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Auto-sample on motion (~2.5s) into memory
          </label>

          <p className="text-[11px] text-[var(--color-fg-subtle)]">
            Legal use only. No hidden recording. Stream stays on your device; agent stores feature cards, not video files.
          </p>
        </div>

        <div className="border-t border-[var(--color-border)] p-3">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// silence unused if tree-shaken oddly
