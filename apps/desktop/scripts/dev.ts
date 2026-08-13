import { randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const markerPath = join(tmpdir(), "nativepi-dev-run.json");
const generation = randomUUID();
const startedAt = Date.now();
const web = process.argv.includes("--web");

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "ignore",
  });
  return result.success ? result.stdout.toString().trim() : undefined;
}

const marker = {
  generation,
  startedAt,
  gitHead: git("rev-parse", "--short=7", "HEAD"),
  dirty: Boolean(git("status", "--porcelain")),
};
const temporaryPath = `${markerPath}.${process.pid}`;
await writeFile(temporaryPath, JSON.stringify(marker), "utf8");
await rename(temporaryPath, markerPath);

const env = {
  ...process.env,
  NATIVEPI_DEV_GENERATION: generation,
  ...(web ? { NATIVEPI_WEB_DEV_PORT: "5174" } : {}),
};

const child = Bun.spawn([process.execPath, "x", "electron-vite", "dev"], {
  cwd: process.cwd(),
  env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await child.exited);
