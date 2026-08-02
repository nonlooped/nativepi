"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/site/Wordmark";
import { GitHubMark } from "@/components/site/Marks";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

const nav = [{ href: "/docs", label: "Docs" }];

export function Header() {
  const pathname = usePathname();
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ease-out",
        lifted
          ? "border-b border-hairline bg-void/85 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      {/*
        The pane header is 3rem in the app. The site keeps that measurement so the
        chrome above the window matches the chrome inside it.
      */}
      <div className="rail flex h-14 items-center justify-between gap-6">
        <Link
          href="/"
          className="flex min-h-11 items-center rounded-sm"
          aria-label="NativePi home"
        >
          <Wordmark className="h-[1.375rem]" />
        </Link>

        <nav className="flex items-center gap-1">
          {nav.map((item) => {
            const active =
              item.href.startsWith("/docs") && pathname.startsWith("/docs");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "min-h-11 items-center rounded-md px-3 text-sm transition-colors duration-150",
                  item.href === "/docs"
                    ? "inline-flex"
                    : "hidden sm:inline-flex",
                  active ? "text-chalk" : "text-silver hover:text-chalk",
                )}
              >
                {item.label}
              </Link>
            );
          })}

          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="NativePi on GitHub"
            className={cn(
              "ml-1 inline-flex h-11 items-center gap-2 rounded-md border border-input-hairline",
              "bg-white/[0.04] px-3 text-sm text-chalk transition-colors duration-150",
              "hover:border-white/25 hover:bg-white/[0.09]",
            )}
          >
            <GitHubMark className="h-4 w-4" />
            <span className="hidden min-[380px]:inline">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
