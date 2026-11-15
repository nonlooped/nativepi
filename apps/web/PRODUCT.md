# Product

## Purpose

NativePi's website helps people understand the desktop app, download it, or
support its development on GitHub. It serves existing Pi users and developers
who prefer a graphical agent workspace. NativePi is free and MIT licensed;
model-provider access is supplied by the user.

## Pages

The website has two content pages:

- `/`: a single-screen landing page with a platform-aware download action,
  GitHub support, and authentic desktop and phone browser captures.
- `/download`: a minimal download page listing every supported operating system
  and architecture, installer formats, installation help, and release links.

Do not add documentation, About, privacy, feature-tour, or other content pages
unless requested. Deleted `/docs` routes return 404 rather than redirecting.
The installer redirect handlers under `/download/[target]`, metadata endpoints,
and normal 404 handling are infrastructure, not additional content pages.
Project documentation remains in the GitHub repository.

## Downloads

- Windows x64: `.exe` installer.
- macOS Apple Silicon and Intel: `.dmg` disk images.
- Linux x64 and ARM64: AppImages.
- Stable is the default. Nightly builds and release notes link to GitHub Releases.
- Resolve the latest stable installer through GitHub's releases API. Validate
  the release shape and require an exact repository, tag, and asset URL match.
  Missing builds, rate limits, or network failures fall back to the release page.
- Windows and macOS groups use the subtitle “Unsigned installer”. Linux has no
  subtitle. Keep explanatory installation and provider paragraphs off this page.
- Pi is included; a separate Pi installation or NativePi account is not required.

The landing page's download action opens `/download` directly. All installer
choices and release links must work without JavaScript.

## Brand and design

- Dark-only website, using NativePi's neutral surfaces, restrained borders,
  Geist typography, and Departure Mono wordmark. Departure Mono is reserved
  for the wordmark and is licensed under the SIL Open Font License.
- Direct, calm prose. No invented testimonials, usage figures, download counts,
  partnerships, performance claims, or provider-cost promises.
- Keep the landing page to one viewport, with real desktop and phone browser
  captures and an iPhone-style frame. Do not fabricate the app interface.
- The app's dithered landscapes supply both pages' visual identity: Mist on the
  landing page and Dunes on the download page. Keep their backdrops distinct.
  Ambient motion is subtle and pausable; reduced motion keeps it static.
  Pointer movement and empty-space clicks can produce short ripples.
- The download page is task-focused: OS rows and explicit architecture choices
  in one crafted glass panel, with tactile capsule download controls and no feature
  grids, sales sections, or download modal.
- Use real platform and project marks to identify compatibility and provenance.
  They never imply endorsement. Asset sources and attribution live in the
  credits files under `public/`.
- Preserve keyboard operation, visible focus, readable contrast, and responsive
  content. The download page may grow vertically on narrow screens.

## Product boundaries

NativePi is a Windows, macOS, and Linux desktop workspace for the Pi coding
agent. Pi supplies model execution, provider authentication, configuration,
extensions, and sessions. NativePi adds graphical workflows and built-in tools
through Pi APIs, and preserves third-party Pi extension support.

Pi sessions remain authoritative and compatible with the Pi CLI. The app does
not require product accounts, a separate conversation store, or NativePi-owned
cloud session storage. Local workspace storage does not imply that model or web
requests stay offline. Optional phone/browser access uses the running desktop
app; this website does not host workspaces or agent sessions.

The website uses Vercel Web Analytics. Desktop telemetry and website analytics
are distinct. Check product claims against `apps/desktop/PRODUCT.md`, the root
README, and the implemented desktop behavior.

## Implementation and evidence

- Next.js, React, and Tailwind; Bun is the package manager.
- OGL enhances the shared landscape. Its still image is visible independently
  of JavaScript and remains available if live rendering fails. Zod validates
  GitHub release data.
- `public/app/desktop.webp` and `phone.webp` are actual captures of the same
  conversation in NativePi and its Local Access phone layout.
- `public/brand/` contains the real Apple, Windows, Linux, and Pi marks.
- `public/landscape/` contains the desktop app's Mist and Dunes photographs with
  no-script or no-WebGL still fallbacks. See its credits file.
- The repository is `https://github.com/nonlooped/nativepi`.
- The website is deployed to Vercel from `apps/web`.
