import { z } from "zod";

const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.literal(false),
  prerelease: z.boolean(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string().url() })),
});

/** Accept only the requested channel’s exact installer and matching repository/tag URL. */
export function releaseDownload(data: unknown, target: string, channel: "stable" | "nightly" = "stable"): string | null {
  const parsed = releaseSchema.safeParse(data);
  if (!parsed.success) return null;
  const release = parsed.data;
  if (channel === "stable" ? release.prerelease || !/^v?\d+\.\d+\.\d+$/.test(release.tag_name)
    : !release.prerelease || !/^v?\d+\.\d+\.\d+-nightly\.\d+$/.test(release.tag_name)) return null;
  const version = release.tag_name.replace(/^v/, "");
  const names: Record<string, string> = {
    "mac-arm64": `NativePi-${version}-arm64.dmg`,
    "mac-x64": `NativePi-${version}-x64.dmg`,
    "windows-x64": `NativePi-Setup-${version}.exe`,
    "linux-x64": `NativePi-${version}-x86_64.AppImage`,
    "linux-arm64": `NativePi-${version}-arm64.AppImage`,
  };
  const name = names[target];
  if (!name) return null;
  const expected = `https://github.com/nonlooped/nativepi/releases/download/${release.tag_name}/${name}`;
  return release.assets.find(asset => asset.name === name && asset.browser_download_url === expected)?.browser_download_url ?? null;
}

/** GitHub lists releases newest first; ignore stable releases and other prereleases. */
export function nightlyDownload(data: unknown, target: string): string | null {
  if (!Array.isArray(data)) return null;
  const latest = data.find(item => {
    const parsed = releaseSchema.safeParse(item);
    return parsed.success && parsed.data.prerelease && /^v?\d+\.\d+\.\d+-nightly\.\d+$/.test(parsed.data.tag_name);
  });
  return releaseDownload(latest, target, "nightly");
}
