/**
 * Shared site metadata and release links. Every claim here must
 * be backed by PRODUCT.md, the README, or source: no download counts, star
 * counts, or benchmarks.
 */

const latestRelease = "https://github.com/nonlooped/nativepi/releases/latest";

export const site = {
  name: "NativePi",
  tagline: "Pi, on your desktop.",
  description:
    "A free, open-source desktop interface for the Pi coding agent on Windows, macOS, and Linux. Your Pi sessions, credentials, and configuration stay where they are.",
  url: "https://nativepi.nonlooped.xyz",
  repo: "https://github.com/nonlooped/nativepi",
  releases: "https://github.com/nonlooped/nativepi/releases",
  releasesLatest: latestRelease,
  issues: "https://github.com/nonlooped/nativepi/issues",
  license: "https://github.com/nonlooped/nativepi/blob/main/LICENSE",
  extensionApi:
    "https://github.com/nonlooped/nativepi/tree/main/packages/extension-api",
  pi: "https://pi.dev/",
  author: "nonlooped",
} as const;
