import { ProviderMark } from "@/components/site/ProviderMark";
import { providers } from "@/lib/site";

export function Providers() {
  return (
    <section
      aria-labelledby="providers-title"
      className="border-y border-hairline bg-sidebar"
    >
      <div className="rail grid gap-8 py-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-center lg:gap-12">
        <div>
          <h2
            id="providers-title"
            className="font-display text-lg font-semibold tracking-[-0.02em] text-chalk"
          >
            Providers stay with Pi.
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-silver">
            NativePi uses whichever providers Pi can authenticate. It does not
            add an account layer of its own.
          </p>
        </div>

        <ul className="flex flex-wrap items-center gap-x-8 gap-y-6 lg:justify-end">
          {providers.map((provider) => (
            <li key={provider.file} title={provider.name}>
              <ProviderMark
                id={provider.file.replace(/\.svg$/, "")}
                name={provider.name}
                mono={provider.mono}
                className="h-5 w-auto opacity-65 transition-opacity duration-150 hover:opacity-100"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
