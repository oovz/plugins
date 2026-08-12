import assert from "node:assert/strict";
import { spawnSync as realSpawnSync } from "node:child_process";
import { utimesSync } from "node:fs";
import { lstat, mkdir, mkdtemp, chmod, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { packSew } from "../scripts/pack-sew.mjs";
import { atomicWriteTree } from "../scripts/lib/files.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILT_SEW_ROOT = path.join(ROOT, "release-build", "sew", "package");
const { internals, main } = await import(`${pathToFileURL(path.join(BUILT_SEW_ROOT, "lib", "sew.mjs")).href}?test=${Date.now()}`);
const ROLES = ["researcher", "engineer", "verifier", "worker"];

async function temp(prefix = "sew-") { return mkdtemp(path.join(os.tmpdir(), prefix)); }

async function capture(argv, { env = {}, cwd, spawnSync } = {}) {
  let stdout = "";
  let stderr = "";
  const oldOut = process.stdout.write;
  const oldErr = process.stderr.write;
  const oldCwd = process.cwd();
  process.stdout.write = ((chunk) => { stdout += String(chunk); return true; });
  process.stderr.write = ((chunk) => { stderr += String(chunk); return true; });
  try {
    if (cwd) process.chdir(cwd);
    const code = await main(argv, { env, spawnSync });
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = oldOut;
    process.stderr.write = oldErr;
    if (cwd) process.chdir(oldCwd);
  }
}

async function exists(file) { try { await lstat(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } }

async function readTree(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push({ path: path.relative(directory, absolute).split(path.sep).join("/"), content: await readFile(absolute) });
      else throw new Error(`Unexpected entry in ${directory}: ${absolute}`);
    }
  }
  await walk(directory);
  return files;
}

function projectAgentRoot(host, project) {
  if (host === "claude-code") return path.join(project, ".claude", "agents");
  if (host === "codex") return path.join(project, ".codex", "agents");
  if (host === "opencode") return path.join(project, ".opencode", "agents");
  if (host === "gemini-cli") return path.join(project, ".gemini", "agents");
  if (host === "antigravity") return path.join(project, ".agents", "agents");
  return path.join(project, ".omp", "agents");
}

function extension(host) { return host === "codex" ? ".toml" : ".md"; }

function codexRunner({ installed = true, enabled = true, malformed = false, status = 0 } = {}) {
  const calls = [];
  const spawnSync = (executable, args, options) => {
    calls.push({ executable, args: [...args], cwd: options.cwd });
    if (args.join(" ") === "plugin list --json") {
      if (malformed) return { status, stdout: "not-json", stderr: "" };
      return {
        status,
        stdout: JSON.stringify({ installed: installed ? [{ pluginId: "senior-engineering-workflow@otto-plugins", installed, enabled, version: "0.9.7" }] : [] }),
        stderr: status === 0 ? "" : "inspection failed",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { calls, spawnSync };
}

test("@oovz/sew is the only SEW CLI implementation", async () => {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "packages/sew/package.json"), "utf8"));
  assert.equal(manifest.name, "@oovz/sew");
  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.bin, { sew: "./bin/sew.mjs" });
  assert.equal(await exists(path.join(ROOT, "packages/sew/payloads")), false);
  assert.equal(await exists(path.join(ROOT, "packages/sew/templates")), false);
  assert.equal(await exists(path.join(ROOT, "packages/sew-models")), false);
  assert.equal(await exists(path.join(ROOT, "scripts/sew-models.mjs")), false);
  assert.equal(await exists(path.join(ROOT, "plugins/senior-engineering-workflow/scripts/sew-models.mjs")), false);
});

test("CLI surface is strict and has no legacy aliases", async () => {
  assert.deepEqual(Object.keys(internals.PRESETS), ["inherit", "two-model", "three-model"]);
  assert.throws(() => internals.normalizePreset("cost"), /Unsupported preset/u);
  assert.throws(() => internals.normalizePreset("balanced"), /Unsupported preset/u);
  const unknown = await capture(["show"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown command/u);
  const option = await capture(["doctor", "--worker-model", "x"]);
  assert.equal(option.code, 2);
  assert.match(option.stderr, /Unknown option/u);
});

test("host roots follow the six documented conventions", () => {
  const home = path.resolve("/home/tester");
  const env = { HOME: home };
  assert.equal(internals.userConfigRoot("claude-code", { env, platform: "linux", home }), path.join(home, ".claude"));
  assert.equal(internals.userConfigRoot("codex", { env, platform: "linux", home }), path.join(home, ".codex"));
  assert.equal(internals.userConfigRoot("opencode", { env, platform: "linux", home }), path.join(home, ".config/opencode"));
  assert.equal(internals.userConfigRoot("gemini-cli", { env, platform: "linux", home }), path.join(home, ".gemini"));
  assert.equal(internals.staticInstallRoots("antigravity", "user", "/project", env).plugin, path.join(home, ".gemini/antigravity-cli/plugins/senior-engineering-workflow"));
  assert.equal(internals.userConfigRoot("oh-my-pi", { env, platform: "linux", home }), path.join(home, ".omp/agent"));
});

test("models configure is inherit-only on hosts without editable agents", async () => {
  for (const host of ["claude-code", "oh-my-pi", "antigravity"]) {
    const project = await temp(`sew-inherit-${host}-`);
    const rejected = await capture(["models", "configure", "--host", host, "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", "flash"]);
    assert.equal(rejected.code, 2);
    assert.match(rejected.stderr, /cannot be edited in place/u);
    const inherited = await capture(["models", "configure", "--host", host, "--scope", "project", "--project", project, "--preset", "inherit"]);
    assert.equal(inherited.code, 0, inherited.stderr);
  }
});

test("models configure edits installed static agents in place and restores inheritance", async () => {
  const cases = [
    ["codex", "gpt-5.6-luna", "max", "senior-engineering-workflow-worker.toml", /model = "gpt-5.6-luna"/u, /model_reasoning_effort = "max"/u],
    ["opencode", "openai/gpt-5.6-luna", "high", "senior-engineering-workflow-worker.md", /model: "openai\/gpt-5.6-luna"/u, /variant: "high"/u],
    ["gemini-cli", "gemini-3-flash-preview", undefined, "senior-engineering-workflow-worker.md", /model: "gemini-3-flash-preview"/u, undefined],
  ];
  for (const [host, model, thinking, agentFile, modelPattern, thinkingPattern] of cases) {
    const project = await temp(`sew-inplace-${host}-`);
    const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
    const runner = host === "codex" ? codexRunner({ installed: true }) : {};
    const install = await capture(["install", "--host", host, "--scope", "project", "--project", project, "--json"], { env, spawnSync: runner.spawnSync });
    assert.equal(install.code, 0, install.stderr);
    const agentRoot = projectAgentRoot(host, project);
    const agent = path.join(agentRoot, agentFile);
    const payload = await readFile(agent, "utf8");
    assert.doesNotMatch(payload, modelPattern);

    const args = ["models", "configure", "--host", host, "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", model, ...(thinking ? ["--worker-thinking", thinking] : [])];
    const configured = await capture([...args, "--json"], { env });
    assert.equal(configured.code, 0, configured.stderr);
    const edited = await readFile(agent, "utf8");
    assert.match(edited, modelPattern, `${host} must gain the model field in place`);
    if (thinkingPattern) assert.match(edited, thinkingPattern, `${host} must gain the thinking field in place`);

    const result = JSON.parse(configured.stdout);
    const state = JSON.parse(await readFile(result.statePath, "utf8"));
    assert.equal(state.models.worker.model, model);
    assert.equal(state.models.worker.thinking, thinking ?? undefined);

    const restored = await capture(["models", "configure", "--host", host, "--scope", "project", "--project", project, "--preset", "inherit"], { env });
    assert.equal(restored.code, 0, restored.stderr);
    assert.equal(await readFile(agent, "utf8"), payload, `${host} inherit must restore the CI payload byte-for-byte`);
  }
});

test("models configure requires an installed static host and refuses modified agents", async () => {
  const project = await temp("sew-configure-gate-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const uninstalled = await capture(["models", "configure", "--host", "codex", "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", "gpt-5.6-luna"]);
  assert.equal(uninstalled.code, 1);
  assert.match(uninstalled.stderr, /sew install/iu);

  const install = await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: codexRunner({ installed: true }).spawnSync });
  assert.equal(install.code, 0, install.stderr);
  const worker = path.join(project, ".codex", "agents", "senior-engineering-workflow-worker.toml");
  await writeFile(worker, `${await readFile(worker, "utf8")}user-edit = true\n`);
  const refused = await capture(["models", "configure", "--host", "codex", "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", "gpt-5.6-luna"]);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /modified outside/u);
  const forced = await capture(["models", "configure", "--host", "codex", "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", "gpt-5.6-luna", "--force"]);
  assert.equal(forced.code, 0, forced.stderr);
  assert.match(await readFile(worker, "utf8"), /model = "gpt-5.6-luna"/u);
});

test("update restores the CI payload and re-applies the stored model configuration", async () => {
  const project = await temp("sew-update-models-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const runner = codexRunner({ installed: true });
  const install = await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: runner.spawnSync });
  assert.equal(install.code, 0, install.stderr);
  const configure = await capture(["models", "configure", "--host", "codex", "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", "gpt-5.6-luna", "--worker-thinking", "max"]);
  assert.equal(configure.code, 0, configure.stderr);
  const update = await capture(["update", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: runner.spawnSync });
  assert.equal(update.code, 0, update.stderr);
  const worker = path.join(project, ".codex", "agents", "senior-engineering-workflow-worker.toml");
  const content = await readFile(worker, "utf8");
  assert.match(content, /model = "gpt-5.6-luna"/u, "update must re-apply the stored model");
  assert.match(content, /model_reasoning_effort = "max"/u);
  const state = JSON.parse(await readFile(path.join(project, ".oovz", "sew", "codex.json"), "utf8"));
  assert.equal(state.models.worker.model, "gpt-5.6-luna");
  const doctor = await capture(["doctor", "--host", "codex", "--project", project, "--json"], { env });
  assert.equal(doctor.code, 0, doctor.stderr);
  assert.doesNotMatch(doctor.stdout, /installation-drift/u);
});

test("static install, update, and uninstall use CI-bundled payloads", async () => {
  for (const host of ["opencode", "gemini-cli", "antigravity"]) {
    const project = await temp(`sew-install-${host}-`);
    const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
    const install = await capture(["install", "--host", host, "--scope", "project", "--project", project, "--json"], { env });
    assert.equal(install.code, 0, install.stderr);
    const installed = JSON.parse(install.stdout);
    assert.equal(installed.status, "installed");
    const state = JSON.parse(await readFile(installed.statePath, "utf8"));
    const payload = JSON.parse(await readFile(path.join(BUILT_SEW_ROOT, "payloads", "manifest.json"), "utf8"));
    assert.equal(state.pluginVersion, payload.pluginVersion);
    const update = await capture(["update", "--host", host, "--scope", "project", "--project", project], { env });
    assert.equal(update.code, 0, update.stderr);
    assert.match(update.stdout, /updated/u);
    const uninstall = await capture(["uninstall", "--host", host, "--scope", "project", "--project", project], { env });
    assert.equal(uninstall.code, 0, uninstall.stderr);
    assert.match(uninstall.stdout, /uninstalled/u);
  }
});

test("Codex preserves a marketplace-owned skill and installs only companion agents", async () => {
  const project = await temp("sew-codex-marketplace-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const skill = path.join(project, ".agents", "skills", "senior-engineering-workflow", "SKILL.md");
  await mkdir(path.dirname(skill), { recursive: true });
  await writeFile(skill, "marketplace-owned\n");
  const runner = codexRunner({ installed: true, enabled: true });

  const install = await capture(["install", "--host", "codex", "--scope", "project", "--project", project, "--json"], { env, spawnSync: runner.spawnSync });
  assert.equal(install.code, 0, install.stderr);
  const result = JSON.parse(install.stdout);
  assert.equal(result.method, "hybrid");
  assert.equal(result.plugin.status, "already-installed");
  assert.deepEqual(runner.calls.map((item) => item.args.join(" ")), ["plugin list --json"]);
  assert.equal(await readFile(skill, "utf8"), "marketplace-owned\n");

  for (const role of ROLES) {
    assert.equal(await exists(path.join(project, ".codex", "agents", `senior-engineering-workflow-${role}.toml`)), true);
  }
  const state = JSON.parse(await readFile(result.statePath, "utf8"));
  assert.deepEqual(Object.keys(state.roots), ["agents"]);
  assert.ok(state.files.every((entry) => entry.root === "agents"));

  const uninstall = await capture(["uninstall", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: () => { throw new Error("uninstall must not inspect or remove the Codex plugin"); } });
  assert.equal(uninstall.code, 0, uninstall.stderr);
  assert.equal(await readFile(skill, "utf8"), "marketplace-owned\n");
  for (const role of ROLES) {
    assert.equal(await exists(path.join(project, ".codex", "agents", `senior-engineering-workflow-${role}.toml`)), false);
  }
});

test("Codex installs the marketplace skill when absent and force reinstalls it", async () => {
  const missingProject = await temp("sew-codex-missing-");
  const missingEnv = { HOME: path.join(missingProject, "home"), XDG_STATE_HOME: path.join(missingProject, "state") };
  const missing = codexRunner({ installed: false });
  const install = await capture(["install", "--host", "codex", "--scope", "project", "--project", missingProject, "--json"], { env: missingEnv, spawnSync: missing.spawnSync });
  assert.equal(install.code, 0, install.stderr);
  assert.deepEqual(missing.calls.map((item) => item.args.join(" ")), [
    "plugin list --json",
    "plugin marketplace add oovz/plugins",
    "plugin add senior-engineering-workflow@otto-plugins",
  ]);

  const forceProject = await temp("sew-codex-force-");
  const forceEnv = { HOME: path.join(forceProject, "home"), XDG_STATE_HOME: path.join(forceProject, "state") };
  const conflictingAgent = path.join(forceProject, ".codex", "agents", "senior-engineering-workflow-worker.toml");
  await mkdir(path.dirname(conflictingAgent), { recursive: true });
  await writeFile(conflictingAgent, "unmanaged\n");
  const forced = codexRunner({ installed: true });
  const force = await capture(["install", "--host", "codex", "--scope", "project", "--project", forceProject, "--force", "--json"], { env: forceEnv, spawnSync: forced.spawnSync });
  assert.equal(force.code, 0, force.stderr);
  assert.deepEqual(forced.calls.map((item) => item.args.join(" ")), [
    "plugin marketplace add oovz/plugins",
    "plugin add senior-engineering-workflow@otto-plugins",
  ]);
  assert.notEqual(await readFile(conflictingAgent, "utf8"), "unmanaged\n");
});

test("Codex inspection fails closed and dry-run never invokes the host", async () => {
  const project = await temp("sew-codex-inspect-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const malformed = codexRunner({ malformed: true });
  const failed = await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: malformed.spawnSync });
  assert.equal(failed.code, 1);
  assert.match(failed.stderr, /Could not parse codex plugin list --json/u);
  assert.equal(await exists(path.join(project, ".codex", "agents")), false);

  const dryRun = await capture(["install", "--host", "codex", "--scope", "project", "--project", project, "--dry-run", "--json"], {
    env,
    spawnSync: () => { throw new Error("dry-run must not invoke Codex"); },
  });
  assert.equal(dryRun.code, 0, dryRun.stderr);
  const result = JSON.parse(dryRun.stdout);
  assert.equal(result.plugin.status, "conditional");
  assert.equal(result.actions[0].status, "would-inspect");
  assert.ok(result.actions.some((item) => item.status === "if-missing-or-disabled"));
});

test("a missing host CLI fails with actionable guidance instead of the raw spawn error", async () => {
  const project = await temp("sew-codex-no-binary-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const spawnSync = () => ({ error: { code: "ENOENT", message: "spawnSync codex ENOENT" } });
  const result = await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Could not find the codex CLI on PATH/u);
  assert.doesNotMatch(result.stderr, /spawnSync codex ENOENT/u);
  assert.equal(await exists(path.join(project, ".codex", "agents")), false);
});

test("win32 PATH/PATHEXT search resolves npm-style shims and returns null when absent", async () => {
  const bin = await temp("sew-win32-path-");
  await writeFile(path.join(bin, "fakecodex.cmd"), "@echo off\n");
  const env = { PATH: bin, PATHEXT: ".COM;.EXE;.BAT;.CMD" };
  assert.equal(internals.findWin32Executable("fakecodex", env), path.join(bin, "fakecodex.cmd"));
  assert.equal(internals.findWin32Executable("missing-tool", env), null);
  assert.equal(internals.findWin32Executable("fakecodex", {}), null);
});

test("win32 app-bundle search selects the highest --version output, not the newest file", async () => {
  const local = await temp("sew-win32-app-");
  const codexBin = path.join(local, "OpenAI", "Codex", "bin");
  await mkdir(codexBin, { recursive: true });
  const topLevel = path.join(codexBin, "codex.exe");
  const versionedDir = path.join(codexBin, "8e8bf206e63ac436");
  await mkdir(versionedDir, { recursive: true });
  const versioned = path.join(versionedDir, "codex.exe");
  await writeFile(topLevel, "stale\n");
  await writeFile(versioned, "current\n");
  const future = new Date(Date.now() + 60_000);
  await utimesSync(topLevel, future, future);
  const env = { LOCALAPPDATA: local };
  const versions = new Map([[topLevel, "codex-cli 0.130.0-alpha.5"], [versioned, "codex-cli 0.147.0-alpha.6.6"]]);
  const probe = (candidate) => versions.get(candidate) ?? null;
  assert.equal(internals.findWin32AppBinary("codex", env, probe), versioned, "higher version must win despite an older mtime");
  versions.set(versioned, "codex-cli 0.999.0");
  assert.equal(internals.findWin32AppBinary("codex", env, probe), versioned);
  versions.set(topLevel, "codex-cli 1.0.0");
  assert.equal(internals.findWin32AppBinary("codex", env, probe), topLevel, "version beats bundle layout");
  assert.equal(internals.findWin32AppBinary("claude", env, probe), null);
  assert.equal(internals.findWin32AppBinary("omp", env, probe), null);
  assert.equal(internals.findWin32AppBinary("codex", {}, probe), null);

  const claude = path.join(local, "AnthropicClaude", "claude.exe");
  await mkdir(path.dirname(claude), { recursive: true });
  await writeFile(claude, "claude\n");
  let probes = 0;
  const countingProbe = (candidate, envValue) => { probes += 1; return probe(candidate, envValue); };
  assert.equal(internals.findWin32AppBinary("claude", env, countingProbe), claude, "a single candidate is used without probing");
  assert.equal(probes, 0, "a single candidate must not be probed");
});

test("win32 app-bundle search falls back to mtime only when no candidate reports a version", async () => {
  const local = await temp("sew-win32-app-");
  const bin = path.join(local, "OpenAI", "Codex", "bin");
  await mkdir(bin, { recursive: true });
  const older = path.join(bin, "codex.exe");
  const versionedDir = path.join(bin, "8e8bf206e63ac436");
  await mkdir(versionedDir, { recursive: true });
  const newer = path.join(versionedDir, "codex.exe");
  await writeFile(older, "older\n");
  await writeFile(newer, "newer\n");
  const future = new Date(Date.now() + 60_000);
  await utimesSync(newer, future, future);
  const env = { LOCALAPPDATA: local };
  assert.equal(internals.findWin32AppBinary("codex", env, () => null), newer, "unparseable probes fall back to newest mtime");
});

test("macOS app-bundle search selects the highest --version output, not the newest file", async () => {
  const home = await temp("sew-macos-app-");
  const chatgpt = path.join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "codex");
  const codexApp = path.join(home, "Applications", "Codex.app", "Contents", "Resources", "codex");
  for (const candidate of [chatgpt, codexApp]) {
    await mkdir(path.dirname(candidate), { recursive: true });
    await writeFile(candidate, "#!/bin/sh\n");
    await chmod(candidate, 0o755);
  }
  const env = { HOME: home };
  const roots = [path.dirname(chatgpt), path.dirname(codexApp)];
  const versions = new Map([[chatgpt, "codex-cli 0.147.0-alpha.6.5"], [codexApp, "codex-cli 0.130.0-alpha.5"]]);
  const probe = (candidate) => versions.get(candidate) ?? null;
  assert.equal(internals.findMacosAppBinary("codex", env, probe, roots), chatgpt, "higher version must win");
  versions.set(codexApp, "codex-cli 0.999.0");
  assert.equal(internals.findMacosAppBinary("codex", env, probe, roots), codexApp);
  versions.set(chatgpt, "codex-cli 1.0.0");
  assert.equal(internals.findMacosAppBinary("codex", env, probe, roots), chatgpt, "version beats bundle name");
  assert.equal(internals.findMacosAppBinary("claude", env, probe, roots), null);
  assert.equal(internals.findMacosAppBinary("codex", env, probe, []), null);
  assert.equal(internals.findMacosAppBinary("codex", env, probe, [path.join(home, "Missing.app", "Contents", "Resources")]), null);

  let probes = 0;
  const countingProbe = (candidate, envValue) => { probes += 1; return null; };
  assert.equal(internals.findMacosAppBinary("codex", env, countingProbe, [path.dirname(chatgpt)]), chatgpt, "a single candidate is used without probing");
  assert.equal(probes, 0, "a single candidate must not be probed");
  await chmod(chatgpt, 0o644);
  assert.equal(internals.findMacosAppBinary("codex", env, countingProbe, [path.dirname(chatgpt)]), null, "non-executable bundles are rejected");
});

test("macOS app-bundle search falls back to mtime only when no candidate reports a version", async () => {
  const home = await temp("sew-macos-app-");
  const chatgpt = path.join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "codex");
  const codexApp = path.join(home, "Applications", "Codex.app", "Contents", "Resources", "codex");
  for (const candidate of [chatgpt, codexApp]) {
    await mkdir(path.dirname(candidate), { recursive: true });
    await writeFile(candidate, "#!/bin/sh\n");
    await chmod(candidate, 0o755);
  }
  const future = new Date(Date.now() + 60_000);
  await utimesSync(codexApp, future, future);
  const env = { HOME: home };
  const roots = [path.dirname(chatgpt), path.dirname(codexApp)];
  assert.equal(internals.findMacosAppBinary("codex", env, () => null, roots), codexApp, "unparseable probes fall back to newest mtime");
});

test("binary version parsing and comparison follow prerelease precedence", () => {
  const parse = internals.parseBinaryVersion;
  assert.deepEqual(parse("codex-cli 0.147.0-alpha.6.6\n"), { numbers: [0, 147, 0], prerelease: ["alpha", "6", "6"] });
  assert.deepEqual(parse("claude 1.2.3"), { numbers: [1, 2, 3], prerelease: null });
  assert.equal(parse("not a version"), null);
  const compare = internals.compareVersions;
  assert.ok(compare(parse("0.147.0-alpha.6.6"), parse("0.130.0-alpha.5")) > 0, "0.147 beats 0.130");
  assert.ok(compare(parse("1.0.0"), parse("0.999.0")) > 0, "1.0 beats 0.999");
  assert.ok(compare(parse("0.147.0"), parse("0.147.0-alpha.6.6")) > 0, "release beats prerelease");
  assert.ok(compare(parse("0.147.0-alpha.6.6"), parse("0.147.0-alpha.10")) < 0, "numeric prerelease components compare numerically");
  assert.ok(compare(parse("0.147.0-alpha.6"), parse("0.147.0-alpha.6.1")) < 0, "longer prerelease wins when a prefix matches");
  assert.equal(compare(parse("1.2.3"), parse("1.2.3")), 0);
});

test("Windows retries Desktop-bundled binaries discovered outside PATH", { skip: process.platform !== "win32" && "requires Windows .cmd shims" }, async () => {
  const project = await temp("sew-codex-desktop-");
  const local = await temp("sew-codex-desktop-app-");
  const bin = path.join(local, "OpenAI", "Codex", "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, "codex.cmd"), [
    "@echo off",
    "if /i \"%1\"==\"plugin\" if /i \"%2\"==\"list\" (",
    "  echo {\"installed\":[]}",
    "  exit /b 0",
    ")",
    "exit /b 0",
    "",
  ].join("\r\n"));
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state"), LOCALAPPDATA: local, PATH: process.env.PATH };
  const calls = [];
  const spawnSync = (executable, args, options) => {
    calls.push({ executable, args: [...args], shell: options.shell });
    if (options.shell !== true) return { error: { code: "ENOENT", message: `spawnSync ${executable} ENOENT` } };
    return realSpawnSync(executable, args, options);
  };
  const install = await capture(["install", "--host", "codex", "--scope", "project", "--project", project, "--json"], { env, spawnSync });
  assert.equal(install.code, 0, install.stderr);
  assert.ok(calls.some((item) => item.shell === true && item.executable.includes(path.join(bin, "codex.cmd"))), "install must run the Desktop-bundled codex shim");
  const result = JSON.parse(install.stdout);
  assert.equal(result.plugin.status, "installed");
  for (const role of ROLES) {
    assert.equal(await exists(path.join(project, ".codex", "agents", `senior-engineering-workflow-${role}.toml`)), true);
  }
});

test("macOS retries ChatGPT Desktop-bundled binaries discovered outside PATH", { skip: process.platform !== "darwin" && "requires macOS app bundles" }, async () => {
  const project = await temp("sew-codex-desktop-macos-");
  const home = await temp("sew-macos-home-");
  const bundle = path.join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "codex");
  await mkdir(path.dirname(bundle), { recursive: true });
  await writeFile(bundle, "#!/bin/sh\n");
  await chmod(bundle, 0o755);
  const env = { HOME: home, XDG_STATE_HOME: path.join(project, "state") };
  const calls = [];
  const spawnSync = (executable, args) => {
    calls.push({ executable, args: [...args] });
    if (executable === "codex") return { error: { code: "ENOENT", message: `spawnSync ${executable} ENOENT` } };
    if (args.join(" ") === "plugin list --json") return { status: 0, stdout: JSON.stringify({ installed: [] }), stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const install = await capture(["install", "--host", "codex", "--scope", "project", "--project", project, "--json"], { env, spawnSync });
  assert.equal(install.code, 0, install.stderr);
  assert.ok(calls.some((item) => item.executable.includes(path.join("ChatGPT.app", "Contents", "Resources", "codex"))), "install must run the ChatGPT Desktop-bundled codex binary");
  const result = JSON.parse(install.stdout);
  assert.equal(result.plugin.status, "installed");
  for (const role of ROLES) {
    assert.equal(await exists(path.join(project, ".codex", "agents", `senior-engineering-workflow-${role}.toml`)), true);
  }
});

test("Windows retries .cmd shims through the shell after an ENOENT spawn", { skip: process.platform !== "win32" && "requires Windows .cmd shims" }, async () => {
  const project = await temp("sew-codex-shim-");
  const bin = await temp("sew-codex-bin-");
  await writeFile(path.join(bin, "codex.cmd"), [
    "@echo off",
    "if /i \"%1\"==\"plugin\" if /i \"%2\"==\"list\" (",
    "  echo {\"installed\":[]}",
    "  exit /b 0",
    ")",
    "exit /b 0",
    "",
  ].join("\r\n"));
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state"), PATH: `${bin};${process.env.PATH}`, PATHEXT: ".COM;.EXE;.BAT;.CMD" };
  const calls = [];
  const spawnSync = (executable, args, options) => {
    calls.push({ executable, args: [...args], shell: options.shell });
    if (options.shell !== true) return { error: { code: "ENOENT", message: `spawnSync ${executable} ENOENT` } };
    return realSpawnSync(executable, args, options);
  };
  const install = await capture(["install", "--host", "codex", "--scope", "project", "--project", project, "--json"], { env, spawnSync });
  assert.equal(install.code, 0, install.stderr);
  assert.equal(calls.length, 6, "each command attempts a bare spawn then retries through the shell");
  const shellRetries = calls.filter((item) => item.shell === true);
  const failedAttempts = calls.filter((item) => item.shell !== true);
  assert.equal(shellRetries.length, 3, "inspect plus two install commands succeed only through the shell");
  assert.ok(shellRetries.every((item) => item.executable.includes("codex")), "shell retries must target the codex shim");
  assert.ok(failedAttempts.every((item) => item.executable === "codex"), "bare spawns must use the plain codex name");
  const result = JSON.parse(install.stdout);
  assert.equal(result.plugin.status, "installed");
  for (const role of ROLES) {
    assert.equal(await exists(path.join(project, ".codex", "agents", `senior-engineering-workflow-${role}.toml`)), true);
  }
});

test("native Claude Code and Oh My Pi commands are exact and dry-run safe", async () => {
  for (const host of ["claude-code", "oh-my-pi"]) {
    const project = await temp();
    const result = await capture(["install", "--host", host, "--scope", "project", "--project", project, "--dry-run", "--json"]);
    assert.equal(result.code, 0, result.stderr);
    const json = JSON.parse(result.stdout);
    assert.equal(json.method, "native");
    assert.ok(json.actions.every((item) => item.status === "would-run"));
    assert.match(json.actions.map((item) => item.command).join("\n"), host === "claude-code" ? /claude plugin/u : /omp plugin/u);
  }
});

test("native commands can be executed through the injected runner", async () => {
  const calls = [];
  const spawnSync = (exe, args, options) => { calls.push({ exe, args, cwd: options.cwd }); return { status: 0, stdout: "", stderr: "" }; };
  const project = await temp();
  const result = await capture(["install", "--host", "claude-code", "--scope", "project", "--project", project, "--json"], { spawnSync });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].exe, "claude");
});

test("static installer rejects symlinked destination ancestors", async (t) => {
  if (process.platform === "win32") return t.skip("requires platform-specific junction setup");
  const project = await temp();
  const outside = await temp("sew-outside-");
  await symlink(outside, path.join(project, ".opencode"), "dir");
  const result = await capture(["install", "--host", "opencode", "--scope", "project", "--project", project], { env: { HOME: path.join(project, "home") } });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /symlink or junction/u);
});

test("doctor is read-only across all six hosts", async () => {
  const project = await temp();
  await mkdir(path.join(project, ".codex", "agents"), { recursive: true });
  await writeFile(path.join(project, ".codex", "agents", "custom.toml"), 'name = "custom"\nmodel = "x"\n');
  const before = await readFile(path.join(project, ".codex", "agents", "custom.toml"), "utf8");
  const result = await capture(["doctor", "--project", project, "--json"], { env: { HOME: path.join(project, "home") } });
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.hosts.map((item) => item.host), internals.HOSTS);
  assert.equal(await readFile(path.join(project, ".codex", "agents", "custom.toml"), "utf8"), before);
});

test("CI-bundled package payloads cover the canonical plugin", async () => {
  const sourceManifest = JSON.parse(await readFile(path.join(ROOT, "packages/sew/package.json"), "utf8"));
  const releaseManifest = JSON.parse(await readFile(path.join(BUILT_SEW_ROOT, "package.json"), "utf8"));
  assert.equal(sourceManifest.private, true);
  assert.equal(releaseManifest.private, undefined);
  assert.equal(releaseManifest.name, "@oovz/sew");
  assert.equal(releaseManifest.version, sourceManifest.version);

  const manifest = JSON.parse(await readFile(path.join(BUILT_SEW_ROOT, "payloads/manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.plugin, "senior-engineering-workflow");
  assert.deepEqual(manifest.hosts, internals.HOSTS);
  assert.deepEqual(manifest.staticHosts, ["codex", "opencode", "gemini-cli", "antigravity"]);
  for (const host of manifest.staticHosts) assert.equal(await exists(path.join(BUILT_SEW_ROOT, "payloads", host)), true);
  for (const host of ["claude-code", "oh-my-pi"]) assert.equal(await exists(path.join(BUILT_SEW_ROOT, "payloads", host)), false);
  assert.equal(await exists(path.join(BUILT_SEW_ROOT, "templates")), false, "role templates are no longer bundled");
});


test("CI bundle copies the freshly built static host projections", async () => {
  const sources = {
    codex: path.join(ROOT, "dist", "codex", "senior-engineering-workflow"),
    opencode: path.join(ROOT, "dist", "opencode", "stable", "senior-engineering-workflow"),
    "gemini-cli": path.join(ROOT, "dist", "gemini-cli", "senior-engineering-workflow"),
    antigravity: path.join(ROOT, "dist", "antigravity", "senior-engineering-workflow"),
  };
  for (const [host, source] of Object.entries(sources)) {
    const expected = await readTree(source);
    const actual = await readTree(path.join(BUILT_SEW_ROOT, "payloads", host));
    assert.deepEqual(actual.map((item) => [item.path, item.content.toString("hex")]), expected.map((item) => [item.path, item.content.toString("hex")]));
  }
});

test("disposable dist replacement cannot delete release staging", async () => {
  const root = await temp("sew-dist-isolation-");
  try {
    const marker = path.join(root, "release-build", "sew", "package", "marker");
    await mkdir(path.dirname(marker), { recursive: true });
    await writeFile(marker, "preserved\n");
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "dist", "stale"), "stale\n");

    await atomicWriteTree(
      path.join(root, "dist"),
      [{ path: "codex/plugin/file", content: Buffer.from("fresh\n") }],
      root,
    );

    assert.equal(await readFile(marker, "utf8"), "preserved\n");
    assert.equal(await exists(path.join(root, "dist", "stale")), false);
    assert.equal(await readFile(path.join(root, "dist", "codex", "plugin", "file"), "utf8"), "fresh\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release packaging creates one npm tarball and checksum from the staged package", async () => {
  const releaseRoot = await temp("sew-release-");
  try {
    const result = await packSew({ root: ROOT, packageRoot: BUILT_SEW_ROOT, releaseRoot });
    const manifest = JSON.parse(await readFile(path.join(ROOT, "packages", "sew", "package.json"), "utf8"));
    assert.equal(await exists(result.tarball), true);
    assert.equal(await exists(result.checksumFile), true);
    assert.equal(path.basename(result.tarball), `oovz-sew-${manifest.version}.tgz`);
    assert.match(await readFile(result.checksumFile, "utf8"), new RegExp(`^[a-f0-9]{64}  oovz-sew-${manifest.version.replaceAll(".", "\\.")}\.tgz\\n$`, "u"));
  } finally {
    await rm(releaseRoot, { recursive: true, force: true });
  }
});

test("release workflow verifies, rebuilds, packs, publishes, and creates a GitHub Release", async () => {
  const workflow = await readFile(path.join(ROOT, ".github", "workflows", "release-sew.yml"), "utf8");
  assert.match(workflow, /tags:\s*\n\s*- "sew-v\*"/u);
  assert.match(workflow, /build:\n[\s\S]*permissions:\n\s+contents: read/u);
  assert.match(workflow, /release:\n[\s\S]*needs: build/u);
  assert.match(workflow, /id-token: write/u);
  assert.match(workflow, /npm run verify/u);
  assert.match(workflow, /npm run pack:sew/u);
  assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/u);
  assert.match(workflow, /actions\/download-artifact@[a-f0-9]{40}/u);
  assert.match(workflow, /release-build\/sew\/artifacts/u);
  assert.doesNotMatch(workflow, /dist\/release|dist\/npm/u);
  assert.match(workflow, /sha256sum --check SHA256SUMS\.txt/u);
  assert.match(workflow, /npm publish "\$\{tarballs\[0\]\}" --access public/u);
  assert.ok(workflow.includes("GH_REPO: ${{ github.repository }}"));
  assert.match(workflow, /gh release create/u);
});
