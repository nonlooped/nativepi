import { useState } from "react";

export default function ProjectIcon({name, src}: {name: string; src?: string}) {
  const [failed, setFailed] = useState<string>();
  return (
    <span aria-hidden="true" className="relative inline-flex size-4.5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted text-[0.625rem] font-semibold text-muted-foreground">
      {[...name.trim()][0]?.toLocaleUpperCase() ?? "?"}
      {src && src !== failed ? <img src={src} alt="" className="absolute inset-0 size-full bg-sidebar object-contain grayscale" onError={() => setFailed(src)} /> : null}
    </span>
  );
}
