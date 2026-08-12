import {
  ArrowsClockwiseIcon,
  GitBranchIcon,
  GlobeHemisphereWestIcon,
  PaintBrushIcon,
  TerminalWindowIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react/dist/ssr";

const capabilities = [
  {
    title: "Review and ship changes",
    detail:
      "Inspect rich diffs, stage files or individual hunks, draft a Conventional Commit with Pi, sync, and open a GitHub pull request.",
    Icon: GitBranchIcon,
  },
  {
    title: "Keep several chats moving",
    detail:
      "Run chats concurrently across projects. Steer an active turn, queue follow-ups, retry, compact, fork, clone, or return to any Pi session.",
    Icon: ArrowsClockwiseIcon,
  },
  {
    title: "Work in persistent terminals",
    detail:
      "Split project-scoped terminals beside the conversation. They stay alive when hidden and while you move between projects.",
    Icon: TerminalWindowIcon,
  },
  {
    title: "Branch without losing context",
    detail:
      "Switch clean branches, create a branch, inspect local and remote history, or add a worktree as its own NativePi project.",
    Icon: TreeStructureIcon,
  },
  {
    title: "Open the same workspace in a browser",
    detail:
      "Start token-protected access on your local network or create a temporary public link. The desktop app remains the host.",
    Icon: GlobeHemisphereWestIcon,
  },
  {
    title: "Make the workspace yours",
    detail:
      "Choose light or dark appearance, use ten built-in color schemes or create one, and rebind keyboard shortcuts by pressing the keys.",
    Icon: PaintBrushIcon,
  },
] as const;

export function Capabilities() {
  return (
    <section id="features" className="scroll-mt-14 bg-ink py-20 sm:py-28 lg:py-32">
      <div className="rail">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end lg:gap-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-silver">The workspace</p>
            <h2 className="section-head mt-4 text-bright">
              One place for the full project loop.
            </h2>
          </div>
          <p className="text-base leading-relaxed text-silver">
            NativePi keeps the conversation at the center, then puts the code,
            terminals, source control, sessions, and Pi controls around it.
          </p>
        </div>

        <ul className="mt-14 grid border-y border-hairline md:grid-cols-2 md:[&>li:nth-child(odd)]:border-e md:[&>li:nth-child(-n+4)]:border-b">
          {capabilities.map(({ title, detail, Icon }) => (
            <li
              key={title}
              className="flex gap-4 border-b border-hairline p-5 last:border-b-0 sm:p-6 md:border-b-0"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-chalk shadow-[inset_0_0_0_1px_var(--color-hairline)]">
                <Icon className="size-4" weight="regular" />
              </span>
              <div>
                <h3 className="font-display text-base font-semibold text-chalk">
                  {title}
                </h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-silver">
                  {detail}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-silver">
          Images, slash commands, skills, model and thinking controls, package
          management, notifications, and automatic updates are built into the
          same workspace.
        </p>
      </div>
    </section>
  );
}
