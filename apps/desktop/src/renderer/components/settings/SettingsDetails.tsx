import type { ReactNode } from "react";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";

/** Named disclosure keeps uncommon controls discoverable, including in search. */
export default function SettingsDetails({ id, title, summary, children }: {
  id: string; title: string; summary?: string; children: ReactNode;
}) {
  return <details data-setting={id} className="settings-details group/settings-details border-b border-border/40 last:border-b-0">
    <summary className="flex cursor-pointer list-none items-center gap-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {summary ? <span className="mt-1 block text-[0.8125rem] leading-5 text-body-muted-foreground">{summary}</span> : null}
      </span>
      <CaretRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-layout) ease-(--motion-ease-out) group-open/settings-details:rotate-90 motion-reduce:transition-none" />
    </summary>
    <div className="pb-4">{children}</div>
  </details>;
}
