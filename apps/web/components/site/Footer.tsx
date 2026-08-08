import Link from "next/link";

import { GitHubMark, PiMark } from "@/components/site/Marks";
import { Wordmark } from "@/components/site/Wordmark";
import { site } from "@/lib/site";

const links = [
  { label: "Download", href: site.releases },
  { label: "Docs", href: "/docs" },
  { label: "Extension API", href: "/docs/extension-api" },
  { label: "Source", href: site.repo },
  { label: "Issues", href: site.issues },
  { label: "MIT License", href: site.license },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-ink">
      <div className="rail py-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Wordmark className="h-5" />
            <p className="mt-3 max-w-md text-sm leading-relaxed text-silver">
              A free, local desktop interface for the Pi coding agent on Windows,
              macOS, and Linux.
            </p>
          </div>

          <nav aria-label="Footer" className="flex max-w-2xl flex-wrap gap-x-6 gap-y-1">
            {links.map((link) => {
              const external = /^https?:/.test(link.href);
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  {...(external
                    ? { target: "_blank", rel: "noreferrer noopener" }
                    : null)}
                  className="touch-target inline-flex items-center text-sm text-silver transition-colors duration-150 hover:text-chalk"
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-hairline pt-6 text-xs leading-relaxed text-silver lg:flex-row lg:items-center lg:justify-between">
          <p>MIT licensed. Built by {site.author}. No account. No telemetry.</p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={site.repo}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-chalk"
            >
              <GitHubMark className="size-3.5" />
              GitHub
            </a>
            <a
              href={site.pi}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-chalk"
            >
              <PiMark className="size-3.5" />
              Pi coding agent
            </a>
          </p>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-dim">
          Provider marks belong to their owners and indicate compatibility only.
          NativePi is not affiliated with or endorsed by them.
        </p>
      </div>
    </footer>
  );
}
