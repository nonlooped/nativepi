import { describe, expect, test } from "bun:test";
import { findTunnelUrl } from "./remoteAccess.ts";

describe("tunnel log parsing", () => {
  test("finds the hostname in the banner cloudflared prints", () => {
    const log = [
      "2026-07-29T10:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...",
      "2026-07-29T10:00:01Z INF +------------------------------------------------------+",
      "2026-07-29T10:00:01Z INF |  Your quick Tunnel has been created! Visit it at:     |",
      "2026-07-29T10:00:01Z INF |  https://plants-yields-suspected-mailing.trycloudflare.com |",
      "2026-07-29T10:00:01Z INF +------------------------------------------------------+",
    ].join("\n");

    expect(findTunnelUrl(log)).toBe("https://plants-yields-suspected-mailing.trycloudflare.com");
  });

  test("ignores the bare domain in the line that precedes the hostname", () => {
    expect(findTunnelUrl("INF Requesting new quick Tunnel on trycloudflare.com...")).toBeUndefined();
  });

  test("has nothing to report while cloudflared is still starting", () => {
    expect(findTunnelUrl("")).toBeUndefined();
    expect(findTunnelUrl("2026-07-29T10:00:00Z ERR failed to dial edge")).toBeUndefined();
  });
});
