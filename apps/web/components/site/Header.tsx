import Link from "next/link";

import { GitHubMark } from "@/components/site/Marks";
import { Wordmark } from "@/components/site/Wordmark";
import { site } from "@/lib/site";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-ink/95 backdrop-blur-xl">
      <div className="rail flex h-14 items-center justify-between gap-6">
        <Link
          href="/"
          className="flex min-h-11 items-center rounded-sm"
          aria-label="NativePi home"
        >
          <Wordmark className="h-5" />
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1">
          <Link
            href="/#features"
            className="hidden min-h-11 items-center rounded-md px-3 text-sm text-silver transition-colors duration-150 hover:bg-white/[0.05] hover:text-chalk sm:inline-flex"
          >
            Features
          </Link>
          <Link
            href="/docs"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-silver transition-colors duration-150 hover:bg-white/[0.05] hover:text-chalk"
          >
            Docs
          </Link>
          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="NativePi on GitHub"
            className="ms-1 inline-flex h-9 items-center gap-2 rounded-md border border-input-hairline bg-white/[0.04] px-3 text-sm text-chalk transition-[background-color,border-color,transform] duration-150 hover:border-white/25 hover:bg-white/[0.08] active:translate-y-px"
          >
            <GitHubMark className="size-4" />
            <span className="hidden min-[460px]:inline">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
