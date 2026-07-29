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
 * Its intrinsic ratio is 1917x1016. Anything framing it uses aspect-[1917/1016]
 * so the frame never crops the window or letterboxes it.
 */
export function AppWindow({ className }: { className?: string }) {
  return (
    <Image
      src="/app/window.png"
      alt="The NativePi window: a project sidebar with recent conversations, a new chat asking what you want to build, a composer with model and branch pickers, and a Changes pane listing modified files."
      width={1917}
      height={1016}
      priority
      sizes="(min-width: 900px) 78rem, 92vw"
      className={cn("h-full w-full object-cover object-left-top", className)}
    />
  );
}
