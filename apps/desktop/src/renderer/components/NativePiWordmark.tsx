import { cn } from "@/lib/utils.ts";

export default function NativePiWordmark({
  display = false,
  className,
}: {
  display?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("nativepi-wordmark", display && "nativepi-wordmark-display", className)}
      aria-label="NativePi"
    >
      <span className="nativepi-wordmark-native" aria-hidden="true">native</span>
      <span aria-hidden="true">pi</span>
    </span>
  );
}
