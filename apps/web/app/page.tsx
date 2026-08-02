import { Close } from "@/components/sections/Close";
import { Interchange } from "@/components/sections/Interchange";
import { Providers } from "@/components/sections/Providers";
import { Atmosphere } from "@/components/stage/Atmosphere";
import { WindowStage } from "@/components/stage/WindowStage";

export default function Home() {
  return (
    <>
      <Atmosphere />
      <WindowStage />
      <Providers />
      <Interchange />
      <Close />
    </>
  );
}
