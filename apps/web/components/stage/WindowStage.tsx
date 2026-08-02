import { AppWindow } from "@/components/app/AppWindow";
import { Hero } from "@/components/stage/Hero";

export function WindowStage() {
  return (
    <section className="overflow-hidden pb-20 pt-28 sm:pb-28 sm:pt-32">
      <Hero />

      <div className="mx-auto mt-14 w-[min(100rem,96vw)] sm:mt-16">
        <div className="plate aspect-video overflow-hidden">
          <AppWindow />
        </div>
      </div>
    </section>
  );
}
