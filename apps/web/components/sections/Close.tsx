import {
  ArrowRightIcon,
  ChatCircleTextIcon,
  CodeIcon,
  RowsIcon,
  SidebarSimpleIcon,
  SquaresFourIcon,
  WrenchIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Button } from "@/components/site/Button";
import { site } from "@/lib/site";

const slots = [
  { name: "Tools and session entries", detail: "Give tool results a native presentation.", href: "tools-and-entries", Icon: WrenchIcon },
  { name: "Composer contributions", detail: "Put extension controls beside the prompt.", href: "composer", Icon: RowsIcon },
  { name: "Conversation views", detail: "Open a complete extension workspace.", href: "contributions", Icon: ChatCircleTextIcon },
  { name: "Context panels", detail: "Keep useful context beside the conversation.", href: "contributions", Icon: SidebarSimpleIcon },
  { name: "Panels and settings", detail: "Give extension configuration a home.", href: "panels-and-settings", Icon: SquaresFourIcon },
  { name: "Typed host channel", detail: "Connect your interface to your Pi extension.", href: "host-channel", Icon: CodeIcon },
] as const;

export function Close() {
  return (
    <>
      <section id="extensions" className="scroll-mt-24 border-t border-hairline py-20 sm:py-28">
        <div className="rail">
          <div className="max-w-3xl">
            <h2 className="section-head text-bright">Bring your Pi extensions into view.</h2>
            <p className="lede mt-6 max-w-[55ch]">
              Pi&apos;s terminal extension UI works in the window. Add an optional
              React interface when your extension needs more space.
            </p>
          </div>
          <ul className="mt-12 grid gap-x-16 gap-y-8 md:grid-cols-2">
            {slots.map(({ name, detail, href, Icon }) => (
              <li key={name}>
                <Link href={`/docs/extension-api/${href}`} className="group flex items-start gap-4 rounded-md py-2">
                  <Icon className="mt-1 size-5 shrink-0 text-slot" aria-hidden="true" />
                  <span className="flex-1">
                    <span className="block text-base font-medium text-chalk">{name}</span>
                    <span className="mt-1 block text-sm text-silver">{detail}</span>
                  </span>
                  <ArrowRightIcon className="mt-1 size-4 shrink-0 text-dim transition-[color,transform] duration-150 group-hover:translate-x-1 group-hover:text-chalk" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-12 flex flex-col justify-between gap-6 border-t border-hairline pt-6 sm:flex-row sm:items-center">
            <p className="max-w-[52ch] text-sm text-silver">
              The graphical API is experimental and versioned. Pi still owns the
              tools, configuration, and agent behavior.
            </p>
            <Button href="/docs/extension-api" variant="outline" className="shrink-0 self-start">
              Read the extension API<ArrowRightIcon className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>
      <section aria-labelledby="download-title" className="border-t border-hairline bg-sidebar py-16 sm:py-20">
        <div className="rail flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div>
            <h2 id="download-title" className="section-head max-w-[15ch] text-bright">
              Your next project, with a little more room.
            </h2>
            <p className="mt-5 max-w-xl text-base text-silver">
              Pi is included. Open a folder and start a conversation.
            </p>
          </div>
          <div className="lg:pb-1">
            <div className="flex flex-wrap items-center gap-3">
              <Button href={site.releasesLatest} external={false}>Download NativePi</Button>
              <Button href={site.repo} variant="ghost">View source</Button>
            </div>
            <p className="mt-4 text-sm text-silver">
              Free for Windows, macOS, and Linux. Installers are unsigned.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
