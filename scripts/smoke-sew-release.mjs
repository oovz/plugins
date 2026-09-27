#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import crossSpawn from "cross-spawn";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { parse as parseToml } from "smol-toml";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const HOSTS = Object.freeze(["claude-code", "codex", "opencode", "cursor", "gemini-cli", "antigravity", "oh-my-pi"]);
const ROLES = Object.freeze(["researcher", "engineer", "verifier"]);
const REASONING_FIELD = Object.freeze({ "claude-code": "effort", codex: "model_reasoning_effort", opencode: "variant", "oh-my-pi": "thinking-level" });

function runResult(command, args, options = {}) {
  const result = crossSpawn.sync(command, args, { encoding: "utf8", stdio: "pipe", windowsHide: true, ...options });
  if (result.error) throw result.error;
  return result;
}

function run(command, args, options = {}) {
  const result = runResult(command, args, options);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status ?? result.signal}: ${String(result.stderr ?? result.stdout ?? "").trim()}`);
  }
  return String(result.stdout ?? "");
}

function invokeSew(binary, args, env) {
  return run(binary, args, { env });
}

function reasoningArgs(host) {
  const model = host === "opencode" ? "openai/example-model" : host === "antigravity" ? "flash" : "example-model";
  const reasoning = REASONING_FIELD[host] ? ["--reasoning", "high"] : [];
  return ["--model", model, ...reasoning];
}

function parseRole(host, content) {
  if (host === "codex") return parseToml(content);
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  assert.ok(match, `${host} role must contain parseable YAML frontmatter`);
  return YAML.parse(match[1]);
}

function roleFile(host, root, role) {
  return path.join(root, `senior-engineering-workflow-${role}.${host === "codex" ? "toml" : "md"}`);
}

function roleRoot(host, scope, project, env) {
  if (scope === "project") {
    const relative = {
      "claude-code": ".claude/agents", codex: ".codex/agents", opencode: ".opencode/agents",
      cursor: ".cursor/agents", "gemini-cli": ".gemini/agents", antigravity: ".agents/agents", "oh-my-pi": ".omp/agents",
    }[host];
    return path.join(project, relative);
  }
  const user = {
    "claude-code": env.CLAUDE_CONFIG_DIR || path.join(env.HOME, ".claude"),
    codex: env.CODEX_HOME,
    opencode: env.OPENCODE_CONFIG_DIR,
    cursor: path.join(env.HOME, ".cursor"),
    "gemini-cli": path.join(env.GEMINI_CLI_HOME, ".gemini"),
    antigravity: path.join(env.HOME, ".gemini", "config"),
    "oh-my-pi": path.join(env.HOME, ".omp", "agent"),
  }[host];
  return path.join(user, "agents");
}

async function readRoleSet(host, root) {
  const contents = new Map();
  for (const role of ROLES) {
    const file = roleFile(host, root, role);
    const content = await readFile(file, "utf8");
    const parsed = parseRole(host, content);
    if (host !== "opencode") assert.equal(parsed.name, `senior-engineering-workflow-${role}`, `${host}/${role} identity`);
    contents.set(role, content);
  }
  return contents;
}

async function smoke(artifactDirectory) {
  const tarballs = (await readdir(artifactDirectory)).filter((name) => /^oovz-sew-.+\.tgz$/u.test(name));
  if (tarballs.length !== 1) throw new Error(`Expected exactly one release tarball in ${artifactDirectory}, found ${tarballs.length}.`);
  const tarball = path.join(artifactDirectory, tarballs[0]);
  const version = tarballs[0].slice("oovz-sew-".length, -".tgz".length);
  const scratch = await mkdtemp(path.join(os.tmpdir(), "oovz-sew-platform-smoke-"));
  try {
    const prefix = path.join(scratch, "npm install ü with spaces");
    run("npm", ["install", "--prefix", prefix, "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", tarball], { env: { ...process.env, NPM_CONFIG_CACHE: path.join(scratch, "npm-cache") } });
    const npmBin = path.join(prefix, "node_modules", ".bin", process.platform === "win32" ? "sew.cmd" : "sew");
    assert.equal(invokeSew(npmBin, ["--version"], process.env).trim(), version);

    const home = path.join(scratch, "user home ü");
    const project = path.join(scratch, "project ü with spaces");
    const userOnlyProject = path.join(scratch, "user-only project ü");
    const configHome = path.join(scratch, "configuration home ü");
    const codexHome = path.join(scratch, "Codex home ü");
    const claudeConfig = path.join(scratch, "Claude config ü");
    const openCodeConfig = path.join(scratch, "OpenCode config ü");
    const geminiHome = path.join(scratch, "Gemini home ü");
    await mkdir(project, { recursive: true });
    await mkdir(userOnlyProject, { recursive: true });
    const defaultClaudeAgents = path.join(home, ".claude", "agents");
    const defaultClaudeSentinel = path.join(defaultClaudeAgents, "keep.md");
    await mkdir(defaultClaudeAgents, { recursive: true });
    await writeFile(defaultClaudeSentinel, "preserve default profile\n");
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: configHome,
      CODEX_HOME: codexHome,
      CLAUDE_CONFIG_DIR: claudeConfig,
      OPENCODE_CONFIG_DIR: openCodeConfig,
      GEMINI_CLI_HOME: geminiHome,
      PATH: "",
    };
    const cliEnv = { ...env, PATH: path.dirname(process.execPath) };
    const unrelatedSettings = path.join(geminiHome, ".gemini", "settings.json");
    await mkdir(path.dirname(unrelatedSettings), { recursive: true });
    await writeFile(unrelatedSettings, "{\"general\":{\"checkpointing\":{\"enabled\":true}}}\n");

    const userFiles = new Map();
    for (const host of HOSTS) {
      const userRoot = roleRoot(host, "user", project, cliEnv);
      invokeSew(npmBin, ["install", "--host", host, "--scope", "user"], cliEnv);
      const createdUserFiles = await readRoleSet(host, userRoot);
      for (const role of ROLES) assert.equal(typeof createdUserFiles.get(role), "string", `${host}/${role} user file`);

      const args = reasoningArgs(host);
      invokeSew(npmBin, ["models", "configure", "--host", host, "--scope", "user", "--role", "engineer", ...args], cliEnv);
      const userEngineer = parseRole(host, await readFile(roleFile(host, userRoot, "engineer"), "utf8"));
      const userModel = args[args.indexOf("--model") + 1];
      assert.equal(userEngineer.model, userModel, `${host} user model override`);
      if (REASONING_FIELD[host]) assert.equal(userEngineer[REASONING_FIELD[host]], "high", `${host} user reasoning override`);
      invokeSew(npmBin, ["install", "--host", host, "--scope", "user"], cliEnv);
      invokeSew(npmBin, ["models", "configure", "--host", host, "--scope", "user", "--role", "engineer", "--reset"], cliEnv);
      const resetUserEngineer = parseRole(host, await readFile(roleFile(host, userRoot, "engineer"), "utf8"));
      assert.equal(resetUserEngineer.model, ["gemini-cli", "antigravity"].includes(host) ? "inherit" : undefined, `${host} user reset`);
      if (REASONING_FIELD[host]) assert.equal(resetUserEngineer[REASONING_FIELD[host]], undefined, `${host} user reasoning reset`);
      userFiles.set(host, await readRoleSet(host, userRoot));
      const userReport = JSON.parse(invokeSew(npmBin, ["doctor", "--host", host, "--project", userOnlyProject, "--json"], cliEnv));
      assert.equal(userReport.status, "configuration-valid", `${host} user-only aggregate`);
      assert.equal(userReport.hosts[0].status, "configuration-valid", `${host} user-only scope`);
      assert.deepEqual(userReport.hosts[0].coverage, ROLES.map((role) => ({ role, scopes: ["user"] })), `${host} user role coverage`);
      assert.deepEqual(userReport.hosts[0].duplicates, [], `${host} no duplicate roles`);
      assert.ok(userReport.hosts[0].user.roles.every((role) => role.status === "valid" && role.name === `senior-engineering-workflow-${role.role}`), `${host} resolved user identities`);

      invokeSew(npmBin, ["install", "--host", host, "--scope", "project", "--project", project], cliEnv);
      const projectRoot = roleRoot(host, "project", project, cliEnv);
      const baselineProjectFiles = await readRoleSet(host, projectRoot);
      invokeSew(npmBin, ["install", "--host", host, "--scope", "project", "--project", project], cliEnv);
      const repeatedProjectFiles = await readRoleSet(host, projectRoot);
      assert.deepEqual(repeatedProjectFiles, baselineProjectFiles, `${host} project repeat install`);
      invokeSew(npmBin, ["models", "configure", "--host", host, "--scope", "project", "--project", project, "--role", "engineer", ...args], cliEnv);
      const projectEngineer = parseRole(host, await readFile(roleFile(host, projectRoot, "engineer"), "utf8"));
      assert.equal(projectEngineer.model, userModel, `${host} project model override`);
      if (REASONING_FIELD[host]) assert.equal(projectEngineer[REASONING_FIELD[host]], "high", `${host} project reasoning override`);
      invokeSew(npmBin, ["install", "--host", host, "--scope", "project", "--project", project], cliEnv);
      const preservedProjectEngineer = parseRole(host, await readFile(roleFile(host, projectRoot, "engineer"), "utf8"));
      assert.equal(preservedProjectEngineer.model, userModel, `${host} repeat install preserves model`);
      if (REASONING_FIELD[host]) assert.equal(preservedProjectEngineer[REASONING_FIELD[host]], "high", `${host} repeat install preserves reasoning`);
      invokeSew(npmBin, ["models", "configure", "--host", host, "--scope", "project", "--project", project, "--role", "engineer", "--reset"], cliEnv);
      const resetProjectEngineer = parseRole(host, await readFile(roleFile(host, projectRoot, "engineer"), "utf8"));
      assert.equal(resetProjectEngineer.model, ["gemini-cli", "antigravity"].includes(host) ? "inherit" : undefined, `${host} project reset`);
      if (REASONING_FIELD[host]) assert.equal(resetProjectEngineer[REASONING_FIELD[host]], undefined, `${host} project reasoning reset`);
      const report = JSON.parse(invokeSew(npmBin, ["doctor", "--host", host, "--project", project, "--json"], cliEnv));
      assert.equal(report.status, "configuration-valid", `${host} aggregate doctor result`);
      assert.equal(report.hosts[0].status, "configuration-valid", `${host} doctor result`);
      assert.deepEqual(report.hosts[0].coverage, ROLES.map((role) => ({ role, scopes: ["user", "project"] })), `${host} doctor scope coverage`);
      assert.deepEqual(report.hosts[0].duplicates, ROLES, `${host} duplicate roles`);
      assert.deepEqual(await readRoleSet(host, userRoot), userFiles.get(host), `${host} project install does not change user roles`);
    }

    const cursorRoot = roleRoot("cursor", "project", project, cliEnv);
    const cursorBaseline = await readRoleSet("cursor", cursorRoot);
    const cursorEngineerPath = roleFile("cursor", cursorRoot, "engineer");
    const cursorChanged = `${cursorBaseline.get("engineer")}\nreviewed customization\n`;
    await writeFile(cursorEngineerPath, cursorChanged);
    const refused = runResult(npmBin, ["install", "--host", "cursor", "--scope", "project", "--project", project], { env: cliEnv });
    assert.equal(refused.status, 1, String(refused.stderr ?? refused.stdout));
    assert.equal(await readFile(cursorEngineerPath, "utf8"), cursorChanged, "unforced install preserves the conflict");
    const cursorSettings = path.join(project, ".cursor", "settings.json");
    const cursorSidecar = path.join(cursorRoot, "local-agent.md");
    await writeFile(cursorSettings, "{\"preserve\":true}\n");
    await writeFile(cursorSidecar, "local agent\n");
    invokeSew(npmBin, ["install", "--host", "cursor", "--scope", "project", "--project", project, "--force"], cliEnv);
    const cursorRestored = await readRoleSet("cursor", cursorRoot);
    assert.deepEqual(cursorRestored, cursorBaseline, "force restores only the three packaged role files");
    assert.equal(await readFile(cursorSettings, "utf8"), "{\"preserve\":true}\n");
    assert.equal(await readFile(cursorSidecar, "utf8"), "local agent\n");

    assert.equal(await readFile(unrelatedSettings, "utf8"), "{\"general\":{\"checkpointing\":{\"enabled\":true}}}\n");
    assert.equal(await readFile(defaultClaudeSentinel, "utf8"), "preserve default profile\n");
    await assert.rejects(readFile(roleFile("claude-code", defaultClaudeAgents, "engineer")), /ENOENT/u);
    process.stdout.write(`smoked @oovz/sew ${version} on ${process.platform} with ${HOSTS.length} host configurations and npm command entry ${npmBin}\n`);
    return { version, hosts: HOSTS.length, platform: process.platform };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const artifactDirectory = process.argv[2];
  if (!artifactDirectory) {
    process.stderr.write("usage: node scripts/smoke-sew-release.mjs <release-artifact-directory>\n");
    process.exitCode = 2;
  } else {
    smoke(path.resolve(artifactDirectory)).catch((error) => {
      process.stderr.write(`release smoke failed: ${error.message}\n`);
      process.exitCode = 1;
    });
  }
}
