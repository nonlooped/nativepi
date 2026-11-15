"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ArrowDownIcon, XIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import Link from "next/link";

import { desktopPlatform, platformNames } from "@/lib/downloads";
import { DownloadChoices } from "./DownloadChoices";

const subscribe = () => () => {};
const serverPlatform = () => null;
const browserPlatform = () => desktopPlatform(navigator.userAgent, navigator.maxTouchPoints);

export function DownloadButton() {
  const platform = useSyncExternalStore(subscribe, browserPlatform, serverPlatform);

  return (
    <Dialog.Root>
      <Dialog.Trigger
        nativeButton={false}
        render={<Link href="/download" prefetch={false} />}
        onClick={event => event.preventDefault()}
        className="landing-button landing-button-primary"
      >
        <ArrowDownIcon aria-hidden="true" />
        {platform ? `Download for ${platformNames[platform]}` : "Download NativePi"}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="download-backdrop" />
        <Dialog.Viewport className="download-viewport">
          <Dialog.Popup className="download-dialog">
            <Dialog.Close className="dialog-close" aria-label="Close downloads"><XIcon aria-hidden="true" /></Dialog.Close>
            <Dialog.Title>Download NativePi</Dialog.Title>
            <Dialog.Description>Free and open source. Connect your own model provider.</Dialog.Description>
            <DownloadChoices preferred={platform} />
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
