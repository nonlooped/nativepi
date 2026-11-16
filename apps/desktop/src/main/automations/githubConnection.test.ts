import { expect, mock, test } from "bun:test";
const responses: { code: number; stdout: string; stderr: string }[] = [];
mock.module("../repoCommand.ts", () => ({ runRepositoryCommand: async () => responses.shift()! }));
const { githubConnection } = await import("./github.ts");
test("GitHub readiness distinguishes installation, sign-in, network failure and a verified account", async () => {
  responses.push({ code: 1, stdout: "", stderr: "spawn gh ENOENT" });
  expect(await githubConnection("/work")).toEqual({ state: "missing" });
  responses.push({ code: 0, stdout: "gh 2", stderr: "" }, { code: 1, stdout: "", stderr: "To get started run gh auth login" });
  expect(await githubConnection("/work")).toEqual({ state: "sign-in" });
  responses.push({ code: 0, stdout: "gh 2", stderr: "" }, { code: 1, stdout: "", stderr: "Network unreachable" });
  expect(await githubConnection("/work")).toEqual({ state: "unavailable" });
  responses.push({ code: 0, stdout: "gh 2", stderr: "" }, { code: 0, stdout: "sample-person\n", stderr: "" });
  expect(await githubConnection("/work")).toEqual({ state: "ready", account: "sample-person" });
});
