import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";

import { PageTitle, Prose } from "@/components/docs/Prose";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "How to install NativePi, how it sits alongside the Pi command line, and how to build a graphical extension.",
};

const pages = [
  {
    href: "/docs/install",
    title: "Install and first run",
    body: "Download, get past your OS's unsigned-app warning, open a project, and sign in to a provider.",
  },
  {
    href: "/docs/working-with-pi",
    title: "Working with Pi",
    body: "Where your sessions live, what NativePi stores, how settings are shared with the command line, and what optional browser access does.",
  },
  {
    href: "/docs/extension-api",
    title: "Graphical extension API",
    body: "Define a typed host protocol, add native interface contributions, and migrate an experimental 0.x renderer to API version 1.",
  },
];

export default function DocsHome() {
  return (
    <>
      <PageTitle
        title="Documentation"
        lede="NativePi is a desktop window onto the Pi coding agent. These pages cover getting it running, how it shares state with the Pi command line, and how to extend its interface."
      />

      <Prose>
        <p>
          If you have never used Pi, start with{" "}
          <a href={site.pi} target="_blank" rel="noreferrer noopener">
            pi.dev
          </a>
          . NativePi bundles a pinned Pi build, so you do not need to install it
          separately, but Pi is the thing doing the work and its own
          documentation is the authority on agent behavior.
        </p>
      </Prose>

      <ul className="measure mt-10 divide-y divide-hairline border-y border-hairline">
        {pages.map((page) => (
          <li key={page.href}>
            <Link
              href={page.href}
              className="group flex items-start gap-4 py-5 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-base font-semibold text-chalk transition-colors group-hover:text-bright">
                  {page.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-silver">
                  {page.body}
                </p>
              </div>
              <ArrowRightIcon className="mt-1 size-4 shrink-0 text-dim transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-chalk" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
