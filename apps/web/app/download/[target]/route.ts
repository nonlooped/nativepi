import { downloadTargets } from "@/lib/downloads";
import { releaseDownload } from "@/lib/releases";
import { site } from "@/lib/site";

/** Resolve a supported build to the latest stable installer, with a release-page fallback. */
export async function GET(request: Request, { params }: { params: Promise<{ target: string }> }) {
  const { target } = await params;
  if (!downloadTargets.some(value => value === target)) {
    return Response.redirect(new URL("/download", request.url), 307);
  }

  let destination: string = site.releasesLatest;
  try {
    const response = await fetch("https://api.github.com/repos/nonlooped/nativepi/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) destination = releaseDownload(await response.json(), target) ?? destination;
  } catch {
    // The release page still provides downloads when the API is unavailable.
  }
  return Response.redirect(destination, 307);
}
