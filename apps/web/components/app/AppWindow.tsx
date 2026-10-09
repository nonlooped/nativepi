import Image from "next/image";

import { cn } from "@/lib/cn";

/** Keep the running application's complete window visible at every width. */
export function AppWindow({ className }: { className?: string }) {
  return (
    <Image
      src="/app/window.png"
      alt="The NativePi window: a project sidebar, a new-chat composer with model and branch controls, and a Changes pane listing modified files."
      width={2560}
      height={1440}
      preload
      sizes="(min-width: 1408px) 1280px, (min-width: 1280px) calc(100vw - 128px), (min-width: 768px) calc(100vw - 64px), calc(100vw - 40px)"
      className={cn(
        "h-full w-full object-contain",
        className,
      )}
    />
  );
}
