import { Capabilities } from "@/components/sections/Capabilities";
import { Close } from "@/components/sections/Close";
import { Interchange } from "@/components/sections/Interchange";
import { Providers } from "@/components/sections/Providers";
import { WindowStage } from "@/components/stage/WindowStage";

export default function Home() {
  return (
    <>
      <WindowStage />
      <Capabilities />
      <Providers />
      <Interchange />
      <Close />
    </>
  );
}
