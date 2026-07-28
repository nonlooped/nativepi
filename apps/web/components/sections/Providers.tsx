import { ProviderMark } from "@/components/site/ProviderMark";
import { providers } from "@/lib/site";

/**
 * Compatibility, stated once and proved with official marks.
 *
 * Deliberately not a logo wall: no tiles, no card per provider, no grid implying
 * partnership or scale. One row and one honest line. The trademark notice lives
 * in the footer so the section reads as a statement rather than a legal notice.
 */
export function Providers() {
  return (
    <section
      aria-label="Supported model providers"
      className="relative z-10 border-y border-hairline bg-ink/60 py-14 backdrop-blur-sm"
    >
      <div className="rail">
        <p className="text-center text-sm text-silver">
          NativePi adds no providers of its own. It uses whatever Pi can
          authenticate.
        </p>

        <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-10 gap-y-7">
          {providers.map((provider) => (
            <li
              key={provider.file}
              title={provider.name}
              className="text-chalk transition-colors duration-200"
            >
              <ProviderMark
                id={provider.file.replace(/\.svg$/, "")}
                name={provider.name}
                mono={provider.mono}
                className="h-6 w-auto opacity-75 transition-opacity duration-200 hover:opacity-100"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
