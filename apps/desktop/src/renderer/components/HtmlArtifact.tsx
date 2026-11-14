import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowsOutIcon } from "@phosphor-icons/react/ArrowsOut";
import { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
import { artifactFrameMessageSchema, htmlArtifactDocument, MAX_ARTIFACT_HEIGHT, type ArtifactTheme, type HtmlArtifact as Artifact } from "../../shared/htmlArtifacts.ts";
import { THEME_CHANGE_EVENT } from "../lib/themes.ts";
import { rpc } from "../lib/rpc.ts";
import { Button } from "./ui/button.tsx";
import { Dialog, DialogViewerContent } from "./ui/dialog.tsx";

const VARIABLES = ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "muted", "muted-foreground", "secondary", "secondary-foreground", "primary", "primary-foreground", "accent", "accent-foreground", "border", "input", "ring", "success", "warning", "info", "destructive", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "radius", "font-sans", "font-mono"];
function currentTheme(): ArtifactTheme {
  const styles = getComputedStyle(document.documentElement);
  return {
    appearance: document.documentElement.classList.contains("dark") ? "dark" : "light",
    variables: Object.fromEntries(VARIABLES.map(name => [`--${name}`, styles.getPropertyValue(`--${name}`).trim()])),
  };
}

function ArtifactFrame({ artifact, expanded }: { artifact: Artifact; expanded?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(artifact.height);
  const [doc] = useState(() => htmlArtifactDocument(artifact.html, currentTheme()));
  const postTheme = () => frame.current?.contentWindow?.postMessage({ type: "nativepi.artifact.theme", theme: currentTheme() }, "*");
  useEffect(() => {
    window.addEventListener(THEME_CHANGE_EVENT, postTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, postTheme);
  }, []);
  useLayoutEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const element = frame.current;
      if (!element || event.source !== element.contentWindow) return;
      const message = artifactFrameMessageSchema.safeParse(event.data);
      if (!message.success) return;
      if (message.data.type === "nativepi.artifact.size") {
        setHeight(Math.min(MAX_ARTIFACT_HEIGHT, Math.max(80, Math.ceil(message.data.height))));
      } else if (message.data.type === "nativepi.artifact.link" && document.activeElement === element && navigator.userActivation?.isActive) {
        void rpc.request.openExternal({ url: message.data.url });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return <iframe ref={frame} title={artifact.title} srcDoc={doc} sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={postTheme} className="block w-full border-0 bg-transparent" style={{ height: expanded ? "min(80dvh, 8000px)" : height, colorScheme: currentTheme().appearance }} />;
}

export default function HtmlArtifact({ artifact }: { artifact: Artifact }) {
  const [expanded, setExpanded] = useState(false);
  function download() {
    const url = URL.createObjectURL(new Blob([htmlArtifactDocument(artifact.html, currentTheme())], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${artifact.title.replace(/[\\/:*?"<>|\p{Cc}]/gu, " ").trim().slice(0, 120) || "Visual"}.html`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="group/artifact relative min-w-0" data-html-artifact>
      <ArtifactFrame artifact={artifact} />
      <div className="mt-1 flex justify-end gap-0.5 opacity-0 focus-within:opacity-100 group-hover/artifact:opacity-100 [@media(hover:none)]:opacity-100">
        <Button variant="ghost" size="icon-xs" aria-label={`Download ${artifact.title}`} title="Download HTML" onClick={download}><DownloadSimpleIcon /></Button>
        <Button variant="ghost" size="icon-xs" aria-label={`Expand ${artifact.title}`} title="Expand visual" onClick={() => setExpanded(true)}><ArrowsOutIcon /></Button>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogViewerContent title={artifact.title} className="max-w-[100rem]">
          <ArtifactFrame artifact={artifact} expanded />
        </DialogViewerContent>
      </Dialog>
    </div>
  );
}
