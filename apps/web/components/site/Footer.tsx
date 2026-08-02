import Link from "next/link";

import { GitHubMark, PiMark } from "@/components/site/Marks";
import { Wordmark } from "@/components/site/Wordmark";
import { site } from "@/lib/site";

const columns = [
  {
    heading: "Product",
    links: [{ label: "Releases", href: site.releases }],
  },
  {
    heading: "Documentation",
    links: [
      { label: "Install and first run", href: "/docs/install" },
      { label: "Working with Pi", href: "/docs/working-with-pi" },
      { label: "Extension API", href: "/docs/extension-api" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "Source on GitHub", href: site.repo },
      { label: "Report an issue", href: site.issues },
      { label: "MIT License", href: site.license },
      { label: "Pi", href: site.pi },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-hairline bg-ink">
      <div className="rail py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark className="h-6" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-silver">
              A cross-platform desktop interface for the Pi coding agent. Free,
              open source, and local to your machine.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <a
                href={site.repo}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex size-11 items-center justify-center rounded-md border border-hairline text-silver transition-colors duration-150 hover:border-white/25 hover:text-chalk"
                aria-label="NativePi on GitHub"
              >
                <GitHubMark className="h-4 w-4" />
              </a>
              <a
                href={site.pi}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex size-11 items-center justify-center rounded-md border border-hairline text-silver transition-colors duration-150 hover:border-white/25 hover:text-chalk"
                aria-label="Pi coding agent"
              >
                <PiMark className="h-4 w-4" />
              </a>
            </div>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-labelledby={`f-${column.heading}`}>
              <h2
                id={`f-${column.heading}`}
                className="font-body text-xs font-semibold tracking-wide text-chalk"
              >
                {column.heading}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => {
                  const external = /^https?:/.test(link.href);
                  return (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        {...(external
                          ? { target: "_blank", rel: "noreferrer noopener" }
                          : null)}
                        className="touch-target inline-flex items-center text-sm text-silver transition-colors duration-150 hover:text-chalk"
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-hairline pt-6 text-xs text-silver">
          <p>MIT licensed. Built by {site.author}.</p>
          <p>
            Provider marks belong to their owners and indicate compatibility
            only. NativePi is not affiliated with or endorsed by any of them.
          </p>
        </div>
      </div>
    </footer>
  );
}
