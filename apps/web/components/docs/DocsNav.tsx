"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const sections = [
  {
    title: "Getting started",
    links: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/install", label: "Install and first run" },
      { href: "/docs/working-with-pi", label: "Working with Pi" },
    ],
  },
  {
    title: "Extending",
    links: [{ href: "/docs/extension-api", label: "Graphical extension API" }],
  },
];

export function DocsNav() {
  const pathname = usePathname();

  return (
    <>
      <nav
        aria-label="Documentation"
        className="no-scrollbar -mx-6 mb-10 overflow-x-auto border-y border-hairline px-6 py-2 md:-mx-8 md:px-8 lg:hidden"
      >
        <ul className="flex w-max items-center gap-1">
          {sections.flatMap((section) =>
            section.links.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors duration-150",
                      active
                        ? "bg-white/[0.06] font-medium text-bright"
                        : "text-silver hover:text-chalk",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            }),
          )}
        </ul>
      </nav>

      <nav
        aria-label="Documentation"
        className="sticky top-20 hidden h-fit w-56 shrink-0 lg:block"
      >
        {/*
          These group labels are deliberately not headings. The nav renders before
          the article, so an <h2> here would put two level-two headings ahead of
          the page's <h1> in the document outline. A labelled group carries the
          same meaning without corrupting the heading order.
        */}
        {sections.map((section) => (
          <div
            key={section.title}
            role="group"
            aria-label={section.title}
            className="mb-7"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-silver">
              {section.title}
            </p>
            <ul className="mt-3 space-y-0.5">
              {section.links.map((link) => {
                const active = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "touch-target -ml-2.5 inline-flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150",
                        active
                          ? "bg-white/[0.06] font-medium text-bright"
                          : "text-silver hover:text-chalk",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
