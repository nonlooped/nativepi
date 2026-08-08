import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";

import { PageTitle, Prose } from "@/components/docs/Prose";
import { docsSections } from "@/lib/docs";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Install and use NativePi, understand how it works with Pi, and build graphical extensions with complete guides and API reference.",
};

export default function DocsHome() {
  return (
    <>
      <PageTitle
        title="Documentation"
        lede="Install NativePi, learn how its desktop workflows relate to Pi, or build a typed graphical extension. Start with the path that matches what you are doing."
      />

      <Prose>
        <p>
          Pi owns agent behavior, providers, tools, sessions, and ordinary
          extensions. Its documentation at{" "}
          <a href={site.pi} target="_blank" rel="noreferrer noopener">
            pi.dev
          </a>{" "}
          remains the authority for those capabilities. These pages cover the
          NativePi desktop surface and its graphical extension API.
        </p>
      </Prose>

      <div className="mt-12 space-y-12">
        {docsSections.map((section) => {
          const links = section.links.filter((link) => link.href !== "/docs");
          if (links.length === 0) return null;

          return (
            <section key={section.title} aria-labelledby={`section-${section.title.replaceAll(" ", "-").toLowerCase()}`}>
              <h2
                id={`section-${section.title.replaceAll(" ", "-").toLowerCase()}`}
                className="measure font-display text-xl font-semibold tracking-[-0.02em] text-bright"
              >
                {section.title}
              </h2>
              <ul className="measure mt-4 divide-y divide-hairline border-y border-hairline">
                {links.map((page) => (
                  <li key={page.href}>
                    <Link
                      href={page.href}
                      className="group flex items-start gap-4 py-4 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-base font-semibold text-chalk transition-colors group-hover:text-bright">
                          {page.label}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-silver">
                          {page.description}
                        </p>
                      </div>
                      <ArrowRightIcon className="mt-1 size-4 shrink-0 text-dim transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-chalk" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
