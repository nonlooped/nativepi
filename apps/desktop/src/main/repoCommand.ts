import { execFile } from "node:child_process";
export function runRepositoryCommand(executable: string, args: string[], cwd: string, maxBuffer = 16 * 1024 * 1024): Promise<{
  stdout: string;
  stderr: string;
  code: number;
}> {
  return new Promise(resolve => {
    execFile(executable, args, { cwd, maxBuffer, windowsHide: true }, (error, stdout, stderr) => {
      const code = error && typeof (error as {
        code?: unknown;
      }).code === "number"
        ? (error as {
          code: number;
        }).code : error ? 1 : 0;
      resolve({ stdout, stderr, code });
    });
  });
}
