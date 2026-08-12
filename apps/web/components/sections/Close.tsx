import {
  ArrowRightIcon,
  CodeIcon,
  LayoutIcon,
  RowsIcon,
  SquaresFourIcon,
  SidebarSimpleIcon,
  WrenchIcon,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/site/Button";
import { DownloadButton } from "@/components/site/DownloadButton";
import { site } from "@/lib/site";

const slots = [
  {
    name: "Tool & entry renderers",
    detail: "Replace Pi tool calls and session entries with native React.",
    Icon: WrenchIcon,
  },
  {
    name: "Composer widgets & controls",
    detail: "Add state above the composer or compact actions beside Send.",
    Icon: RowsIcon,
  },
  {
    name: "Conversation views",
    detail: "Open a complete extension workspace in the conversation area.",
    Icon: SquaresFourIcon,
  },
  {
    name: "Context panels",
    detail: "Keep extension context visible beside the conversation.",
    Icon: SidebarSimpleIcon,
  },
  {
    name: "Typed host channel",
    detail: "One shared protocol for calls and events, validated on both sides.",
    Icon: LayoutIcon,
  },
  {
    name: "Panels & settings",
    detail: "Keep project context visible and give configuration a native home.",
    Icon: CodeIcon,
  },
];

export function Close() {
  return (
    <section
      id="extensions"
      className="scroll-mt-12 border-t border-hairline bg-sidebar py-20 sm:py-28 lg:py-32"
    >
      <div className="rail">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-silver">Extensions</p>
            <h2 className="section-head mt-4 text-bright">
              Pi extensions can belong in the window.
            </h2>
          </div>

          <div className="lg:pt-8">
            <p className="text-base leading-relaxed text-silver">
              NativePi presents Pi&apos;s terminal extension UI and also offers a
              typed graphical API. Build native React contributions without
              replacing the agent or maintaining a separate integration.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-silver">
              <span className="font-medium text-chalk">API version 1.</span>{" "}
              The graphical contract is versioned and MIT licensed. A bundle
              declares <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-xs text-chalk">apiVersion: 1</code> and NativePi rejects an incompatible one.
            </p>
            <Button
              href="/docs/extension-api"
              variant="outline"
              className="mt-5"
            >
              Read the extension API
              <ArrowRightIcon className="size-4" />
            </Button>
          </div>
        </div>

        <ul className="mt-14 grid border-y border-hairline md:grid-cols-2 md:[&>li:nth-child(odd)]:border-e md:[&>li:nth-child(-n+2)]:border-b">
          {slots.map(({ name, detail, Icon }) => (
            <li key={name} className="flex gap-4 border-b border-hairline p-5 last:border-b-0 md:border-b-0 sm:p-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slot/20 bg-slot/[0.06] text-slot">
                <Icon className="size-4" />
              </span>
              <div>
                <h3 className="font-display text-base font-semibold text-chalk">
                  {name}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-silver">
                  {detail}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="composer-cta mt-16 flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-silver">Ready to use Pi on desktop?</p>
            <p className="mt-1 font-display text-xl font-semibold tracking-[-0.025em] text-bright">
              Open a project. Everything Pi knows is already there.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-3">
            <DownloadButton />
            <Button href={site.repo} variant="ghost">
              View source
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
