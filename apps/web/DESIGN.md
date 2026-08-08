---
name: NativePi Web
description: The public surface for NativePi, structured like the desktop workspace it introduces.
colors:
  void: "oklch(0.115 0.004 285)"
  workspace-ink: "oklch(0.155 0.004 285)"
  sidebar-graphite: "oklch(0.18 0.005 285.885)"
  raised-graphite: "oklch(0.19 0.005 285)"
  popover-graphite: "oklch(0.21 0.006 285.885)"
  soft-slate: "oklch(0.225 0.006 286.033)"
  interactive-slate: "oklch(0.235 0.006 286.033)"
  accent-slate: "oklch(0.274 0.006 286.033)"
  chalk-text: "oklch(0.94 0.004 285)"
  bright-text: "oklch(0.985 0 0)"
  primary-chalk: "oklch(0.92 0.004 286.32)"
  muted-silver: "oklch(0.64 0.012 286.067)"
  dim-silver: "oklch(0.6 0.012 286)"
  destructive-coral: "oklch(0.704 0.191 22.216)"
  favorite-gold: "oklch(0.82 0.16 85)"
  success-green: "oklch(0.72 0.17 145)"
  warning-amber: "oklch(0.78 0.14 75)"
  info-blue: "oklch(0.74 0.12 235)"
  slot-cyan: "oklch(0.78 0.11 205)"
  border-hairline: "oklch(1 0 0 / 9%)"
  input-hairline: "oklch(1 0 0 / 15%)"
  focus-ring: "oklch(0.552 0.016 285.938)"
typography:
  wordmark:
    fontFamily: "Departure Mono, monospace"
    fontSize: "1.375rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.04em"
  display:
    fontFamily: "Raleway Variable, sans-serif"
    fontSize: "clamp(2.75rem, 6vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.045em"
  section:
    fontFamily: "Raleway Variable, sans-serif"
    fontSize: "clamp(1.75rem, 3.6vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Raleway Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  lede:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "clamp(1.0625rem, 1.5vw, 1.3125rem)"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  ui:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.625
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  2xl: "1.125rem"
  3xl: "1.375rem"
  full: "9999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "8": "2rem"
  "12": "3rem"
  "16": "4rem"
  "24": "6rem"
  "32": "8rem"
components:
  button-primary:
    backgroundColor: "{colors.primary-chalk}"
    textColor: "{colors.popover-graphite}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "0 1.125rem"
    height: "2.75rem"
  button-outline:
    backgroundColor: "{colors.input-hairline}"
    textColor: "{colors.chalk-text}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "0 1.125rem"
    height: "2.75rem"
  window-panel:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.chalk-text}"
    rounded: "{rounded.lg}"
    padding: "1rem"
  composer-cta:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.chalk-text}"
    rounded: "{rounded.3xl}"
    padding: "1.5rem"
---

# Design System: NativePi Web

## Overview

**Creative North Star: “The Focused Public Workspace”**

The site should feel like NativePi before the visitor downloads NativePi. It
uses the desktop app’s graphite layers, precise typography, compact controls,
literal product evidence, and floating composer geometry without recreating the
application as website chrome.

The page is not a mock application. Navigation remains ordinary website
navigation, product facts remain factual copy, and the only depiction of the
running product is the unaltered screenshot.

Key characteristics:

- A quiet application header and one dominant proposition in the first viewport.
- A single leading edge for the relationship to Pi, headline, explanation,
  actions, and installer caveat.
- The real NativePi screenshot shown immediately after the proposition at its
  native 16:9 ratio.
- A short linear argument about Pi compatibility, data ownership, and graphical
  extensions.
- Near-monochrome graphite. Saturated hue keeps the same meaning it has in the
  app.

## Color

The web surface inherits the desktop graphite ladder. Workspace Ink is the page
ground, Sidebar Graphite separates persistent utility regions, Raised Graphite
belongs to floating or grouped surfaces, and Void is reserved for the stage
behind the real application window.

**The Color-Is-Status Rule.** Saturated hue communicates status, file state,
provider identity, or extension ownership. It is never a general brand accent.

**The Slot-Cyan Rule.** Cyan marks NativePi graphical extension slots and
nothing else.

**The Provider-Mark Rule.** Provider SVGs keep their official color inside the
mark. Surrounding chrome remains neutral. The marks communicate compatibility,
not partnership.

**The Caveats-Are-Not-Marginalia Rule.** Installer signing and experimental-API
copy use Muted Silver or stronger. Dim Silver is for genuinely optional context.

## Typography

- Departure Mono is the NativePi wordmark and nothing else.
- Raleway is reserved for concise headings and product identity.
- Nunito Sans carries interface labels and prose.
- The system monospace stack carries literal paths, commands, types, and code.

Display copy is left aligned on one 52rem rail. This avoids the generic centered
product-launch composition and gives the first viewport one obvious reading
order. Headings use balanced wrapping; descriptions use pretty wrapping; body
measure stays between 60 and 72 characters.

## Layout

The opening region is deliberately simpler than the application. A 3.5rem
header contains only the wordmark, Docs, and GitHub. Below it, the relationship
to Pi, headline, one-sentence explanation, actions, and installer caveat share a
single leading edge and a 52rem maximum width. No side navigation, fact rail,
breadcrumb, or status pane competes with the proposition.

The screenshot then spans up to 96rem with 1rem mobile and 1.5rem larger-screen
gutters. It always remains 16:9, uncropped, until it naturally becomes too small
to inspect on a phone. Supporting arguments use one flexible copy column and an
optional 24rem proof column. At narrower widths those columns stack in reading
order.

Docs are Read mode. They keep a fixed navigation rail on wide screens, a 68ch
measure, generous heading space, syntax highlighting, and anchored headings.

## Elevation and Shapes

Persistent page sections are flat and separated with close tones and hairlines.
Shadows belong only to surfaces that genuinely float:

- The unaltered application screenshot gets the strongest window cast and a
  low-opacity white image outline.
- The final call to action uses the desktop composer’s large radius and soft
  elevation.
- Small state diagrams may use one inset edge but do not become dashboard cards.

Controls use medium corners, grouped data uses large corners, and the composer
call to action uses the extra-large conversation radius.

## Motion

There is no staged, scroll-linked, or ambient animation. Hover and focus
transitions are interruptible and limited to the exact properties that change.
Press feedback follows the desktop app’s one-pixel translation. Reduced motion
removes transitions without changing information or layout.

## Components

### Application header

The header uses Workspace Ink, a one-pixel bottom hairline, the NativePi
wordmark, and two compact navigation actions. It does not carry product facts or
become a translucent floating pill.

### Opening proposition

The first viewport has one focal point: “Keep Pi. Add a window.” Supporting copy
states the no-migration benefit in one sentence. Download is the one filled
action; GitHub stays visually secondary. Platform, license, and signing details
sit on one quiet line below the actions.

### Application screenshot

Use the screenshot of the running app without overlays, retouching, cropping,
tilt, caption bar, or staged animation. It follows the proposition directly so
the visitor sees evidence before the next argument begins.

### Provider marks

Marks share one restrained row or wrapped line. Never put each provider in a
card or imply endorsement through a logo wall.

### Data ownership proof

Show NativePi and the Pi command line reading the same `~/.pi/agent` state. The
proof must name sessions, packages, settings, and credentials without implying a
NativePi-owned conversation store.

### Extension slots

Graphical extension contributions use cyan only on the slot icon and frame.
Copy must state that the API is experimental.

### Final call to action

The closing action uses the desktop composer’s shape and elevation. It remains
compact, keeps one filled primary action, and does not repeat a giant marketing
headline.

## Do and Don’t

Do:

- Keep Pi named as the agent and NativePi named as its desktop interface.
- Build hierarchy with one reading order, graphite tone, spacing, and hairlines.
- Keep the real screenshot large, literal, and early.
- State unsigned installers and the experimental API where a visitor decides.
- Keep the page short enough to understand in under a minute.

Don’t:

- Reuse the centered grid-background launch-page composition common to coding
  agent sites.
- Rebuild or decorate the product interface in marketing markup.
- Use gradient text, glass cards, floating provider tiles, testimonials, counts,
  or metrics the project cannot prove.
- Use Departure Mono outside the wordmark.
- Use color as decoration or add a general bright accent.
