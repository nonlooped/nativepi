import { expect, test } from "bun:test";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { excludeRetiredPackages, isRetiredPackage } from "./retiredPackages.ts";
test("matches retired npm package identities precisely", () => {
  for (const name of ["ask-user", "title-generator", "service-tier", "mcp", "meta", "chat-mode", "web-access", "subagents", "subscription-usage", "throughput"]) {
    expect(isRetiredPackage(`npm:@nativepi/${name}`)).toBe(true);
    expect(isRetiredPackage(`npm:@nativepi/${name}@1.0.0`)).toBe(true);
  }
  for (const source of ["npm:@nativepi/extension-api", "npm:@other/mcp", "npm:@nativepi/mcp-other", "/my/meta"])
    expect(isRetiredPackage(source)).toBe(false);
});
test("excludes obsolete hooks and queued provider registrations without touching other extensions", () => {
  const prototype = DefaultResourceLoader.prototype;
  const original = prototype.getExtensions;
  const runtime = {
    pendingProviderRegistrations: [{ extensionPath: "/meta" }, { extensionPath: "/other" }],
    pendingNativeProviderRegistrations: [{ extensionPath: "/meta" }],
  };
  const extensions = [
    { path: "/meta", sourceInfo: { source: "npm:@nativepi/meta" } },
    { path: "/other", sourceInfo: { source: "npm:@other/provider" } },
  ];
  prototype.getExtensions = () => ({ extensions, runtime, errors: [] } as unknown as ReturnType<typeof original>);
  try {
    excludeRetiredPackages();
    const result = prototype.getExtensions();
    expect(result.extensions.map(extension => extension.path)).toEqual(["/other"]);
    expect(runtime.pendingProviderRegistrations).toEqual([{ extensionPath: "/other" }]);
    expect(runtime.pendingNativeProviderRegistrations).toEqual([]);
    expect(result.warnings?.[0]?.warning).toContain("retired");
  } finally { prototype.getExtensions = original; }
});
