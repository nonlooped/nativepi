import { expect, test } from "bun:test";
import "./testBridge.ts";

const { useAppStore } = await import("../store.ts");
const { emptyConversation } = await import("./conversation.ts");

test("external branch picker requests are ignored while a turn is running", () => {
  const projectPath = "C:\\project";
  useAppStore.setState({
    activeProjectPath: projectPath,
    branchMenuRequested: false,
    conversations: {
      [projectPath]: { ...emptyConversation(), projectDir: projectPath, running: true },
    },
  });

  useAppStore.getState().requestBranchMenu();
  expect(useAppStore.getState().branchMenuRequested).toBe(false);

  useAppStore.setState({ conversations: { [projectPath]: emptyConversation() } });
  useAppStore.getState().requestBranchMenu();
  expect(useAppStore.getState().branchMenuRequested).toBe(true);

  useAppStore.getState().consumeBranchMenuRequest();
  expect(useAppStore.getState().branchMenuRequested).toBe(false);
});
