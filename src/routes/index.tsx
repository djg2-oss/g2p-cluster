import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/agent/Sidebar";
import { MessageList } from "@/components/agent/MessageList";
import { Composer } from "@/components/agent/Composer";
import { DefinitionModal } from "@/components/agent/DefinitionModal";
import { TrainingSchedule } from "@/components/agent/TrainingSchedule";
import { DesignMe } from "@/components/agent/DesignMe";
import { LiveCamera } from "@/components/agent/LiveCamera";
import { TopicRail } from "@/components/agent/TopicRail";
import { useAgentStore } from "@/lib/agent/store";
import { MODE_META } from "@/lib/agent/system-definition";

export const Route = createFileRoute("/")({ component: Home });

const QUICK: { label: string; text: string }[] = [
  { label: "Quadratic", text: "solve 2x^2 + 3x - 5 = 0" },
  { label: "Steady me", text: "I'm spiraling — help me stay calm and pick one next step." },
  { label: "Career", text: "Stuck between stable job and risky offer." },
  { label: "Who are you?", text: "Who are you?" },
];

function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [defOpen, setDefOpen] = useState(false);
  const [trainOpen, setTrainOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const messages = useAgentStore((s) => s.messages);
  const thinking = useAgentStore((s) => s.thinking);
  const mode = useAgentStore((s) => s.mode);
  const identity = useAgentStore((s) => s.identity);
  const send = useAgentStore((s) => s.send);

  return (
    <div className="flex h-[100dvh] flex-col bg-[var(--color-bg)] pt-[var(--grok-banner-h,0px)]">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onOpenDef={() => {
            setDefOpen(true);
            setSidebarOpen(false);
          }}
          onOpenTrain={() => {
            setTrainOpen(true);
            setSidebarOpen(false);
          }}
          onOpenDesign={() => {
            setDesignOpen(true);
            setSidebarOpen(false);
          }}
          onOpenCamera={() => {
            setCamOpen(true);
            setSidebarOpen(false);
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-3 sm:px-5">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[var(--color-fg)]">
                {identity.name}
                <span className="font-normal text-[var(--color-fg-muted)]">
                  {" "}
                  · {MODE_META[mode].label}
                </span>
              </div>
              <div className="truncate text-[12px] text-[var(--color-fg-muted)]">
                Calm · human · on-point · {MODE_META[mode].short}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCamOpen(true)}
              className="hidden rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] sm:inline"
            >
              Camera
            </button>
            <button
              type="button"
              onClick={() => setDesignOpen(true)}
              className="hidden rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] sm:inline"
            >
              Design me
            </button>
          </header>

          {!identity.designed && messages.length <= 2 && (
            <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2.5 text-center text-[12px] text-[var(--color-fg-muted)] sm:px-6">
              Female until you design —{" "}
              <button
                type="button"
                className="text-[var(--color-fg)] underline-offset-2 hover:underline"
                onClick={() => setDesignOpen(true)}
              >
                Design me
              </button>{" "}
              (name, gender, traits, look)
            </div>
          )}

          {messages.length <= 1 && (
            <div className="border-b border-[var(--color-border)] px-4 py-3 sm:px-6">
              <div className="mx-auto flex max-w-2xl flex-wrap gap-2">
                {QUICK.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => send(q.text)}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <TopicRail />
          <MessageList messages={messages} thinking={thinking} />
          <Composer />
        </div>
      </div>

      <DefinitionModal open={defOpen} onClose={() => setDefOpen(false)} />
      <TrainingSchedule open={trainOpen} onClose={() => setTrainOpen(false)} />
      <DesignMe open={designOpen} onClose={() => setDesignOpen(false)} />
      <LiveCamera open={camOpen} onClose={() => setCamOpen(false)} />
    </div>
  );
}
