# NativePi web

NativePi's landing and download site, built with Next.js, React, and Tailwind
CSS. Deployed to Vercel. The website has two pages: `/` and `/download`.

## Develop

```sh
bun install          # from the repository root
bun run --cwd apps/web dev
```

The site runs on <http://localhost:3000>.

For another device on the same network, use this machine's LAN address on port
3000. The Next.js configuration allows dev requests from IPv4 addresses assigned
to this host, so its interactive client also initializes through the LAN URL.
No arbitrary external origins are allowed. After a network-address change,
restart the dev server to refresh the allowed addresses.

With the dev server running, check that connection using:

```sh
bun run --cwd apps/web test:lan
```

An explicit LAN URL can also be passed as the first argument.

## Checks

```sh
bun run --cwd apps/web typecheck
bun run --cwd apps/web lint
bun test apps/web/lib/downloads.test.ts apps/web/lib/landscapeTexture.test.ts
bun run --cwd apps/web build
```

Builds use Turbopack, which resolves this workspace's Bun install layout.
After removing routes, `bun node_modules/next/dist/bin/next typegen` from
`apps/web` refreshes generated route types before a standalone typecheck.

## Deploying to Vercel

Set **Root Directory** to `apps/web`, with **Include source files outside of the
Root Directory** enabled. `vercel.json` supplies install and build commands.

`lib/site.ts` holds the canonical origin and public release links. `robots.txt`
and `sitemap.xml` use that origin; the sitemap lists the landing and download
pages. Vercel Web Analytics is enabled.

## Structure

- `app/page.tsx` and `components/landing/`: the single-screen introduction,
  real desktop/phone captures, and OGL dithered landscape. The download button
  navigates directly to `/download` and adapts its label to the visitor's OS.
- `app/landing.css`: the shared neutral palette, typography, controls, and
  landing layout. Both pages use the living landscape. Ambient motion runs at up to 30fps, pauses offscreen
  or in hidden tabs, and respects reduced motion and the pause control.
- `app/download/page.tsx` and `download.css`: the download page, with translucent
  OS panels over the landscape and working HTML links for Windows x64,
  macOS Apple Silicon/Intel, and Linux x64/ARM64.
- `app/download/[target]/route.ts`: resolve a build to the latest Stable GitHub
  installer. Missing assets and upstream errors fall back to the release page.
  `lib/releases.ts` validates release data and exact download URLs.
- `lib/downloads.ts`: supported targets, architecture labels, and desktop OS
  identification. `lib/downloads.test.ts` checks selection and failure paths.
- `public/app/desktop.webp` and `phone.webp`: matching captures of the running
  app and Local Access. Retake them together when the interface changes.
- `public/landscape/` and `public/brand/`: landscape and real product/platform
  marks. Sources, licenses, and attribution are recorded in their credits files.

The still landscape is visible from the first CSS paint, including when
JavaScript loads slowly or fails. The live layer takes over only after a
correctly sized, successful frame. Shader, texture, or context failures preserve
the still image. `lib/landscapeTexture.ts` avoids an unsupported R-axis texture
parameter in OGL's WebGL1 path; its focused test exercises the real OGL uploader.

The previous website documentation and download UI have been removed. There is
no docs route or redirect; unknown URLs use the normal 404 page. Project docs
remain in the repository. `PRODUCT.md` records the site's scope and boundaries.
Desktop release operations are described in [`docs/release.md`](../../docs/release.md).

Departure Mono is by Helena Zhang under the SIL Open Font License; its license
travels with the font in `public/fonts`. The Pi mark comes from <https://pi.dev/logo-auto.svg>.
