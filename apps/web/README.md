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
- `components/stage/` the hero and the aligned application screenshot with a
  full-size image link.
- `components/app/` the NativePi window, which is a screenshot of the running
  app in `public/app/window.png`. Retake it when the interface changes.
- `components/sections/` workflow details, the shared-storage diagram, extension
  links, and download calls to action. Workflow details work without JavaScript.
- `components/docs/` read-mode typography and navigation.
- `lib/site.ts` shared metadata, release/download URLs, and common external links.
- `lib/docs.ts` documentation navigation and descriptions.

`DESIGN.md` records the visual system; `PRODUCT.md` records product boundaries.
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
