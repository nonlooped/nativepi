import { StarIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/site/Button";
import { GitHubMark, WindowsMark } from "@/components/site/Marks";
import { site } from "@/lib/site";

/**
 * The costs, stated by the product rather than discovered by the visitor.
 *
 * One line each. These were paragraphs, and a paragraph invites the reader to
 * skim past a limitation they should actually register.
 */
const limits = [
  ["Platform", "Windows only. Single window, dark only. No macOS or Linux."],
  ["Installer", "Unsigned, so SmartScreen warns on first launch."],
  ["Git", "Branches and worktrees. No commits, merges, or history rewriting."],
  ["Extensions", "The graphical API is experimental and unsandboxed."],
  ["Agent", "None of its own. If Pi cannot do it, neither can this."],
  ["Sync", "No cloud, no accounts, no paid tier, no telemetry."],
];

export function Boundaries() {
  return (
    <section
      id="boundaries"
      className="relative z-10 border-t border-hairline py-24 sm:py-32"
    >
      <div className="rail grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-20">
        <h2 className="section-head text-bright">
          What it
          <br className="hidden lg:block" /> does not do.
        </h2>

        <dl className="divide-y divide-hairline border-y border-hairline">
          {limits.map(([term, detail]) => (
            <div
              key={term}
              className="grid gap-x-8 gap-y-1 py-4 sm:grid-cols-[8rem_minmax(0,1fr)]"
            >
              <dt className="text-sm font-semibold text-chalk">{term}</dt>
              <dd className="text-sm leading-relaxed text-silver">{detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

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
          <Button href={site.repo} variant="primary">
            <StarIcon className="size-4" weight="fill" />
            Star on GitHub
          </Button>
          <Button href={site.releasesLatest} variant="outline">
            <WindowsMark className="size-4" />
            Download for Windows
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
