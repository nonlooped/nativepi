import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = Bun.YAML.parse(readFileSync(".github/workflows/ci.yml", "utf8")) as any;
const { ACTIONLINT_VERSION: version, ACTIONLINT_SHA256: linuxChecksum } = workflow.jobs.check.steps.find((step: any) => step.name === "Lint workflows").env;
// Pinned upstream archive hashes; update alongside the CI actionlint version.
const checksums: Record<string, string> = {
  darwin_amd64: "5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644",
  darwin_arm64: "aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f",
  linux_amd64: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
  linux_arm64: "325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6",
  windows_amd64: "6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9",
  windows_arm64: "cadcf7ea4efe3a68728893813643cebe1185e5b1d4be5b96245f65c9a4d5ea41",
};
if (version !== "1.7.12" || linuxChecksum !== checksums.linux_amd64) {
  throw new Error("Update local actionlint checksums to match CI.");
}
const platform = process.platform === "win32" ? "windows" : process.platform;
const arch = process.arch === "x64" ? "amd64" : process.arch;
const checksum = checksums[`${platform}_${arch}`];
if (!checksum) throw new Error(`Unsupported actionlint platform: ${platform}_${arch}`);
const directory = join(process.cwd(), ".cache", "actionlint", version, `${platform}_${arch}`);
const binary = join(directory, platform === "windows" ? "actionlint.exe" : "actionlint");
if (!existsSync(binary)) {
  mkdirSync(directory, { recursive: true });
  const archiveName = `actionlint_${version}_${platform}_${arch}.${platform === "windows" ? "zip" : "tar.gz"}`;
  const response = await fetch(`https://github.com/rhysd/actionlint/releases/download/v${version}/${archiveName}`);
  if (!response.ok) throw new Error(`actionlint download failed: ${response.status}`);
  const archive = new Uint8Array(await response.arrayBuffer());
  if (createHash("sha256").update(archive).digest("hex") !== checksum) throw new Error("actionlint checksum mismatch");
  const archivePath = join(directory, archiveName);
  await Bun.write(archivePath, archive);
  const result = Bun.spawnSync(["tar", "-xf", archivePath, "-C", directory, platform === "windows" ? "actionlint.exe" : "actionlint"], { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode) process.exit(result.exitCode);
}
const result = Bun.spawnSync([binary, "-color"], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exit(result.exitCode);
