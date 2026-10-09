import { Button } from "@/components/site/Button";
import { GitHubMark, PiMark } from "@/components/site/Marks";
import Link from "next/link";
import { site } from "@/lib/site";

export function Hero() {
  return (
    <section
      id="overview"
      className="scroll-mt-24 bg-ink"
    >
      <div className="rail pb-10 pt-12 sm:pb-12 sm:pt-16 lg:pb-14 lg:pt-20">
        <p className="flex items-center gap-2.5 text-sm font-medium text-silver">
          <PiMark className="size-4" />
          A desktop interface for the Pi coding agent
        </p>
        <div className="mt-6 grid gap-7 lg:grid-cols-[1.35fr_1fr] lg:items-end lg:gap-16">
          <h1 className="hero-display text-bright">
            <span className="block">Keep Pi.</span>{" "}
            <span className="block">Add a window.</span>
          </h1>
          <div className="lg:pb-1">
            <p className="lede max-w-[34ch]">
              Your projects, conversations, and code in one place. The Pi setup
              you already use, with more room to work.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button href={site.releasesLatest} external={false}>Download NativePi</Button>
              <Button href={site.repo} variant="ghost" className="px-3">
                <GitHubMark className="size-4" />
                View on GitHub
              </Button>
            </div>
            <p className="mt-4 text-sm text-silver">
              Installers are unsigned.{" "}
              <Link href="/docs/install" className="text-chalk underline decoration-input-hairline underline-offset-4 hover:decoration-current">
                Read the installation guide
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
