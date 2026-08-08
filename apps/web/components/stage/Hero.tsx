import { Button } from "@/components/site/Button";
import { DownloadButton } from "@/components/site/DownloadButton";
import { GitHubMark, PiMark } from "@/components/site/Marks";
import { site } from "@/lib/site";

export function Hero() {
  return (
    <section
      id="overview"
      className="scroll-mt-14 border-b border-hairline bg-ink"
    >
      <div className="rail py-16 sm:py-20 lg:pb-24 lg:pt-28">
        <div className="max-w-[52rem]">
          <p className="flex items-center gap-2 text-sm font-medium text-silver">
            <PiMark className="size-3.5" />
            A desktop interface for the Pi coding agent
          </p>

          <h1 className="hero-display mt-6 text-bright">
            Keep Pi. Add a window.
          </h1>

          <p className="lede mt-6 max-w-2xl">
            Work with Pi in a focused desktop app without moving your sessions,
            credentials, or configuration.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <DownloadButton />
            <Button href={site.repo} variant="ghost" className="px-3">
              <GitHubMark className="size-4" />
              View on GitHub
            </Button>
          </div>

          <p className="mt-4 text-sm text-silver">
            Free and MIT licensed for Windows, macOS, and Linux. Installers are
            unsigned.
          </p>
        </div>
      </div>
    </section>
  );
}
