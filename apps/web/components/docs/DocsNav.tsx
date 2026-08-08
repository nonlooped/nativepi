"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { docsLinks, docsSections } from "@/lib/docs";

export function DocsNav() {
  const pathname = usePathname();
  const currentPage = docsLinks.find((link) => link.href === pathname);

  return (
    <>
      <nav aria-label="Documentation" className="mb-10 lg:hidden">
        <details className="group rounded-lg border border-hairline bg-white/[0.025]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-4 py-2.5 text-sm text-chalk marker:hidden">
            <span>Documentation menu</span>
            <span className="text-silver">{currentPage?.label ?? "Overview"}</span>
          </summary>
          <div className="border-t border-hairline px-4 pb-4 pt-2">
            {docsSections.map((section) => (
              <div key={section.title} role="group" aria-label={section.title} className="mt-4 first:mt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-silver">
                  {section.title}
                </p>
                <ul className="mt-2 grid gap-0.5 sm:grid-cols-2">
                  {section.links.map((link) => {
                    const active = pathname === link.href;
                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center rounded-md px-2.5 py-2 text-sm transition-colors duration-150",
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
          </div>
        </details>
      </nav>

      <nav
        aria-label="Documentation"
        className="no-scrollbar sticky top-20 hidden max-h-[calc(100vh-6rem)] h-fit w-60 shrink-0 overflow-y-auto pb-8 lg:block"
      >
        {docsSections.map((section) => (
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
                        "touch-target -ms-2.5 flex items-center rounded-md px-2.5 py-1.5 text-sm leading-snug transition-colors duration-150",
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
