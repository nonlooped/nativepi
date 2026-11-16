/**
 * Shared site metadata and release links. Every claim here must
 * be backed by PRODUCT.md, the README, or source: no download counts, star
 * counts, or benchmarks.
 */

const latestRelease = "https://github.com/nonlooped/nativepi/releases/latest";

export const site = {
  name: "NativePi",
  title: "NativePi — AI Workspace for Your Desktop",
  tagline: "AI for your desktop.",
  description:
    "Chat, build projects and review changes in NativePi, a free desktop AI workspace for Windows, macOS, and Linux powered by Pi. Connect your own supported AI account.",
  url: "https://nativepi.nonlooped.xyz",
  shareImage: {
    url: "/share.png",
    width: 1200,
    height: 630,
    alt: "NativePi. Pi, on your desktop.",
  },
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
