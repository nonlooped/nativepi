# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The site serves people evaluating NativePi before they install anything:

- Existing Pi users deciding whether a desktop interface is worth adding to a
  workflow that already works in the terminal. Their real question is what they
  lose by adopting it, not what they gain.
- Developers who want a graphical coding agent and do not want terminal fluency
  to be the price of entry. Their question is whether this is a serious tool.
- Extension authors evaluating whether the graphical extension API is stable and
  expressive enough to build against.

All three arrive from GitHub, a link, or search, on a desktop browser, in a
tab next to the editor they already use. They are skeptical by default and have
seen many agent wrappers.

## Product Purpose

The site exists to make NativePi legible and credible in under a minute, and to
send the visitor to the GitHub repository. It is the public face of a free,
MIT-licensed Windows desktop interface for the Pi coding agent.

Success means a visitor can state what NativePi is, why its relationship to Pi
is different from other agent frontends, and what it costs them to try, then
acts on that by opening the repository.

## Positioning

NativePi is a Pi-only desktop wrapper, not a competing agent harness. Pi owns
the agent loop, providers, models, authentication, tools, prompts, skills,
extensions, queues, compaction, and sessions. NativePi renders what Pi returns.

The claim a neighboring product cannot truthfully copy: nothing is locked in.
Sessions and credentials stay in Pi's normal storage in `~/.pi/agent` and remain
fully interchangeable with the Pi CLI. There is no second conversation store, no
account, no cloud, no telemetry. Uninstalling NativePi leaves the Pi workflow
exactly as it was.

The second differentiator is that NativePi extends Pi's extension API into a
graphical one, so the app itself is hackable by the same people who already
shape Pi.

## Operating Context

- The visitor is on the web, evaluating. The product itself is a Windows-only
  Electron desktop application; the site never pretends otherwise.
- Distribution is GitHub Releases. Installers are currently unsigned, so
  Windows SmartScreen warns on first launch. The site states this plainly
  rather than letting the visitor discover it after downloading.
- NativePi bundles a pinned Pi version, so a separate Pi installation is not
  required, and existing Pi credentials, configuration, and sessions are reused.
- The graphical extension API is published as `@nativepi/extension-api` and is
  experimental; it may change between releases.

## Capabilities and Constraints

Site scope:

- Marketing surface (Persuade) plus a smaller documentation surface (Read).
- Documentation is two general pages plus a complete reference for the
  graphical extension API.
- Deployed on Vercel from this monorepo at `apps/web`.
- Dark only. The product is dark only; the site matches and ships no light
  theme and no theme toggle.

Product facts the site may state, all sourced from the desktop PRODUCT.md and
README:

- Projects, chat discovery, and opening folders in installed editors.
- Session workflows: new, resume, rename, clone, fork, delete, import, HTML
  export, session tree, statistics, compaction.
- Streamed text, thinking, tool activity, file-change summaries, rich diffs,
  retries, steering, follow-ups, queues, and abort.
- Image attachments by paste, drag and drop, or file picker.
- Pi-backed model and thinking-level selection, favorite models, provider
  authentication, project trust.
- Git status and working-tree diffs, clean-worktree branch switch or creation,
  worktrees added as projects.
- Pi package install, update, removal, and reload at user or project scope.
- Pi slash commands, prompt templates, and skills offered in the composer.
- Project-scoped integrated terminals that survive being hidden.
- An on-demand, access-token-protected local server that presents the same
  workspace in a browser on the local network.

Boundaries the site must not blur:

- Windows only, single window, dark only.
- No agent loop of its own, no LLM requests of its own, no added agent tools,
  no support for other harnesses.
- Git mutation is narrow: branch checkout and creation on a clean worktree, and
  adding worktrees. No staging, committing, merging, rebasing, discarding,
  checkpointing, or history rewriting.
- No cloud sync, collaboration, remote projects, accounts, paid tiers, or
  telemetry.

## Brand Commitments

- The product name is NativePi. Pi is named accurately as the agent that owns
  and performs agent work.
- The Departure Mono wordmark is the identity anchor and stays. The existing
  asset is `docs/assets/nativepi-wordmark.svg`. Departure Mono is by Helena
  Zhang under the SIL Open Font License.
- Voice is direct and calm. It does not assume Pi or terminal expertise, and it
  does not oversell. No emoji. No em dashes in prose.
- Third-party marks appear only for things NativePi genuinely uses or supports:
  model providers Pi can authenticate, the Windows platform, GitHub, and Pi
  itself. They indicate compatibility, never endorsement or partnership.

## Evidence on Hand

- `docs/assets/nativepi-home.png`: one screenshot of the app at an empty-state
  home view.
- `docs/assets/nativepi-wordmark.svg`: the wordmark.
- `docs/assets/nativepi-social-preview.png`: social preview image.
- `apps/desktop/src/`: the source of truth for implemented behavior.
- `packages/extension-api/src/index.ts`: the complete, small public surface of
  the graphical extension API.
- The repository is `github.com/nonlooped/nativepi`, MIT licensed.

No testimonials, customer logos, download counts, star counts, usage
benchmarks, pricing, press coverage, or commercial proof assets exist. The site
must not fabricate any of them. The window on the marketing page is a screenshot
of the running app, and it is the only depiction of the product the site makes.

## Product Principles

1. Credibility comes from demonstration, not adjectives. Show the interface
   doing the work rather than describing how good it is.
2. State the costs where a visitor would otherwise find them later: Windows
   only, unsigned installer, experimental extension API.
3. Pi is the product core. Never imply NativePi replaces, competes with, or
   reimplements it.
4. Respect the visitor's autonomy the way the product respects their machine:
   no dark patterns, no manufactured urgency, no gated content.
5. The site's own behavior should model the product's claims. Local, fast, no
   trackers, works without an account.

## Accessibility & Inclusion

- Keyboard operable throughout, with visible focus treatment.
- `prefers-reduced-motion: reduce` must neutralize scroll-linked motion, 3D
  camera movement, and ambient animation, leaving all content readable and all
  meaning intact.
- The ambient background is decorative. Every page remains complete and
  legible with backgrounds, motion, and JavaScript disabled.
- Text contrast meets WCAG AA against the dark ground. Copy does not require
  prior familiarity with Pi's terminal interface.
