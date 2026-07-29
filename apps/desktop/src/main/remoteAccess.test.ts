import { describe, expect, test } from "bun:test";
import { parseTailscaleStatus } from "./remoteAccess.ts";

describe("Tailscale status", () => {
  test("accepts the fields NativePi needs and ignores future fields", () => {
    expect(parseTailscaleStatus(JSON.stringify({
      BackendState: "Running",
      Self: { DNSName: "desktop.example.ts.net.", FutureField: true },
      FutureField: true,
    }))).toEqual({
      BackendState: "Running",
      Self: { DNSName: "desktop.example.ts.net." },
    });
  });

  test("rejects malformed CLI output", () => {
    expect(parseTailscaleStatus("not json")).toBeUndefined();
  });
});
