import { useAppStore } from "../lib/store.ts";
import { chatBackgroundSource } from "../lib/chat-backgrounds.ts";
import ChatLandscape from "./ChatLandscape.tsx";

export default function ChatBackdrop() {
  const background = useAppStore((s) => s.preferences.chatBackground);
  const src = chatBackgroundSource(background);
  return src ? <ChatLandscape key={src} src={src} /> : null;
}
