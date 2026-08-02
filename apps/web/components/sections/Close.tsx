import { StarIcon } from "@phosphor-icons/react/dist/ssr";

import { DownloadButton } from "@/components/site/DownloadButton";
import { Button } from "@/components/site/Button";
import { GitHubMark } from "@/components/site/Marks";
import { site } from "@/lib/site";

export function Close() {
  return (
    <section className="relative z-10 overflow-hidden border-t border-hairline">
      <div className="rail py-28 text-center sm:py-36">
        <h2 className="display text-bright">Take it apart yourself.</h2>
        <p className="lede mx-auto mt-6 max-w-lg text-balance">
          MIT licensed, all the way down to the extension contract. Read it,
          fork it, bend it.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <DownloadButton />
          <Button href={site.repo} variant="outline">
            <StarIcon className="size-4" weight="fill" />
            Star on GitHub
          </Button>
        </div>

        <p className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-silver">
          <span className="flex items-center gap-1.5">
            <GitHubMark className="size-3.5" />
            github.com/nonlooped/nativepi
          </span>
          <span>Made for people who already shape Pi around their workflow.</span>
        </p>
      </div>
    </section>
  );
}
