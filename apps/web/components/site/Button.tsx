import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

const base =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md px-[1.125rem] text-sm font-medium " +
  "transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out " +
  "active:translate-y-px whitespace-nowrap";

const variants = {
  primary:
    "bg-primary-chalk text-popover hover:bg-bright " +
    "shadow-[0_1px_2px_0_oklch(0_0_0/40%)]",
  outline:
    "border border-input-hairline bg-white/[0.04] text-chalk " +
    "hover:bg-white/[0.09] hover:border-white/25",
  ghost: "text-silver hover:text-chalk hover:bg-white/[0.06]",
} as const;

type Variant = keyof typeof variants;

export function Button({
  href,
  variant = "primary",
  className,
  children,
  external,
  ...rest
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
  external?: boolean;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">) {
  const isExternal = external ?? /^https?:/.test(href);

  return (
    <Link
      href={href}
      className={cn(base, variants[variant], className)}
      {...(isExternal
        ? { target: "_blank", rel: "noreferrer noopener" }
        : null)}
      {...rest}
    >
      {children}
    </Link>
  );
}
