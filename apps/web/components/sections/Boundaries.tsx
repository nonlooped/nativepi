import { StarIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/site/Button";
import { GitHubMark, WindowsMark } from "@/components/site/Marks";
import { site } from "@/lib/site";

/**
 * The costs, stated by the product rather than discovered by the visitor.
 *
 * This section exists because Product Principle 2 requires it, and because a
 * page that only lists strengths is the one thing a skeptical developer
 * reliably distrusts.
 */
const limits = [
  {
    title: "Windows only, for now",
    body: "The host is Windows-first, single window, and dark only. There is no macOS or Linux build.",
  },
  {
    title: "The installer is unsigned",
    body: "Releases are not code signed yet, so Windows SmartScreen warns on first launch and you have to click through it.",
  },
  {
    title: "Git access is deliberately narrow",
    body: "Branch checkout and creation on a clean worktree, and adding worktrees. No staging, committing, merging, rebasing, discarding, or history rewriting.",
  },
  {
    title: "The graphical API is experimental",
    body: "Extension slots may change between releases. Graphical extensions are trusted code running in the window, not sandboxed code.",
  },
  {
    title: "It is not its own agent",
    body: "No agent loop, no model requests, no added tools, and no support for harnesses other than Pi. If Pi cannot do it, neither can this.",
  },
  {
    title: "Nothing is synced",
    body: "No cloud, no collaboration, no remote projects, no accounts, no paid tier, and no telemetry of any kind.",
  },
];

export function Boundaries() {
  return (
    <section
      id="boundaries"
      className="relative z-10 border-t border-hairline py-24 sm:py-32"
    >
      <div className="rail">
        <div className="max-w-3xl">
          <h2 className="section-head text-bright">
            What it does not do.
          </h2>
          <p className="lede mt-6">
            Worth knowing before you download it rather than after.
          </p>
        </div>

        <ul className="mt-14 grid gap-x-12 gap-y-9 md:grid-cols-2 lg:grid-cols-3">
          {limits.map((limit) => (
            <li key={limit.title}>
              <h3 className="text-sm font-semibold text-chalk">
                {limit.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-silver">
                {limit.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Close() {
  return (
    <section className="relative z-10 overflow-hidden border-t border-hairline">
      <div className="rail py-28 text-center sm:py-36">
        <h2 className="display text-bright">Take it apart yourself.</h2>
        <p className="lede mx-auto mt-6 max-w-xl text-balance">
          The whole thing is MIT licensed, from the app down to the extension
          contract. Read it, fork it, or bend it around the workflow you already
          have.
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
