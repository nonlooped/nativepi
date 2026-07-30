import {
  ArrowsOutIcon,
  CaretDownIcon,
  GitBranchIcon,
  WrenchIcon,
} from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/cn";

/**
 * Three pieces of the running interface, drawn at the size the page shows them.
 *
 * The full window is a photograph (see AppWindow) because it has to stay honest
 * at every width the stage hands it. These are the opposite case: fixed, small,
 * and always the same size, where the only source pixels available are a 344px
 * sidebar strip and a 380px pane that would have to be upscaled to fill a card.
 * Drawn, they stay sharp and stay true; each one shows the same content the
 * corresponding pane shows, in the same tones. Swap any of them for a real
 * capture by replacing the body, not the frame.
 */

function Frame({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="plate flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-ink/60 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-silver">
          {title}
        </span>
        {trailing}
      </div>
      <div className="flex-1 bg-ink/30 p-3">{children}</div>
    </div>
  );
}

/** Git status and a working-tree diff, beside the transcript. */
export function DiffVignette() {
  const lines: Array<[string, string]> = [
    ["ctx", "export function Composer({ session }: Props) {"],
    ["del", "  const [draft, setDraft] = useState('')"],
    ["add", "  const [draft, setDraft] = useDraft(session.id)"],
    ["ctx", ""],
    ["ctx", "  return ("],
  ];

  return (
    <Frame
      title="Changes"
      trailing={
        <span className="flex items-center gap-1.5 font-mono text-xs text-silver">
          <GitBranchIcon className="size-3.5" />
          main
        </span>
      }
    >
      <div className="flex items-center justify-between gap-2 rounded-sm bg-soft/50 px-2 py-1">
        <span className="truncate font-mono text-xs text-chalk">
          Composer.tsx
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums">
          <span className="text-green">+1</span>{" "}
          <span className="text-coral">-1</span>
        </span>
      </div>

      <div className="mt-2 space-y-px font-mono text-xs leading-relaxed">
        {lines.map(([kind, text], index) => (
          <div
            key={index}
            className={cn(
              "flex gap-2 rounded-sm px-1",
              kind === "add" && "bg-green/10 text-green",
              kind === "del" && "bg-coral/10 text-coral",
              kind === "ctx" && "text-dim",
            )}
          >
            <span className="w-2 shrink-0 select-none">
              {kind === "add" ? "+" : kind === "del" ? "-" : ""}
            </span>
            <span className="truncate">{text}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** A project-scoped terminal that survives being hidden. */
export function TerminalVignette() {
  return (
    <Frame
      title="Terminal"
      trailing={
        <span className="font-mono text-xs text-dim">loopcode</span>
      }
    >
      <div className="space-y-1 font-mono text-xs leading-relaxed">
        <div className="text-silver">
          <span className="text-green">$</span> bun test
        </div>
        <div className="text-dim">apps/desktop/src/session.test.ts:</div>
        <div className="text-silver">
          <span className="text-green">✓</span> resumes a forked session
        </div>
        <div className="text-silver">
          <span className="text-green">✓</span> keeps drafts across a cold send
        </div>
        <div className="pt-1 text-dim">
          <span className="tabular-nums">2 pass</span>, 0 fail
        </div>
        <div className="text-silver">
          <span className="text-green">$</span>
          <span className="ml-1 inline-block h-3 w-1.5 translate-y-px bg-silver/70 align-middle" />
        </div>
      </div>
    </Frame>
  );
}

/** A turn in flight: streamed text, thinking, and tool activity. */
export function TurnVignette() {
  return (
    <Frame
      title="Transcript"
      trailing={
        <span className="flex items-center gap-1.5 text-xs text-silver">
          <span className="relative flex size-1.5">
            <span className="absolute inset-0 rounded-full bg-slot motion-safe:animate-ping" />
            <span className="relative size-1.5 rounded-full bg-slot" />
          </span>
          running
        </span>
      }
    >
      <div className="space-y-2">
        <div className="rounded-sm border border-hairline bg-soft/40 px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <WrenchIcon className="size-3 shrink-0 text-silver" />
            <span className="font-mono text-xs text-chalk">read</span>
            <span className="truncate font-mono text-xs text-dim">
              src/session.ts
            </span>
            <CaretDownIcon className="ml-auto size-3 shrink-0 text-dim" />
          </div>
        </div>

        <div className="rounded-sm border border-hairline bg-soft/40 px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <WrenchIcon className="size-3 shrink-0 text-silver" />
            <span className="font-mono text-xs text-chalk">edit</span>
            <span className="truncate font-mono text-xs text-dim">
              src/session.ts
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs text-green">
              +1 -1
            </span>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-silver">
          The draft now keys off the session id, so a failed cold send keeps
          what you typed
          <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-px bg-silver/70 align-middle" />
        </p>
      </div>
    </Frame>
  );
}

/**
 * The optional local server, drawn as the one thing it hands you.
 *
 * The URL shape is the real one from apps/desktop/src/main/localServer.ts:
 * a LAN address, an ephemeral port (the server listens on 0), and the access
 * token in the fragment. The token is truncated because a full one is 32
 * characters of base64url and would only add noise.
 */
export function ServerVignette() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-hairline bg-ink/50 px-4 py-3">
      <ArrowsOutIcon className="size-4 shrink-0 text-silver" />
      <span className="truncate font-mono text-xs">
        <span className="text-chalk">http://192.168.1.24:52318/</span>
        <span className="text-slot">#token=</span>
        <span className="text-dim">yYd3Rk…</span>
      </span>
      <span className="ml-auto flex items-center gap-1.5 text-xs text-dim">
        <span className="size-1.5 rounded-full bg-dim" />
        off until you start it
      </span>
    </div>
  );
}
