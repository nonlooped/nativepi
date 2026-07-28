# NativePi web

The marketing site and documentation for NativePi. Next.js 16 on the App
Router, deployed to Vercel.

## Develop

```sh
bun install          # from the repository root
bun run web:dev      # or: cd apps/web && bun run dev
```

The site runs on <http://localhost:3000>.

## Build

```sh
bun run web:build
```

Builds use Turbopack, which resolves modules correctly against Bun's isolated
install layout in this workspace.

## Deploying to Vercel

Create the project against this repository and set **Root Directory** to
`apps/web`, with **Include source files outside of the Root Directory** enabled
so the Bun workspace resolves. `vercel.json` supplies the install and build
commands; nothing else needs configuring.

Set the canonical origin in `lib/site.ts` before the first production deploy.
Metadata, `robots.txt`, and `sitemap.xml` all read `site.url` from there.

## How it is put together

- `app/` routes. The marketing page is `app/page.tsx`; docs live under
  `app/docs`.
- `components/stage/` the pinned window that comes apart on scroll, plus the
  static ambient field behind it. `WindowStage.tsx` owns the scroll rig and the
  flat arrangement used on narrow screens and under reduced motion.
- `components/app/` the NativePi window, which is a screenshot of the running
  app in `public/app/window.png`. Retake it when the interface changes.
- `components/sections/` the rest of the marketing page.
- `components/docs/` read-mode typography and navigation.
- `lib/site.ts` every fact and link the site states. Nothing on the site may
  claim anything this file does not.

`DESIGN.md` records the visual system and `PRODUCT.md` records product truth.
Both are the authority when the two disagree with the code.

## Assets

Provider marks in `public/providers` are official SVGs copied unmodified from
`@lobehub/icons-static-svg`. `lib/providerMarks.ts` is generated from them:

```sh
bun run marks
```

The Pi mark comes from <https://pi.dev/logo-auto.svg>. Departure Mono is by
Helena Zhang under the SIL Open Font License; its license travels with the font
in `public/fonts`.
