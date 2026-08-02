import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runGenerator } from "../scripts/generate.mjs";
import { discoverMarketplace, inspectPlugin } from "../scripts/lib/marketplace.mjs";
import { validateRepository } from "../scripts/validate.mjs";
import { createFixtureMarketplace, execFileAsync, readJson } from "./helpers.mjs";

const silent = { write() {} };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function addSchemas(root) {
  await cp(path.join(ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
}

async function treeDigest(directory) {
  const hash = createHash("sha256");
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else {
        hash.update(path.relative(directory, absolute).split(path.sep).join("/"));
        hash.update(await readFile(absolute));
      }
    }
  }
  await walk(directory);
  return hash.digest("hex");
}

test("canonical marketplace and semantic workflow contract validate", async () => {
  const result = await validateRepository();
  assert.equal(result.plugins.length, result.catalog.marketplace.plugins.length);
  const contractFiles = result.plugins.flatMap((plugin) => plugin.skills.flatMap((skill) => skill.files.filter((file) => file.relative.endsWith("workflow-contract.yaml"))));
  assert.ok(contractFiles.length > 0, "a declared skill must carry the workflow contract");
});

test("validator CLI executes its platform-safe main entry point", async () => {
  const result = await execFileAsync(process.execPath, [path.join(ROOT, "scripts", "validate.mjs")], { cwd: ROOT });
  assert.match(result.stdout, /validated 1 plugin across 7 host targets/);
});

test("two explicitly cataloged plugins build independently and deterministically", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-marketplace-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [
    { id: "alpha-plugin", version: "1.2.3", options: { roleId: "builder", workspace: "workspace-write", shell: true } },
    { id: "beta-plugin", version: "9.8.7", options: { roleId: "auditor" } }
  ]);
  const catalog = await discoverMarketplace(root);
  assert.deepEqual(catalog.plugins.map((plugin) => plugin.manifest.id), ["alpha-plugin", "beta-plugin"]);

  await runGenerator(["build", "--all"], { root, stdout: silent });
  const alphaManifest = await readJson(path.join(root, "dist", "gemini-cli", "alpha-plugin", "gemini-extension.json"));
  const betaManifest = await readJson(path.join(root, "dist", "gemini-cli", "beta-plugin", "gemini-extension.json"));
  assert.equal(alphaManifest.version, "1.2.3");
  assert.equal(betaManifest.version, "9.8.7");
  assert.ok(await readFile(path.join(root, "dist", "codex", "alpha-plugin", "companion", "agents", "alpha-plugin-builder.toml")));
  assert.ok(await readFile(path.join(root, "dist", "codex", "beta-plugin", "companion", "agents", "beta-plugin-auditor.toml")));
  const codexAgent = await readFile(path.join(root, "dist", "codex", "alpha-plugin", "companion", "agents", "alpha-plugin-builder.toml"), "utf8");
  assert.match(codexAgent, /Role constraints/);
  assert.doesNotMatch(codexAgent, /Host-enforced constraints/);
  await runGenerator(["generate", "--all"], { root, stdout: silent });
  for (const host of ["claude-code", "codex"]) {
    const manifestPath = host === "claude-code" ? ".claude-plugin/plugin.json" : ".codex-plugin/plugin.json";
    assert.equal(
      await readFile(path.join(root, "adapters", host, "alpha-plugin", manifestPath), "utf8"),
      await readFile(path.join(root, "dist", host, "alpha-plugin", manifestPath), "utf8"),
      `${host} adapter and dist manifests must be byte-identical`
    );
  }
  const claudeCatalog = await readJson(path.join(root, ".claude-plugin", "marketplace.json"));
  assert.equal(claudeCatalog.plugins[0].source, "./adapters/claude-code/alpha-plugin");
  const codexCatalog = await readJson(path.join(root, ".agents", "plugins", "marketplace.json"));
  assert.equal(codexCatalog.plugins[0].source.path, "./adapters/codex/alpha-plugin");

  const before = await treeDigest(path.join(root, "dist"));
  await runGenerator(["build"], { root, stdout: silent });
  assert.equal(await treeDigest(path.join(root, "dist")), before);

  const marker = path.join(root, "dist", "codex", "beta-plugin", "user-marker");
  await writeFile(marker, "preserve\n");
  await runGenerator(["build", "--plugin", "alpha-plugin", "--host", "codex"], { root, stdout: silent });
  assert.equal(await readFile(marker, "utf8"), "preserve\n", "building one plugin must not touch another plugin's output");
});

test("hostFiles are copied only into their declared host bundle", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-host-file-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "asset-plugin",
    version: "1.0.0",
    options: { hostFile: { path: "host/policy.toml", hosts: ["gemini-cli"], destination: "policies/policy.toml", content: "enabled = true\n" } }
  }]);
  await runGenerator(["build", "--all"], { root, stdout: silent });
  assert.equal(await readFile(path.join(root, "dist", "gemini-cli", "asset-plugin", "policies", "policy.toml"), "utf8"), "enabled = true\n");
  await assert.rejects(readFile(path.join(root, "dist", "codex", "asset-plugin", "policies", "policy.toml")), /ENOENT/);
});

test("an explicitly cataloged missing manifest fails closed", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-missing-plugin-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{ id: "present-plugin", version: "1.0.0" }]);
  const marketplace = await readJson(path.join(root, "marketplace.json"));
  marketplace.plugins.push({ id: "missing-plugin", path: "plugins/missing-plugin" });
  await mkdir(path.join(root, "plugins", "missing-plugin"));
  await writeFile(path.join(root, "marketplace.json"), `${JSON.stringify(marketplace, null, 2)}\n`);
  await assert.rejects(discoverMarketplace(root), /missing-plugin[/\\]plugin\.json/);
});

test("generate, build, and check reject schema-invalid marketplace and plugin manifests", async (t) => {
  for (const target of ["marketplace", "plugin"]) {
    const root = await mkdtemp(path.join(os.tmpdir(), `oovz-invalid-${target}-schema-`));
    t.after(() => rm(root, { recursive: true, force: true }));
    await createFixtureMarketplace(root, [{ id: "schema-plugin", version: "1.0.0" }]);
    const manifestFile = target === "marketplace"
      ? path.join(root, "marketplace.json")
      : path.join(root, "plugins", "schema-plugin", "plugin.json");
    const manifest = await readJson(manifestFile);
    manifest.unexpectedProperty = true;
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

    for (const operation of ["generate", "build", "check"]) {
      await assert.rejects(
        runGenerator([operation, "--all"], { root, stdout: silent }),
        /does not match its schema/
      );
    }
    await assert.rejects(lstat(path.join(root, "adapters")), /ENOENT/);
    await assert.rejects(lstat(path.join(root, "dist")), /ENOENT/);
  }
});

test("generate, build, and check reject schema-valid host capability mismatches", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-invalid-host-capability-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "recursive-plugin",
    version: "1.0.0",
    options: { delegates: true }
  }]);

  for (const operation of ["generate", "build", "check"]) {
    await assert.rejects(
      runGenerator([operation, "--all"], { root, stdout: silent }),
      /cannot enable Gemini CLI for recursively delegating agent/
    );
  }
  await assert.rejects(lstat(path.join(root, "adapters")), /ENOENT/);
  await assert.rejects(lstat(path.join(root, "dist")), /ENOENT/);
});

test("strict SemVer 2 validation rejects malformed prerelease identifiers", async (t) => {
  for (const version of ["1.0.0-01", "1.0.0-", "1.0.0-.", "1.0.0-alpha..1", "1.0.0+"]) {
    const root = await mkdtemp(path.join(os.tmpdir(), "oovz-invalid-semver-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await createFixtureMarketplace(root, [{ id: "version-plugin", version }]);
    await assert.rejects(
      runGenerator(["build", "--all"], { root, stdout: silent }),
      /invalid semantic version|does not match its schema/
    );
  }
});

test("generator rejects a symlinked output containment root", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-build-symlink-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "oovz-build-outside-"));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  await createFixtureMarketplace(root, [{ id: "safe-plugin", version: "1.0.0" }]);
  await symlink(outside, path.join(root, "dist"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(runGenerator(["build", "--all"], { root, stdout: silent }), /symlink/);
});

test("generated checks reject symlinked adapter roots", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-check-symlink-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "oovz-check-adapters-"));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  await createFixtureMarketplace(root, [{ id: "check-plugin", version: "1.0.0" }]);
  await runGenerator(["generate", "--all"], { root, stdout: silent });
  await rm(outside, { recursive: true });
  await cp(path.join(root, "adapters"), outside, { recursive: true });
  await rm(path.join(root, "adapters"), { recursive: true });
  await symlink(outside, path.join(root, "adapters"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(runGenerator(["check", "--all"], { root, stdout: silent }), /symlink/);
});

test("generated checks reject symlinked source manifests", { skip: process.platform === "win32" }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-check-source-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{ id: "check-plugin", version: "1.0.0" }]);
  await runGenerator(["generate", "--all"], { root, stdout: silent });
  const source = path.join(root, ".claude-plugin", "marketplace.json");
  const external = path.join(root, "external-marketplace.json");
  await writeFile(external, await readFile(source));
  await rm(source);
  await symlink(external, source, "file");
  await assert.rejects(runGenerator(["check", "--all"], { root, stdout: silent }), /symlink/);
});

test("source component parent symlinks cannot escape the plugin", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-source-symlink-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "oovz-source-outside-"));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  await createFixtureMarketplace(root, [{ id: "safe-plugin", version: "1.0.0" }]);
  await rm(path.join(root, "plugins", "safe-plugin", "agents"), { recursive: true });
  await writeFile(path.join(outside, "worker.md"), "---\nname: worker\ndescription: escaped\nmodel: inherit\n---\n\nescaped\n");
  await symlink(outside, path.join(root, "plugins", "safe-plugin", "agents"), process.platform === "win32" ? "junction" : "dir");
  const catalog = await discoverMarketplace(root);
  await assert.rejects(inspectPlugin(catalog.plugins[0]), /symlink/);
});

test("invalid Agent Skills frontmatter fails validation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-invalid-skill-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{ id: "invalid-skill-plugin", version: "1.0.0" }]);
  await writeFile(path.join(root, "plugins", "invalid-skill-plugin", "skills", "invalid-skill-plugin-skill", "SKILL.md"), "No frontmatter.\n");
  const catalog = await discoverMarketplace(root);
  await assert.rejects(inspectPlugin(catalog.plugins[0]), /YAML frontmatter/);
});

test("host enablement filters catalogs, source manifests, and adapters", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-portable-only-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "portable-only",
    version: "2.0.0",
    options: { hosts: { portable: { enabled: true } } }
  }]);
  await runGenerator(["generate", "--all"], { root, stdout: silent });
  assert.deepEqual((await readJson(path.join(root, ".claude-plugin", "marketplace.json"))).plugins, []);
  assert.deepEqual((await readJson(path.join(root, ".agents", "plugins", "marketplace.json"))).plugins, []);
  await assert.rejects(readFile(path.join(root, "plugins", "portable-only", ".claude-plugin", "plugin.json")), /ENOENT/);
  await assert.rejects(readFile(path.join(root, "plugins", "portable-only", ".codex-plugin", "plugin.json")), /ENOENT/);
  assert.ok(await readFile(path.join(root, "adapters", "portable-agent-skills", "portable-only", ".agents", "skills", "portable-only-skill", "SKILL.md")));
  const adapterTop = (await readdir(path.join(root, "adapters"))).sort();
  assert.deepEqual(adapterTop, ["portable-agent-skills"]);
  await runGenerator(["check", "--all"], { root, stdout: silent });
});

test("plugin-scoped regeneration removes outputs for a newly disabled host", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-disable-toggle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{ id: "toggle-plugin", version: "1.0.0" }]);
  await runGenerator(["generate", "--all"], { root, stdout: silent });
  await runGenerator(["build", "--all"], { root, stdout: silent });
  const manifestFile = path.join(root, "plugins", "toggle-plugin", "plugin.json");
  const manifest = await readJson(manifestFile);
  manifest.hosts["gemini-cli"].enabled = false;
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  await runGenerator(["generate", "--plugin", "toggle-plugin"], { root, stdout: silent });
  await runGenerator(["build", "--plugin", "toggle-plugin"], { root, stdout: silent });
  await assert.rejects(readFile(path.join(root, "adapters", "gemini-cli", "toggle-plugin", "gemini-extension.json")), /ENOENT/);
  await assert.rejects(readFile(path.join(root, "dist", "gemini-cli", "toggle-plugin", "gemini-extension.json")), /ENOENT/);
});

test("generic delegating/question-capable plugin and unrelated contract validate", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-generic-plugin-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "generic-plugin",
    version: "1.0.0",
    options: {
      delegates: true,
      question: true,
      license: "A private fixture license.\n",
      licenseId: "LicenseRef-Private",
      supportFile: { path: "references/workflow-contract.yaml", content: "contract_id: unrelated\nnotes: parse-only\n" },
      hosts: {
        "claude-code": { enabled: true },
        codex: { enabled: true },
        opencode: { enabled: true },
        "opencode-v2": { enabled: true, status: "preview" },
        portable: { enabled: true }
      }
    }
  }]);
  await addSchemas(root);
  const result = await validateRepository(root);
  assert.equal(result.plugins[0].manifest.id, "generic-plugin");
  const plugin = await inspectPlugin(result.catalog.plugins[0]);
  const stable = (await import("../scripts/lib/hosts.mjs")).renderHost(plugin, "opencode", "stable");
  const agent = stable.artifacts.find((item) => item.path.endsWith("generic-plugin-worker.md")).content.toString("utf8");
  assert.doesNotMatch(agent, /task:\n\s+"\*": deny|question: deny/);
});

test("commands receive collision-safe flat IDs outside scoped Claude bundles", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-command-namespace-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const command = { id: "review", path: "commands/review.md", hosts: ["claude-code", "gemini-cli", "opencode", "opencode-v2"] };
  await createFixtureMarketplace(root, [
    { id: "first-plugin", version: "1.0.0", options: { command } },
    { id: "second-plugin", version: "2.0.0", options: { command } }
  ]);
  await runGenerator(["build", "--all"], { root, stdout: silent });
  for (const id of ["first-plugin", "second-plugin"]) {
    assert.ok(await readFile(path.join(root, "dist", "gemini-cli", id, "commands", `${id}-review.toml`)));
    assert.ok(await readFile(path.join(root, "dist", "opencode", "stable", id, ".opencode", "commands", `${id}-review.md`)));
    assert.ok(await readFile(path.join(root, "dist", "claude-code", id, "commands", "review.md")));
  }
});

test("executable skill support files retain mode in bundles", { skip: process.platform === "win32" }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-executable-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{ id: "script-plugin", version: "1.0.0", options: { supportFile: { path: "scripts/run.sh", content: "#!/bin/sh\n", executable: true } } }]);
  await runGenerator(["build", "--host", "codex", "--all"], { root, stdout: silent });
  const output = path.join(root, "dist", "codex", "script-plugin", "skills", "script-plugin-skill", "scripts", "run.sh");
  assert.notEqual((await lstat(output)).mode & 0o111, 0);
});
