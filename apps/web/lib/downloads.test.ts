import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { desktopPlatform, desktopTarget, downloadFailureSchema } from "./downloads";
import { releaseDownload, nightlyDownload } from "./releases";
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

  it("uses reliable CPU information and falls back for ambiguous or unsupported devices", () => {
    assert.equal(desktopTarget("Windows NT 10.0; Win64; x64"), "windows-x64");
    assert.equal(desktopTarget("Windows NT 10.0; Win64; x64", "arm", "64"), null);
    assert.equal(desktopTarget("Macintosh; Intel Mac OS X", "arm", "64"), "mac-arm64");
    assert.equal(desktopTarget("Macintosh; Intel Mac OS X", "x86", "64"), "mac-x64");
    assert.equal(desktopTarget("Macintosh; Intel Mac OS X"), null);
    assert.equal(desktopTarget("Linux aarch64"), "linux-arm64");
    assert.equal(desktopTarget("Linux i686"), null);
    assert.equal(desktopTarget("Linux; Android", "arm", "64"), null);
  });

  it("only serves a nightly when explicitly requested and refuses unrelated prereleases", () => {
    const nightly = JSON.parse(JSON.stringify(release).replaceAll("1.19.0", "1.20.0-nightly.202611160100"));
    nightly.prerelease = true;
    assert.equal(releaseDownload(nightly, "mac-arm64"), null);
    assert.equal(nightlyDownload([release, nightly], "mac-arm64"), nightly.assets[0].browser_download_url);
    assert.equal(nightlyDownload([release], "mac-arm64"), null);
    assert.equal(nightlyDownload([{ ...nightly, draft: true }], "mac-arm64"), null);
    assert.equal(nightlyDownload([{ ...nightly, assets: [] }, nightly], "mac-arm64"), null);
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
      assert.equal((await GET(new Request(`${request.url}?channel=nightly`), context)).headers.get("location"), `${site.url}/download?unavailable=mac-arm64&channel=nightly`);
      globalThis.fetch = async () => new Response("rate limited", { status: 403 });
      assert.equal((await GET(request, context)).headers.get("location"), `${site.url}/download?unavailable=mac-arm64&channel=stable`);
      globalThis.fetch = async () => { throw new Error("network unavailable"); };
      assert.equal((await GET(request, context)).headers.get("location"), `${site.url}/download?unavailable=mac-arm64&channel=stable`);
      assert.equal((await GET(request, { params: Promise.resolve({ target: "invalid" }) })).headers.get("location"), `${site.url}/download`);
    } finally { globalThis.fetch = originalFetch; }
  });
  it("validates failure links and retries the lookup without a cached result", async () => {
    assert.equal(downloadFailureSchema.safeParse({ unavailable: "https://example.com" }).success, false);
    assert.equal(downloadFailureSchema.safeParse({ unavailable: ["mac-arm64", "mac-x64"] }).success, false);
    assert.deepEqual(downloadFailureSchema.parse({ unavailable: "mac-arm64" }), { unavailable: "mac-arm64", channel: "stable" });
    const previous = globalThis.fetch;
    let options: RequestInit | undefined;
    try {
      globalThis.fetch = async (_url, init) => { options = init; return Response.json(release); };
      const result = await GET(new Request(`${site.url}/download/mac-arm64?channel=stable&retry=1`), { params: Promise.resolve({ target: "mac-arm64" }) });
      assert.equal(options?.cache, "no-store");
      assert.equal(result.headers.get("location"), release.assets[0].browser_download_url);
    } finally { globalThis.fetch = previous; }
  });

});
