import { Boundaries, Close } from "@/components/sections/Boundaries";
import { Capabilities } from "@/components/sections/Capabilities";
import { Extensions } from "@/components/sections/Extensions";
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
      <Extensions />
      <Capabilities />
      <Boundaries />
      <Close />
    </>
  );
}
