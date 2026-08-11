import {
  Brain,
  Calculator,
  Compass,
  Code2,
  Eraser,
  GraduationCap,
  PanelLeftClose,
  Sparkles,
  UserRoundPen,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentMode, MODE_META, PILLARS, AGENT_VERSION } from "@/lib/agent/system-definition";
import { useAgentStore } from "@/lib/agent/store";
import { CURRICULUM } from "@/lib/agent/training/curriculum";
import { cn } from "@/lib/utils";

const ICONS: Record<AgentMode, typeof Brain> = {
  companion: Sparkles,
  math: Calculator,
  life: Compass,
  build: Code2,
};

export function Sidebar({
  open,
  onClose,
  onOpenDef,
  onOpenTrain,
  onOpenDesign,
  onOpenCamera,
}: {
  open: boolean;
  onClose: () => void;
  onOpenDef: () => void;
  onOpenTrain: () => void;
  onOpenDesign: () => void;
  onOpenCamera: () => void;
}) {
  const mode = useAgentStore((s) => s.mode);
  const setMode = useAgentStore((s) => s.setMode);
  const setModeLocked = useAgentStore((s) => s.setModeLocked);
  const clear = useAgentStore((s) => s.clear);
  const identity = useAgentStore((s) => s.identity);
  const progress = useAgentStore((s) => s.trainProgress);
  const done = CURRICULUM.filter((m) => progress[m.id] === "done").length;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(100%,20rem)] flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] pt-[var(--grok-banner-h,0px)] transition-transform duration-200 md:static md:z-0 md:translate-x-0 md:pt-0",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-[var(--color-fg-subtle)]">
              G2P Technologies
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--color-fg)]">
              {identity.name}
            </h1>
            <p className="text-[11px] text-[var(--color-fg-muted)]">
              v{AGENT_VERSION} · {identity.gender} · {identity.pronouns}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose} aria-label="Close">
            <PanelLeftClose className="size-4" />
          </Button>
        </div>

        <div className="agent-scroll flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
            Mode
          </p>
          <div className="flex flex-col gap-1">
            {(Object.keys(MODE_META) as AgentMode[]).map((m) => {
              const Icon = ICONS[m];
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    onClose();
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors",
                    active
                      ? "bg-[var(--color-bg-subtle)] text-[var(--color-fg)]"
                      : "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-fg)]",
                  )}
                >
                  <Icon
                    className="mt-0.5 size-4 shrink-0"
                    style={{ color: active ? MODE_META[m].accent : undefined }}
                  />
                  <span>
                    <span className="block text-sm font-medium">{MODE_META[m].label}</span>
                    <span className="block text-[11px] text-[var(--color-fg-subtle)]">
                      {MODE_META[m].short}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mb-2 mt-6 px-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
            Presence
          </p>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-[12px] text-[var(--color-fg-muted)]">
            Cool · calm · collected · human. In tune. Short. Sharp. Female until you design me.
            {identity.traits.length > 0 && (
              <p className="mt-1 text-[var(--color-fg-subtle)]">
                Traits: {identity.traits.join(" · ")}
              </p>
            )}
          </div>

          <p className="mb-2 mt-6 px-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
            Pillars
          </p>
          <div className="space-y-2">
            {PILLARS.map((p) => (
              <div
                key={p.id}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5"
              >
                <div className="text-sm font-medium text-[var(--color-fg)]">{p.title}</div>
                <p className="mt-1 text-[12px] leading-snug text-[var(--color-fg-muted)]">{p.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-[var(--color-border)] p-3">
          <Button
            variant="default"
            className="w-full justify-start"
            onClick={() => {
              onOpenCamera();
              onClose();
            }}
          >
            <Camera className="size-4" />
            Live camera
          </Button>
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={() => {
              onOpenDesign();
              onClose();
            }}
          >
            <UserRoundPen className="size-4" />
            Design me
          </Button>
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={() => {
              onOpenTrain();
              onClose();
            }}
          >
            <GraduationCap className="size-4" />
            Training ({done}/{CURRICULUM.length})
          </Button>
          <Button variant="ghost" className="w-full justify-start" onClick={onOpenDef}>
            <Brain className="size-4" />
            System definition
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => {
              clear();
              onClose();
            }}
          >
            <Eraser className="size-4" />
            Clear conversation
          </Button>
        </div>
      </aside>
    </>
  );
}
