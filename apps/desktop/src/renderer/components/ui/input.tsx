import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

// `text-sm` at every width. The preset dropped to 12px above `md`, which made a
// field you type into the same size as the timestamps beside it, and disagreed
// with the 0.875rem DESIGN.md gives `input`. Fields that hold a path or a
// pattern still opt into `font-mono text-xs` themselves, where dense is right.
function Input({ className, ...props }: InputPrimitive.Props) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-input/20 px-2.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
