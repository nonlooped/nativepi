import { AppWindow } from "@/components/app/AppWindow";
import { Hero } from "@/components/stage/Hero";
import { AppleMark, LinuxMark, WindowsMark } from "@/components/site/Marks";
import { ArrowsOutIcon } from "@phosphor-icons/react/dist/ssr";

export function WindowStage() {
  return (
    <div className="bg-ink">
      <Hero />
      <div id="app" className="rail scroll-mt-24">
        <a href="/app/window.png" target="_blank" rel="noreferrer noopener" aria-label="Open the full-size NativePi screenshot in a new tab" className="group block rounded-xl">
          <div className="window-frame aspect-video w-full overflow-hidden">
            <AppWindow />
          </div>
          <span className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-silver transition-colors group-hover:text-chalk">
            Open full-size screenshot<ArrowsOutIcon className="size-4" aria-hidden="true" />
          </span>
        </a>
        <div className="flex flex-col justify-between gap-3 border-b border-hairline pb-8 pt-3 text-sm text-silver sm:flex-row sm:items-center sm:pb-10">
          <p className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-2"><WindowsMark />Windows</span>
            <span className="inline-flex items-center gap-2"><AppleMark />macOS</span>
            <span className="inline-flex items-center gap-2"><LinuxMark />Linux</span>
          </p>
          <p>Free and MIT licensed. Installers are unsigned.</p>
        </div>
      </div>
    </div>
  );
}
