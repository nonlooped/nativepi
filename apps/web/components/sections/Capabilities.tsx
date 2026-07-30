import {
  DiffVignette,
  ServerVignette,
  TerminalVignette,
  TurnVignette,
} from "@/components/app/Vignettes";

/**
 * What the window actually contains, shown rather than listed.
 *
 * This section used to be sixteen bullets in four equal columns, which gave
 * every capability the same weight and left the reader to imagine all of them.
 * Three pictures and three lines carry the same claim and can be checked.
 */
const shots = [
  {
    title: "Watch the turn happen",
    line: "Streamed text, thinking, and every tool call, with steer and stop while it runs.",
    render: <TurnVignette />,
  },
  {
    title: "See what it changed",
    line: "Git status and working-tree diffs beside the transcript, not in another app.",
    render: <DiffVignette />,
  },
  {
    title: "Run things yourself",
    line: "Project-scoped terminals that keep running when you hide them.",
    render: <TerminalVignette />,
  },
];

export function Capabilities() {
  return (
    <section className="relative z-10 border-t border-hairline py-24 sm:py-32">
      <div className="rail">
        <div className="max-w-2xl">
          <h2 className="section-head text-bright">
            One window, the whole job.
          </h2>
          <p className="lede mt-6">
            Pi does the work. You can see all of it.
          </p>
        </div>

        <ul className="mt-14 grid gap-8 lg:grid-cols-3">
          {shots.map((shot) => (
            <li key={shot.title} className="flex flex-col">
              <div className="min-h-[13rem] flex-1">{shot.render}</div>
              <h3 className="mt-5 text-sm font-semibold text-chalk">
                {shot.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-silver">
                {shot.line}
              </p>
            </li>
          ))}
        </ul>

        {/*
          The local server was a trailing paragraph nobody would reach. It is a
          real feature, so it gets a real row.
        */}
        <div className="mt-16 grid items-center gap-6 border-t border-hairline pt-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12">
          <div>
            <h3 className="text-sm font-semibold text-chalk">
              Reach it from the couch
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-silver">
              The same projects, chats, and terminals in a browser on your own
              network. Never published to the internet.
            </p>
          </div>
          <ServerVignette />
        </div>
      </div>
    </section>
  );
}
