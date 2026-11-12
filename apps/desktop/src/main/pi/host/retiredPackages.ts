import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const retired = /^npm:@nativepi\/(?:ask-user|title-generator|service-tier|mcp|meta)(?:@[^\s]+)?$/;
export function isRetiredPackage(source: string): boolean { return retired.test(source); }

/** Existing npm installations must not register duplicate tools, title hooks, or providers.
 * Leave Pi's files alone: the CLI keeps its configuration until the user removes a package.
 */
export function excludeRetiredPackages(): void {
  const get = DefaultResourceLoader.prototype.getExtensions;
  DefaultResourceLoader.prototype.getExtensions = function () {
    const result = get.call(this);
    const removed = result.extensions.filter(extension => isRetiredPackage(extension.sourceInfo.source));
    if (!removed.length) return result;
    const paths = new Set(removed.map(extension => extension.path));
    result.runtime.pendingProviderRegistrations = result.runtime.pendingProviderRegistrations.filter(item => !paths.has(item.extensionPath));
    result.runtime.pendingNativeProviderRegistrations = result.runtime.pendingNativeProviderRegistrations.filter(item => !paths.has(item.extensionPath));
    return {
      ...result,
      extensions: result.extensions.filter(extension => !paths.has(extension.path)),
      warnings: [ ...(result.warnings ?? []), ...removed.map(extension => ({
        path: extension.path,
        warning: `${extension.sourceInfo.source} is retired and ignored in NativePi. Remove it with Pi's package manager; see NativePi's upgrade notes.`,
      })) ],
    };
  };
}
