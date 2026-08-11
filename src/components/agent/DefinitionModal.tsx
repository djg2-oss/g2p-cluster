import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SYSTEM_DEFINITION } from "@/lib/agent/system-definition";

export function DefinitionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-label="Agent G2P system definition"
        className="relative z-10 flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] sm:rounded-[var(--radius-xl)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--color-fg)]">System definition</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <pre className="agent-scroll flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-4 font-mono text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
          {SYSTEM_DEFINITION}
        </pre>
      </div>
    </div>
  );
}
