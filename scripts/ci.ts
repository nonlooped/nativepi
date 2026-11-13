import { readFileSync } from "node:fs";

// Run the main-push commands straight from the workflow so local checks cannot drift.
// PR path filtering is deliberately ignored: a push certifies the whole tree.
const workflow = Bun.YAML.parse(readFileSync(".github/workflows/ci.yml", "utf8")) as {
  env: Record<string, string>;
  jobs: { check: { steps: { name?: string; run?: string; uses?: string }[] } };
};
const env = { ...process.env, ...workflow.env, CI: "true" };
function run(command: string) {
  const result = Bun.spawnSync(["bash", "-eo", "pipefail", "-c", command], { env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) process.exit(result.exitCode || 1);
}
for (const step of workflow.jobs.check.steps) {
  if (step.name === "Checkout" || step.name === "Select checks") continue;
  console.log(`\n== ${step.name} ==`);
  if (step.name === "Lint workflows") run("bun scripts/lint-workflows.ts");
  else if (step.uses === "./.github/actions/setup") run("bun install --frozen-lockfile");
  else if (step.run) run(step.run);
  else throw new Error(`Unsupported local CI step: ${step.name}`);
}
console.log("\nAll CI checks passed.");
