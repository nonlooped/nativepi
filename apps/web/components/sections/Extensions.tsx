import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Code } from "@/components/site/Code";
import { slots } from "@/components/stage/layers";
import { site } from "@/lib/site";

/**
 * The second differentiator, and the one most likely to earn a repository visit.
 *
 * The snippet is the real API from packages/extension-api/src/index.ts, not a
 * simplified illustration, and the four slots are the four the type actually
 * declares.
 */

const example = `import { defineRenderer } from "@nativepi/extension-api";

export default defineRenderer({
  // Draw a tool call your own way, wherever it appears in the transcript.
  tools: {
    "db.query": ({ call, result, ctx }) => (
      <ResultTable
        sql={String(call.arguments.sql)}
        rows={result?.details}
        projectDir={ctx.session?.projectDir}
      />
    ),
  },

  // Add a titled panel to the context pane, beside the diff view.
  panels: [
    {
      key: "schema",
      title: "Schema",
      render: (ctx) => <SchemaTree dir={ctx.session?.projectDir} />,
    },
  ],
});`;

const manifest = `{
  "nativepi": {
    "renderer": "./src/renderer.tsx"
  }
}`;

export function Extensions() {
  return (
    <section id="extensions" className="relative z-10 py-24 sm:py-32">
      <div className="rail">
        <div className="max-w-3xl">
          <h2 className="section-head text-bright">
            The app itself is hackable.
          </h2>
          <p className="lede mt-6">
            You already shape Pi with TypeScript extensions. Add a renderer entry
            and they can draw in the window too.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            <Code
              code={example}
              lang="tsx"
              filename="src/renderer.tsx"
              className="h-full"
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-chalk">
              Four places to contribute
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-silver">
              Slots only. A broken extension cannot take the window with it.
            </p>

            <ul className="mt-6 divide-y divide-hairline border-y border-hairline">
              {slots.map((slot) => (
                <li key={slot.key} className="py-3.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-slot">
                      {slot.label}
                    </span>
                    <code className="font-mono text-xs text-dim">
                      {slot.type}
                    </code>
                  </div>
                  <p className="mt-1 text-sm text-silver">{slot.blurb}</p>
                </li>
              ))}
            </ul>

            <h3 className="mt-9 text-sm font-semibold text-chalk">
              How it loads
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-silver">
              Point your manifest at a browser entry. esbuild compiles it, and
              your components share NativePi&apos;s React instance.
            </p>

            <div className="mt-4">
              <Code code={manifest} lang="json" filename="pi-package.json" />
            </div>

            <p className="mt-5 text-xs text-silver">
              Experimental. Slots may change between releases.
            </p>

            <Link
              href="/docs/extension-api"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-chalk transition-colors hover:text-bright"
            >
              Read the extension API reference
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        </div>

        <p className="mt-12 text-sm text-silver">
          Extensions without a renderer entry keep working, unchanged.{" "}
          <a
            href={site.extensionApi}
            target="_blank"
            rel="noreferrer noopener"
            className="text-chalk underline decoration-hairline underline-offset-4 transition-colors hover:decoration-current"
          >
            See the package on GitHub
          </a>
          .
        </p>
      </div>
    </section>
  );
}
