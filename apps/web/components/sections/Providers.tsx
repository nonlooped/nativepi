import { ProviderMark } from "@/components/site/ProviderMark";
import { providers } from "@/lib/site";

export function Providers() {
  return (
    <section aria-labelledby="providers-title" className="border-y border-hairline bg-sidebar">
      <div className="rail py-12 sm:py-14">
        <div className="max-w-2xl">
          <h2 id="providers-title" className="font-display text-2xl font-medium tracking-[-0.03em] text-chalk">
            Your models. Your provider accounts.
          </h2>
          <p className="mt-3 max-w-[60ch] text-sm text-silver">
            Pi connects to your providers. NativePi brings those models into the
            window, using the credentials you already have.
          </p>
        </div>
        <ul className="mt-10 flex flex-wrap items-center gap-x-9 gap-y-7 sm:gap-x-11">
          {providers.map((provider) => (
            <li key={provider.file} title={provider.name}>
              <ProviderMark
                id={provider.file.replace(/\.svg$/, "")}
                name={provider.name}
                mono={provider.mono}
                className="h-6 w-auto text-chalk opacity-75 transition-opacity duration-150 hover:opacity-100"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
