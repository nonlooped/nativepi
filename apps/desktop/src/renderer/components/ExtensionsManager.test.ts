import { expect, test } from "bun:test";
import "../lib/store/testBridge.ts";

const { useAppStore } = await import("../lib/store.ts");
const { emptyConversation } = await import("../lib/store/conversation.ts");
const { canReloadProjectAfterPackageChange } = await import("./ExtensionsManager.tsx");

const A = "C:\\project-a";
const B = "C:\\project-b";

test("a package operation only reloads its original project when it remains idle", () => {
  useAppStore.setState({
    activeProjectPath: A,
    conversations: { [A]: { ...emptyConversation(), projectDir: A } },
  });
  expect(canReloadProjectAfterPackageChange(A)).toBe(true);

  useAppStore.setState({
    activeProjectPath: A,
    conversations: {
      [A]: { ...emptyConversation(), projectDir: A },
      [B]: { ...emptyConversation(), projectDir: B, running: true },
    },
  });
  expect(canReloadProjectAfterPackageChange(A)).toBe(true);

  useAppStore.setState({
    activeProjectPath: B,
    conversations: { [B]: { ...emptyConversation(), projectDir: B, running: true } },
  });
  expect(canReloadProjectAfterPackageChange(A)).toBe(false);

  useAppStore.setState({
    activeProjectPath: A,
    conversations: { [A]: { ...emptyConversation(), projectDir: A, running: true } },
  });
  expect(canReloadProjectAfterPackageChange(A)).toBe(false);
});
