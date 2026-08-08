import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Read-mode typography: a 68ch measure, more space above a heading than below
 * it, and anchored headings so a section can be linked to directly.
 */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "measure",
        "[&_p]:mt-4 [&_p]:text-base [&_p]:leading-[1.7] [&_p]:text-silver",
        "[&_ul]:mt-4 [&_ul]:space-y-2 [&_ol]:mt-4 [&_ol]:space-y-2",
        "[&_li]:text-base [&_li]:leading-[1.7] [&_li]:text-silver",
        "[&_strong]:font-semibold [&_strong]:text-chalk",
        "[&_a]:text-chalk [&_a]:underline [&_a]:decoration-hairline [&_a]:underline-offset-4",
        "hover:[&_a]:decoration-current",
        "[&_code]:rounded-sm [&_code]:bg-white/[0.07] [&_code]:px-1 [&_code]:py-0.5",
        "[&_code]:font-mono [&_code]:text-[0.875em] [&_code]:text-chalk",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageTitle({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: string;
  lede: string;
}) {
  return (
    <header className="measure mb-12">
      {eyebrow && (
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-silver">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-2 font-display text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-bright">
        {title}
      </h1>
      <p className="lede mt-5">{lede}</p>
    </header>
  );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="measure mb-4 mt-14 scroll-mt-20 font-display text-2xl font-semibold tracking-[-0.025em] text-bright first:mt-0"
    >
      <a href={`#${id}`} className="hover:underline">
        {children}
      </a>
    </h2>
  );
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="measure mb-3 mt-10 scroll-mt-20 font-display text-base font-semibold tracking-[-0.02em] text-chalk"
    >
      {children}
    </h3>
  );
}

/** A note that carries real consequence, not a decorative callout. */
export function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning";
  children: ReactNode;
}) {
  return (
    <aside
      className={cn(
        "measure mt-6 rounded-lg border p-4 text-sm leading-relaxed",
        tone === "warning"
          ? "border-amber/30 bg-amber/[0.06] text-chalk"
          : "border-hairline bg-white/[0.03] text-silver",
      )}
    >
      {children}
    </aside>
  );
}
