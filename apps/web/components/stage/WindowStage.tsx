import { AppWindow } from "@/components/app/AppWindow";
import { Hero } from "@/components/stage/Hero";

export function WindowStage() {
  return (
    <section className="bg-void">
      <Hero />

      <div
        id="app"
        className="scroll-mt-14 px-4 pb-16 pt-4 sm:px-6 sm:pb-24 sm:pt-6 lg:pb-28"
      >
        <div className="window-frame mx-auto aspect-video w-full max-w-[96rem] overflow-hidden">
          <AppWindow />
        </div>
      </div>
    </section>
  );
}
