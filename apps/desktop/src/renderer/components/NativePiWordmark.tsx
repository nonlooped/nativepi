import { cn } from "@/lib/utils.ts";

export default function NativePiWordmark({
  display = false,
  className,
}: {
  display?: boolean;
  className?: string;
}) {
  // `role="img"` because `aria-label` is prohibited on a bare span, and both
  // halves of the mark are hidden — without a role the product's own name
  // reached the accessibility tree as nothing at all.
  return (
    <span
      className={cn("nativepi-wordmark", display && "nativepi-wordmark-display", className)}
      role="img"
      aria-label="NativePi"
    >
      <span className="nativepi-wordmark-native" aria-hidden="true">native</span>
      <span aria-hidden="true">pi</span>
    </span>
  );
}
