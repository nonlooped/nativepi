"use client";

import { ArrowDownIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import Link from "next/link";

import { desktopPlatform, platformNames } from "@/lib/downloads";

const subscribe = () => () => {};
const serverPlatform = () => null;
const browserPlatform = () => desktopPlatform(navigator.userAgent, navigator.maxTouchPoints);

export function DownloadButton() {
  const platform = useSyncExternalStore(subscribe, browserPlatform, serverPlatform);

  return (
    <Link href="/download" className="landing-button landing-button-primary">
      <ArrowDownIcon aria-hidden="true" />
      {platform ? `Download for ${platformNames[platform]}` : "Download NativePi"}
    </Link>
  );
}
