/**
 * Which shell this renderer is running in.
 *
 * The same document is served two ways: inside the frameless Electron window,
 * where the preload bridge exists and NativePi draws its own title bar, and over
 * the network to a browser on another device, where it does neither. Anything
 * that draws or reserves space for window chrome asks here first.
 */
export const isDesktopShell = typeof window !== "undefined" && window.nativepi !== undefined;

/**
 * The name of the operating system whose preferences this window inherits.
 *
 * Read from the browser rather than from the Electron main process on purpose.
 * The settings that defer to "the system" — reduced motion, and anything else
 * behind a media query — resolve against whatever is rendering the document. On
 * a phone opened through Remote Access that is the phone, not the machine
 * running NativePi, so naming the host would name the wrong device.
 *
 * `userAgentData` is the supported reading and Electron provides it; the
 * `platform` sniff is the fallback for the browsers that never shipped it.
 */
export function osName(): string {
  if (typeof navigator !== "object") return "your system";

  const reported = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const source = reported || navigator.platform || "";

  if (/mac|iphone|ipad|ipod/i.test(source)) return "macOS";
  if (/win/i.test(source)) return "Windows";
  if (/android/i.test(source)) return "Android";
  if (/linux|x11|cros/i.test(source)) return "Linux";
  return "your system";
}
