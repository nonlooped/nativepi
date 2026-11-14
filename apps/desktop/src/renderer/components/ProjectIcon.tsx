import { useState } from "react";
import { cn } from "../lib/utils.ts";

export default function ProjectIcon({name, src, className}: {name: string; src?: string; className?: string}) {
  const [failed, setFailed] = useState<string>();
  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-4.5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted text-[0.625rem] font-semibold text-muted-foreground", className)}>
      {[...name.trim()][0]?.toLocaleUpperCase() ?? "?"}
      {src && src !== failed ? <img src={src} alt="" className="absolute inset-0 size-full bg-sidebar object-contain" onError={() => setFailed(src)} /> : null}
    </span>
  );
}
