import { codeToHtml } from "shiki";

import { cn } from "@/lib/cn";

/**
 * Server-highlighted code. Shiki runs at build time, so no highlighter ships to
 * the client and the markup is styled before first paint.
 *
 * A maintained high-contrast theme keeps every token legible against the
 * site's graphite code surface instead of its stock editor background.
 */
export async function Code({
  code,
  lang = "tsx",
  className,
  filename,
}: {
  code: string;
  lang?: string;
  className?: string;
  filename?: string;
}) {
  const html = await codeToHtml(code.trim(), {
    lang,
    theme: "github-dark-high-contrast",
    transformers: [
      {
        pre(node) {
          node.properties.style = "background-color:transparent";
          node.properties.tabindex = "0";
        },
      },
    ],
  });

  return (
    <figure
      className={cn(
        "overflow-hidden rounded-lg border border-hairline bg-ink",
        className,
      )}
    >
      {filename && (
        <figcaption className="border-b border-hairline px-3.5 py-2 font-mono text-xs text-silver">
          {filename}
        </figcaption>
      )}
      <div
        className="overflow-x-auto p-3.5 font-mono text-xs leading-[1.7] [&_pre]:min-w-fit"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </figure>
  );
}
