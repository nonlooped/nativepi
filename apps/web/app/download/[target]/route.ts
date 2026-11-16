import { downloadTargets } from "@/lib/downloads";
import { releaseDownload, nightlyDownload } from "@/lib/releases";


/** Resolve a supported build to the latest stable installer, with a download-page fallback. */
export async function GET(request: Request, { params }: { params: Promise<{ target: string }> }) {
  const { target } = await params;
  if (!downloadTargets.some(value => value === target)) {
    return Response.redirect(new URL("/download", request.url), 307);
  }

  const nightly = new URL(request.url).searchParams.get("channel") === "nightly";
  let destination = new URL("/download", request.url).href;
  try {
    const response = await fetch(`https://api.github.com/repos/nonlooped/nativepi/releases${nightly ? "?per_page=100" : "/latest"}`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) destination = (nightly ? nightlyDownload : releaseDownload)(await response.json(), target) ?? destination;
  } catch {
    // The download page still provides choices when the API is unavailable.
  }
  return Response.redirect(destination, 307);
}
