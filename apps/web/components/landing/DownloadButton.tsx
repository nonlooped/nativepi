"use client";

import { ArrowDownIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import Link from "next/link";


import { desktopPlatform, desktopTarget, platformNames } from "@/lib/downloads";

const subscribe = () => () => {};
const serverPlatform = () => null;
const browserPlatform = () => desktopPlatform(navigator.userAgent, navigator.maxTouchPoints);

export function DownloadButton() {
  const platform = useSyncExternalStore(subscribe, browserPlatform, serverPlatform);

  return (
    <Link href="/download" onClick={async event => {
      event.preventDefault();
      let architecture = "", bitness = "";
      try {
        const hints = await (navigator as Navigator & { userAgentData?: { getHighEntropyValues(keys: string[]): Promise<{ architecture?: string; bitness?: string }> } }).userAgentData?.getHighEntropyValues(["architecture", "bitness"]);
        architecture = hints?.architecture ?? "";
        bitness = hints?.bitness ?? "";
      } catch { /* Browsers may decline architecture hints. */ }
      const target = desktopTarget(navigator.userAgent, architecture, bitness, navigator.maxTouchPoints);
      window.location.assign(target ? `/download/${target}` : "/download");
    }} className="landing-button landing-button-primary">
      <ArrowDownIcon aria-hidden="true" />
      {platform ? `Download for ${platformNames[platform]}` : "Download NativePi"}
    </Link>
  );
}
