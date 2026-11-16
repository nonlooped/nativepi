export const downloadTargets = ["mac-arm64", "mac-x64", "windows-x64", "linux-x64", "linux-arm64"] as const;
export type DownloadTarget = typeof downloadTargets[number];
export type DesktopPlatform = "mac" | "windows" | "linux";

/** Mobile browsers also advertise Mac/Linux. Check those before desktop names. */
export function desktopPlatform(userAgent: string, maxTouchPoints = 0): DesktopPlatform | null {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return null;
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";
  if (/Linux|X11/i.test(userAgent)) return "linux";
  return null;
}

export const platformNames: Record<DesktopPlatform, string> = { mac: "macOS", windows: "Windows", linux: "Linux" };

export const platformDownloads: Record<DesktopPlatform, { target: DownloadTarget; label: string }[]> = {
  mac: [{ target: "mac-arm64", label: "Apple Silicon" }, { target: "mac-x64", label: "Intel" }],
  windows: [{ target: "windows-x64", label: "x64" }],
  linux: [{ target: "linux-x64", label: "x64" }, { target: "linux-arm64", label: "ARM64" }],
};

/** Prefer explicit architecture hints; macOS user agents conceal the real CPU. */
export function desktopTarget(userAgent: string, architecture = "", bitness = "", maxTouchPoints = 0): DownloadTarget | null {
  const platform = desktopPlatform(userAgent, maxTouchPoints);
  if (!platform) return null;
  const arm = /^(arm|arm64|aarch64)$/i.test(architecture) || /aarch64|arm64/i.test(userAgent);
  const x64 = (/^(x86|x64)$/i.test(architecture) && bitness === "64") || /x86_64|amd64|Win64|WOW64/i.test(userAgent);
  if (platform === "windows") return !arm && x64 ? "windows-x64" : null;
  if (arm) return `${platform}-arm64`;
  if (x64) return `${platform}-x64`;
  return null;
}
