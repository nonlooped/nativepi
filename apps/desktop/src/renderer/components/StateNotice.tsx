import { useReducedMotion } from "../lib/motion.ts";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { Button } from "./ui/button.tsx";

/** A read has one visible outcome: waiting, failed with recovery, or its content. */
export default function StateNotice({ title, detail, retry, loading = false }: {
  title: string; detail?: string; retry?: () => void; loading?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  return <div role={loading ? "status" : "alert"} className="min-w-0 py-3 text-sm">
    <p className="flex items-center gap-2 font-semibold text-foreground">
      {title}
      {loading && !reducedMotion ? <CircleNotchIcon aria-hidden className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
    </p>
    {detail ? <p className="mt-1 break-words text-xs leading-5 text-body-muted-foreground">{detail}</p> : null}
    {retry ? <Button variant="outline" size="sm" className="mt-2" onClick={retry}>Try again</Button> : null}
  </div>;
}
