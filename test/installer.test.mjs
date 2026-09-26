import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveInstallPlan, runInstaller } from "../scripts/install.mjs";
import { assertOwnershipRecordMatchesSchema } from "../scripts/lib/schema.mjs";
import { discoverMarketplace, inspectPlugin } from "../scripts/lib/marketplace.mjs";
import { createFixtureMarketplace, execFileAsync, readJson } from "./helpers.mjs";
import { removeLegacyAntigravityOwnership } from "../scripts/migrate-antigravity-ownership.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER = path.join(ROOT, "scripts", "install.mjs");
const MIGRATION = path.join(ROOT, "scripts", "migrate-antigravity-ownership.mjs");
const PLUGIN = "senior-engineering-workflow";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-install-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await mkdir(home, { recursive: true });
  await mkdir(project, { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, home, project };
}

async function run(args, options) {
  const env = {
    ...process.env,
    HOME: options.home,
    USERPROFILE: options.home,
    XDG_STATE_HOME: path.join(options.home, ".state"),
    ...options.env
  };
  return execFileAsync(process.execPath, [INSTALLER, ...args], { cwd: ROOT, env });
}

function baseFor(plugin, operation, host, scope, extra = []) {
  return [operation, "--plugin", plugin, "--host", host, "--scope", scope, ...extra];
}

function base(operation, host, scope, extra = []) {
  return baseFor(PLUGIN, operation, host, scope, extra);
}

test("strict argv and native-only host guidance", async (t) => {
  const ctx = await fixture(t);
  const help = await run(["--help"], ctx);
  assert.match(help.stdout, /Codex only/);
  await assert.rejects(run(["install", "--plugin", PLUGIN, "--host", "codex", "--scope", "project", "--project", ctx.project], ctx), /requires --mode/);
  await assert.rejects(run([...base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project]), "--unknown"], ctx), /unknown argument/);
  await assert.rejects(run(base("install", "claude-code", "project", ["--project", ctx.project]), ctx), /claude plugin marketplace add/i);
  await assert.rejects(run(base("install", "gemini-cli", "user"), ctx), (error) => {
    assert.match(error.message, /npm run build -- --plugin senior-engineering-workflow --host gemini-cli/u);
    assert.match(error.message, /gemini extensions install \.\/dist\/gemini-cli\/senior-engineering-workflow/u);
    assert.doesNotMatch(error.message, /npx @oovz\/sew/u);
    return true;
  });
  await assert.rejects(run(base("install", "oh-my-pi", "project", ["--project", ctx.project]), ctx), /omp plugin marketplace add/i);

  const marketplaceRoot = path.join(ctx.root, "renamed-marketplace");
  await createFixtureMarketplace(marketplaceRoot, [{ id: "guidance-plugin", version: "1.0.0" }]);
  await assert.rejects(
    runInstaller(
      ["install", "--plugin", "guidance-plugin", "--host", "claude-code", "--scope", "project", "--project", ctx.project],
      { root: marketplaceRoot, env: { ...process.env, HOME: ctx.home, XDG_STATE_HOME: path.join(ctx.home, ".state") }, cwd: ctx.project, stdout: { write() {} } }
    ),
    (error) => {
      assert.match(error.message, /claude plugin marketplace add https:\/\/example\.com\/plugins/);
      assert.match(error.message, /guidance-plugin@fixture-marketplace/);
      assert.doesNotMatch(error.message, /otto-plugins/);
      return true;
    }
  );
});

test("Codex standalone and companion use exact project paths", async (t) => {
  const ctx = await fixture(t);
  await run(base("install", "codex", "project", ["--mode", "standalone", "--project", ctx.project]), ctx);
  const skill = path.join(ctx.project, ".agents", "skills", PLUGIN, "SKILL.md");
  const agent = path.join(ctx.project, ".codex", "agents", `${PLUGIN}-researcher.toml`);
  assert.match(await readFile(skill, "utf8"), /Senior Engineering Workflow/);
  assert.doesNotMatch(await readFile(agent, "utf8"), /sandbox_mode/);
  await run(base("uninstall", "codex", "project", ["--mode", "standalone", "--project", ctx.project]), ctx);
  await assert.rejects(readFile(skill), /ENOENT/);
  await assert.rejects(readFile(agent), /ENOENT/);

  await run(base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project]), ctx);
  assert.doesNotMatch(await readFile(agent, "utf8"), /sandbox_mode/);
  await assert.rejects(readFile(skill), /ENOENT/);
});

test("Codex companion rejects skill-only plugins before creating ownership state", async (t) => {
  const ctx = await fixture(t);
  const env = { ...process.env, HOME: ctx.home, USERPROFILE: ctx.home, XDG_STATE_HOME: path.join(ctx.home, ".state") };
  await assert.rejects(
    runInstaller(
      ["install", "--plugin", "tauri-v2-desktop", "--host", "codex", "--scope", "project", "--mode", "companion", "--project", ctx.project, "--dry-run"],
      { root: ROOT, env, cwd: ctx.project, stdout: { write() {} } }
    ),
    (error) => {
      assert.match(error.message, /skill-only plugin/i);
      assert.match(error.message, /native Codex marketplace/i);
      assert.match(error.message, /standalone mode/i);
      return true;
    }
  );
  await assert.rejects(lstat(path.join(ctx.home, ".state")), /ENOENT/);
});

test("Codex standalone dry-run lists skill-only files and license", async (t) => {
  const ctx = await fixture(t);
  let output = "";
  const env = { ...process.env, HOME: ctx.home, USERPROFILE: ctx.home, XDG_STATE_HOME: path.join(ctx.home, ".state") };
  await runInstaller(
    ["install", "--plugin", "tauri-v2-desktop", "--host", "codex", "--scope", "project", "--mode", "standalone", "--project", ctx.project, "--dry-run"],
    { root: ROOT, env, cwd: ctx.project, stdout: { write(value) { output += value; } } }
  );
  assert.match(output, /would write .*\.agents[\\/]skills[\\/]tauri-v2-desktop[\\/]SKILL\.md/);
  assert.match(output, /would write .*\.agents[\\/]skills[\\/]tauri-v2-desktop[\\/]LICENSE/);
  await assert.rejects(lstat(path.join(ctx.project, ".agents")), /ENOENT/);
});

test("Chrome Extension Tester rejects Codex standalone due to native host files and directs Gemini CLI to build adapter", async (t) => {
  const ctx = await fixture(t);
  const env = { ...process.env, HOME: ctx.home, USERPROFILE: ctx.home, XDG_STATE_HOME: path.join(ctx.home, ".state") };
  await assert.rejects(
    runInstaller(
      ["install", "--plugin", "chrome-extension-tester", "--host", "codex", "--scope", "project", "--mode", "standalone", "--project", ctx.project, "--dry-run"],
      { root: ROOT, env, cwd: ctx.project, stdout: { write() {} } }
    ),
    /Codex standalone cannot install native host files \(codex-mcp\)/
  );
  await assert.rejects(
    runInstaller(
      ["install", "--plugin", "chrome-extension-tester", "--host", "gemini-cli", "--scope", "user", "--dry-run"],
      { root: ROOT, env, cwd: ctx.project, stdout: { write() {} } }
    ),
    /npm run build -- --plugin chrome-extension-tester --host gemini-cli/
  );
});

test("Codex user scope splits Agent Skills from CODEX_HOME agents", async (t) => {
  const ctx = await fixture(t);
  const codexHome = path.join(ctx.root, "custom-codex");
  await run(base("install", "codex", "user", ["--mode", "standalone"]), { ...ctx, env: { CODEX_HOME: codexHome } });
  assert.ok(await readFile(path.join(ctx.home, ".agents", "skills", PLUGIN, "SKILL.md")));
  assert.ok(await readFile(path.join(codexHome, "agents", `${PLUGIN}-researcher.toml`)));
  await assert.rejects(readFile(path.join(codexHome, "skills", PLUGIN, "SKILL.md")), /ENOENT/);
});

test("generic installer ownership records match the current schema", async (t) => {
  const ctx = await fixture(t);
  await run(base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project]), ctx);
  const projectKey = createHash("sha256").update(path.resolve(ctx.project)).digest("hex").slice(0, 24);
  const recordPath = path.join(ctx.home, ".state", "oovz-plugins", "projects", projectKey, "ownership.json");
  const record = await readJson(recordPath);
  await assertOwnershipRecordMatchesSchema(ROOT, record);
  const first = Object.keys(record.files)[0];
  record.files[first].variant = null;
  await assert.rejects(assertOwnershipRecordMatchesSchema(ROOT, record), /additional properties/u);
});

test("generic install plans retain explicit state and trusted-root anchors", async (t) => {
  const ctx = await fixture(t);
  await createFixtureMarketplace(ctx.root, [{ id: "anchor-plugin", version: "1.0.0", options: { hosts: { portable: { enabled: true } } } }]);
  const catalog = await discoverMarketplace(ctx.root);
  const plugin = await inspectPlugin(catalog.plugins.find((candidate) => candidate.manifest.id === "anchor-plugin"));
  const env = { ...process.env, HOME: ctx.home, USERPROFILE: ctx.home, XDG_STATE_HOME: path.join(ctx.home, ".state") };
  const plan = resolveInstallPlan(plugin, { plugin: "anchor-plugin", host: "portable-agent-skills", scope: "project", mode: null, project: ctx.project }, env, ctx.project);
  assert.equal(plan.stateAnchor, path.resolve(ctx.home));
  assert.ok(plan.rootAnchors[path.resolve(ctx.project, ".agents", "skills")]);
});

test("generic installer preserves a concrete trusted root through staged promotion below a stable alias", async (t) => {
  const ctx = await fixture(t);
  const physicalParent = path.join(ctx.root, "physical");
  const aliasParent = path.join(ctx.root, "alias");
  const project = path.join(aliasParent, "project");
  await mkdir(path.join(physicalParent, "project"), { recursive: true });
  try { await symlink(physicalParent, aliasParent, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error?.code)) { t.skip("platform does not permit directory aliases"); return; } throw error; }
  const env = { ...process.env, HOME: ctx.home, USERPROFILE: ctx.home, XDG_STATE_HOME: path.join(ctx.home, ".state") };
  await runInstaller(
    ["install", "--plugin", "tauri-v2-desktop", "--host", "portable-agent-skills", "--scope", "project", "--project", project],
    { root: ROOT, env, cwd: project, stdout: { write() {} } },
  );
  assert.equal(await readFile(path.join(physicalParent, "project", ".agents", "skills", "tauri-v2-desktop", "SKILL.md"), "utf8").then(Boolean), true);
});

test("OpenCode user root precedence is OPENCODE_CONFIG_DIR then XDG then HOME", async (t) => {
  const ctx = await fixture(t);
  for (const [name, env, expected] of [
    ["override", { OPENCODE_CONFIG_DIR: path.join(ctx.root, "override"), XDG_CONFIG_HOME: path.join(ctx.root, "xdg") }, path.join(ctx.root, "override")],
    ["xdg", { OPENCODE_CONFIG_DIR: "", XDG_CONFIG_HOME: path.join(ctx.root, "xdg-only") }, path.join(ctx.root, "xdg-only", "opencode")],
    ["home", { OPENCODE_CONFIG_DIR: "", XDG_CONFIG_HOME: "" }, path.join(ctx.home, ".config", "opencode")]
  ]) {
    const isolatedHome = path.join(ctx.root, `home-${name}`);
    await mkdir(isolatedHome);
    await run(base("install", "opencode", "user"), { ...ctx, home: isolatedHome, env });
    assert.ok(await readFile(path.join(expected.replace(ctx.home, isolatedHome), "agents", `${PLUGIN}-researcher.md`)));
  }
});

test("OpenCode rejects the removed variant selector", async (t) => {
  const ctx = await fixture(t);
  await assert.rejects(
    run(base("install", "opencode", "project", ["--variant", "v2-beta", "--project", ctx.project]), ctx),
    /unknown argument: --variant/,
  );
  await assert.rejects(lstat(path.join(ctx.project, ".opencode")), /ENOENT/);
});

test("Antigravity and portable installs use native project/user roots", async (t) => {
  const ctx = await fixture(t);
  const antigravityPlugin = "tauri-v2-desktop";
  await run(
    baseFor(antigravityPlugin, "install", "antigravity", "project", ["--project", ctx.project]),
    ctx,
  );
  assert.ok(
    await readFile(
      path.join(ctx.project, ".agents", "plugins", antigravityPlugin, "plugin.json"),
    ),
  );
  await run(baseFor(antigravityPlugin, "install", "antigravity", "user"), ctx);
  assert.ok(
    await readFile(
      path.join(ctx.home, ".gemini", "antigravity-cli", "plugins", antigravityPlugin, "plugin.json"),
    ),
  );
  await run(
    baseFor(antigravityPlugin, "uninstall", "antigravity", "project", ["--project", ctx.project]),
    ctx,
  );
  await assert.rejects(
    lstat(path.join(ctx.project, ".agents", "plugins", antigravityPlugin)),
    /ENOENT/,
  );
  await run(baseFor(antigravityPlugin, "uninstall", "antigravity", "user"), ctx);
  await assert.rejects(
    lstat(path.join(ctx.home, ".gemini", "antigravity-cli", "plugins", antigravityPlugin)),
    /ENOENT/,
  );
  const portableProject = path.join(ctx.root, "portable-project");
  await mkdir(portableProject);
  await run(baseFor("tauri-v2-desktop", "install", "portable-agent-skills", "project", ["--project", portableProject]), ctx);
  assert.ok(await readFile(path.join(portableProject, ".agents", "skills", "tauri-v2-desktop", "SKILL.md")));
});

test("Antigravity migration filters only the obsolete generic ownership entries", () => {
  const oldRoot = path.resolve("C:/Users/tester/.gemini/config/plugins/senior-engineering-workflow");
  const record = {
    schemaVersion: 1,
    files: {
      [path.join(oldRoot, "plugin.json")]: { plugin: "senior-engineering-workflow", host: "antigravity", scope: "user", variant: null },
      [path.join(oldRoot, "skills", "workflow", "SKILL.md")]: { plugin: "senior-engineering-workflow", host: "antigravity", scope: "user", variant: null },
      [path.join(path.dirname(oldRoot), "other-plugin", "plugin.json")]: { plugin: "other-plugin", host: "antigravity", scope: "user", variant: null },
    },
  };
  const result = removeLegacyAntigravityOwnership(record, oldRoot);
  assert.equal(result.removed.length, 2);
  assert.deepEqual(Object.keys(result.record.files), [path.join(path.dirname(oldRoot), "other-plugin", "plugin.json")]);
  assert.equal(Object.hasOwn(result.record.files[path.join(path.dirname(oldRoot), "other-plugin", "plugin.json")], "variant"), false);
  const tauriRoot = path.resolve("C:/Users/tester/.gemini/config/plugins/tauri-v2-desktop");
  const tauriResult = removeLegacyAntigravityOwnership({
    schemaVersion: 1,
    files: { [path.join(tauriRoot, "plugin.json")]: { plugin: "tauri-v2-desktop", host: "antigravity", scope: "user" } },
  }, tauriRoot);
  assert.deepEqual(tauriResult.removed, [path.join(tauriRoot, "plugin.json")]);
});

test("Antigravity ownership migration refuses an active generic writer lock", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-antigravity-migration-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const recordRoot = path.join(root, "state", "oovz-plugins", "user");
  const recordFile = path.join(recordRoot, "ownership.json");
  const oldRoot = path.join(root, "old", "senior-engineering-workflow");
  const record = { schemaVersion: 1, files: { [path.join(oldRoot, "plugin.json")]: { plugin: "senior-engineering-workflow", host: "antigravity", scope: "user", variant: null } } };
  await mkdir(recordRoot, { recursive: true });
  await writeFile(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  await mkdir(path.join(recordRoot, ".install.lock"));
  await assert.rejects(execFileAsync(process.execPath, [MIGRATION, "--record", recordFile, "--old-root", oldRoot, "--apply"]), /ownership record is busy/u);
  assert.deepEqual(JSON.parse(await readFile(recordFile, "utf8")), record);
});

test("dry-run is non-mutating and preflight prevents partial writes", async (t) => {
  const ctx = await fixture(t);
  const args = base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project]);
  const dry = await run([...args, "--dry-run"], ctx);
  assert.match(dry.stdout, /would write/);
  await assert.rejects(readFile(path.join(ctx.project, ".codex", "agents", `${PLUGIN}-researcher.toml`)), /ENOENT/);

  const conflict = path.join(ctx.project, ".codex", "agents", `${PLUGIN}-verifier.toml`);
  await mkdir(path.dirname(conflict), { recursive: true });
  await writeFile(conflict, "user content\n");
  await assert.rejects(run(args, ctx), /unowned/);
  await assert.rejects(readFile(path.join(ctx.project, ".codex", "agents", `${PLUGIN}-researcher.toml`)), /ENOENT/, "preflight must finish before any write");
  await run([...args, "--force"], ctx);
  assert.match(await readFile(conflict, "utf8"), /developer_instructions/);
  assert.doesNotMatch(await readFile(conflict, "utf8"), /sandbox_mode/);
});

test("dry-run previews install, update, and uninstall while a writer holds the lock", async (t) => {
  const ctx = await fixture(t);
  const extra = ["--mode", "companion", "--project", ctx.project];
  const projectKey = createHash("sha256").update(path.resolve(ctx.project)).digest("hex").slice(0, 24);
  const recordRoot = path.join(ctx.home, ".state", "oovz-plugins", "projects", projectKey);
  const lock = path.join(recordRoot, ".install.lock");
  await mkdir(lock, { recursive: true });
  const install = await run([...base("install", "codex", "project", extra), "--dry-run"], ctx);
  assert.match(install.stdout, /would write/);
  assert.deepEqual(await readdir(recordRoot), [".install.lock"]);
  await assert.rejects(lstat(path.join(ctx.project, ".codex")), /ENOENT/);
  await rm(lock, { recursive: true });
  await run(base("install", "codex", "project", extra), ctx);
  const recordFile = path.join(recordRoot, "ownership.json");
  const record = await readFile(recordFile, "utf8");
  const agent = path.join(ctx.project, ".codex", "agents", `${PLUGIN}-researcher.toml`);
  const original = await readFile(agent, "utf8");
  await mkdir(lock);
  for (const operation of ["update", "uninstall"]) {
    const preview = await run([...base(operation, "codex", "project", extra), "--dry-run"], ctx);
    assert.match(preview.stdout, operation === "update" ? /would write/ : /would remove/);
    assert.equal(await readFile(recordFile, "utf8"), record);
    assert.equal(await readFile(agent, "utf8"), original);
    assert.equal((await lstat(lock)).isDirectory(), true);
  }
  await writeFile(agent, "local modification\n");
  await assert.rejects(run([...base("update", "codex", "project", extra), "--dry-run"], ctx), /modified/);
});

test("dry-run works with read-only ownership state without creating directories", async (t) => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    t.skip("requires POSIX permission enforcement");
    return;
  }
  const ctx = await fixture(t);
  const state = path.join(ctx.home, ".state");
  await mkdir(state);
  await chmod(state, 0o555);
  try {
    const preview = await run([...base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project]), "--dry-run"], ctx);
    assert.match(preview.stdout, /would write/);
    assert.deepEqual(await readdir(state), []);
    await assert.rejects(lstat(path.join(ctx.project, ".codex")), /ENOENT/);
  } finally {
    await chmod(state, 0o755);
  }
});

test("updates and uninstalls refuse modified owned files", async (t) => {
  const ctx = await fixture(t);
  const install = base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project]);
  await run(install, ctx);
  const agent = path.join(ctx.project, ".codex", "agents", `${PLUGIN}-researcher.toml`);
  await writeFile(agent, "local modification\n");
  await assert.rejects(run(base("update", "codex", "project", ["--mode", "companion", "--project", ctx.project, "--force"]), ctx), /modified/);
  await assert.rejects(run(base("uninstall", "codex", "project", ["--mode", "companion", "--project", ctx.project]), ctx), /modified/);
  assert.equal(await readFile(agent, "utf8"), "local modification\n");
});

test("cross-install ownership collisions fail before writes", async (t) => {
  const ctx = await fixture(t);
  const args = base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project]);
  await run(args, ctx);
  const projectRecords = path.join(ctx.home, ".state", "oovz-plugins", "projects");
  const recordFile = path.join(projectRecords, (await readdir(projectRecords))[0], "ownership.json");
  const record = await readJson(recordFile);
  const victim = Object.keys(record.files).find((file) => file.endsWith(`${PLUGIN}-verifier.toml`));
  record.files[victim].plugin = "another-plugin";
  await writeFile(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  await assert.rejects(run(base("update", "codex", "project", ["--mode", "companion", "--project", ctx.project]), ctx), /another plugin or install mode/);
});

test("concurrent installs serialize ownership without orphaning either plugin", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-concurrent-install-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await mkdir(home);
  await mkdir(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [
    { id: "alpha-plugin", version: "1.0.0", options: { hosts: { portable: { enabled: true } } } },
    { id: "beta-plugin", version: "2.0.0", options: { hosts: { portable: { enabled: true } } } }
  ]);
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: path.join(home, ".state") };
  const install = (plugin) => runInstaller(
    ["install", "--plugin", plugin, "--host", "portable-agent-skills", "--scope", "project", "--project", project],
    { root, env, cwd: project, stdout: { write() {} } }
  );
  const plugins = ["alpha-plugin", "beta-plugin"];
  const results = await Promise.allSettled(plugins.map(install));
  const succeeded = new Set(plugins.filter((_, index) => results[index].status === "fulfilled"));
  assert.ok(succeeded.size >= 1);
  for (const result of results) if (result.status === "rejected") assert.match(result.reason.message, /ownership record is busy/);

  const projectKey = createHash("sha256").update(path.resolve(project)).digest("hex").slice(0, 24);
  const record = await readJson(path.join(home, ".state", "oovz-plugins", "projects", projectKey, "ownership.json"));
  const recorded = new Set(Object.values(record.files).map((entry) => entry.plugin));
  assert.deepEqual(recorded, succeeded);
  for (const plugin of plugins) {
    const skill = path.join(project, ".agents", "skills", `${plugin}-skill`, "SKILL.md");
    if (succeeded.has(plugin)) assert.ok(await readFile(skill));
    else await assert.rejects(readFile(skill), /ENOENT/);
  }
});

test("ownership lock blocks install, update, and uninstall before mutation", async (t) => {
  const ctx = await fixture(t);
  const install = base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project]);
  await run(install, ctx);
  const agent = path.join(ctx.project, ".codex", "agents", `${PLUGIN}-researcher.toml`);
  const original = await readFile(agent, "utf8");
  const projectKey = createHash("sha256").update(path.resolve(ctx.project)).digest("hex").slice(0, 24);
  const lock = path.join(ctx.home, ".state", "oovz-plugins", "projects", projectKey, ".install.lock");
  await mkdir(lock);
  for (const operation of ["update", "uninstall"]) {
    await assert.rejects(
      run(base(operation, "codex", "project", ["--mode", "companion", "--project", ctx.project]), ctx),
      (error) => {
        assert.match(`${error.stderr}${error.message}`, /ownership record is busy/);
        assert.match(`${error.stderr}${error.message}`, /\.install\.lock/);
        assert.match(`${error.stderr}${error.message}`, /If no installer process is running, remove that lock directory manually/);
        return true;
      }
    );
    assert.equal(await readFile(agent, "utf8"), original);
  }
  await rm(lock, { recursive: true });
});

test("symlink ancestors are rejected", async (t) => {
  const ctx = await fixture(t);
  const outside = path.join(ctx.root, "outside");
  await mkdir(outside);
  await mkdir(path.join(ctx.project, ".codex"));
  await symlink(outside, path.join(ctx.project, ".codex", "agents"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(run(base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project]), ctx), /symlink/);
  await assert.rejects(readFile(path.join(outside, `${PLUGIN}-researcher.toml`)), /ENOENT/);
});

test("ownership records are checked for symlinks before they are read", async (t) => {
  const ctx = await fixture(t);
  const projectKey = createHash("sha256").update(path.resolve(ctx.project)).digest("hex").slice(0, 24);
  const recordRoot = path.join(ctx.home, ".state", "oovz-plugins", "projects", projectKey);
  const external = path.join(ctx.root, "external-record");
  await mkdir(recordRoot, { recursive: true });
  await mkdir(external);
  await writeFile(path.join(external, "sentinel"), "TOP_SECRET_SENTINEL not json\n");
  await symlink(external, path.join(recordRoot, "ownership.json"), process.platform === "win32" ? "junction" : "dir");
  for (const flags of [[], ["--dry-run"]]) {
    await assert.rejects(run(base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project, ...flags]), ctx), (error) => {
      assert.match(`${error.stderr}${error.message}`, /symlink/);
      assert.doesNotMatch(`${error.stderr}${error.message}`, /TOP_SECRET_SENTINEL/);
      return true;
    });
  }
});

test("uninstall relies on ownership, not the current catalog or plugin source", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-removed-plugin-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await mkdir(home);
  await mkdir(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{ id: "removed-plugin", version: "1.0.0", options: { hosts: { portable: { enabled: true } } } }]);
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: path.join(home, ".state") };
  const args = ["install", "--plugin", "removed-plugin", "--host", "portable-agent-skills", "--scope", "project", "--project", project];
  await runInstaller(args, { root, env, cwd: project, stdout: { write() {} } });
  const skill = path.join(project, ".agents", "skills", "removed-plugin-skill", "SKILL.md");
  assert.ok(await readFile(skill));
  await rm(path.join(root, "marketplace.json"));
  await rm(path.join(root, "plugins"), { recursive: true });
  await runInstaller(["uninstall", ...args.slice(1)], { root, env, cwd: project, stdout: { write() {} } });
  await assert.rejects(readFile(skill), /ENOENT/);
});

test("Codex standalone rejects native-only host files instead of silently dropping them", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-hostfile-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await mkdir(home);
  await mkdir(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "native-file-plugin",
    version: "1.0.0",
    options: {
      hosts: { codex: { enabled: true } },
      hostFile: { path: "native/hooks.json", hosts: ["codex"], destination: "hooks/hooks.json", content: "{\"hooks\":{\"SessionStart\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"true\"}]}]}}\n" }
    }
  }]);
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: path.join(home, ".state") };
  const common = ["--plugin", "native-file-plugin", "--host", "codex", "--scope", "project", "--project", project];
  await assert.rejects(runInstaller(["install", ...common, "--mode", "standalone"], { root, env, cwd: project, stdout: { write() {} } }), /cannot install native host files/);
  let output = "";
  await runInstaller(["install", ...common, "--mode", "companion"], { root, env, cwd: project, stdout: { write(value) { output += value; } } });
  assert.match(output, /native plugin host files must already be installed/);
  assert.ok(await readFile(path.join(project, ".codex", "agents", "native-file-plugin-worker.toml")));
});

test("Codex mode guidance follows skills, agents, and native host-file components", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-component-matrix-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await mkdir(home);
  await mkdir(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  const nativeFile = { path: "native/policy.json", hosts: ["codex"], destination: "hooks/policy.json", content: "{\"hooks\":{\"SessionStart\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"true\"}]}]}}\n" };
  await createFixtureMarketplace(root, [
    { id: "skill-only", version: "1.0.0", options: { includeAgent: false } },
    { id: "agent-only", version: "1.0.0", options: { includeSkill: false } },
    { id: "skill-native", version: "1.0.0", options: { includeAgent: false, hostFile: nativeFile } },
    { id: "agent-native", version: "1.0.0", options: { hostFile: nativeFile } },
    { id: "native-only", version: "1.0.0", options: { includeSkill: false, includeAgent: false, hostFile: nativeFile } }
  ]);
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: path.join(home, ".state") };
  const args = (plugin, mode) => ["install", "--plugin", plugin, "--host", "codex", "--scope", "project", "--mode", mode, "--project", project];

  let output = "";
  await runInstaller(args("agent-only", "companion"), { root, env, cwd: project, stdout: { write(value) { output += value; } } });
  assert.ok(await readFile(path.join(project, ".codex", "agents", "agent-only-worker.toml")));
  output = "";
  await runInstaller(args("agent-native", "companion"), { root, env, cwd: project, stdout: { write(value) { output += value; } } });
  assert.match(output, /native plugin host files must already be installed/);
  assert.ok(await readFile(path.join(project, ".codex", "agents", "agent-native-worker.toml")));

  await assert.rejects(
    runInstaller(args("skill-native", "companion"), { root, env, cwd: project, stdout: { write() {} } }),
    (error) => {
      assert.match(error.message, /native Codex host files/);
      assert.match(error.message, /native Codex plugin/);
      assert.doesNotMatch(error.message, /standalone mode/);
      return true;
    }
  );
  await assert.rejects(
    runInstaller(args("skill-native", "standalone"), { root, env, cwd: project, stdout: { write() {} } }),
    /install the native Codex plugin through its marketplace/
  );
  await assert.rejects(
    runInstaller(args("native-only", "companion"), { root, env, cwd: project, stdout: { write() {} } }),
    /no companion agents/
  );
  await assert.rejects(
    runInstaller(args("native-only", "standalone"), { root, env, cwd: project, stdout: { write() {} } }),
    /install the native Codex plugin through its marketplace/
  );
  await assert.rejects(readFile(path.join(project, ".codex", "agents", "skill-native-worker.toml")), /ENOENT/);
  await assert.rejects(readFile(path.join(project, ".codex", "agents", "native-only-worker.toml")), /ENOENT/);
});

test("Codex companion mode honors explicit host disablement before writes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-disabled-companion-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await mkdir(home);
  await mkdir(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "codex-disabled-plugin",
    version: "1.0.0",
    options: {
      hosts: {
        "claude-code": { enabled: true },
        codex: { enabled: false }
      }
    }
  }]);
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: path.join(home, ".state") };
  const args = ["install", "--plugin", "codex-disabled-plugin", "--host", "codex", "--scope", "project", "--mode", "companion", "--project", project];
  await assert.rejects(runInstaller(args, { root, env, cwd: project, stdout: { write() {} } }), /does not enable host codex/);
  await assert.rejects(readFile(path.join(project, ".codex", "agents", "codex-disabled-plugin-worker.toml")), /ENOENT/);
  await assert.rejects(readFile(path.join(home, ".state", "oovz-plugins"), "utf8"), /ENOENT|EISDIR/);
});

test("Codex skill overlays require a declared owner and share route guidance", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-skill-overlay-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await mkdir(home);
  await mkdir(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "overlay-plugin",
    version: "1.0.0",
    options: {
      includeAgent: false,
      hostFile: { path: "host/note.md", hosts: ["codex"], destination: "skills/overlay-plugin-skill/references/note.md", content: "overlay\n" }
    }
  }]);
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: path.join(home, ".state") };
  const common = ["install", "--plugin", "overlay-plugin", "--host", "codex", "--scope", "project", "--project", project];
  await assert.rejects(
    runInstaller([...common, "--mode", "companion", "--dry-run"], { root, env, cwd: project, stdout: { write() {} } }),
    (error) => {
      assert.match(error.message, /skill-only plugin/);
      assert.doesNotMatch(error.message, /native Codex host files/);
      return true;
    }
  );
  let output = "";
  await runInstaller([...common, "--mode", "standalone", "--dry-run"], { root, env, cwd: project, stdout: { write(value) { output += value; } } });
  assert.match(output, /references[\\/]note\.md/);

  const orphanRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-orphan-"));
  t.after(() => rm(orphanRoot, { recursive: true, force: true }));
  await createFixtureMarketplace(orphanRoot, [{
    id: "orphan-plugin",
    version: "1.0.0",
    options: { includeSkill: false, hostFile: { path: "host/note.md", hosts: ["codex"], destination: "skills/orphan/references/note.md", content: "orphan\n" } }
  }]);
  await assert.rejects(
    runInstaller(["install", "--plugin", "orphan-plugin", "--host", "codex", "--scope", "project", "--mode", "standalone", "--project", project, "--dry-run"], { root: orphanRoot, env, cwd: project, stdout: { write() {} } }),
    /declared skill support path/
  );
  await assert.rejects(lstat(path.join(home, ".state")), /ENOENT/);
});

test("direct skill installs preserve the canonical standalone skill license", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-skill-license-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await mkdir(home);
  await mkdir(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{ id: "licensed-plugin", version: "1.0.0", options: { hosts: { portable: { enabled: true } }, license: "Private plugin license.\n", skillLicense: "Independent skill license.\n", licenseId: "LicenseRef-Private" } }]);
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: path.join(home, ".state") };
  await runInstaller(["install", "--plugin", "licensed-plugin", "--host", "portable-agent-skills", "--scope", "project", "--project", project], { root, env, cwd: project, stdout: { write() {} } });
  assert.equal(await readFile(path.join(project, ".agents", "skills", "licensed-plugin-skill", "LICENSE"), "utf8"), "Independent skill license.\n");
});

test("tampered ownership entries outside exact host roots are rejected", async (t) => {
  const ctx = await fixture(t);
  const args = base("install", "codex", "project", ["--mode", "companion", "--project", ctx.project]);
  await run(args, ctx);
  const projectRecords = path.join(ctx.home, ".state", "oovz-plugins", "projects");
  const recordFile = path.join(projectRecords, (await readdir(projectRecords))[0], "ownership.json");
  const outside = path.join(ctx.project, "valuable.txt");
  await writeFile(outside, "valuable\n");
  const record = await readJson(recordFile);
  record.files[outside] = {
    plugin: PLUGIN,
    version: "0.6.0",
    host: "codex",
    scope: "project",
    mode: "companion",
    sha256: createHash("sha256").update("valuable\n").digest("hex")
  };
  await writeFile(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  await assert.rejects(run(base("uninstall", "codex", "project", ["--mode", "companion", "--project", ctx.project]), ctx), /outside trusted roots/);
  assert.equal(await readFile(outside, "utf8"), "valuable\n");
});
