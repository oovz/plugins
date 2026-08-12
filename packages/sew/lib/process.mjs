import { statSync } from "node:fs";
import crossSpawn from "cross-spawn";

export const defaultSpawnSync = crossSpawn.sync;

function invalidWorkingDirectory(cwd) {
  const error = new Error(`Working directory does not exist or is not a directory: ${cwd}`);
  error.code = "SEW_INVALID_CWD";
  return { error, status: null, signal: null, stdout: null, stderr: null };
}

export function spawnHost(executable, args, options = {}) {
  const runner = options.spawnSync ?? defaultSpawnSync;
  const cwd = options.cwd;
  if (cwd !== undefined) {
    try {
      if (!statSync(cwd).isDirectory()) return invalidWorkingDirectory(cwd);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return invalidWorkingDirectory(cwd);
      throw error;
    }
  }
  return runner(executable, args, {
    cwd,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    env: options.env ?? process.env,
  });
}
