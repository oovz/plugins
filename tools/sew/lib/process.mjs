import { accessSync, constants, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
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

function executableInfo(file, modifiedPath = file) {
  try {
    const info = statSync(file);
    if (!info.isFile()) return null;
    accessSync(file, constants.X_OK);
    return { file, modified: statSync(modifiedPath).mtimeMs };
  } catch (error) {
    if (["EACCES", "ENOENT", "ENOTDIR"].includes(error?.code)) return null;
    throw error;
  }
}

function windowsDesktopCodex(env) {
  if (!env.LOCALAPPDATA) return null;
  const bin = path.join(env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
  let directories;
  try {
    directories = readdirSync(bin, { withFileTypes: true });
  } catch (error) {
    if (["EACCES", "ENOENT", "ENOTDIR"].includes(error?.code)) return null;
    throw error;
  }

  return directories
    .filter((entry) => entry.isDirectory())
    .map((entry) => executableInfo(path.join(bin, entry.name, "codex.exe"), path.join(bin, entry.name)))
    .filter(Boolean)
    .sort((left, right) => right.modified - left.modified)[0]?.file ?? null;
}

function macosDesktopCodex(env) {
  const home = env.HOME || os.homedir();
  const candidates = [
    path.join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "codex"),
    path.join("/Applications", "ChatGPT.app", "Contents", "Resources", "codex"),
  ];
  return candidates.map((candidate) => executableInfo(candidate)).filter(Boolean)[0]?.file ?? null;
}

function desktopCodexExecutable({ env = process.env, platform = process.platform } = {}) {
  if (platform === "win32") return windowsDesktopCodex(env);
  if (platform === "darwin") return macosDesktopCodex(env);
  return null;
}

export function spawnCodex(args, options = {}) {
  const result = spawnHost("codex", args, options);
  if (result?.error?.code !== "ENOENT") return result;
  const executable = desktopCodexExecutable(options);
  return executable ? spawnHost(executable, args, options) : result;
}
