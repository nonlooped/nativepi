/**
 * What the window actually contains.
 *
 * A definition list rather than a grid of identical icon cards: these entries
 * have genuinely different weights, and a card grid would flatten them into a
 * shape that says nothing.
 */
const groups = [
  {
    title: "Sessions",
    items: [
      "Create, resume, rename, clone, and fork",
      "Import, export to HTML, and delete",
      "Session tree, statistics, and compaction",
      "Drafts survive a failed cold send",
    ],
  },
  {
    title: "Running a turn",
    items: [
      "Streamed text, thinking, and tool activity",
      "Steer mid-run, queue a follow-up, or stop",
      "Retries, errors, and failed calls shown in full",
      "Images by paste, drag and drop, or file picker",
    ],
  },
  {
    title: "Code",
    items: [
      "Git status and working-tree diffs",
      "Switch or create a branch from the composer",
      "Add a worktree as a project of its own",
      "Open the folder in your installed editor",
    ],
  },
  {
    title: "Around the work",
    items: [
      "Project-scoped terminals that survive hiding",
      "Pi packages installed at user or project scope",
      "Pi slash commands, prompts, and skills by name",
      "A quit confirmation that names what it would stop",
    ],
  },
];

export function Capabilities() {
  return (
    <section className="relative z-10 border-t border-hairline py-24 sm:py-32">
      <div className="rail">
        <div className="max-w-3xl">
          <h2 className="section-head text-bright">
            One window, the whole job.
          </h2>
          <p className="lede mt-6">
            Pi does the work. NativePi makes every part of it visible, and puts
            the controls where you can reach them without leaving the
            conversation.
          </p>
        </div>

        <dl className="mt-14 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group) => (
            <div key={group.title}>
              <dt className="border-b border-hairline pb-3 text-sm font-semibold text-chalk">
                {group.title}
              </dt>
              <dd>
                <ul className="mt-4 space-y-2.5">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="text-sm leading-relaxed text-silver"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-14 max-w-2xl text-sm leading-relaxed text-silver">
          There is also an on-demand local server, protected by an access token,
          that presents the same projects, chats, changes, and terminals in a
          browser on your own network while the desktop app stays open. It is off
          until you start it, and it is never published to the internet.
        </p>
      </div>
    </section>
  );
}
