import { expect, test } from "bun:test";
import "./testBridge.ts";

const { useAppStore } = await import("../store.ts");
const { emptyConversation } = await import("./conversation.ts");

test("external branch picker requests are ignored while a turn is running", () => {
  const projectPath = "C:\\project";
  useAppStore.setState({
    activeProjectPath: projectPath,
    branchMenuRequest: 0,
    conversations: { [projectPath]: { ...emptyConversation(), running: true } },
  });

  useAppStore.getState().requestBranchMenu();
  expect(useAppStore.getState().branchMenuRequest).toBe(0);

  useAppStore.setState({ conversations: { [projectPath]: emptyConversation() } });
  useAppStore.getState().requestBranchMenu();
  expect(useAppStore.getState().branchMenuRequest).toBe(1);
});
