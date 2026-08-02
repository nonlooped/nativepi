import { StarIcon } from "@phosphor-icons/react/dist/ssr";

import { DownloadButton } from "@/components/site/DownloadButton";
import { Button } from "@/components/site/Button";
import { PiMark } from "@/components/site/Marks";
import { site } from "@/lib/site";

/**
 * The opening statement.
 *
 * Download is the primary action, with the repository available as the secondary
 * path. The platform and unsigned-installer costs are stated here rather than
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

      <p className="lede mx-auto mt-6 max-w-xl text-balance">
        A free, open source app for the Pi coding agent. Same sessions,
        same logins, same files.
      </p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <DownloadButton />
        <Button href={site.repo} variant="outline">
          <StarIcon className="size-4" weight="fill" />
          Star on GitHub
        </Button>
      </div>

      {/* A caveat, not marginalia. It gets a readable tone. */}
      <p className="mt-4 text-xs text-silver">
        MIT licensed. Windows, macOS, and Linux. Unsigned, so your OS warns once.
      </p>
    </div>
  );
}
