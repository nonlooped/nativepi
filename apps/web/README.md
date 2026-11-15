# NativePi web

NativePi's marketing site and task-focused documentation, built with Next.js 16,
React 19.3, and Tailwind CSS 4. Deployed to Vercel.

## Develop

```sh
bun install          # from the repository root
bun run --cwd apps/web dev
```

The site runs on <http://localhost:3000>.

## Build

```sh
bun run --cwd apps/web build
bun run --cwd apps/web typecheck
bun run --cwd apps/web lint
```

Builds use Turbopack, which resolves modules correctly against Bun's isolated
install layout in this workspace.

## Deploying to Vercel

Create the project against this repository and set **Root Directory** to
`apps/web`, with **Include source files outside of the Root Directory** enabled
so the Bun workspace resolves. `vercel.json` supplies the install and build
commands; nothing else needs configuring.

`lib/site.ts` holds the canonical origin, metadata, and public release links.
`robots.txt` and `sitemap.xml` use that origin. Vercel Web Analytics is enabled
and disclosed in the site footer.

## How it is put together

- `app/` routes. The marketing page is `app/page.tsx`; docs live under
  `app/docs`.
- `components/landing/` the single-screen introduction, OGL dithered landscape,
  desktop/phone captures, and Base UI download dialog. Simple motion uses CSS.
  Ambient motion renders at up to 30fps and pauses offscreen, in hidden tabs,
  with reduced motion, or through the visible pause control. Empty-space clicks
  and pointer movement produce short ripples.
- `app/landing.css` the landing page's neutral palette, type, and responsive layout.
- `app/download/` a JavaScript-free download page and platform routes that resolve
  Stable assets from GitHub Releases. Missing assets or upstream failures fall
  back to the release page. `lib/releases.ts` validates the release and asset URLs.
- `public/landscape/` the desktop app's Mist photograph and a still dither fallback;
  see its credits file. The live plate fades in after its first correctly sized
  frame; the still plate is used only without JavaScript or WebGL, avoiding a
  pattern swap during startup.
- `public/app/desktop.webp` and `phone.webp` are matching real captures from the
  running desktop app and Local Access. Retake them together when the UI changes.
- `public/brand/` contains platform marks; sources and attribution are in its credits file.
- `components/docs/` read-mode typography and navigation.
- `lib/site.ts` shared metadata, release/download URLs, and common external links.
- `lib/docs.ts` documentation navigation and descriptions.

`PRODUCT.md` records product boundaries.
Check workflow claims against the desktop implementation and keep the docs in
sync with its actual controls. Desktop release automation is described in
[`docs/release.md`](../../docs/release.md).

## Assets

Provider marks in `public/providers` are official SVGs copied unmodified from
`@lobehub/icons-static-svg`. `lib/providerMarks.ts` is generated from them:

```sh
bun run marks
```

The Pi mark comes from <https://pi.dev/logo-auto.svg>. Departure Mono is by
Helena Zhang under the SIL Open Font License; its license travels with the font
in `public/fonts`.
