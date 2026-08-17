import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { parse as parseToml } from "smol-toml";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILT_SEW_ROOT = path.join(ROOT, "release-build", "sew", "package");
const { internals, main } = await import(`${pathToFileURL(path.join(BUILT_SEW_ROOT, "lib", "sew.mjs")).href}?regression=${Date.now()}`);
const ROLES = ["researcher", "engineer", "verifier", "worker"];

async function temp(prefix = "sew-regression-") { return mkdtemp(path.join(os.tmpdir(), prefix)); }
async function exists(file) { try { await lstat(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } }

async function capture(argv, { env = {}, spawnSync } = {}) {
  let stdout = "";
  let stderr = "";
  const oldOut = process.stdout.write;
  const oldErr = process.stderr.write;
  process.stdout.write = ((chunk) => { stdout += String(chunk); return true; });
  process.stderr.write = ((chunk) => { stderr += String(chunk); return true; });
  try {
    const code = await main(argv, { env, spawnSync });
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = oldOut;
    process.stderr.write = oldErr;
  }
}

function codexRunner({ installed = true } = {}) {
  return (executable, args) => {
    if (executable === "codex" && args.join(" ") === "plugin list --json") {
      return {
        status: 0,
        stdout: JSON.stringify({ installed: installed ? [{ pluginId: "senior-engineering-workflow@otto-plugins", installed: true, enabled: true }] : [] }),
        stderr: "",
      };
    }
    if (executable === "opencode" && args.join(" ") === "models") {
      return { status: 0, stdout: "openai/test\n", stderr: "" };
    }
    if (executable === "codex" && args.join(" ") === "debug models") {
      return {
        status: 0,
        stdout: JSON.stringify({
          models: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-test", "openai/test", "o3", "o3-mini", "gpt-4o"].map((slug) => ({
            slug,
            visibility: "list",
            supported_in_api: true,
            supported_reasoning_levels: ["low", "medium", "high", "max"].map((effort) => ({ effort })),
          })),
        }),
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
}

function frontmatter(content) {
  const normalized = String(content).replaceAll("\r\n", "\n");
  const end = normalized.indexOf("\n---\n", 4);
  assert.equal(normalized.startsWith("---\n"), true);
  assert.ok(end > 0);
  return YAML.parse(normalized.slice(4, end));
}

test("model configuration rejects hosts without sew-owned editable agents", async () => {
  const runner = codexRunner();
  for (const host of ["claude-code", "oh-my-pi", "antigravity"]) {
    const project = await temp(`sew-unsupported-${host}-`);
    const result = await capture([
      "models", "configure", "--host", host, "--scope", "project", "--project", project, "--preset", "inherit",
    ], { env: {}, spawnSync: runner });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Model configuration is not supported/u);
  }

  const invalidHostResult = await capture([
    "models", "configure", "--host", "unknown-harness", "--scope", "project", "--preset", "inherit",
  ]);
  assert.equal(invalidHostResult.code, 2);
  assert.match(invalidHostResult.stderr, /--host must be one of/u);
});

test("inherit removes durable model state and a later update remains inherited", async () => {
  const project = await temp("sew-inherit-update-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const spawnSync = codexRunner();
  assert.equal((await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync })).code, 0);
  assert.equal((await capture(["models", "configure", "--host", "codex", "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", "gpt-test"], { env, spawnSync })).code, 0);
  assert.equal((await capture(["models", "configure", "--host", "codex", "--scope", "project", "--project", project, "--preset", "inherit"], { env, spawnSync })).code, 0);

  const statePath = path.join(project, ".oovz", "sew", "codex.json");
  assert.equal(Object.hasOwn(JSON.parse(await readFile(statePath, "utf8")), "models"), false);
  assert.equal((await capture(["update", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync })).code, 0);

  const worker = await readFile(path.join(project, ".codex", "agents", "senior-engineering-workflow-worker.toml"), "utf8");
  const parsed = parseToml(worker);
  assert.equal(parsed.model, undefined);
  assert.equal(parsed.model_reasoning_effort, undefined);
});

test("a generated marker does not authorize subsequent external edits", async () => {
  const project = await temp("sew-marker-trust-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const spawnSync = codexRunner();
  assert.equal((await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync })).code, 0);
  const configure = ["models", "configure", "--host", "codex", "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", "gpt-test"];
  assert.equal((await capture(configure, { env, spawnSync })).code, 0);

  const worker = path.join(project, ".codex", "agents", "senior-engineering-workflow-worker.toml");
  await writeFile(worker, `${await readFile(worker, "utf8")}user-edit = true\n`);
  const refused = await capture(configure, { env, spawnSync });
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /modified outside/u);
});

test("OpenCode removes a stale variant and emits valid YAML", async () => {
  const project = await temp("sew-opencode-variant-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  assert.equal((await capture(["install", "--host", "opencode", "--scope", "project", "--project", project], { env, spawnSync: () => ({ error: { code: "ENOENT" } }) })).code, 0);
  const base = ["models", "configure", "--host", "opencode", "--scope", "project", "--project", project, "--preset", "two-model", "--worker-model", "openai/test"];
  const opencodeRunner = codexRunner();
  assert.equal((await capture([...base, "--worker-thinking", "high"], { env, spawnSync: opencodeRunner })).code, 0);
  assert.equal((await capture(base, { env, spawnSync: opencodeRunner })).code, 0);

  const worker = await readFile(path.join(project, ".opencode", "agents", "senior-engineering-workflow-worker.md"), "utf8");
  const parsed = frontmatter(worker);
  assert.equal(parsed.model, "openai/test");
  assert.equal(parsed.variant, undefined);
});

test("model state has an exact validated shape", async () => {
  const project = await temp("sew-model-state-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  assert.equal((await capture(["install", "--host", "opencode", "--scope", "project", "--project", project], { env, spawnSync: () => ({ error: { code: "ENOENT" } }) })).code, 0);
  const statePath = path.join(project, ".oovz", "sew", "opencode.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.models = { unknown: { model: "x" } };
  await writeFile(statePath, JSON.stringify(state));
  const result = await capture(["update", "--host", "opencode", "--scope", "project", "--project", project], { env });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /unknown model role/u);
});



test("installation state cannot redirect managed roots outside the selected host paths", async () => {
  const project = await temp("sew-state-roots-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  assert.equal((await capture(["install", "--host", "opencode", "--scope", "project", "--project", project], { env, spawnSync: () => ({ error: { code: "ENOENT" } }) })).code, 0);
  const statePath = path.join(project, ".oovz", "sew", "opencode.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.roots.config = path.join(project, "outside");
  await writeFile(statePath, JSON.stringify(state));
  const result = await capture(["update", "--host", "opencode", "--scope", "project", "--project", project], { env });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /root config does not match/u);
});

test("model configuration is one rollback-capable file-and-state transaction", async () => {
  const root = await temp("sew-model-transaction-");
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  await writeFile(first, "old-first");
  await writeFile(second, "old-second");
  const blocker = path.join(root, "not-a-directory");
  await writeFile(blocker, "blocker");

  await assert.rejects(internals.commitManagedOperation("models", {
    statePath: path.join(blocker, "state.json"),
    nextState: { schemaVersion: 2 },
    writes: [
      { destination: first, content: Buffer.from("new-first") },
      { destination: second, content: Buffer.from("new-second") },
    ],
    removals: [],
    roots: {},
  }));

  assert.equal(await readFile(first, "utf8"), "old-first");
  assert.equal(await readFile(second, "utf8"), "old-second");
  assert.deepEqual((await readdir(root)).filter((name) => name.includes("sew-") || name.includes("backup")), []);
});

test("OpenCode installation is verified as a skill plus four subagents, not a JS plugin", async () => {
  const project = await temp("sew-opencode-discovery-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const expected = ROLES.map((role) => `senior-engineering-workflow-${role}`);
  const spawnSync = (executable, args) => executable === "opencode" && args.join(" ") === "agent list"
    ? { status: 0, stdout: expected.map((name) => `${name} (subagent)`).join("\n"), stderr: "" }
    : { status: 0, stdout: "", stderr: "" };

  const install = await capture(["install", "--host", "opencode", "--scope", "project", "--project", project, "--json"], { env, spawnSync });
  assert.equal(install.code, 0, install.stderr);
  const result = JSON.parse(install.stdout);
  assert.equal(result.discovery.status, "verified");
  assert.match(result.discovery.message, /does not register a JavaScript\/TypeScript plugin/u);
  for (const role of ROLES) assert.equal(await exists(path.join(project, ".opencode", "agents", `senior-engineering-workflow-${role}.md`)), true);
  assert.equal(await exists(path.join(project, ".opencode", "skills", "senior-engineering-workflow", "SKILL.md")), true);
});



test("OpenCode reports a discovery failure when a fresh CLI process cannot see installed subagents", async () => {
  const project = await temp("sew-opencode-missing-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const spawnSync = (executable, args) => executable === "opencode" && args.join(" ") === "agent list"
    ? { status: 0, stdout: "build (primary)\nplan (primary)\n", stderr: "" }
    : { status: 0, stdout: "", stderr: "" };
  const install = await capture(["install", "--host", "opencode", "--scope", "project", "--project", project, "--json"], { env, spawnSync });
  assert.equal(install.code, 1);
  const result = JSON.parse(install.stdout);
  assert.equal(result.status, "installed-but-not-discovered");
  assert.equal(result.discovery.status, "not-discovered");
  assert.deepEqual(result.discovery.missing, ROLES.map((role) => `senior-engineering-workflow-${role}`));
});

test("process execution preserves argv and fails closed for a missing cwd", async () => {
  const cwd = await temp("sew-process-");
  const calls = [];
  const spawnSync = (executable, args, options) => { calls.push({ executable, args, options }); return { status: 0, stdout: "", stderr: "" }; };
  assert.equal(internals.spawnHost("codex", ["value with spaces", "plain"], { cwd, spawnSync }).status, 0);
  assert.deepEqual(calls[0].args, ["value with spaces", "plain"]);
  const invalid = internals.spawnHost("codex", [], { cwd: path.join(cwd, "missing"), spawnSync });
  assert.equal(invalid.error.code, "SEW_INVALID_CWD");
  assert.equal(calls.length, 1);
});

test("Windows executes an npm-style cmd shim with exact arguments", { skip: process.platform !== "win32" && "requires Windows command shims" }, async () => {
  const root = await temp("sew-cross-spawn-");
  const bin = path.join(root, "bin with spaces");
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, "capture.mjs"), "process.stdout.write(JSON.stringify(process.argv.slice(2)))\n");
  await writeFile(path.join(bin, "fakecodex.cmd"), "@echo off\r\nnode \"%~dp0capture.mjs\" %*\r\n");
  const result = internals.spawnHost("fakecodex", ["value with spaces", "paren(value)"], {
    cwd: root,
    env: { ...process.env, PATH: `${bin};${process.env.PATH}` },
    stdio: "pipe",
  });
  assert.equal(result.status, 0, String(result.stderr ?? ""));
  assert.deepEqual(JSON.parse(result.stdout), ["value with spaces", "paren(value)"]);
});
