---
name: NativePi Desktop
description: A focused, dark desktop workspace for operating the Pi coding agent.
colors:
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
  destructive-coral: "oklch(0.704 0.191 22.216)"
  favorite-gold: "oklch(0.82 0.16 85)"
  success-green: "oklch(0.72 0.17 145)"
  warning-amber: "oklch(0.78 0.14 75)"
  info-blue: "oklch(0.74 0.12 235)"
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
  wordmark-display:
    fontFamily: "Departure Mono, monospace"
    fontSize: "2.75rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Raleway Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Raleway Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  composer:
    fontFamily: "Nunito Sans Variable, sans-serif"
    fontSize: "0.9375rem"
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
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
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
  "0.5": "0.125rem"
  "1": "0.25rem"
  "1.5": "0.375rem"
  "2": "0.5rem"
  "2.5": "0.625rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "10": "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary-chalk}"
    textColor: "{colors.popover-graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  button-form:
    backgroundColor: "{colors.primary-chalk}"
    textColor: "{colors.popover-graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 1.25rem"
    height: "2.5rem"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.chalk-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-silver}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  input:
    backgroundColor: "{colors.input-hairline}"
    textColor: "{colors.chalk-text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 0.625rem"
    height: "2.5rem"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.chalk-text}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.75rem"
  composer-surface:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.chalk-text}"
    typography: "{typography.composer}"
    rounded: "{rounded.3xl}"
    padding: "0.5rem 0.75rem 0.75rem"
    width: "48rem"
  user-message:
    backgroundColor: "{colors.interactive-slate}"
    textColor: "{colors.bright-text}"
    typography: "{typography.body}"
    rounded: "{rounded.2xl}"
    padding: "0.75rem 1rem"
  dialog:
    backgroundColor: "{colors.popover-graphite}"
    textColor: "{colors.bright-text}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
    width: "28rem"
---

# Design System: NativePi Desktop

## Overview

**Creative North Star: "The Focused Desktop Workspace"**

NativePi is a compact, dark operating surface that keeps projects, conversations, and code context visible without competing with the work. Its visual hierarchy comes from quiet graphite layers, precise spacing, restrained type, and native desktop structure rather than decorative branding.

The system is calm, compact, and tactile. Soft geometry makes dense controls approachable, while explicit hover, focus, selected, running, and error states keep the interface legible during long agent sessions. This is a description of the incumbent system, not a mandate for a themed or ornamental visual world.

**Key Characteristics:**

- Dense three-pane desktop organization with a protected central conversation column.
- Near-monochrome chrome with saturated color reserved for status and provider identity.
- Compact controls, soft corners, hairline borders, and visible interaction feedback.
- Ambient elevation only where a surface genuinely floats above the workspace.

## Colors

The palette is a cool graphite ladder: close neutral values separate workspace layers while high-contrast chalk text carries content.

### Primary

- **Primary Chalk:** The light action surface used for the default button and strongest immediate actions.
- **Button Ink:** Popover Graphite supplies dark text against Primary Chalk.

### Secondary

- **Destructive Coral:** Errors, destructive actions, and invalid states only.
- **Success Green:** Confirmed selections and successful connection states.
- **Warning Amber:** Retry, caution, and modified-file states.
- **Info Blue:** Informational and untracked-file states.

### Tertiary

- **Favorite Gold:** Favorite-model stars and pinned-chat markers, and no other general emphasis.
- Provider brand colors may appear inside provider marks; they do not recolor surrounding chrome.

### Neutral

- **Workspace Ink:** The conversation canvas and deepest continuous background.
- **Sidebar Graphite:** The left and right utility panes.
- **Raised Graphite:** Composer and card surfaces that sit above the workspace.
- **Popover Graphite:** Menus, dialogs, and floating detail surfaces.
- **Soft Slate:** Muted fills and low-priority regions.
- **Interactive Slate:** Secondary controls and selected sidebar rows.
- **Accent Slate:** Stronger highlighted menu and navigation states.
- **Chalk Text / Bright Text:** Primary reading and high-contrast overlay text.
- **Muted Silver:** Secondary labels, timestamps, icons, and explanatory copy.
- **Border Hairline / Input Hairline:** Low-contrast structural separation.
- **Focus Ring:** Keyboard focus and active resize feedback.

### Named Rules

**The Color-Is-Status Rule.** Keep application chrome neutral; use saturated hue only to communicate status, severity, file state, favorites, or an external provider identity.

**The Close-Tone Rule.** Separate persistent panes with adjacent graphite tones and hairlines, not large contrast jumps.

## Typography

**Wordmark Font:** Departure Mono (with monospace fallback)
**Display Font:** Raleway Variable (with sans-serif fallback)
**Body Font:** Nunito Sans Variable (with sans-serif fallback)
**Label/Mono Font:** Nunito Sans Variable for interface labels; the platform monospace stack for paths, tool arguments, code, and diffs.

**Character:** Raleway gives short headings a precise, slightly architectural voice. Nunito Sans keeps dense controls and long conversation text open and approachable.

### Hierarchy

- **Headline:** Reserved for empty states and top-level settings titles; compact rather than promotional.
- **Title:** Product identity, dialog titles, and compact section headings.
- **Body:** Transcript content, descriptions, list rows, and settings copy.
- **Composer:** Slightly larger than body text so the active input remains easy to scan.
- **Label:** Buttons, metadata, compact controls, timestamps, and uppercase utility headings.
- **Code:** Paths, tool summaries, shell output, tokens, and diffs; use tabular numerals for changing counts and usage values.

### Named Rules

**The Heading-Only Raleway Rule.** Use Raleway for headings and product identity, never for transcript prose, form inputs, or dense metadata.

**The Wordmark-Only Departure Rule.** Use Departure Mono only for the NativePi wordmark. It connects NativePi to Pi's visual language without turning application labels into decorative technical text.

**The Technical-Content Rule.** Monospace communicates literal technical material, not visual personality; surrounding labels remain in Nunito Sans.

## Layout

The application uses a full-height, resizable three-pane desktop frame. The project sidebar ranges from 14% to 30% of the window. The context pane defaults to 28% and ranges from 20% to 45%. The conversation panel retains at least 35% and is the protected center of gravity.

Transcript and composer content share a centered 48rem maximum width, keeping message measure and actions aligned. Settings uses that same 48rem rail for both its heading and its content, so the two share one right edge. Every pane header is 3rem high — one baseline across the sidebar, conversation, context pane, and Settings — which is what the frameless Windows drag region and custom window controls need.

Spacing follows the quarter-rem Tailwind rhythm plus its half-steps: eighth-rem for tightly bound text pairs (a label above its description), five-eighths-rem as the standard inset for dense controls, half-rem and three-quarter-rem gaps for control clusters, and one- to one-and-a-half-rem spacing between content groups. Values off that ladder are drift, not intent. One-pixel resizable hairlines define persistent pane boundaries.

The implementation collapses either side pane to protect conversation space and constrains large menus to the viewport. Below 1100px the context pane moves into a right sheet; below 900px project navigation and the settings category rail also move into left sheets. These compact layouts preserve the conversation and composer rather than attempting to turn the desktop application into a separate mobile interface.

The same document is also served over the local network, so the compact layout has to survive a phone. Below 640px the composer toolbar wraps as a group so Send is never the control pushed off the end, the header drops the project half of its breadcrumb, and settings rows stack their control under the label instead of beside it. Diffs render unified regardless of the saved preference, because side-by-side is two columns of twenty characters at that width.

Two rules follow from the input rather than the width. On a coarse pointer every control takes a 2.25rem floor in both axes, since the desktop density is a comfortable mouse target and an unreliable thumb target, and text fields take a 1rem floor, since anything smaller makes iOS zoom on focus and never zoom back. Where there is no hover, controls that are otherwise revealed by it are simply always visible: the tap that would reveal one is the same tap that activates whatever sits beneath it. Window controls and the clearance reserved for them exist only in the desktop shell.

## Elevation & Depth

The system uses ambient hierarchy. Persistent surfaces are flat and separated by tonal layering, borders, and inset pane edges. Shadows are reserved for the composer, menus, dialogs, transient notices, and the large product mark so floating elements read as genuinely above the workspace.

### Shadow Vocabulary

- **Composer Float:** A broad, low-opacity ambient shadow plus a faint inset top highlight anchors the persistent rounded composer.
- **Menu Lift:** A compact medium shadow distinguishes menus from the pane beneath them.
- **Dialog Lift:** A larger shadow, dimmed backdrop, and subtle blur establish modal focus.
- **Pane Edge:** An inset one-pixel edge separates the sidebar without making it look like a card.

### Named Rules

**The Flat-Until-Floating Rule.** Do not add shadows to persistent rows, panes, tool cards, or settings sections; use shadow only when a surface overlaps another surface.

## Shapes

The base form language uses gently curved small and medium corners. Compact controls, menu rows, inputs, Git files, and tool containers use the shared radius scale rather than one-off values.

Larger curvature is reserved for conversational elements: user messages use a soft bubble with a tighter lower-right corner, the composer uses the largest recurring container radius, and send, stop, progress, and notice controls may become fully circular. Borders remain hairline and low contrast.

**The Radius-Follows-Role Rule.** Use medium corners for controls, large corners for grouped interactive rows, extra-large corners for conversation surfaces, and full circles only for compact icon actions or pill notices.

## Components

The component system is compact and restrained, with soft geometry and explicit state feedback.

### Buttons

- **Shape:** Compact medium-radius rectangles by default; icon-only composer actions are circular.
- **Primary:** A light neutral fill with dark text marks the strongest available action.
- **Hover / Focus / Active:** Hover reduces or shifts tonal intensity, keyboard focus adds a border and soft two-pixel ring, and press translates non-menu buttons down by one pixel.
- **Outline:** Hairline border over a faint input-toned surface on dark backgrounds.
- **Ghost:** Transparent at rest and filled with muted graphite on hover or expanded state.
- **Destructive:** A low-opacity coral fill with coral text; never use the default primary treatment for destructive actions.

### Chips

- **Style:** Compact muted-slate labels with small corners and subdued text.
- **State:** Use chips for queue type, defaults, package filtering, and similar metadata, not as a substitute for buttons.

### Cards / Containers

- **Corner Style:** Medium or large corners for tool calls, Git file rows, extension errors, and contextual detail.
- **Background:** Transparent, Raised Graphite, or a faint card/sidebar tint depending on hierarchy.
- **Shadow Strategy:** Flat by default; see the Flat-Until-Floating Rule.
- **Border:** Hairline border supplies structure without creating a dashboard-card appearance.
- **Internal Padding:** Dense half- to three-quarter-rem spacing for utility containers; dialogs use a roomier inset.

### Inputs / Fields

- **Style:** Compact, medium-radius fields with a faint input fill and low-contrast border.
- **Focus:** Border shifts to Focus Ring and gains a soft two-pixel halo.
- **Error / Disabled:** Invalid fields use Destructive Coral for border and halo; disabled controls reduce opacity and preserve layout.
- **Composer Exception:** The textarea drops its own border and focus ring because the containing composer surface owns the shape and elevation.

### Navigation

- Project, chat, settings, and provider rows use full-width rounded targets with quiet hover fills.
- Selected rows use Interactive Slate or Accent Slate without a bright brand accent.
- Secondary actions stay hidden until row hover or keyboard focus when the action would otherwise crowd the list.
- Pane headers align with the frameless drag region; all interactive controls inside them opt out of window dragging.

### Motion

- Motion reinforces state; it never carries it alone. Every animated indicator has a text or shape equivalent that survives the animation being removed.
- `prefers-reduced-motion: reduce` neutralizes animation globally and components swap in static equivalents (a filled dot for a spinner, a still caret for a streaming one).

**The Information-Survives-Stillness Rule.** If freezing every animation would leave a state unreadable, the state is under-built — add the word, not more motion.

### Conversation

- Assistant responses remain on the open canvas for maximum reading continuity.
- Every turn that writes a file states so outside the collapsed work panel, as a persistent change strip naming the files and their line counts; filenames expand to their diff in place.
- A running turn is instrumented by a single floating status pill above the composer carrying phase, elapsed time, files touched, and Stop.
- Failed tool calls are the loudest element of a turn — coral border, labelled chip, open by default — never a grey word.

**The Stop-Is-Not-Send Rule.** Controls that act on the run live with the run status, not in the composer's send cluster. Reserve the circular rightmost slot for sending.
- User messages align right in a secondary-slate bubble with a tighter lower-right corner.
- Thinking and tool work collapse beneath a quiet duration trigger; tool results use bordered graphite containers and monospace output.
- Message actions appear on hover or focus to keep the transcript calm while remaining keyboard discoverable.

### Composer

- The persistent composer is the signature floating surface: centered with the transcript, strongly rounded, and softly elevated.
- Model, thinking level, context usage, queue behavior, and send controls share one compact bottom row. Stop remains in the floating run-status pill above the composer.
- The input remains usable while Pi starts or runs; pending and queued states appear immediately above the surface.

### Extension Surfaces

- An extension's own React contributions use the tokens on this page like any other component, and are indistinguishable from NativePi's own surfaces.
- A pi-tui component is the exception, and deliberately so: it is drawn by Pi in a terminal grid, so it appears as monospace text on a transparent ground inside NativePi's container, with the surrounding border, radius and padding supplied by the slot it sits in. The component's own colours are its author's; the frame around it is ours.

**The Terminal-Stays-In-Its-Frame Rule.** Terminal-drawn extension UI never bleeds into the window's chrome. It gets a bounded pane: a dialog for a `custom()` component, a three-row card between transcript and composer for a widget, one row for a footer. Anything an extension sends as data rather than as a component, such as a working message, a spinner, or a status, is redrawn in NativePi's own type and palette instead.

### Dialogs And Menus

- Menus use compact padding, medium corners, a hairline border, and highlighted graphite rows.
- Dialogs use Popover Graphite, a dim blurred backdrop, a larger ambient shadow, and subtle scale/fade entry and exit.
- Titles and descriptions are mandatory; actions align to the lower right unless the task requires a vertical choice list.

## Do's and Don'ts

### Do:

- **Do** preserve the centered 48rem conversation and composer rail as the visual anchor.
- **Do** build hierarchy with graphite tone, typography, spacing, and hairline separation before adding color or shadow.
- **Do** keep controls compact while preserving visible keyboard focus and practical hit targets.
- **Do** use Phosphor icons for application actions and provider marks only where provider identity is meaningful.
- **Do** use the Material Icon Theme file-type mark wherever a specific file is named, so a path is recognizable before it is read.
- **Do** keep transcript prose open on the canvas and reserve containers for user messages, tools, diffs, errors, and transient state.

### Don't:

- **Don't** introduce a bright application accent across navigation, buttons, or large surfaces; the incumbent chrome is intentionally neutral.
- **Don't** wrap every section in a card or add shadows to persistent pane content.
- **Don't** use Raleway for body copy, code, form values, or transcript content.
- **Don't** replace pane structure with a generic dashboard grid or detach the composer from the conversation rail.
- **Don't** use color as decoration when tone, weight, border, or spacing can communicate hierarchy.
