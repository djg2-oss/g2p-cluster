import { useEffect, useRef, type ReactNode } from "react";
import type { ChatMessage } from "@/lib/agent/chat-engine";
import { MODE_META } from "@/lib/agent/system-definition";
import { useAgentStore } from "@/lib/agent/store";
import { cn } from "@/lib/utils";

/** Minimal safe markdown: **bold**, _italic_, `code`, lists, quotes — no raw HTML */
function renderLine(line: string, key: number): ReactNode {
  if (line === "") return <span key={key} className="block h-2" />;

  const nodes: ReactNode[] = [];
  // split by **bold**, _italic_, `code` while escaping plain text
  const re = /(\*\*[^*]+\*\*|_{[^_]+}_|`[^`]+`)/g;
  // simpler iterative parse
  let i = 0;
  const pattern = /\*\*(.+?)\*\*|_([^_]+)_|`([^`]+)`/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = pattern.exec(line)) !== null) {
    if (m.index > last) {
      nodes.push(line.slice(last, m.index));
    }
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={`${key}-b-${i++}`} className="font-semibold text-[var(--color-fg)]">
          {m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      nodes.push(
        <em key={`${key}-i-${i++}`} className="italic text-[var(--color-fg-muted)]">
          {m[2]}
        </em>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <code
          key={`${key}-c-${i++}`}
          className="rounded-[var(--radius-xs)] bg-[var(--color-bg-subtle)] px-1 py-0.5 font-mono text-[13px] text-[var(--color-math)]"
        >
          {m[3]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) nodes.push(line.slice(last));

  if (line.startsWith("> ")) {
    return (
      <span
        key={key}
        className="block border-l-2 border-[var(--color-border-strong)] pl-3 text-[var(--color-fg-muted)]"
      >
        {renderLine(line.slice(2), key)}
      </span>
    );
  }

  if (/^• /.test(line) || /^\d+\. /.test(line)) {
    const bullet = line.match(/^(• |\d+\. )/)?.[1] ?? "";
    const rest = line.slice(bullet.length);
    return (
      <span key={key} className="block">
        <span className="text-[var(--color-fg-subtle)] tabular-nums">{bullet}</span>
        {renderInline(rest, `${key}-r`)}
      </span>
    );
  }

  return (
    <span key={key} className="block">
      {nodes.length ? nodes : line}
    </span>
  );
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|_([^_]+)_|`([^`]+)`/g;
  let m: RegExpExecArray | null;
  let last = 0;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined)
      nodes.push(
        <strong key={`${keyPrefix}-b${i++}`} className="font-semibold">
          {m[1]}
        </strong>,
      );
    else if (m[2] !== undefined)
      nodes.push(
        <em key={`${keyPrefix}-i${i++}`} className="italic">
          {m[2]}
        </em>,
      );
    else if (m[3] !== undefined)
      nodes.push(
        <code
          key={`${keyPrefix}-c${i++}`}
          className="rounded-[var(--radius-xs)] bg-[var(--color-bg-subtle)] px-1 font-mono text-[13px] text-[var(--color-math)]"
        >
          {m[3]}
        </code>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function MessageBody({ content }: { content: string }) {
  const lines = content.split("\n");
  return <div className="text-[var(--color-fg)]">{lines.map((line, i) => renderLine(line, i))}</div>;
}

export function MessageList({
  messages,
  thinking,
}: {
  messages: ChatMessage[];
  thinking: boolean;
}) {
  const agentName = useAgentStore((s) => s.identity.name);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  return (
    <div className="agent-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        {messages.map((m) => (
          <article
            key={m.id}
            className={cn(
              "rounded-[var(--radius-lg)] px-4 py-3 text-[15px] leading-relaxed",
              m.role === "user"
                ? "ml-8 self-end bg-[var(--color-bg-subtle)] text-[var(--color-fg)]"
                : "mr-4 self-start border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
            )}
          >
            {m.role === "agent" && (
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
                <span
                  className="inline-block size-1.5 rounded-full"
                  style={{ background: MODE_META[m.mode].accent }}
                />
                {agentName} · {MODE_META[m.mode].label}
                {m.confidence ? (
                  <span className="font-normal normal-case tracking-normal text-[var(--color-fg-subtle)]">
                    · {m.confidence}
                  </span>
                ) : null}
              </div>
            )}
            <MessageBody content={m.content} />
          </article>
        ))}
        {thinking && (
          <div className="mr-4 self-start rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3 text-sm text-[var(--color-fg-muted)]">
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
              Reflecting…
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
