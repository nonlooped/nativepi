import { ClockIcon } from "@phosphor-icons/react/Clock";
import { useReducedMotion } from "../lib/motion.ts";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { Button } from "./ui/button.tsx";

/** A read has one visible outcome: waiting, failed with recovery, or its content. */
export default function StateNotice({ title, detail, retry, loading = false }: {
  title: string; detail?: string; retry?: () => void; loading?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  return <div role={loading ? "status" : "alert"} className="flex min-h-14 items-start gap-3 py-3 text-sm">
    <span className={loading ? "flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground ring-1 ring-border/50" : "flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive"}>
      {loading ? reducedMotion ? <ClockIcon aria-hidden className="size-4" /> : <CircleNotchIcon aria-hidden className="size-4 animate-spin" /> : <WarningCircleIcon aria-hidden className="size-4" />}
    </span>
    <div className="min-w-0 flex-1 pt-1">
      <p className={loading ? "text-muted-foreground" : "font-medium text-foreground"}>{title}</p>
      {detail ? <p className="mt-1 break-words text-xs leading-5 text-body-muted-foreground">{detail}</p> : null}
      {retry ? <Button variant="outline" size="sm" className="mt-2" onClick={retry}>Try again</Button> : null}
    </div>
  </div>;
}
