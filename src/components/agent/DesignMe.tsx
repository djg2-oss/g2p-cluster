import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/lib/agent/store";
import {
  TRAIT_CATALOG,
  type AgentGender,
  type PresenceTraitId,
} from "@/lib/agent/companion-identity";
import { cn } from "@/lib/utils";

const GENDERS: { id: AgentGender; label: string }[] = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "neutral", label: "Neutral" },
  { id: "unspecified", label: "Unspecified" },
];

const FOCUS = [
  "clarity",
  "goals",
  "well-being",
  "career",
  "money",
  "relationships",
  "health",
  "focus",
  "creativity",
  "business",
];

export function DesignMe({ open, onClose }: { open: boolean; onClose: () => void }) {
  const identity = useAgentStore((s) => s.identity);
  const setName = useAgentStore((s) => s.setName);
  const setGender = useAgentStore((s) => s.setGender);
  const toggleTrait = useAgentStore((s) => s.toggleTrait);
  const setIdentity = useAgentStore((s) => s.setIdentity);
  const completeDesign = useAgentStore((s) => s.completeDesign);

  if (!open) return null;

  function toggleFocus(f: string) {
    const cur = identity.lifeFocus;
    const next = cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f].slice(0, 6);
    setIdentity({ lifeFocus: next });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-label="Design agent"
        className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] sm:rounded-[var(--radius-xl)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-fg)]">Design me</h2>
            <p className="text-[12px] text-[var(--color-fg-muted)]">
              Until you save: female default. Then I'm yours to shape.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="agent-scroll flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
              Name
            </span>
            <input
              value={identity.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What do you call me?"
              className="mt-1.5 h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-fg)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </label>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
              Gender
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {GENDERS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGender(g.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    identity.gender === g.id
                      ? "border-[var(--color-accent)] bg-[var(--color-bg-subtle)] text-[var(--color-fg)]"
                      : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
              Pronouns: {identity.pronouns}
            </p>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
              Traits (up to 5) — grounded start
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TRAIT_CATALOG.map((t) => {
                const on = identity.traits.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    title={t.blurb}
                    onClick={() => toggleTrait(t.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      on
                        ? "border-[var(--color-math)] bg-[var(--color-bg-subtle)] text-[var(--color-fg)]"
                        : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
              Look — text prompt
            </span>
            <textarea
              value={identity.lookPrompt}
              onChange={(e) => setIdentity({ lookPrompt: e.target.value })}
              rows={3}
              placeholder="Describe face, style, wardrobe, vibe…"
              className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
              Look — image / video notes
            </span>
            <textarea
              value={identity.lookMediaNotes}
              onChange={(e) => setIdentity({ lookMediaNotes: e.target.value })}
              rows={2}
              placeholder="Refs from images or video (describe or paste URLs you own)…"
              className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </label>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
              Life focus (I improve these as life changes)
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {FOCUS.map((f) => {
                const on = identity.lifeFocus.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFocus(f)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs capitalize transition-colors",
                      on
                        ? "border-[var(--color-life)] bg-[var(--color-bg-subtle)] text-[var(--color-fg)]"
                        : "border-[var(--color-border)] text-[var(--color-fg-muted)]",
                    )}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-[var(--color-border)] p-3">
          <Button
            className="flex-1"
            onClick={() => {
              completeDesign();
              onClose();
            }}
          >
            Save design
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
