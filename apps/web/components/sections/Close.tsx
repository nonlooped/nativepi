import {
  ArrowRightIcon,
  CodeIcon,
  SlidersHorizontalIcon,
  SidebarSimpleIcon,
  WrenchIcon,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/site/Button";
import { DownloadButton } from "@/components/site/DownloadButton";
import { site } from "@/lib/site";

const slots = [
  {
    name: "Tool renderers",
    detail: "Turn Pi tool results into native React surfaces.",
    Icon: WrenchIcon,
  },
  {
    name: "Composer controls",
    detail: "Add focused actions beside the prompt.",
    Icon: SlidersHorizontalIcon,
  },
  {
    name: "Settings sections",
    detail: "Give an extension a native place to configure itself.",
    Icon: CodeIcon,
  },
  {
    name: "Context panels",
    detail: "Keep extension context visible beside the conversation.",
    Icon: SidebarSimpleIcon,
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
              NativePi extends Pi&apos;s package model with a small graphical API.
              Build interface contributions without replacing the agent or
              maintaining a separate integration.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-silver">
              <span className="font-medium text-chalk">Experimental API.</span>{" "}
              It is MIT licensed and may change between releases.
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
