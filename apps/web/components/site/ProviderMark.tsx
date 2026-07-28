import { providerMarks } from "@/lib/providerMarks";
import { cn } from "@/lib/cn";

/**
 * Renders an official provider mark. Mono marks carry no fill of their own, so
 * they are painted with currentColor and take the surrounding text color rather
 * than falling back to the SVG default of black; color marks keep their own
 * brand colors and tint nothing around them, per the Provider-Mark Rule.
 */
export function ProviderMark({
  id,
  name,
  mono,
  className,
}: {
  id: string;
  name: string;
  mono?: boolean;
  className?: string;
}) {
  const mark = providerMarks[id];
  if (!mark) return null;

  return (
    <svg
      viewBox={mark.viewBox}
      role="img"
      aria-label={name}
      className={cn("h-6 w-auto", mono && "fill-current", className)}
      dangerouslySetInnerHTML={{ __html: mark.inner }}
    />
  );
}
