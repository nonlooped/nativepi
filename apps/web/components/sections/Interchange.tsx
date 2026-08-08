import {
  FolderIcon,
  MonitorIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react/dist/ssr";

import { PiMark } from "@/components/site/Marks";
import { Wordmark } from "@/components/site/Wordmark";

const nativePiKeeps = [
  "Pinned projects and chats",
  "Last project and chat",
  "Unsent drafts",
  "Favorite models",
  "Pane sizes",
  "Interface preferences",
];

const sharedState = [
  ["sessions/", "Conversations"],
  ["packages/", "Packages and extensions"],
  ["settings.json", "Pi configuration"],
  ["auth.json", "Provider logins"],
] as const;

export function Interchange() {
  return (
    <section
      id="ownership"
      className="scroll-mt-12 bg-ink py-20 sm:py-28 lg:py-32"
    >
      <div className="rail grid gap-14 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-20">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-silver">Your data</p>
          <h2 className="section-head mt-4 max-w-2xl text-bright">
            Your Pi setup stays yours.
          </h2>
          <p className="lede mt-6 max-w-2xl">
            NativePi reads the same sessions, credentials, settings, packages,
            and extensions as the Pi command line. Close the app and keep
            working in the terminal. Nothing needs exporting or migrating.
          </p>

          <div className="mt-10 border-t border-hairline pt-6">
            <h3 className="text-sm font-semibold text-chalk">
              NativePi keeps only interface state
            </h3>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {nativePiKeeps.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-sm text-silver"
                >
                  <span className="size-1 rounded-full bg-dim" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="lg:pt-8">
          <div className="window-panel overflow-hidden">
            <div className="grid grid-cols-2 border-b border-hairline">
              <div className="flex min-h-24 flex-col items-center justify-center gap-2 border-e border-hairline p-4">
                <Wordmark className="h-4" />
                <span className="flex items-center gap-1.5 text-xs text-silver">
                  <MonitorIcon className="size-3.5" />
                  Desktop
                </span>
              </div>
              <div className="flex min-h-24 flex-col items-center justify-center gap-2 p-4">
                <span className="flex items-center gap-2 font-mono text-sm text-chalk">
                  <PiMark className="size-3.5" />
                  pi
                </span>
                <span className="flex items-center gap-1.5 text-xs text-silver">
                  <TerminalWindowIcon className="size-3.5" />
                  Command line
                </span>
              </div>
            </div>

            <div className="bg-void p-4">
              <p className="flex items-center gap-2 font-mono text-sm text-chalk">
                <FolderIcon className="size-4 text-silver" />
                ~/.pi/agent
              </p>
              <dl className="mt-4 divide-y divide-hairline border-s border-hairline ps-4">
                {sharedState.map(([path, label]) => (
                  <div
                    key={path}
                    className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0"
                  >
                    <dt className="font-mono text-xs text-chalk">{path}</dt>
                    <dd className="text-end text-xs text-silver">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-silver">
            No product account. No cloud conversation store. No telemetry.
          </p>
        </div>
      </div>
    </section>
  );
}
