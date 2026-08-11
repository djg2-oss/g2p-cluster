import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/lib/agent/store";

export function Composer() {
  const [text, setText] = useState("");
  const send = useAgentStore((s) => s.send);
  const thinking = useAgentStore((s) => s.thinking);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || thinking) return;
    send(text);
    setText("");
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 sm:px-6"
    >
      <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-[var(--radius-xl)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-2 pl-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Math, life decision, code, or conversation…"
          className="max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-subtle)]"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!text.trim() || thinking}
          aria-label="Send"
          className="shrink-0"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
      <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-[var(--color-fg-subtle)]">
        Enter to send · Shift+Enter for newline · Legal use only · G2P Technologies
      </p>
    </form>
  );
}
