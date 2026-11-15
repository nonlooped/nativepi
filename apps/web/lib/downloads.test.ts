import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { desktopPlatform } from "./downloads";
import { releaseDownload } from "./releases";
import { GET } from "../app/download/[target]/route";
import { site } from "./site";

const release = {
  tag_name: "v1.19.0", draft: false, prerelease: false,
  assets: [
    "NativePi-1.19.0-arm64.dmg", "NativePi-1.19.0-x64.dmg", "NativePi-Setup-1.19.0.exe",
    "NativePi-1.19.0-x86_64.AppImage", "NativePi-1.19.0-arm64.AppImage",
  ].map(name => ({ name, browser_download_url: `https://github.com/nonlooped/nativepi/releases/download/v1.19.0/${name}` })),
};

describe("download selection", () => {
  it("distinguishes desktop operating systems from mobile browsers claiming Mac or Linux", () => {
    assert.equal(desktopPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "windows");
    assert.equal(desktopPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "mac");
    assert.equal(desktopPlatform("Mozilla/5.0 (X11; Linux x86_64)"), "linux");
    assert.equal(desktopPlatform("Mozilla/5.0 (Linux; Android 15)"), null);
    assert.equal(desktopPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), null);
    assert.equal(desktopPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), null);
    assert.equal(desktopPlatform("unknown browser"), null);
  });

  it("selects the actual installer format for every released architecture", () => {
    const expected = {
      "mac-arm64": "NativePi-1.19.0-arm64.dmg", "mac-x64": "NativePi-1.19.0-x64.dmg",
      "windows-x64": "NativePi-Setup-1.19.0.exe", "linux-x64": "NativePi-1.19.0-x86_64.AppImage",
      "linux-arm64": "NativePi-1.19.0-arm64.AppImage",
    };
    for (const [target, name] of Object.entries(expected)) {
      assert.equal(releaseDownload(release, target), `https://github.com/nonlooped/nativepi/releases/download/v1.19.0/${name}`);
    }
  });

  it("refuses missing builds, malformed releases, prereleases, and mismatched asset URLs", () => {
    assert.equal(releaseDownload({ ...release, assets: [] }, "mac-arm64"), null);
    assert.equal(releaseDownload({ assets: release.assets }, "mac-arm64"), null);
    assert.equal(releaseDownload({ ...release, prerelease: true }, "mac-arm64"), null);
    assert.equal(releaseDownload({ ...release, assets: [{ ...release.assets[0], browser_download_url: "https://example.com/installer.dmg" }] }, "mac-arm64"), null);
    assert.equal(releaseDownload({ ...release, assets: [{ ...release.assets[0], browser_download_url: "https://github.com/nonlooped/nativepi/releases/download/v1.18.0/NativePi-1.19.0-arm64.dmg" }] }, "mac-arm64"), null);
  });

  it("redirects to a verified asset and keeps a useful fallback when GitHub fails", async () => {
    const originalFetch = globalThis.fetch;
    const request = new Request("https://nativepi.nonlooped.xyz/download/mac-arm64");
    const context = { params: Promise.resolve({ target: "mac-arm64" }) };
    try {
      globalThis.fetch = async () => Response.json(release);
      assert.equal((await GET(request, context)).headers.get("location"), release.assets[0].browser_download_url);
      globalThis.fetch = async () => new Response("rate limited", { status: 403 });
      assert.equal((await GET(request, context)).headers.get("location"), site.releasesLatest);
      globalThis.fetch = async () => { throw new Error("network unavailable"); };
      assert.equal((await GET(request, context)).headers.get("location"), site.releasesLatest);
      assert.equal((await GET(request, { params: Promise.resolve({ target: "invalid" }) })).headers.get("location"), `${site.url}/download`);
    } finally { globalThis.fetch = originalFetch; }
  });
});
