import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
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

function assertNoPolicyFields(host, content) {
  if (host === "codex") {
    for (const key of ["sandbox_mode", "approval_policy", "mcp_servers"]) assert.doesNotMatch(content, new RegExp(`^${key}\\s*=`, "mu"));
    return;
  }
  const fm = internals.parseFrontmatterScalars(content);
  for (const key of ["tools", "permission", "permissions", "permissionMode", "hooks", "mcpServers", "steps", "maxTurns"]) assert.equal(fm[key], undefined, `${host} alias must omit ${key}`);
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

test("model aliases contain only prompt plus model/thinking fields", async () => {
  const cases = [
    ["claude-code", "haiku", "medium", /effort:/u],
    ["codex", "gpt-5.6-luna", "max", /model_reasoning_effort/u],
    ["opencode", "openai/gpt-5.6-luna", "high", /variant:/u],
    ["gemini-cli", "gemini-3-flash-preview", undefined, /model:/u],
    ["oh-my-pi", "openai/gpt-5.6-luna", "high", /thinking-level:/u],
  ];
  for (const [host, model, thinking, expected] of cases) {
    const content = await internals.renderModelAlias(host, "worker", "worker", { "worker-model": model, ...(thinking ? { "worker-thinking": thinking } : {}) });
    assert.match(content, expected);
    assertNoPolicyFields(host, content);
  }
});

test("Antigravity rejects model-only role aliases but permits inheritance cleanup", async () => {
  const project = await temp();
  const rejected = await capture(["models", "configure", "--host", "antigravity", "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", "flash"]);
  assert.equal(rejected.code, 2);
  assert.match(rejected.stderr, /explicit tool list/u);
  const inherited = await capture(["models", "configure", "--host", "antigravity", "--scope", "project", "--project", project, "--preset", "inherit"]);
  assert.equal(inherited.code, 0);
});

test("models configure writes and removes four managed aliases", async () => {
  for (const host of ["claude-code", "codex", "opencode", "gemini-cli", "oh-my-pi"]) {
    const project = await temp(`sew-${host}-`);
    const model = host === "opencode" ? "openai/worker" : "worker-model";
    const args = ["models", "configure", "--host", host, "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", model];
    const result = await capture(args);
    assert.equal(result.code, 0, result.stderr);
    const root = projectAgentRoot(host, project);
    for (const role of ROLES) assert.equal(await exists(path.join(root, `sew-${role}${extension(host)}`)), true);
    const remove = await capture(["models", "configure", "--host", host, "--scope", "project", "--project", project, "--preset", "inherit"]);
    assert.equal(remove.code, 0, remove.stderr);
    for (const role of ROLES) assert.equal(await exists(path.join(root, `sew-${role}${extension(host)}`)), false);
  }
});

test("static install, update, and uninstall use CI-bundled payloads", async () => {
  for (const host of ["codex", "opencode", "gemini-cli", "antigravity"]) {
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

test("CI-bundled package payloads and role templates cover the canonical plugin", async () => {
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
  for (const role of ROLES) {
    assert.equal(await readFile(path.join(BUILT_SEW_ROOT, "templates", `${role}.md`), "utf8"), await readFile(path.join(ROOT, "plugins/senior-engineering-workflow/agents", `${role}.md`), "utf8"));
  }
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
