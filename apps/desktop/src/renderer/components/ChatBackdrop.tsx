import { useAppStore } from "../lib/store.ts";
import { chatBackgroundSource } from "../lib/chat-backgrounds.ts";
import { usesNativeGlass } from "../../shared/themes.ts";
import ChatLandscape from "./ChatLandscape.tsx";

export default function ChatBackdrop() {
  const background = useAppStore((s) => s.preferences.chatBackground);
  const glass = useAppStore((s) => usesNativeGlass(s.preferences));
  if (glass) return null;
  const src = chatBackgroundSource(background);
  return src ? <ChatLandscape key={src} src={src} /> : null;
}
