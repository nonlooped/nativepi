import Link from "next/link";

import { DocsNav } from "@/components/docs/DocsNav";

/**
 * Docs are Read mode, not Persuade.
 *
 * The window silhouette does not follow the reader in here. Only the wordmark
 * does. Structure, measure, and wayfinding outrank expression on this surface.
 */
export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rail pt-16 lg:flex lg:gap-12">
      <DocsNav />

      <div className="min-w-0 flex-1 pb-24">
        {children}

        <footer className="mt-16 border-t border-hairline pt-6 text-sm text-silver">
          Something wrong or missing on this page?{" "}
          <Link
            href="https://github.com/nonlooped/nativepi/issues"
            target="_blank"
            rel="noreferrer noopener"
            className="text-chalk underline decoration-hairline underline-offset-4 transition-colors hover:decoration-current"
          >
            Open an issue
          </Link>
          .
        </footer>
      </div>
    </div>
  );
}
