import Image from "next/image";

import { cn } from "@/lib/cn";

/**
 * The NativePi window, as a screenshot of the running application.
 *
 * This is the single most persuasive asset on the page, so it is the real thing:
 * a rebuilt-in-markup facsimile has to reflow at every width the stage can hand
 * it, and every width where it reflows differently from the app is a width where
 * the page is lying. A picture is honest at all of them.
 *
 * Its intrinsic ratio is 2560x1440. Anything framing it uses aspect-video
 * so the frame never crops the window or letterboxes it.
 */
export function AppWindow({ className }: { className?: string }) {
  return (
    <Image
      src="/app/window.png"
      alt="The NativePi window: a project sidebar, a new-chat composer with model and branch controls, and a Changes pane listing modified files."
      width={2560}
      height={1440}
      priority
      sizes="(min-width: 1667px) 100rem, 96vw"
      className={cn("h-full w-full object-cover object-left-top", className)}
    />
  );
}
