
import { useAgentStore } from "@/lib/agent/store";
import { cn } from "@/lib/utils";

const KIND_COLOR: Record<string, string> = {
  math: "var(--color-math)",
  life: "var(--color-life)",
  build: "var(--color-accent)",
  companion: "var(--color-companion)",
  design: "var(--color-fg-muted)",
  legal: "var(--color-danger)",
  general: "var(--color-fg-subtle)",
};

export function TopicRail() {
  const threads = useAgentStore((s) => s.memory.threads);
  const openLoops = useAgentStore((s) => s.memory.openLoops);
  const last = useAgentStore((s) => s.lastTopicKind);
  const modeLocked = useAgentStore((s) => s.modeLocked);
  const setMode = useAgentStore((s) => s.setMode);
  const setModeLocked = useAgentStore((s) => s.setModeLocked);

  if (!threads.length && !openLoops.length) return null;

  const top = [...threads].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);

  return (
    <div className="border-b border-[var(--color-border)] px-4 py-2 sm:px-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
            Live topics
            {last ? ` · now: ${last}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setModeLocked(!modeLocked)}
            className="text-[10px] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
          >
            {modeLocked ? "Mode locked" : "Adaptive roam"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {top.map((th) => (
            <button
              key={th.id}
              type="button"
              title={th.notes[th.notes.length - 1]}
              onClick={() => {
                if (th.kind === "math") setMode("math");
                else if (th.kind === "life") setMode("life");
                else if (th.kind === "build") setMode("build");
                else setMode("companion");
              }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]",
                last === th.kind
                  ? "border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)]"
                  : "border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
              )}
              style={{
                boxShadow:
                  last === th.kind
                    ? `inset 0 0 0 1px ${KIND_COLOR[th.kind] || "transparent"}`
                    : undefined,
              }}
            >
              {th.label}
              <span className="ml-1 text-[var(--color-fg-subtle)]">{th.mentionCount}</span>
            </button>
          ))}
        </div>
        {openLoops[0] ? (
          <p className="truncate text-[11px] text-[var(--color-fg-subtle)]">
            Open: {openLoops[0]}
          </p>
        ) : null}
      </div>
    </div>
  );
}
