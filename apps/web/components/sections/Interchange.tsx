import { ArrowsDownUpIcon, MonitorIcon, TerminalWindowIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

const sharedState = [
  ["Sessions", "Conversations and their history"],
  ["Credentials", "Your existing provider logins"],
  ["Configuration", "Models, settings, and preferences"],
  ["Packages", "Pi extensions and skills"],
] as const;

export function Interchange() {
  return (
    <section id="ownership" className="scroll-mt-24 py-20 sm:py-28">
      <div className="rail">
        <div className="max-w-3xl">
          <h2 className="section-head text-bright">A new window. The same Pi.</h2>
          <p className="lede mt-6 max-w-[52ch]">
            Close NativePi and continue in the terminal. Your sessions,
            credentials, and configuration stay in Pi&apos;s normal storage.
          </p>
        </div>
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-center lg:gap-20">
          <div className="rounded-xl border border-hairline bg-sidebar p-5 sm:p-8">
            <div className="grid grid-cols-2 gap-5 text-center">
              <div className="flex flex-col items-center gap-3">
                <MonitorIcon className="size-6 text-silver" aria-hidden="true" />
                <p className="text-sm font-medium text-chalk">NativePi desktop</p>
                <ArrowsDownUpIcon className="size-5 text-dim" aria-hidden="true" />
              </div>
              <div className="flex flex-col items-center gap-3">
                <TerminalWindowIcon className="size-6 text-silver" aria-hidden="true" />
                <p className="text-sm font-medium text-chalk">Pi command line</p>
                <ArrowsDownUpIcon className="size-5 text-dim" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-5 rounded-lg border border-hairline bg-ink p-5 sm:p-6">
              <p className="text-sm font-medium text-chalk">One shared Pi setup</p>
              <p className="mt-1 font-mono text-xs text-silver">~/.pi/agent</p>
              <dl className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                {sharedState.map(([label, description]) => (
                  <div key={label}>
                    <dt className="text-sm font-medium text-chalk">{label}</dt>
                    <dd className="mt-1 text-xs text-silver">{description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div>
            <h3 className="font-display text-2xl font-medium tracking-[-0.03em] text-chalk">
              Nothing to move. Nothing to lock in.
            </h3>
            <p className="mt-4 max-w-[40ch] text-base text-silver">
              NativePi remembers interface details such as your drafts, pinned
              projects, favorite models, and pane sizes. Pi remains the source
              of truth for your conversations.
            </p>
            <p className="mt-4 max-w-[40ch] text-sm text-silver">
              No product account, cloud conversation store, or NativePi-owned
              desktop telemetry.
            </p>
            <Link href="/docs/sessions-and-storage" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-chalk underline decoration-input-hairline underline-offset-4 hover:decoration-current">
              Read how sessions are stored
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
