import * as React from "react";

import { cn } from "@/lib/utils";

function ContextualIcon({
  active,
  activeIcon,
  inactiveIcon,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  active: boolean;
  activeIcon: React.ReactNode;
  inactiveIcon: React.ReactNode;
}) {
  const motion = "flex items-center justify-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]";
  return (
    <span className={cn("relative inline-grid size-4 shrink-0 place-items-center", className)} aria-hidden="true" {...props}>
      <span className={cn(motion, "absolute inset-0", active ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]")}>
        {activeIcon}
      </span>
      <span className={cn(motion, active ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0")}>
        {inactiveIcon}
      </span>
    </span>
  );
}

export { ContextualIcon };
