---
name: NativePi Web
description: The public marketing and documentation surface for NativePi, built as the app's own window opened up in space.
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
  ambient-field: "oklch(0.28 0.035 225)"
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
    fontSize: "clamp(2.25rem, min(6vw, 8.5vh), 4.75rem)"
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
  title:
    fontFamily: "Raleway Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  lede:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "clamp(1.0625rem, 1.5vw, 1.3125rem)"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  composer:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  ui:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.625
    letterSpacing: "normal"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
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
  "48": "12rem"
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
  layer-plate:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.chalk-text}"
    rounded: "{rounded.lg}"
    padding: "1rem"
  slot-marker:
    backgroundColor: "transparent"
    textColor: "{colors.slot-cyan}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.125rem 0.375rem"
---

# Design System: NativePi Web

## Overview

**Creative North Star: "The Window, Opened"**

The website opens the desktop app's graphite window at a scale large enough to
inspect before installing it. A concise, centered proposition leads directly to
the real interface, followed only by the product's strongest compatibility,
portability, and open-source arguments.

This is the desktop design system inherited whole and given a display register
it did not previously need. The palette, radius scale, Color-Is-Status rule, and
type families carry over unchanged. The web surface adds scale and breathing
room, not a second visual metaphor.

**Key Characteristics:**

- A large, centered application screenshot as the page's visual anchor.
- A short, linear argument with generous separation between sections.
- Near-monochrome graphite, with saturated hue meaning exactly what it means in
  the app.
- The real interface, screenshotted from the running app rather than rebuilt.

## Colors

The web surface inherits the desktop's cool graphite ladder and extends it
downward by one step.

### Primary

- **Primary Chalk:** The light action surface. Carries the single primary
  action on the page.
- **Void:** One step below Workspace Ink. The space the window floats in, and
  the only color on the site the desktop app does not have. It exists because
  the app's deepest background has to become a surface that sits on something.

### Secondary

- **Slot Cyan:** Marks the four extension contribution points, and nothing
  else. This is the one hue the web surface adds, and it is functional: it is
  how a visitor tells the part of the app that is theirs from the part that is
  not.
- **Success Green / Destructive Coral:** Diff additions and deletions, and
  error states, exactly as in the app.
- **Info Blue / Warning Amber / Favorite Gold:** Untracked files, modified
  files, and favorite models. Carried over unchanged.

### Neutral

The full graphite ladder from the desktop system: Workspace Ink, Sidebar
Graphite, Raised Graphite, Popover Graphite, Soft Slate, Interactive Slate,
Accent Slate, with Chalk Text and Muted Silver carrying content, and Dim Silver
added for the lowest-priority marginalia the app never needed.

**Dim Silver** is pinned to the darkest value that still clears 4.5:1 against
Sidebar Graphite, the lightest ground it appears on, which is why it sits close
to Muted Silver rather than well below it. A prettier hierarchy here costs the
people who need the contrast, and the step is small on purpose.

**The Caveats-Are-Not-Marginalia Rule.** Text a visitor needs in order to decide
never uses Dim Silver. The platform-and-signing note, the experimental-API
note, and the provider disclaimer are Muted Silver or above. They are the
least decorative copy on the site.

### Named Rules

**The Color-Is-Status Rule.** Inherited without exception. Chrome stays
neutral. Saturated hue communicates status, severity, file state, extension
ownership, or provider identity. It is never decoration and never brand.

**The Provider-Mark Rule.** Provider logos render in their own official colors
inside their own mark and do not tint anything around them. They state
compatibility with what Pi supports. They never imply endorsement, partnership,
or sponsorship, and no provider name appears in a claim the product cannot
back.

**The No-Gradient-Text Rule.** Emphasis comes from weight, size, and tone.
Gradients belong to the ambient field and to nothing else.

## Typography

**Wordmark:** Departure Mono, self-hosted.
**Display:** Raleway Variable.
**Body:** Nunito Sans Variable.
**Code:** The platform monospace stack.

**Character:** The desktop app keeps Raleway small and architectural because
space is scarce. The web surface has room, so Raleway finally gets to be a
display face: large, tightly tracked, and set in short lines. Nunito Sans keeps
prose open and unpretentious at a real reading size, which is the register the
product's voice already uses.

### Hierarchy

- **Display:** One per page, the opening statement. Capped at 4.75rem and
  clamped against viewport height as well as width so it remains balanced on
  short, wide screens.
- **Section:** The heading for each supporting argument.
- **Headline / Title:** Sub-arguments and doc page headings.
- **Lede:** The single paragraph under a display or section heading. Wider and
  lighter than body.
- **Body:** Documentation prose and long-form explanation, 65 to 72ch.
- **UI:** Interface text the site draws itself. The app's own interface is a
  screenshot and sets its own type.
- **Label:** Metadata and captions.
- **Code:** Paths, snippets, types, diffs, and shell output.

### Named Rules

**The Wordmark-Only Departure Rule.** Inherited. Departure Mono sets the
NativePi wordmark and nothing else. Not section headings, not slot labels, not
code, not eyebrows. The moment it becomes a general-purpose technical typeface
it stops being an identity.

**The Interface-Is-Not-Decoration Rule.** The window is a screenshot of the
running app, at its own scale and in its own words. Do not retouch it for
legibility, do not paste in copy that reads better than the product's, and do
not stage a session the app could not produce.

**The No-Eyebrow Rule.** Sections are introduced by their heading. There is no
tracked uppercase kicker over every section.

## Layout

The page is a short vertical document. The hero copy and actions are centered,
followed by the application screenshot at up to 96% of the viewport and a
100rem cap. This makes the product itself the dominant evidence without cropping
or tilting it.

Page gutters run 1.5rem at mobile, 2rem at tablet, and 4rem above 1280px, with
prose capped at 90rem. Vertical rhythm uses the 4/8/12/16/24/32 step ladder,
with more space above a heading than below it. Supporting sections use ordinary
block flow and generous fixed padding.

The screenshot keeps its 16:9 proportions at every width. It is a picture of a
desktop application, and a desktop application is what it should look like on a
phone.

## Elevation & Depth

Depth is restrained to the screenshot and genuinely raised diagrams.

- **Window Cast:** A large, offset, low-opacity shadow with genuine blur. Never
  a zero-offset halo.
- **Edge Light:** A one-pixel top highlight at low opacity makes the screenshot
  frame read as a window.
- **Ambient Field:** A static, very low-contrast CSS field behind everything,
  which gives the void volume without competing with content.

**The Flat-Until-Floating Rule.** Inherited: only the screenshot and genuinely
raised diagrams cast shadows. Persistent page sections remain flat.

## Shapes

Inherited unchanged. Medium corners for controls, large for grouped rows,
extra-large for conversation surfaces, full circles only for compact icon
actions. Plates use the large radius so they read as app surfaces rather than
as generic cards. Borders stay hairline and low contrast at every scale.

## Motion

The marketing page has no scroll-linked or staged motion. Native scrolling keeps
the screenshot stable and the reading order predictable. Hover and focus
transitions are limited to controls and provider marks.

**The Information-Survives-Stillness Rule.** Inherited and binding here. Freeze
every transition and the page must remain complete.

**The Atmosphere-Is-Decoration Rule.** The ambient field adds depth without
client JavaScript. Removing backgrounds leaves the same complete hierarchy.

## Components

### Buttons

- **Primary:** Primary Chalk fill, dark text, medium radius, 2.75rem tall.
  Exactly one per viewport. It downloads the latest release.
- **Outline:** Hairline border over a faint input-toned fill.
- **Hover / Focus / Active:** Hover shifts tone. Focus shows a visible ring
  against the dark ground. Press translates down one pixel.

### Application Screenshot

The screenshot is the page's primary visual component: full-width within its
large centered frame, with a hairline border, edge light, and cast shadow. It is
never tilted, composited over, or animated.

### Provider Marks

Official provider SVGs at a consistent optical size, in a single row, under one
plain line of copy stating what is true: NativePi uses whatever providers Pi
supports. No grid of tiles, no card per provider, no logo wall implying scale.

### Documentation

Docs are Read mode, not Persuade. They use a fixed sidebar, a 68ch measure,
generous heading space, real syntax highlighting, and anchored headings. The
application screenshot does not follow the reader into the docs. Only the
wordmark does.

## Do's and Don'ts

### Do:

- **Do** keep the application screenshot large and centered.
- **Do** show the interface as a screenshot of the running app, replaced when
  the app changes rather than touched up.
- **Do** state the installer cost plainly.
- **Do** use Phosphor icons, matching the desktop app.

### Don't:

- **Don't** introduce a second visual metaphor once the window is established.
- **Don't** add scroll-linked transforms or tilt the screenshot.
- **Don't** use gradient text, decorative glass, or a colored left border.
- **Don't** put Departure Mono anywhere except the wordmark.
- **Don't** show a capability the app does not have, or a number the project
  cannot prove. There are no download counts, star counts, testimonials, or
  benchmarks to display.
- **Don't** imply provider endorsement or partnership through logo placement.
