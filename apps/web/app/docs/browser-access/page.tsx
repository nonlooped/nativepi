import type { Metadata } from "next";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";

export const metadata: Metadata = {
  title: "Browser access",
  description: "Share a running NativePi workspace over the local network or a temporary public Cloudflare link.",
};

export default function BrowserAccessPage() {
  return (
    <>
      <PageTitle
        eyebrow="Using NativePi"
        title="Browser access"
        lede="NativePi can present the running desktop workspace in a browser. Access is off until you start it and ends when you stop it or close the app."
      />

      <H2 id="local">Local network access</H2>
      <Prose>
        <p>
          Start local access from NativePi to open an HTTP and WebSocket server
          on this computer. The generated link includes an access token and can
          be opened by another device that can reach the machine over the local
          network.
        </p>
        <p>
          Your firewall, router, and VPN determine which devices can connect.
          NativePi does not make the local address reachable through the internet
          on its own.
        </p>
      </Prose>

      <H2 id="public">Temporary public access</H2>
      <Prose>
        <p>
          Start public access to create a throwaway Cloudflare quick tunnel to
          the same local server. NativePi shows the generated address and closes
          the tunnel after twelve hours at the latest. It does not register a
          permanent hostname or operate a hosted relay.
        </p>
      </Prose>

      <H2 id="token">Access token</H2>
      <Prose>
        <p>
          Local and public links use the same token. Treat a copied link or QR
          code as a credential: anyone who receives it can use the exposed
          workspace while the server is running. Replacing the token invalidates
          every link issued with the old value.
        </p>
        <p>
          NativePi shows connected devices, the route they used, and the links
          this window has copied or displayed. Stop access when the other device
          no longer needs it.
        </p>
      </Prose>

      <Note tone="warning">
        Browser access exposes projects, chats, changes, and terminals from the
        running app. Use local access only on networks you trust, share public
        links through a secure channel, and revoke access if a link reaches the
        wrong person.
      </Note>

      <H2 id="availability">Availability</H2>
      <Prose>
        <p>
          The desktop app must remain open. Quitting NativePi ends the server,
          active browser sessions, and any public tunnel. The quit confirmation
          reports connected browser clients before closing them.
        </p>
      </Prose>
    </>
  );
}
