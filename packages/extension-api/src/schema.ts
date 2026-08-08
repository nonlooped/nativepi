/**
 * NativePi's host-provided Zod instance.
 *
 * Renderer builds import this subpath without bundling Zod. The Pi half resolves
 * the same API through this package's declared dependency.
 */
export { z } from "zod";
