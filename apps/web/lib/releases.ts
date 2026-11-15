import { z } from "zod";

const releaseSchema = z.object({
  tag_name: z.string().regex(/^v?\d+\.\d+\.\d+$/),
  draft: z.literal(false),
  prerelease: z.literal(false),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string().url() })),
});

/** Accept only the exact stable installer and its matching repository/tag URL. */
export function releaseDownload(data: unknown, target: string): string | null {
  const parsed = releaseSchema.safeParse(data);
  if (!parsed.success) return null;
  const release = parsed.data;
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
