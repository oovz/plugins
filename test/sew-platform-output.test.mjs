import assert from "node:assert/strict";
import { spawnSync as spawnProcessSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILT_SEW_ROOT = path.join(ROOT, "release-build", "sew", "package");
const { internals, main } = await import(`${pathToFileURL(path.join(BUILT_SEW_ROOT, "lib", "sew.mjs")).href}?platform-output=${Date.now()}`);

async function temp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function executable(file) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "placeholder");
  if (process.platform !== "win32") await chmod(file, 0o755);
}

async function captureMain(argv, runtime) {
  let stdout = "";
  let stderr = "";
  const oldOut = process.stdout.write;
  const oldErr = process.stderr.write;
  process.stdout.write = ((chunk) => { stdout += String(chunk); return true; });
  process.stderr.write = ((chunk) => { stderr += String(chunk); return true; });
  try {
    return { code: await main(argv, runtime), stdout, stderr };
  } finally {
    process.stdout.write = oldOut;
    process.stderr.write = oldErr;
  }
}

function runCli(args, environment = {}) {
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  delete env.NO_COLOR;
  Object.assign(env, environment);
  return spawnProcessSync(process.execPath, [path.join(BUILT_SEW_ROOT, "bin", "sew.mjs"), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env,
  });
}

test("Codex model discovery uses the newest Windows ChatGPT desktop binary when codex is absent from PATH", async () => {
  assert.equal(typeof internals.fetchHarnessCapabilities, "function");
  const localAppData = await temp("sew-windows-desktop-");
  const bin = path.join(localAppData, "OpenAI", "Codex", "bin");
  const oldCodex = path.join(bin, "old-build", "codex.exe");
  const currentCodex = path.join(bin, "current-build", "codex.exe");
  await executable(oldCodex);
  await executable(currentCodex);
  await utimes(oldCodex, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
  await utimes(currentCodex, new Date("2025-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"));
  await utimes(path.dirname(oldCodex), new Date("2025-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"));
  await utimes(path.dirname(currentCodex), new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));

  const calls = [];
  const spawnSync = (command, args) => {
    calls.push({ command, args: [...args] });
    if (command === "codex") return { error: { code: "ENOENT" }, status: null, stdout: null, stderr: null };
    return {
      status: 0,
      stdout: JSON.stringify({ models: [{ slug: "gpt-desktop", visibility: "list", supported_in_api: true }] }),
      stderr: "",
    };
  };

  const capabilities = internals.fetchHarnessCapabilities("codex", {
    env: { LOCALAPPDATA: localAppData },
    platform: "win32",
    project: localAppData,
    spawnSync,
  });

  assert.deepEqual(capabilities.models, ["gpt-desktop"]);
  assert.deepEqual(calls, [
    { command: "codex", args: ["debug", "models"] },
    { command: currentCodex, args: ["debug", "models"] },
  ]);
});

test("Codex plugin operations use the macOS ChatGPT desktop binary when codex is absent from PATH", async () => {
  const project = await temp("sew-macos-desktop-");
  const home = path.join(project, "home");
  const desktopCodex = path.join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "codex");
  await executable(desktopCodex);

  const calls = [];
  const spawnSync = (command, args) => {
    calls.push({ command, args: [...args] });
    if (command === "codex") return { error: { code: "ENOENT" }, status: null, stdout: null, stderr: null };
    if (args.join(" ") === "plugin list --json") return { status: 0, stdout: JSON.stringify({ installed: [] }), stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };

  const result = await captureMain([
    "install", "--host", "codex", "--scope", "project", "--project", project, "--json",
  ], { env: { HOME: home }, platform: "darwin", spawnSync });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(calls.map(({ command, args }) => ({ command, args })), [
    { command: "codex", args: ["plugin", "list", "--json"] },
    { command: desktopCodex, args: ["plugin", "list", "--json"] },
    { command: "codex", args: ["plugin", "marketplace", "add", "oovz/plugins"] },
    { command: desktopCodex, args: ["plugin", "marketplace", "add", "oovz/plugins"] },
    { command: "codex", args: ["plugin", "add", "senior-engineering-workflow@otto-plugins"] },
    { command: desktopCodex, args: ["plugin", "add", "senior-engineering-workflow@otto-plugins"] },
  ]);
});

test("human-readable CLI output uses ANSI colors when color is forced", () => {
  const result = runCli(["--help"], { FORCE_COLOR: "1" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\u001B\[[0-9;]*m/u);
  assert.match(result.stdout, /Usage:/u);
});

test("NO_COLOR disables ANSI colors", () => {
  const result = runCli(["--help"], { FORCE_COLOR: "1", NO_COLOR: "1" });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /\u001B\[[0-9;]*m/u);
  assert.match(result.stdout, /Usage:/u);
});

test("JSON output stays machine-readable when color is forced", async () => {
  const project = await temp("sew-json-color-");
  const result = runCli(["doctor", "--host", "codex", "--project", project, "--json"], { FORCE_COLOR: "1" });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /\u001B\[[0-9;]*m/u);
  assert.equal(JSON.parse(result.stdout).command, "doctor");
});
