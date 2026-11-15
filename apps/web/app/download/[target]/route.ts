import { downloadTargets } from "@/lib/downloads";
import { releaseDownload } from "@/lib/releases";
import { site } from "@/lib/site";

export async function GET(_request: Request, { params }: { params: Promise<{ target: string }> }) {
  const { target } = await params;
  if (!downloadTargets.some(value => value === target)) return Response.redirect(new URL("/download", site.url), 307);
  try {
    const response = await fetch("https://api.github.com/repos/nonlooped/nativepi/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const url = releaseDownload(await response.json(), target);
      if (url) return Response.redirect(url, 307);
    }
  } catch { /* GitHub's release page remains useful during API/rate-limit failures. */ }
  return Response.redirect(site.releasesLatest, 307);
}
