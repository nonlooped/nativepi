import { FolderIcon, TerminalWindowIcon } from "@phosphor-icons/react/dist/ssr";

import { PiMark } from "@/components/site/Marks";
import { Wordmark } from "@/components/site/Wordmark";

/**
 * The claim a neighboring product cannot truthfully copy, proved with the
 * filesystem rather than asserted with an adjective.
 *
 * The list of what NativePi persists on its own is exhaustive and comes from
 * PRODUCT.md. Being able to print the whole list is the argument.
 */

const nativePiKeeps = [
  "Pinned projects",
  "Last project and chat",
  "Unsent drafts",
  "Favorite models",
  "Pane sizes",
  "Its own interface preferences",
];

export function Interchange() {
  return (
    <section className="relative z-10 py-24 sm:py-32">
      <div className="rail grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20">
        <div>
          <h2 className="section-head text-bright">
            Leave whenever
            <br />
            you want.
          </h2>
          <p className="lede mt-6 max-w-lg">
            Most agent frontends replace the agent they wrap: their own loop,
            their own storage, their own login. NativePi does none of that.
          </p>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-silver">
            Your sessions and credentials stay in Pi&apos;s normal storage. There
            is no second conversation store to migrate out of, no account to
            close, and no export step. The Pi command line reads and writes the
            same files while NativePi is open.
          </p>

          <div className="mt-10">
            <h3 className="text-sm font-semibold text-chalk">
              Everything NativePi stores on its own
            </h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {nativePiKeeps.map((item) => (
                <li
                  key={item}
                  className="rounded-md border border-hairline bg-white/[0.03] px-2.5 py-1 text-xs text-silver"
                >
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-silver">
              That is the complete list. No conversations, no credentials, no
              telemetry, and nothing that leaves your machine.
            </p>
          </div>
        </div>

        {/* One store, two clients. The diagram is the proof. */}
        <div className="plate p-6 sm:p-8">
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            <div className="flex flex-1 flex-col items-center gap-2 rounded-lg border border-hairline bg-white/[0.02] px-3 py-4">
              <Wordmark className="h-4" />
              <span className="text-xs text-dim">desktop</span>
            </div>
            <div className="flex flex-1 flex-col items-center gap-2 rounded-lg border border-hairline bg-white/[0.02] px-3 py-4">
              <TerminalWindowIcon className="size-4 text-chalk" />
              <span className="font-mono text-sm text-chalk">pi</span>
              <span className="text-xs text-dim">command line</span>
            </div>
          </div>

          {/* Both arrows point down into the same place. */}
          <div
            className="relative mx-auto h-12 w-full max-w-[19rem]"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 300 48"
              className="h-full w-full"
              preserveAspectRatio="none"
            >
              <path
                d="M75 0 V20 Q75 30 105 30 H150 M225 0 V20 Q225 30 195 30 H150 M150 30 V48"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-silver/45"
              />
            </svg>
          </div>

          <div className="rounded-lg border border-hairline bg-ink p-4">
            <div className="flex items-center gap-2">
              <PiMark className="size-3.5 shrink-0 text-silver" />
              <span className="font-mono text-xs text-chalk">~/.pi/agent</span>
            </div>
            <div className="mt-3 space-y-1 border-l border-hairline pl-3 font-mono text-xs text-silver">
              <div className="flex items-center gap-2">
                <FolderIcon className="size-3 shrink-0 text-dim" />
                sessions/
              </div>
              <div className="flex items-center gap-2">
                <FolderIcon className="size-3 shrink-0 text-dim" />
                packages/
              </div>
              <div className="pl-5 text-dim">settings.json</div>
              <div className="pl-5 text-dim">credentials</div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-dim">
            One store. Both clients. Neither one owns it.
          </p>
        </div>
      </div>
    </section>
  );
}
