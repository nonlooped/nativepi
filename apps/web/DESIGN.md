---
name: NativePi Web
description: A direct, evidence-led public surface for the Pi desktop workspace.
colors:
  workspace-ink: "oklch(0.155 0.004 285)"
  sidebar-graphite: "oklch(0.18 0.005 285.885)"
  raised-graphite: "oklch(0.19 0.005 285)"
  chalk-text: "oklch(0.94 0.004 285)"
  bright-text: "oklch(0.985 0 0)"
  muted-silver: "oklch(0.71 0.008 286.067)"
  dim-silver: "oklch(0.6 0.012 286)"
  slot-cyan: "oklch(0.78 0.11 205)"
  border-hairline: "oklch(1 0 0 / 9%)"
typography:
  display:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "clamp(3rem, 6.8vw, 6.125rem)"
    fontWeight: 500
    lineHeight: 1.06
    letterSpacing: "-0.06em"
  section:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "clamp(2rem, 3.8vw, 3.5rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.045em"
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.65
---

# NativePi Web

## Direction

The site introduces a serious local developer tool. Keep the existing Departure
Mono wordmark, graphite palette, direct voice, and real application screenshot.
Give the proposition more presence through typography and composition, then let
visitors explore the workflows they care about.

The website stays dark-only. The desktop application's appearance options are
product capabilities, not a reason to change the website's established theme.

Design variance is 7, motion intensity is 3, and visual density is 4. Asymmetry
belongs to the hero and supporting content. Motion acknowledges interaction;
there is no ambient animation or scroll choreography.

## Typography and layout

Departure Mono remains in the outlined wordmark only. Geist carries display,
interface, and reading text. Load variable WOFF2 locally with font-display swap;
the package's Unicode ranges let browsers request only the required subsets.
Use the system monospace stack for literal paths and code.

The main rail is at most 88rem including its gutters. Gutters are 1.25rem on
phones, 2rem from 768px, and 4rem from 1280px. The header is 4.5rem high. Header
and content share their leading edges.

The opening headline and explanation sit side by side on desktop and stack in
reading order below 1024px. Keep the two sentences of the headline distinct.
The screenshot immediately follows at its unaltered 16:9 ratio within the rail.
Never crop, retouch, tilt, overlay, or rebuild it as website markup. Link the
image to its original file with an explicit full-size label so phone visitors
can inspect it using the browser's native zoom.

Section headings use balanced wrapping and short descriptions use pretty
wrapping. Reading content keeps a 68ch measure. Supporting copy sits below its
heading, rather than floating independently in a section's opposite corner.

## Surfaces and color

Graphite layers organize the page. The provider band and final download section
use Sidebar Graphite; the shared-storage diagram uses a darker inset to group
the state both interfaces share. Keep text readable on every layer.

Color represents status, provider identity, or extension ownership. Cyan belongs
only to graphical extension contributions. Provider marks retain official color
within the mark and indicate compatibility, never endorsement.

Controls use medium corners, grouped diagrams use large corners, and the real
application screenshot uses extra-large corners with a restrained window cast.
Ordinary content remains flat. Avoid repeated cards, glass, gradient text,
decorative grids, manufactured metrics, or invented social proof.

## Interaction and accessibility

Workflow discovery uses native details and summary elements. The first workflow
starts open; a shared name lets supporting browsers open one at a time. Content
and interaction remain available without JavaScript. Summaries have visible
keyboard focus and generous targets. A plus changes to a cross when expanded.

Hover, focus, and press feedback use short transitions on specific properties.
Reduced motion removes transitions without hiding information. Navigation uses
ordinary scrolling with an offset for the sticky header. The page has two
layers: header at 10 and the focused skip link at 20.

Docs are for reading: a sticky navigation rail on wide screens, a native menu on
small screens, anchored headings, and clear active-page styling. Missing pages
provide a visible route back home and into the documentation.

## Credibility

Keep Pi named as the agent and NativePi named as its interface. Explain that
both interfaces share Pi's sessions, credentials, configuration, and packages;
NativePi persists only its own interface state. Disclose unsigned installers
and the experimental graphical API at the relevant decision.

Keep existing metadata, social assets, product routes, documentation routes,
and Vercel Web Analytics. Claims must trace to PRODUCT.md or implemented
behavior. Do not invent counts, benchmarks, endorsements, or provider support.
