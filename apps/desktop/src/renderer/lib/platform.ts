/**
 * Which shell this renderer is running in.
 *
 * The same document is served two ways: inside the frameless Electron window,
 * where the preload bridge exists and NativePi draws its own title bar, and over
 * the network to a browser on another device, where it does neither. Anything
 * that draws or reserves space for window chrome asks here first.
 */
export const isDesktopShell = typeof window !== "undefined" && window.nativepi !== undefined;
