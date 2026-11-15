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
  windows: [{ target: "windows-x64", label: "Windows x64" }],
  linux: [{ target: "linux-x64", label: "x64" }, { target: "linux-arm64", label: "ARM64" }],
};
