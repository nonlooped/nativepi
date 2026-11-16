import { execFile } from "node:child_process";
import { shellEnv } from "shell-env";

// Finder/desktop launches do not inherit the PATH configured in shell profiles.
// Resolve it once, without replacing app-owned or caller-provided environment.
let loginPath: Promise<string | undefined> | undefined;
export async function repositoryEnv(): Promise<NodeJS.ProcessEnv> {
  if (process.platform === "win32") return process.env;
  loginPath ??= shellEnv().then(env => env.PATH).catch(() => undefined);
  const path = await loginPath;
  return path ? { ...process.env, PATH: path } : process.env;
}

export async function runRepositoryCommand(executable: string, args: string[], cwd: string, maxBuffer = 16 * 1024 * 1024, timeout?: number): Promise<{
  stdout: string;
  stderr: string;
  code: number;
}> {
  const env = await repositoryEnv();
  return new Promise(resolve => {
    execFile(executable, args, { cwd, env, maxBuffer, timeout, windowsHide: true }, (error, stdout, stderr) => {
      const code = error && typeof (error as {
        code?: unknown;
      }).code === "number"
        ? (error as {
          code: number;
        }).code : error ? 1 : 0;
      resolve({ stdout, stderr: stderr || error?.message || "", code });
    });
  });
}
