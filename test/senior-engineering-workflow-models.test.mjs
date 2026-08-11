import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  internals,
  main,
} from "../packages/sew-models/lib/sew-models.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ROLES = ["researcher", "engineer", "verifier", "worker"];

async function captureRun(argv, { env = {}, cwd } = {}) {
  let stdout = "";
  let stderr = "";
  const originalOut = process.stdout.write;
  const originalErr = process.stderr.write;
  const originalCwd = process.cwd();
  const previousEnv = new Map();
  for (const [key, value] of Object.entries(env)) {
    previousEnv.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  process.stdout.write = ((chunk) => {
    stdout += String(chunk);
    return true;
  });
  process.stderr.write = ((chunk) => {
    stderr += String(chunk);
    return true;
  });
  try {
    if (cwd) process.chdir(cwd);
    const code = await main(argv);
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
    if (cwd) process.chdir(originalCwd);
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function tempRoot(prefix = "sew-models-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function projectAgentRoot(host, project) {
  if (host === "claude-code") return path.join(project, ".claude", "agents");
  if (host === "codex") return path.join(project, ".codex", "agents");
  return path.join(project, ".opencode", "agents");
}

function extension(host) {
  return host === "codex" ? ".toml" : ".md";
}

async function snapshotTree(root) {
  const result = new Map();
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) result.set(relative, await readFile(absolute, "utf8"));
      else result.set(relative, `<${entry.isSymbolicLink() ? "symlink" : "other"}>`);
    }
  }
  await walk(root);
  return result;
}

function assertNoRuntimePolicyFields(host, content) {
  if (host === "codex") {
    assert.doesNotMatch(content, /^sandbox_mode\s*=/mu);
    assert.doesNotMatch(content, /^approval_policy\s*=/mu);
    assert.doesNotMatch(content, /^mcp_servers\s*=/mu);
    return;
  }
  const frontmatter = internals.parseFrontmatterScalars(content);
  for (const field of [
    "tools",
    "disallowedTools",
    "permission",
    "permissions",
    "permissionMode",
    "hooks",
    "mcpServers",
    "steps",
    "maxTurns",
  ]) {
    assert.equal(frontmatter[field], undefined, `${host} alias must not set ${field}`);
  }
}

test("preset aliases and role maps are normalized", () => {
  assert.equal(internals.normalizePreset("cost"), "two-model");
  assert.equal(internals.normalizePreset("balanced"), "three-model");
  assert.deepEqual(internals.PRESETS["two-model"], {
    researcher: "worker",
    engineer: "worker",
    verifier: "inherit",
    worker: "worker",
  });
  assert.deepEqual(
    internals.parseRoleMap(
      "researcher=inherit,engineer=worker,verifier=balanced,worker=worker",
      internals.PRESETS["two-model"],
    ),
    {
      researcher: "inherit",
      engineer: "worker",
      verifier: "balanced",
      worker: "worker",
    },
  );
});

test("default user and project roots follow host conventions", () => {
  const posixHome = path.resolve("/home/tester");
  assert.equal(
    internals.resolveTargetRoot({
      host: "claude-code",
      scope: "user",
      env: { HOME: posixHome },
      platform: "linux",
      home: posixHome,
    }),
    path.join(posixHome, ".claude"),
  );
  assert.equal(
    internals.resolveTargetRoot({
      host: "codex",
      scope: "user",
      env: { HOME: posixHome, CODEX_HOME: "/custom/codex" },
      platform: "linux",
      home: posixHome,
    }),
    path.resolve("/custom/codex"),
  );
  assert.equal(
    internals.resolveTargetRoot({
      host: "opencode",
      scope: "user",
      env: { HOME: posixHome, XDG_CONFIG_HOME: "/custom/config" },
      platform: "linux",
      home: posixHome,
    }),
    path.resolve("/custom/config/opencode"),
  );
  assert.equal(
    internals.resolveTargetRoot({
      host: "opencode",
      scope: "user",
      env: { HOME: posixHome, OPENCODE_CONFIG_DIR: "/custom/opencode" },
      platform: "linux",
      home: posixHome,
    }),
    path.resolve("/custom/opencode"),
  );

  const project = path.resolve("/work/repo");
  assert.equal(
    internals.resolveTargetRoot({ host: "claude-code", scope: "project", projectRoot: project }),
    path.join(project, ".claude"),
  );
  assert.equal(
    internals.resolveTargetRoot({ host: "codex", scope: "project", projectRoot: project }),
    path.join(project, ".codex"),
  );
  assert.equal(
    internals.resolveTargetRoot({ host: "opencode", scope: "project", projectRoot: project }),
    path.join(project, ".opencode"),
  );

  assert.equal(
    internals.homeDirectory(
      { USERPROFILE: "K:\\Users\\Tester", HOME: "/home/tester" },
      "win32",
      "C:\\fallback",
    ),
    path.resolve("K:\\Users\\Tester"),
  );
});

test("host renderers add only model and thinking fields", async () => {
  const options = {
    "worker-model": "worker-model",
    "worker-thinking": "max",
    "balanced-model": "balanced-model",
    "balanced-thinking": "high",
  };

  const claude = await internals.renderAlias("claude-code", "engineer", "worker", options);
  const claudeFrontmatter = internals.parseFrontmatterScalars(claude);
  assert.equal(claudeFrontmatter.name, "sew-engineer");
  assert.equal(claudeFrontmatter.model, "worker-model");
  assert.equal(claudeFrontmatter.effort, "max");
  assertNoRuntimePolicyFields("claude-code", claude);

  const claudeInherited = await internals.renderAlias("claude-code", "verifier", "inherit", options);
  const inheritedClaudeFrontmatter = internals.parseFrontmatterScalars(claudeInherited);
  assert.equal(inheritedClaudeFrontmatter.model, "inherit");
  assert.equal(inheritedClaudeFrontmatter.effort, undefined);
  assertNoRuntimePolicyFields("claude-code", claudeInherited);

  const codex = await internals.renderAlias("codex", "engineer", "worker", options);
  const codexRoot = internals.parseTomlScalars(codex).get("");
  assert.equal(codexRoot.name, "sew-engineer");
  assert.equal(codexRoot.model, "worker-model");
  assert.equal(codexRoot.model_reasoning_effort, "max");
  assertNoRuntimePolicyFields("codex", codex);

  const codexInherited = await internals.renderAlias("codex", "verifier", "inherit", options);
  const inheritedCodexRoot = internals.parseTomlScalars(codexInherited).get("");
  assert.equal(inheritedCodexRoot.model, undefined);
  assert.equal(inheritedCodexRoot.model_reasoning_effort, undefined);
  assertNoRuntimePolicyFields("codex", codexInherited);

  const openCodeOptions = {
    ...options,
    "worker-model": "openai/worker-model",
    "balanced-model": "openai/balanced-model",
  };
  const opencode = await internals.renderAlias("opencode", "worker", "worker", openCodeOptions);
  const openCodeFrontmatter = internals.parseFrontmatterScalars(opencode);
  assert.equal(openCodeFrontmatter.model, "openai/worker-model");
  assert.equal(openCodeFrontmatter.variant, "max");
  assertNoRuntimePolicyFields("opencode", opencode);

  const opencodeInherited = await internals.renderAlias("opencode", "verifier", "inherit", openCodeOptions);
  const inheritedOpenCodeFrontmatter = internals.parseFrontmatterScalars(opencodeInherited);
  assert.equal(inheritedOpenCodeFrontmatter.model, undefined);
  assert.equal(inheritedOpenCodeFrontmatter.variant, undefined);
  assertNoRuntimePolicyFields("opencode", opencodeInherited);
});

test("configure writes four model-only aliases for every supported host", async () => {
  for (const host of ["claude-code", "codex", "opencode"]) {
    const project = await tempRoot(`sew-models-${host}-`);
    const model = host === "opencode" ? "openai/worker-model" : "worker-model";
    const configured = await captureRun([
      "configure",
      "--host",
      host,
      "--scope",
      "project",
      "--project",
      project,
      "--preset",
      "two-model",
      "--worker-model",
      model,
      "--worker-thinking",
      "max",
      "--json",
    ]);
    assert.equal(configured.code, 0, configured.stderr);
    const result = JSON.parse(configured.stdout);
    assert.equal(result.files.length, 4);

    for (const role of ROLES) {
      const file = path.join(projectAgentRoot(host, project), `sew-${role}${extension(host)}`);
      const content = await readFile(file, "utf8");
      assert.match(content, new RegExp(internals.MARKER.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
      assertNoRuntimePolicyFields(host, content);
    }
  }
});

test("configure --preset inherit removes marked aliases and preserves unmanaged files", async () => {
  const project = await tempRoot();
  const configured = await captureRun([
    "configure",
    "--host",
    "codex",
    "--scope",
    "project",
    "--project",
    project,
    "--preset",
    "two-model",
    "--worker-model",
    "worker-model",
  ]);
  assert.equal(configured.code, 0, configured.stderr);

  const agents = projectAgentRoot("codex", project);
  const unmanaged = path.join(agents, "sew-worker.toml");
  await writeFile(unmanaged, "name = \"sew-worker\"\n# intentionally unmanaged\n");

  const restored = await captureRun([
    "configure",
    "--host",
    "codex",
    "--scope",
    "project",
    "--project",
    project,
    "--preset",
    "inherit",
    "--json",
  ]);
  assert.equal(restored.code, 0, restored.stderr);
  const result = JSON.parse(restored.stdout);
  assert.equal(result.files.filter((item) => item.action === "remove").length, 3);
  assert.equal(result.files.filter((item) => item.action === "preserve-unmanaged").length, 1);
  assert.match(await readFile(unmanaged, "utf8"), /intentionally unmanaged/u);
  for (const role of ["researcher", "engineer", "verifier"]) {
    await assert.rejects(readFile(path.join(agents, `sew-${role}.toml`), "utf8"), { code: "ENOENT" });
  }
});

test("configure refuses unmanaged aliases unless explicitly forced", async () => {
  const project = await tempRoot();
  const agents = projectAgentRoot("claude-code", project);
  await mkdir(agents, { recursive: true });
  const file = path.join(agents, "sew-worker.md");
  await writeFile(file, "---\nname: sew-worker\n---\n\nunmanaged\n");

  const refused = await captureRun([
    "configure",
    "--host",
    "claude-code",
    "--scope",
    "project",
    "--project",
    project,
    "--preset",
    "two-model",
    "--worker-model",
    "haiku",
  ]);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /Refusing to replace unmanaged alias file/u);
  assert.match(await readFile(file, "utf8"), /unmanaged/u);

  const forced = await captureRun([
    "configure",
    "--host",
    "claude-code",
    "--scope",
    "project",
    "--project",
    project,
    "--preset",
    "two-model",
    "--worker-model",
    "haiku",
    "--force",
  ]);
  assert.equal(forced.code, 0, forced.stderr);
  assert.match(await readFile(file, "utf8"), new RegExp(internals.MARKER.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
});

test("dry-run reports the plan without mutating configuration", async () => {
  const project = await tempRoot();
  const before = await snapshotTree(project);
  const result = await captureRun([
    "configure",
    "--host",
    "opencode",
    "--scope",
    "project",
    "--project",
    project,
    "--preset",
    "two-model",
    "--worker-model",
    "openai/worker-model",
    "--dry-run",
    "--json",
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "dry-run");
  assert.deepEqual(await snapshotTree(project), before);
});

test("OpenCode requires provider/model syntax", async () => {
  const project = await tempRoot();
  const result = await captureRun([
    "configure",
    "--host",
    "opencode",
    "--scope",
    "project",
    "--project",
    project,
    "--preset",
    "two-model",
    "--worker-model",
    "worker-model",
  ]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /provider\/model syntax/u);
});

test("doctor is read-only and analyzes all supported default locations", async () => {
  const sandbox = await tempRoot();
  const project = path.join(sandbox, "project");
  const claudeRoot = path.join(sandbox, "claude");
  const codexRoot = path.join(sandbox, "codex");
  const openCodeRoot = path.join(sandbox, "opencode");
  await mkdir(project, { recursive: true });

  await mkdir(path.join(claudeRoot, "agents"), { recursive: true });
  await writeFile(
    path.join(claudeRoot, "agents", "sew-worker.md"),
    "---\nname: sew-worker\ndescription: test\nmodel: haiku\neffort: medium\n---\n\nbody\n",
  );

  await mkdir(path.join(codexRoot, "agents"), { recursive: true });
  await writeFile(
    path.join(codexRoot, "config.toml"),
    '[agents]\ndefault_subagent_model = "gpt-default"\ndefault_subagent_reasoning_effort = "high"\n',
  );
  await writeFile(
    path.join(codexRoot, "agents", "sew-engineer.toml"),
    'name = "sew-engineer"\nmodel = "gpt-worker"\nmodel_reasoning_effort = "max"\n',
  );

  await mkdir(path.join(openCodeRoot, "agents"), { recursive: true });
  await writeFile(
    path.join(openCodeRoot, "agents", "sew-researcher.md"),
    "---\ndescription: test\nmode: subagent\nmodel: openai/gpt-balanced\nvariant: high\n---\n\nbody\n",
  );

  const env = {
    CLAUDE_CONFIG_DIR: claudeRoot,
    CODEX_HOME: codexRoot,
    OPENCODE_CONFIG_DIR: openCodeRoot,
    CLAUDE_CODE_SUBAGENT_MODEL: "opus",
  };
  const before = await snapshotTree(sandbox);
  const result = await captureRun(["doctor", "--project", project, "--json"], { env });
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.hosts.map((item) => item.host), ["claude-code", "codex", "opencode"]);
  assert.equal(report.status, "warnings");
  assert.ok(report.hosts.find((item) => item.host === "claude-code").definitions.some((item) => item.model === "haiku"));
  assert.ok(report.hosts.find((item) => item.host === "codex").settings.some((item) => item.defaultSubagentModel === "gpt-default"));
  assert.ok(report.hosts.find((item) => item.host === "opencode").definitions.some((item) => item.model === "openai/gpt-balanced"));
  assert.deepEqual(await snapshotTree(sandbox), before);
});

test("doctor reports duplicate and host-wide model configuration", async () => {
  const sandbox = await tempRoot();
  const project = path.join(sandbox, "project");
  const codexRoot = path.join(sandbox, "codex");
  await mkdir(path.join(codexRoot, "agents"), { recursive: true });
  await mkdir(path.join(project, ".codex", "agents"), { recursive: true });
  await writeFile(
    path.join(codexRoot, "config.toml"),
    '[agents]\ndefault_subagent_model = "gpt-shadow"\ndefault_subagent_reasoning_effort = "high"\n',
  );
  for (const file of [
    path.join(codexRoot, "agents", "sew-worker.toml"),
    path.join(project, ".codex", "agents", "sew-worker.toml"),
  ]) {
    await writeFile(file, 'name = "sew-worker"\nmodel = "gpt-worker"\n');
  }

  const result = await captureRun([
    "doctor",
    "--host",
    "codex",
    "--project",
    project,
    "--json",
  ], { env: { CODEX_HOME: codexRoot } });
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout).hosts[0];
  assert.ok(report.findings.some((item) => item.code === "codex-subagent-default"));
  assert.ok(report.findings.some((item) => item.code === "duplicate-agent"));
});

test("strict argument parsing rejects unknown, duplicate, and inapplicable options", async () => {
  const unknown = await captureRun(["doctor", "--unknown"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown option/u);

  const duplicate = await captureRun(["doctor", "--host", "codex", "--host", "opencode"]);
  assert.equal(duplicate.code, 2);
  assert.match(duplicate.stderr, /only once/u);

  const inapplicable = await captureRun([
    "configure",
    "--host",
    "codex",
    "--preset",
    "inherit",
    "--worker-model",
    "gpt-worker",
  ]);
  assert.equal(inapplicable.code, 2);
  assert.match(inapplicable.stderr, /not valid with --preset inherit/u);
});

test("configure rejects a symlinked agents directory", async (t) => {
  if (process.platform === "win32") {
    t.skip("native Windows junction coverage belongs in the Windows CI job");
    return;
  }
  const project = await tempRoot();
  const outside = await tempRoot("sew-models-outside-");
  const hostRoot = path.join(project, ".codex");
  await mkdir(hostRoot, { recursive: true });
  await symlink(outside, path.join(hostRoot, "agents"), "dir");

  const result = await captureRun([
    "configure",
    "--host",
    "codex",
    "--scope",
    "project",
    "--project",
    project,
    "--preset",
    "two-model",
    "--worker-model",
    "gpt-worker",
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /symlink or junction/u);
  assert.deepEqual(await readdir(outside), []);
});

test("published role templates match canonical plugin roles", async () => {
  for (const role of ROLES) {
    const canonical = await readFile(path.join(ROOT, "plugins", "senior-engineering-workflow", "agents", `${role}.md`), "utf8");
    const packaged = await readFile(path.join(ROOT, "packages", "sew-models", "templates", `${role}.md`), "utf8");
    assert.equal(packaged, canonical, `${role} template must match the canonical role prompt`);
  }
});

test("npm package exposes only the narrow public CLI surface", async () => {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "packages", "sew-models", "package.json"), "utf8"));
  assert.equal(manifest.name, "@oovz/sew-models");
  assert.deepEqual(manifest.bin, { "sew-models": "./bin/sew-models.mjs" });
  assert.equal(manifest.publishConfig.access, "public");
  assert.deepEqual(manifest.files, ["bin/", "lib/", "templates/", "README.md", "LICENSE"]);

  const help = await captureRun(["--help"]);
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /sew-models configure/u);
  assert.match(help.stdout, /sew-models doctor/u);
  assert.doesNotMatch(help.stdout, /\b(remove|show|install|uninstall)\b/u);
});

test("the npm workspace is the only sew-models implementation", async () => {
  for (const legacy of [
    path.join(ROOT, "scripts", "sew-models.mjs"),
    path.join(ROOT, "plugins", "senior-engineering-workflow", "scripts", "sew-models.mjs"),
    path.join(ROOT, "plugins", "senior-engineering-workflow", "MODEL_CONFIGURATION.md"),
  ]) {
    await assert.rejects(lstat(legacy), { code: "ENOENT" });
  }

  const manifest = JSON.parse(await readFile(path.join(ROOT, "packages", "sew-models", "package.json"), "utf8"));
  const help = await captureRun(["--help"]);
  assert.match(help.stdout, new RegExp(`@oovz/sew-models ${manifest.version.replaceAll(".", "\\.")}`));
});
