"use client";

import { useSyncExternalStore } from "react";

import { AppleMark, LinuxMark, WindowsMark } from "@/components/site/Marks";
import { Button } from "@/components/site/Button";
import { site } from "@/lib/site";

type Platform = "windows" | "macos" | "linux";

function detectPlatform(): Platform | null {
  const userAgent = navigator.userAgent;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform;

  if (/android|iphone|ipad|ipod/i.test(userAgent)) return null;
  if (/mac/i.test(platform)) {
    return "macos";
  }
  if (/win/i.test(platform)) {
    return "windows";
  }
  if (/linux/i.test(platform)) {
    return "linux";
  }

  return null;
}

function subscribe() {
  return () => {};
}

const platforms = {
  windows: { label: "Windows", Icon: WindowsMark },
  macos: { label: "macOS", Icon: AppleMark },
  linux: { label: "Linux", Icon: LinuxMark },
} as const;

export function DownloadButton() {
  const platform = useSyncExternalStore(subscribe, detectPlatform, () => null);

  if (!platform) {
    return (
      <Button href={site.releasesLatest} variant="primary" external={false}>
        Download NativePi
      </Button>
    );
  }

  const { label, Icon } = platforms[platform];

  return (
    <Button href={site.downloads[platform]} variant="primary" external={false}>
      <Icon className="size-4" />
      {`Download for ${label}`}
    </Button>
  );
}
