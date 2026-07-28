import { ArrowDownIcon, StarIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/site/Button";
import { PiMark, WindowsMark } from "@/components/site/Marks";
import { site } from "@/lib/site";

/**
 * The opening statement.
 *
 * The primary action is the repository, so it is the only filled button on the
 * page. The Windows and unsigned-installer costs are stated here rather than
 * discovered later, which is Product Principle 2 applied to the first viewport.
 */
export function Hero() {
  return (
    <div className="rail text-center">
      <p className="flex items-center justify-center gap-2 text-sm text-silver">
        <PiMark className="size-3.5" />
        Built around the Pi coding agent
      </p>

      <h1 className="display mt-5 text-bright">
        Pi, at home
        <br />
        on your desktop.
      </h1>

      <p className="lede mx-auto mt-6 max-w-2xl text-balance">
        A free, open source Windows interface for Pi. It renders the agent you
        already use, and it keeps every session, credential, and setting exactly
        where Pi puts them.
      </p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Button href={site.repo} variant="primary">
          <StarIcon className="size-4" weight="fill" />
          Star on GitHub
        </Button>
        <Button href={site.releasesLatest} variant="outline">
          <WindowsMark className="size-4" />
          Download for Windows
        </Button>
      </div>

      {/* A caveat, not marginalia. It gets a readable tone. */}
      <p className="mt-4 text-xs text-silver">
        MIT licensed. Windows only. Releases are unsigned, so SmartScreen warns
        on first launch.
      </p>
    </div>
  );
}

export function ScrollCue() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-hairline bg-void/90 px-3 py-1.5 text-xs text-silver backdrop-blur-sm">
      <ArrowDownIcon className="size-3.5" />
      Scroll to take it apart
    </div>
  );
}
