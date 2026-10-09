import {
  ArrowRightIcon,
  ChatCircleTextIcon,
  GitBranchIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

const workflows = [
  {
    title: "Follow the conversation",
    description: "See Pi think, use tools, and work through your project.",
    detail: "Steer a running turn, queue the next idea, attach images, or fork a conversation. Your sessions are the same ones you use in Pi.",
    href: "/docs/working-with-pi",
    link: "Explore conversations",
    Icon: ChatCircleTextIcon,
  },
  {
    title: "Review the changes",
    description: "Move from a suggested change to a reviewed commit.",
    detail: "Read rich diffs, stage a file or a single hunk, and ask Pi to draft a commit message. Switch clean branches, add worktrees, and open GitHub pull requests.",
    href: "/docs/git",
    link: "Explore source control",
    Icon: GitBranchIcon,
  },
  {
    title: "Stay in your workspace",
    description: "Keep your files, terminals, and active chats close.",
    detail: "Run chats across projects and split persistent terminals beside the conversation. Start browser access when you need the same workspace on another device.",
    href: "/docs/browser-access",
    link: "Explore browser access",
    Icon: TerminalWindowIcon,
  },
  {
    title: "Make it feel like yours",
    description: "Choose the appearance, shortcuts, and Pi setup that fit.",
    detail: "Use light or dark appearance, ten built-in color schemes or your own, and rebind shortcuts. Manage Pi models, thinking levels, packages, and extensions from the window.",
    href: "/docs/settings-and-customization",
    link: "Explore customization",
    Icon: SlidersHorizontalIcon,
  },
] as const;

export function Capabilities() {
  return (
    <section id="features" className="scroll-mt-24 py-20 sm:py-28">
      <div className="rail grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div>
          <h2 className="section-head max-w-[14ch] text-bright">
            From the first prompt to the final diff.
          </h2>
          <p className="lede mt-6 max-w-[35ch]">
            A conversation at the center. Everything you need to work around it.
          </p>
        </div>
        <div className="border-t border-hairline">
          {workflows.map(({ title, description, detail, href, link, Icon }, index) => (
            <details key={title} name="workflows" open={index === 0} className="workflow group border-b border-hairline">
              <summary className="flex cursor-pointer list-none items-start gap-4 py-6 marker:hidden sm:gap-5">
                <Icon className="mt-1 size-5 shrink-0 text-silver" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-lg font-medium tracking-[-0.02em] text-chalk transition-colors group-hover:text-bright">
                    {title}
                  </span>
                  <span className="mt-1 block text-sm text-silver">{description}</span>
                </span>
                <PlusIcon className="workflow-toggle mt-1 size-4 shrink-0 text-silver" aria-hidden="true" />
              </summary>
              <div className="pb-6 ps-9 sm:ps-10">
                <p className="max-w-[52ch] text-sm leading-relaxed text-silver">{detail}</p>
                <Link href={href} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-chalk transition-colors hover:text-bright">
                  {link}<ArrowRightIcon className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
