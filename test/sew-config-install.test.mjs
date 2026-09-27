import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { parse as parseToml } from "smol-toml";
import YAML from "yaml";
import { buildSewPackage } from "../scripts/build-sew-package.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RELEASE_BUILD_ROOT = path.join(ROOT, "release-build", "sew");
const PACKAGE_ROOT = path.join(RELEASE_BUILD_ROOT, "package");
const SEW_CLI = path.join(PACKAGE_ROOT, "bin", "sew.mjs");
const hostRoles = {
  "claude-code": true,
  codex: true,
  opencode: true,
  cursor: true,
  "gemini-cli": true,
  antigravity: true,
  "oh-my-pi": true,
};

async function temp(prefix) { return mkdtemp(path.join(os.tmpdir(), prefix)); }

function parseRole(host, content) {
  if (host === "codex") return parseToml(content);
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  assert.ok(match, `${host} role has parseable YAML frontmatter`);
  return YAML.parse(match[1]);
}

function runCli(args, { env = {}, cwd = ROOT } = {}) {
  return spawnSync(process.execPath, [SEW_CLI, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true,
  });
}

function rolePath(root, host, role) {
  return path.join(root, `senior-engineering-workflow-${role}.${host === "codex" ? "toml" : "md"}`);
}

async function tree(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push(path.relative(directory, absolute).split(path.sep).join("/"));
    }
  }
  await walk(directory);
  return files.sort();
}

test("published configuration payload contains only usable host agent definitions", async (t) => {
  const scratch = await mkdtemp(path.join(RELEASE_BUILD_ROOT, "config-payload-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const built = await buildSewPackage({ output: path.join(scratch, "package") });
  const payloadRoot = path.join(built.output, "payloads", "config");

  for (const host of Object.keys(hostRoles)) {
    const files = await tree(path.join(payloadRoot, host));
    assert.equal(files.length, 3, `${host} should package only three role definitions`);
    for (const file of files) assert.match(file, /^agents\/senior-engineering-workflow-(?:researcher|engineer|verifier)\.(?:md|toml)$/u);
  }

  const packageFiles = await tree(built.output);
  assert.ok(packageFiles.includes("payloads/manifest.json"));
  assert.ok(packageFiles.every((file) => !/(?:^|\/)(?:skills|\.claude-plugin|\.codex-plugin|\.mcp\.json)(?:\/|$)/u.test(file)), "configuration package must not ship plugin, skill, or MCP payloads");
  assert.ok(packageFiles.every((file) => !/marketplace/i.test(file)), "configuration package must not ship marketplace records");
});

test("Gemini CLI custom home is the parent of its .gemini directory", async () => {
  const { internals } = await import(`${pathToFileURL(path.join(PACKAGE_ROOT, "lib", "sew.mjs")).href}?gemini-home=${Date.now()}`);
  const customHome = path.join(os.tmpdir(), "workspace home ü");
  assert.equal(internals.roleAgentRoot("gemini-cli", "user", process.cwd(), { GEMINI_CLI_HOME: customHome }), path.join(customHome, ".gemini", "agents"));
});

test("Claude Code honors CLAUDE_CONFIG_DIR for user files and keeps project scope fixed", async () => {
  const { internals } = await import(`${pathToFileURL(path.join(PACKAGE_ROOT, "lib", "sew.mjs")).href}?claude-home=${Date.now()}`);
  const home = path.join(os.tmpdir(), "claude default ü");
  const custom = path.join(os.tmpdir(), "claude config ü", "custom");
  assert.equal(internals.roleAgentRoot("claude-code", "user", process.cwd(), { HOME: home, CLAUDE_CONFIG_DIR: custom }), path.join(custom, "agents"));
  assert.equal(internals.roleAgentRoot("claude-code", "user", process.cwd(), { HOME: home, CLAUDE_CONFIG_DIR: "" }), path.join(home, ".claude", "agents"));
  assert.equal(internals.roleAgentRoot("claude-code", "project", custom, { HOME: home, CLAUDE_CONFIG_DIR: custom }), path.join(custom, ".claude", "agents"));
});

test("every host installs configuration files without marketplace or host-command calls", async () => {
  const { internals, main } = await import(`${pathToFileURL(path.join(PACKAGE_ROOT, "lib", "sew.mjs")).href}?no-marketplace=${Date.now()}`);
  const project = await temp("sew-no-marketplace-");
  try {
    for (const host of Object.keys(hostRoles)) {
      const result = await main(["install", "--host", host, "--scope", "project", "--project", project]);
      assert.equal(result, 0, `${host} install should be configuration-only`);
    }
    for (const host of Object.keys(hostRoles)) {
      const root = internals.roleAgentRoot(host, "project", project);
      assert.ok(await readFile(path.join(root, `senior-engineering-workflow-researcher${host === "codex" ? ".toml" : ".md"}`), "utf8"), host);
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("repeat install is idempotent and force replaces only the three selected role files", async () => {
  const { main } = await import(`${pathToFileURL(path.join(PACKAGE_ROOT, "lib", "sew.mjs")).href}?overwrite=${Date.now()}`);
  const project = await temp("sew-explicit-overwrite-");
  const settingsPath = path.join(project, ".cursor", "settings.json");
  try {
    const first = await main(["install", "--host", "cursor", "--scope", "project", "--project", project]);
    assert.equal(first, 0);
    await writeFile(settingsPath, "{\"unrelated\":true}\n");
    const repeat = await main(["install", "--host", "cursor", "--scope", "project", "--project", project]);
    assert.equal(repeat, 0);

    const engineer = path.join(project, ".cursor", "agents", "senior-engineering-workflow-engineer.md");
    const model = await main(["models", "configure", "--host", "cursor", "--scope", "project", "--project", project, "--role", "engineer", "--model", "composer-2.5"]);
    assert.equal(model, 0);
    const repeatConfigured = await main(["install", "--host", "cursor", "--scope", "project", "--project", project]);
    assert.equal(repeatConfigured, 0, "repeat install should keep supported model overrides");
    assert.match(await readFile(engineer, "utf8"), /^model: composer-2\.5$/mu);

    await writeFile(engineer, `${await readFile(engineer, "utf8")}\nlocal customization\n`);
    const refused = await main(["install", "--host", "cursor", "--scope", "project", "--project", project]);
    assert.equal(refused, 1);
    assert.match(await readFile(engineer, "utf8"), /local customization/u);

    const replaced = await main(["install", "--host", "cursor", "--scope", "project", "--project", project, "--force"]);
    assert.equal(replaced, 0);
    assert.doesNotMatch(await readFile(engineer, "utf8"), /local customization/u);
    assert.equal(await readFile(settingsPath, "utf8"), "{\"unrelated\":true}\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("install dry-run reports the three roles without creating the host directory", async () => {
  const { main } = await import(`${pathToFileURL(path.join(PACKAGE_ROOT, "lib", "sew.mjs")).href}?dry-run=${Date.now()}`);
  const project = await temp("sew-install-dry-run-");
  const root = path.join(project, ".gemini", "agents");
  let output = "";
  const stdoutWrite = process.stdout.write;
  process.stdout.write = (chunk) => { output += String(chunk); return true; };
  try {
    const code = await main(["install", "--host", "gemini-cli", "--scope", "project", "--project", project, "--dry-run", "--json"]);
    assert.equal(code, 0);
    await assert.rejects(access(root), /ENOENT/u);
  } finally {
    process.stdout.write = stdoutWrite;
    await rm(project, { recursive: true, force: true });
  }
  const result = JSON.parse(output);
  assert.equal(result.status, "dry-run");
  assert.equal(result.actions.length, 3);
});

test("retired Worker configuration is rejected and installs preserve existing Worker files", async (t) => {
  const { internals } = await import(pathToFileURL(path.join(PACKAGE_ROOT, "lib", "sew.mjs")).href);
  const project = await temp("sew-retired-worker-");
  t.after(() => rm(project, { recursive: true, force: true }));
  const retainedRoles = ["researcher", "engineer", "verifier"];
  const retiredContent = "---\nname: senior-engineering-workflow-worker\n---\nUser-customized retired role.\n";
  for (const host of Object.keys(hostRoles)) {
    const root = internals.roleAgentRoot(host, "project", project);
    const retiredPath = rolePath(root, host, "worker");
    await mkdir(root, { recursive: true });
    await writeFile(retiredPath, retiredContent);
    for (const extra of [[], ["--force"]]) {
      const installed = runCli(["install", "--host", host, "--scope", "project", "--project", project, ...extra, "--json"]);
      assert.equal(installed.status, 0, `${host}: ${installed.stderr || installed.stdout}`);
      assert.deepEqual(JSON.parse(installed.stdout).actions.map((item) => item.role), retainedRoles);
      assert.equal(await readFile(retiredPath, "utf8"), retiredContent, `${host} preserves retired file`);
    }
    for (const override of [["--model", "example-model"], ["--reset"]]) {
      const configured = runCli(["models", "configure", "--host", host, "--scope", "project", "--project", project, "--role", "worker", ...override, "--json"]);
      assert.equal(configured.status, 2, `${host}: ${configured.stdout}`);
      assert.match(JSON.parse(configured.stdout).error, /--role must be one of: researcher, engineer, verifier/u);
      assert.equal(await readFile(retiredPath, "utf8"), retiredContent, `${host} refuses retired role writes`);
    }
  }
});

test("role model and native reasoning overrides validate and write without discovery", async () => {
  const { internals, main } = await import(`${pathToFileURL(path.join(PACKAGE_ROOT, "lib", "sew.mjs")).href}?static-model=${Date.now()}`);
  const project = await temp("sew-static-model-");
  try {
    for (const host of Object.keys(hostRoles)) {
      const install = await main(["install", "--host", host, "--scope", "project", "--project", project]);
      assert.equal(install, 0, `${host} install`);
      const model = host === "opencode" ? "example/provider-model" : host === "antigravity" ? "flash" : "example-model";
      const reasoning = ["claude-code", "codex", "opencode", "oh-my-pi"].includes(host) ? "high" : null;
      const configured = await main(["models", "configure", "--host", host, "--scope", "project", "--project", project, "--role", "engineer", "--model", model, ...(reasoning ? ["--reasoning", reasoning] : [])]);
      assert.equal(configured, 0, `${host} model configuration`);
      const file = path.join(internals.roleAgentRoot(host, "project", project), internals.roleFileName(host, "engineer"));
      const configuredValue = parseRole(host, await readFile(file, "utf8"));
      assert.equal(configuredValue.model, model, `${host} parsed model override`);
      const reasoningField = { "claude-code": "effort", codex: "model_reasoning_effort", opencode: "variant", "oh-my-pi": "thinking-level" }[host];
      if (reasoningField) assert.equal(configuredValue[reasoningField], "high", `${host} parsed reasoning override`);
      if (host === "claude-code") {
        const invalidEffort = await main(["models", "configure", "--host", host, "--scope", "project", "--project", project, "--role", "engineer", "--model", model, "--reasoning", "ultra"]);
        assert.equal(invalidEffort, 2);
        assert.equal(parseRole(host, await readFile(file, "utf8"))["effort"], "high", "invalid Claude effort must not change the file");
      }
      const repeatInstall = await main(["install", "--host", host, "--scope", "project", "--project", project]);
      assert.equal(repeatInstall, 0, `${host} repeat install retains valid overrides`);
      const repeatedValue = parseRole(host, await readFile(file, "utf8"));
      if (reasoningField) assert.equal(repeatedValue[reasoningField], "high");
      const reset = await main(["models", "configure", "--host", host, "--scope", "project", "--project", project, "--role", "engineer", "--reset"]);
      assert.equal(reset, 0, `${host} model reset`);
      const restored = parseRole(host, await readFile(file, "utf8"));
      assert.equal(restored.model, ["gemini-cli", "antigravity"].includes(host) ? "inherit" : undefined, `${host} restores model inheritance`);
      if (reasoningField) assert.equal(restored[reasoningField], undefined, `${host} removes native reasoning override`);
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("doctor is read-only and inventories duplicate user/project roles", async () => {
  const { main } = await import(`${pathToFileURL(path.join(PACKAGE_ROOT, "lib", "sew.mjs")).href}?doctor=${Date.now()}`);
  const project = await temp("sew-doctor-roots-");
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = path.join(project, "user home ü", "codex");
  try {
    for (const scopeArgs of [["--scope", "user"], ["--scope", "project", "--project", project]]) {
      assert.equal(await main(["install", "--host", "codex", ...scopeArgs]), 0);
    }
    const projectEngineer = path.join(project, ".codex", "agents", "senior-engineering-workflow-engineer.toml");
    const projectBefore = await readFile(projectEngineer, "utf8");
    await writeFile(projectEngineer, `${projectBefore}\nsandbox_mode = "read-only"\n`);
    for (const [scopeArgs, model] of [
      [["--scope", "user"], "user-model"],
      [["--scope", "project", "--project", project], "project-model"],
    ]) {
      assert.equal(await main(["models", "configure", "--host", "codex", ...scopeArgs, "--role", "engineer", "--model", model]), 0);
    }
    let output = "";
    const stdoutWrite = process.stdout.write;
    process.stdout.write = (chunk) => { output += String(chunk); return true; };
    let status;
    try { status = await main(["doctor", "--host", "codex", "--project", project, "--json"]); }
    finally { process.stdout.write = stdoutWrite; }
    assert.equal(status, 0);
    const report = JSON.parse(output);
    assert.equal(report.status, "configuration-valid");
    assert.equal(report.hosts[0].status, "configuration-valid");
    assert.deepEqual(report.hosts[0].duplicates, ["researcher", "engineer", "verifier"]);
    assert.deepEqual(report.hosts[0].coverage.find((item) => item.role === "engineer"), { role: "engineer", scopes: ["user", "project"] });
    assert.equal(report.hosts[0].project.roles.find((item) => item.role === "engineer").model, "project-model");
    assert.equal(report.hosts[0].user.roles.find((item) => item.role === "engineer").model, "user-model");
    assert.equal(parseToml(await readFile(projectEngineer, "utf8")).sandbox_mode, "read-only");
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    await rm(project, { recursive: true, force: true });
  }
});

test("a non-directory host ancestor refuses install with native path diagnostics and no writes", async (t) => {
  const project = await temp("sew-write-error-");
  t.after(() => rm(project, { recursive: true, force: true }));
  const cursorRoot = path.join(project, ".cursor");
  const adjacent = path.join(project, "adjacent-settings.json");
  await writeFile(cursorRoot, "not a directory");
  await writeFile(adjacent, "preserve\n");
  const result = runCli(["install", "--host", "cursor", "--scope", "project", "--project", project]);
  assert.ok([1, 2].includes(result.status), `preflight refusal exit status: ${result.status}`);
  assert.ok(result.stderr.includes(cursorRoot), `diagnostic should use the native path ${cursorRoot}: ${result.stderr}`);
  assert.match(result.stderr, /\bENOTDIR\b/u, "diagnostic should retain the filesystem error code");
  assert.equal(await readFile(adjacent, "utf8"), "preserve\n");
  await assert.rejects(access(path.join(cursorRoot, "agents")), (error) => ["ENOENT", "ENOTDIR"].includes(error.code));
  assert.equal(await readFile(cursorRoot, "utf8"), "not a directory");
});

test("doctor process reports invalid YAML, TOML, and nonregular role targets with failure status", async (t) => {
  const root = await temp("sew-doctor-invalid-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, "user home ü");
  const project = path.join(root, "project");
  await mkdir(project, { recursive: true });
  const env = { HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, "codex") };
  const cursorRoot = path.join(home, ".cursor", "agents");
  const codexRoot = path.join(env.CODEX_HOME, "agents");
  const claudeRoot = path.join(home, ".claude", "agents");
  await mkdir(cursorRoot, { recursive: true });
  await mkdir(codexRoot, { recursive: true });
  await mkdir(claudeRoot, { recursive: true });
  const cursorFile = rolePath(cursorRoot, "cursor", "researcher");
  const codexFile = rolePath(codexRoot, "codex", "researcher");
  const claudeFile = rolePath(claudeRoot, "claude-code", "researcher");
  const cursorBytes = "---\nname: [unterminated\n---\nbody\n";
  const codexBytes = "name = \"senior-engineering-workflow-researcher\"\ndescription = [\n";
  await writeFile(cursorFile, cursorBytes);
  await writeFile(codexFile, codexBytes);
  await mkdir(claudeFile);
  const result = runCli(["doctor", "--host", "cursor,codex,claude-code", "--project", project, "--json"], { env });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "invalid");
  assert.deepEqual(report.hosts.map((host) => host.status), ["invalid", "invalid", "invalid"]);
  assert.equal(await readFile(cursorFile, "utf8"), cursorBytes);
  assert.equal(await readFile(codexFile, "utf8"), codexBytes);
  assert.equal((await lstat(claudeFile)).isDirectory(), true);
});

test("doctor validates its project and distinguishes invalid, incomplete, and valid configurations", async (t) => {
  const root = await temp("sew-doctor-status-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await mkdir(project, { recursive: true });
  const env = { HOME: home, USERPROFILE: home };
  const missingProject = path.join(root, "missing project");
  const nonexistent = runCli(["doctor", "--host", "cursor", "--project", missingProject, "--json"], { env });
  assert.equal(nonexistent.status, 2);
  assert.equal(nonexistent.stderr, "");
  assert.match(JSON.parse(nonexistent.stdout).error, /Project directory does not exist/u);

  const incomplete = runCli(["doctor", "--host", "cursor", "--project", project, "--json"], { env });
  assert.equal(incomplete.status, 0);
  assert.equal(JSON.parse(incomplete.stdout).status, "incomplete");
  assert.equal(JSON.parse(incomplete.stdout).hosts[0].status, "incomplete");

  const installed = runCli(["install", "--host", "cursor", "--scope", "project", "--project", project], { env });
  assert.equal(installed.status, 0, installed.stderr);
  const engineer = path.join(project, ".cursor", "agents", "senior-engineering-workflow-engineer.md");
  const original = await readFile(engineer);
  const valid = runCli(["doctor", "--host", "cursor", "--project", project, "--json"], { env });
  assert.equal(valid.status, 0);
  assert.equal(JSON.parse(valid.stdout).status, "configuration-valid");

  await writeFile(engineer, "---\nname: wrong-agent\ndescription: valid description\n---\nvalid prompt\n");
  const invalid = runCli(["doctor", "--host", "cursor", "--project", project, "--json"], { env });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).hosts[0].status, "invalid");
  assert.notDeepEqual(await readFile(engineer), original);
});

test("doctor validates declared role identity and nonempty Codex required fields", async (t) => {
  const root = await temp("sew-doctor-identity-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  await mkdir(project, { recursive: true });
  const env = { HOME: path.join(root, "home"), USERPROFILE: path.join(root, "home"), CODEX_HOME: path.join(root, "codex") };
  for (const host of Object.keys(hostRoles)) {
    const installed = runCli(["install", "--host", host, "--scope", "project", "--project", project], { env });
    assert.equal(installed.status, 0, `${host}: ${installed.stderr}`);
  }
  for (const host of ["claude-code", "codex", "cursor", "gemini-cli", "antigravity", "oh-my-pi"]) {
    const filename = rolePath(path.join(project, {
      "claude-code": ".claude/agents", codex: ".codex/agents", cursor: ".cursor/agents",
      "gemini-cli": ".gemini/agents", antigravity: ".agents/agents", "oh-my-pi": ".omp/agents",
    }[host]), host, "researcher");
    const content = await readFile(filename, "utf8");
    if (host === "codex") {
      await writeFile(filename, content.replace('name = "senior-engineering-workflow-researcher"', 'name = ""'));
    } else {
      await writeFile(filename, content.replace("name: senior-engineering-workflow-researcher", "name: senior-engineering-workflow-engineer"));
    }
    const result = runCli(["doctor", "--host", host, "--project", project, "--json"], { env });
    assert.equal(result.status, 1, `${host}: ${result.stdout}`);
    assert.equal(JSON.parse(result.stdout).hosts[0].status, "invalid", host);
  }
  const researcher = rolePath(path.join(project, ".codex", "agents"), "codex", "researcher");
  const codex = parseToml(await readFile(researcher, "utf8"));
  codex.name = "senior-engineering-workflow-researcher";
  codex.description = "   ";
  await writeFile(researcher, `name = "${codex.name}"\ndescription = "${codex.description}"\ndeveloper_instructions = ${JSON.stringify(codex.developer_instructions)}\n`);
  const emptyRequired = runCli(["doctor", "--host", "codex", "--project", project, "--json"], { env });
  assert.equal(emptyRequired.status, 1);
  assert.equal(JSON.parse(emptyRequired.stdout).hosts[0].status, "invalid");
  await writeFile(researcher, `name = "${codex.name}"\ndescription = "valid description"\ndeveloper_instructions = ${JSON.stringify(codex.developer_instructions)}\nmodel = " model-with-spaces "\n`);
  const invalidStoredModel = runCli(["doctor", "--host", "codex", "--project", project, "--json"], { env });
  assert.equal(invalidStoredModel.status, 1);
  assert.equal(JSON.parse(invalidStoredModel.stdout).hosts[0].status, "invalid");
});

test("invalid Antigravity model tiers fail before writing and doctor rejects stored invalid tiers", async (t) => {
  const root = await temp("sew-antigravity-model-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  await mkdir(project, { recursive: true });
  const env = { HOME: path.join(root, "home"), USERPROFILE: path.join(root, "home") };
  const install = runCli(["install", "--host", "antigravity", "--scope", "project", "--project", project], { env });
  assert.equal(install.status, 0, install.stderr);
  const engineer = path.join(project, ".agents", "agents", "senior-engineering-workflow-engineer.md");
  for (const model of ["inherit", "flash", "pro"]) {
    const configured = runCli(["models", "configure", "--host", "antigravity", "--scope", "project", "--project", project, "--role", "engineer", "--model", model], { env });
    assert.equal(configured.status, 0, configured.stderr);
    assert.equal(parseRole("antigravity", await readFile(engineer, "utf8")).model, model);
  }
  const original = await readFile(engineer);
  const refused = runCli(["models", "configure", "--host", "antigravity", "--scope", "project", "--project", project, "--role", "engineer", "--model", "example-model"], { env });
  assert.equal(refused.status, 2);
  assert.deepEqual(await readFile(engineer), original);
  const changed = (await readFile(engineer, "utf8")).replace(/^model: (?:inherit|flash|pro)$/mu, "model: example-model");
  await writeFile(engineer, changed);
  const doctor = runCli(["doctor", "--host", "antigravity", "--project", project, "--json"], { env });
  assert.equal(doctor.status, 1);
  assert.equal(JSON.parse(doctor.stdout).hosts[0].status, "invalid");
});

async function diagnosticFixture(t, host) {
  const root = await temp("sew-diagnostics-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  await mkdir(project);
  const env = { HOME: path.join(root, "home"), USERPROFILE: path.join(root, "home"), OPENCODE_CONFIG_DIR: path.join(root, "opencode") };
  const installed = runCli(["install", "--host", host, "--scope", "project", "--project", project, "--json"], { env });
  assert.equal(installed.status, 0, installed.stderr);
  const engineer = JSON.parse(installed.stdout).actions.find((item) => item.role === "engineer").path;
  const configure = ["models", "configure", "--host", host, "--scope", "project", "--project", project, "--role", "engineer"];
  const doctor = ["doctor", "--host", host, "--project", project];
  return { project, env, engineer, configure, doctor };
}

test("Oh My Pi rejects invalid CLI thinking selectors without writes", async (t) => {
  const { env, engineer, configure } = await diagnosticFixture(t, "oh-my-pi");
  const before = await readFile(engineer);
  for (const reasoning of ["totally-invalid", "m", "h", "au", "HIGH"]) {
    const result = runCli([...configure, "--model", "example-model", "--reasoning", reasoning], { env });
    assert.equal(result.status, 2, `${reasoning}: ${result.stdout}`);
    assert.match(result.stderr, /thinking/u);
    assert.deepEqual(await readFile(engineer), before);
  }
});

test("Oh My Pi doctor rejects invalid stored thinking selectors", async (t) => {
  const { env, engineer, doctor } = await diagnosticFixture(t, "oh-my-pi");
  const source = await readFile(engineer, "utf8");
  for (const reasoning of ["totally-invalid", "m", "au", "HIGH"]) {
    await writeFile(engineer, source.replace("---\n", `---\nthinking-level: ${reasoning}\n`));
    const result = runCli([...doctor, "--json"], { env });
    assert.equal(result.status, 1, reasoning);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "invalid");
    assert.match(report.hosts[0].project.roles.find((item) => item.role === "engineer").error, /thinking/u);
  }
});

test("Oh My Pi preserves accepted selector spelling through model updates and reinstall", async (t) => {
  const { env, engineer, configure, project, doctor } = await diagnosticFixture(t, "oh-my-pi");
  for (const reasoning of ["inherit", "off", "minimal", "low", "medium", "high", "xhigh", "max", "auto", "in", "of", "mi", "lo", "me", "hi", "xh", "ma"]) {
    const configured = runCli([...configure, "--model", "example-model", "--reasoning", reasoning], { env });
    assert.equal(configured.status, 0, `${reasoning}: ${configured.stderr}`);
    assert.equal(parseRole("oh-my-pi", await readFile(engineer, "utf8"))["thinking-level"], reasoning);
    assert.equal(runCli([...doctor, "--json"], { env }).status, 0);
  }
  assert.equal(runCli([...configure, "--model", "new-model"], { env }).status, 0);
  assert.equal(runCli(["install", "--host", "oh-my-pi", "--scope", "project", "--project", project], { env }).status, 0);
  const retained = parseRole("oh-my-pi", await readFile(engineer, "utf8"));
  assert.equal(retained.model, "new-model");
  assert.equal(retained["thinking-level"], "ma");
  assert.equal(runCli([...configure, "--reset"], { env }).status, 0);
  const reset = parseRole("oh-my-pi", await readFile(engineer, "utf8"));
  assert.equal(reset.model, undefined);
  assert.equal(reset["thinking-level"], undefined);
});

test("OpenCode derives absent identity for configuration and doctor output", async (t) => {
  const { env, engineer, configure, doctor } = await diagnosticFixture(t, "opencode");
  const configured = runCli([...configure, "--model", "provider/model", "--json"], { env });
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(JSON.parse(configured.stdout).current.name, "senior-engineering-workflow-engineer");
  const report = JSON.parse(runCli([...doctor, "--json"], { env }).stdout);
  assert.equal(report.hosts[0].project.roles.find((item) => item.role === "engineer").name, "senior-engineering-workflow-engineer");
});

test("OpenCode rejects explicit mismatched or empty identities before configuration writes", async (t) => {
  const { env, engineer, configure, doctor } = await diagnosticFixture(t, "opencode");
  const source = await readFile(engineer, "utf8");
  for (const name of ["completely-different-agent", '""', "null", "42"]) {
    const changed = source.replace("---\n", `---\nname: ${name}\n`);
    await writeFile(engineer, changed);
    const invalid = runCli([...configure, "--model", "provider/model"], { env });
    assert.equal(invalid.status, 2, name);
    assert.equal(await readFile(engineer, "utf8"), changed);
    assert.equal(runCli([...doctor, "--json"], { env }).status, 1, name);
  }
  await writeFile(engineer, source.replace("---\n", "---\nname: senior-engineering-workflow-engineer\n"));
  assert.equal(runCli([...configure, "--model", "provider/model"], { env }).status, 0);
});

test("doctor reports coverage and duplicates without native precedence claims", async (t) => {
  const { project, env, engineer, doctor } = await diagnosticFixture(t, "opencode");
  const installed = runCli(["install", "--host", "opencode", "--scope", "user", "--json"], { env });
  assert.equal(installed.status, 0, installed.stderr);
  const userEngineer = JSON.parse(installed.stdout).actions.find((item) => item.role === "engineer").path;
  for (const [scope, model, reasoning] of [["user", "provider/user-model", "customUser"], ["project", "provider/project-model", "customProject"]]) {
    const result = runCli(["models", "configure", "--host", "opencode", "--scope", scope,
      ...(scope === "project" ? ["--project", project] : []), "--role", "engineer", "--model", model, "--reasoning", reasoning], { env });
    assert.equal(result.status, 0, result.stderr);
  }
  const valid = JSON.parse(runCli([...doctor, "--json"], { env }).stdout).hosts[0];
  assert.equal(valid.user.roles.find((item) => item.role === "engineer").model, "provider/user-model");
  assert.equal(valid.user.roles.find((item) => item.role === "engineer").reasoning, "customUser");
  assert.equal(valid.project.roles.find((item) => item.role === "engineer").model, "provider/project-model");
  assert.equal(valid.project.roles.find((item) => item.role === "engineer").reasoning, "customProject");
  assert.deepEqual(valid.coverage, [
    { role: "researcher", scopes: ["user", "project"] }, { role: "engineer", scopes: ["user", "project"] },
    { role: "verifier", scopes: ["user", "project"] },
  ]);
  assert.deepEqual(valid.duplicates, ["researcher", "engineer", "verifier"]);
  assert.equal(Object.hasOwn(valid, "effective"), false);
  assert.equal(JSON.stringify(valid).includes('"source"'), false);
  await writeFile(engineer, "---\nbroken: [\n---\nprompt\n");
  const invalidResult = runCli([...doctor, "--json"], { env });
  const invalid = JSON.parse(invalidResult.stdout);
  assert.equal(invalidResult.status, 1);
  assert.equal(invalid.status, "invalid");
  assert.deepEqual(invalid.hosts[0].coverage.find((item) => item.role === "engineer"), { role: "engineer", scopes: ["user"] });
  assert.equal(invalid.hosts[0].duplicates.includes("engineer"), false);
  await rm(engineer);
  await rm(userEngineer);
  const incomplete = JSON.parse(runCli([...doctor, "--json"], { env }).stdout);
  assert.equal(incomplete.status, "incomplete");
  assert.deepEqual(incomplete.hosts[0].coverage.find((item) => item.role === "engineer"), { role: "engineer", scopes: [] });
  assert.equal(incomplete.projectRoot, project);
});

test("doctor text exposes both inventories with scope path identity and invalid cause", async (t) => {
  const { env, engineer, doctor } = await diagnosticFixture(t, "opencode");
  const installed = runCli(["install", "--host", "opencode", "--scope", "user", "--json"], { env });
  assert.equal(installed.status, 0, installed.stderr);
  const userEngineer = JSON.parse(installed.stdout).actions.find((item) => item.role === "engineer").path;
  await writeFile(engineer, "---\nbroken: [\n---\nprompt\n");
  const result = runCli(doctor, { env });
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(userEngineer));
  assert.ok(result.stdout.includes(engineer));
  assert.match(result.stdout, /user\/engineer: valid/u);
  assert.match(result.stdout, /project\/engineer: invalid/u);
  assert.match(result.stdout, /senior-engineering-workflow-engineer/u);
  assert.match(result.stdout, /invalid YAML/u);
});

test("JSON mode survives argument parsing errors", () => {
  for (const args of [
    ["doctor", "--host", "opencode", "--typo", "--json"],
    ["doctor", "--json", "--host"],
    ["unknown", "--json"],
    ["models", "--json"],
    ["doctor", "--host", "opencode", "--host", "codex", "--json"],
    ["models", "configure", "--host", "oh-my-pi", "--role", "engineer", "--model", "model", "--reasoning", "invalid", "--json"],
  ]) {
    const result = runCli(args);
    assert.equal(result.status, 2, args.join(" "));
    assert.equal(result.stderr, "", args.join(" "));
    assert.equal(typeof JSON.parse(result.stdout).error, "string");
  }
});
