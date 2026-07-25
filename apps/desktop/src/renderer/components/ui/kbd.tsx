import { cn } from "@/lib/utils.ts";

function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "rounded-sm border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export { Kbd };
