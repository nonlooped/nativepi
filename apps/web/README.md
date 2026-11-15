# NativePi web

NativePi's landing and download site, built with Next.js, React, and Tailwind
CSS. Deployed to Vercel. The website has two pages: `/` and `/download`.

## Develop

```sh
bun install          # from the repository root
bun run --cwd apps/web dev
```

The site runs on <http://localhost:3000>.

## Checks

```sh
bun run --cwd apps/web typecheck
bun run --cwd apps/web lint
bun test apps/web/lib/downloads.test.ts
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
  landing layout. Ambient landscape motion runs at up to 30fps, pauses offscreen
  or in hidden tabs, and respects reduced motion and the pause control.
- `app/download/page.tsx` and `download.css`: the download page, listing Windows
  x64, macOS Apple Silicon/Intel, and Linux x64/ARM64 with working HTML links.
- `app/download/[target]/route.ts`: resolve a build to the latest Stable GitHub
  installer. Missing assets and upstream errors fall back to the release page.
  `lib/releases.ts` validates release data and exact download URLs.
- `lib/downloads.ts`: supported targets, architecture labels, and desktop OS
  identification. `lib/downloads.test.ts` checks selection and failure paths.
- `public/app/desktop.webp` and `phone.webp`: matching captures of the running
  app and Local Access. Retake them together when the interface changes.
- `public/landscape/` and `public/brand/`: landscape and real product/platform
  marks. Sources, licenses, and attribution are recorded in their credits files.

The live landscape fades in after its first correctly sized frame. Its still
fallback is used only without JavaScript or WebGL to avoid a startup pattern swap.

The previous website documentation and download UI have been removed. There is
no docs route or redirect; unknown URLs use the normal 404 page. Project docs
remain in the repository. `PRODUCT.md` records the site's scope and boundaries.
Desktop release operations are described in [`docs/release.md`](../../docs/release.md).

Departure Mono is by Helena Zhang under the SIL Open Font License; its license
travels with the font in `public/fonts`. The Pi mark comes from <https://pi.dev/logo-auto.svg>.
