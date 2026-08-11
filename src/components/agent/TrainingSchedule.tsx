import { X, Check, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CURRICULUM, PHASES, costSummary, type TrainStatus } from "@/lib/agent/training/curriculum";
import { BAKE_SCHEDULE, BAKE_PHASES, bakeSummary } from "@/lib/agent/training/bake-schedule";
import { useAgentStore } from "@/lib/agent/store";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<TrainStatus, typeof Check> = {
  done: Check,
  in_progress: Loader2,
  pending: Circle,
  deferred: Circle,
};

export function TrainingSchedule({ open, onClose }: { open: boolean; onClose: () => void }) {
  const progress = useAgentStore((s) => s.trainProgress);
  const setTrainStatus = useAgentStore((s) => s.setTrainStatus);
  const summary = costSummary();
  const bake = bakeSummary();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-label="Training schedule"
        className="relative z-10 flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-t-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] sm:rounded-[var(--radius-xl)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-fg)]">Training schedule</h2>
            <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">
              All needed + useful · {summary.localCount} local ($0) · {summary.apiCount} light API ·{" "}
              {summary.gpuCount} GPU optional · ~{summary.localHours}h local work
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="agent-scroll flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                Weeks 1–4
              </div>
              <div className="text-sm font-medium text-[var(--color-fg)]">LOCAL · $0</div>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                Week 5
              </div>
              <div className="text-sm font-medium text-[var(--color-fg)]">API · $10–40</div>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                Week 6+
              </div>
              <div className="text-sm font-medium text-[var(--color-fg)]">GPU · you approve</div>
            </div>
          </div>


          <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3">
            <h3 className="text-sm font-semibold text-[var(--color-fg)]">Bake-in plan + recurring</h3>
            <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
              {bake.onceCount} one-time bake · {bake.recurringCount} recurring · ~{bake.localBakeHours}h local bake · daily {bake.dailyMinutes}m · weekly {bake.weeklyMinutes}m · monthly {bake.monthlyMinutes}m
            </p>
            <ul className="mt-3 space-y-1.5">
              {BAKE_SCHEDULE.filter((m) => m.cadence !== "once").map((m) => (
                <li key={m.id} className="text-[12px] text-[var(--color-fg-subtle)]">
                  <span className="font-medium text-[var(--color-fg)]">{m.id}</span>{" "}
                  {m.cadence.toUpperCase()} · {m.minutes}m · {m.title}
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-2">
              {BAKE_PHASES.filter((p) => p.phase < 6).map((p) => (
                <div key={p.phase} className="text-[11px] text-[var(--color-fg-muted)]">
                  Phase {p.phase} · {p.name} · {p.week} · {p.cost} ·{" "}
                  {BAKE_SCHEDULE.filter((m) => m.phase === p.phase).length} modules
                </div>
              ))}
            </div>
          </div>

          {PHASES.map((ph) => {
            const mods = CURRICULUM.filter((m) => m.phase === ph.phase);
            return (
              <section key={ph.phase} className="mb-6">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--color-fg)]">
                    Phase {ph.phase} · {ph.name}
                  </h3>
                  <span className="text-[11px] text-[var(--color-fg-subtle)]">
                    {ph.week} · {ph.cost}
                  </span>
                </div>
                <p className="mb-3 text-[12px] text-[var(--color-fg-muted)]">{ph.focus}</p>
                <ul className="space-y-2">
                  {mods.map((m) => {
                    const st = progress[m.id] ?? "pending";
                    const Icon = STATUS_ICON[st];
                    return (
                      <li
                        key={m.id}
                        className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex items-start gap-2">
                          <Icon
                            className={cn(
                              "mt-0.5 size-3.5 shrink-0",
                              st === "done" && "text-[var(--color-success)]",
                              st === "in_progress" && "animate-spin text-[var(--color-math)]",
                              st === "pending" && "text-[var(--color-fg-subtle)]",
                            )}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-[var(--color-fg)]">
                              <span className="text-[var(--color-fg-subtle)]">{m.id}</span>{" "}
                              {m.title}
                            </div>
                            <div className="text-[11px] text-[var(--color-fg-muted)]">
                              {m.tier}
                              {m.estimatedApiUsd ? ` · ${m.estimatedApiUsd}` : ""} · {m.priority} ·{" "}
                              {m.minutesLocal}m local
                            </div>
                            <div className="mt-0.5 text-[12px] text-[var(--color-fg-subtle)]">
                              {m.deliverable}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1 sm:flex-col">
                          {(["done", "in_progress", "pending", "deferred"] as TrainStatus[]).map(
                            (s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setTrainStatus(m.id, s)}
                                className={cn(
                                  "rounded px-2 py-0.5 text-[10px] uppercase tracking-wide",
                                  st === s
                                    ? "bg-[var(--color-bg-subtle)] text-[var(--color-fg)]"
                                    : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]",
                                )}
                              >
                                {s.replace("_", " ")}
                              </button>
                            ),
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="border-t border-[var(--color-border)] px-4 py-3 text-[11px] text-[var(--color-fg-subtle)]">
          Mark modules done as we ship them. Phase 5–6 spend only when you say so. Agent never
          self-trains architecture without your YES.
        </div>
      </div>
    </div>
  );
}
