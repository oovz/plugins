import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runGenerator } from "../scripts/generate.mjs";
import { discoverMarketplace, inspectPlugin, parseFrontmatter } from "../scripts/lib/marketplace.mjs";
import { codexPluginManifest } from "../scripts/lib/hosts.mjs";
import { assertKnownOhMyPiTools, validateRepository } from "../scripts/validate.mjs";
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

test("Tauri v2 desktop is a skill-only all-host plugin", async () => {
  const result = await validateRepository();
  const plugin = result.plugins.find((item) => item.manifest.id === "tauri-v2-desktop");
  assert.ok(plugin);
  assert.deepEqual(plugin.manifest.components.agents, []);
  assert.deepEqual(plugin.manifest.components.commands, []);
  assert.equal(plugin.skills.length, 1);
  assert.equal(plugin.skills[0].id, "tauri-v2-desktop");
  assert.equal(plugin.manifest.version, "1.1.0");
  for (const host of ["claude-code", "codex", "gemini-cli", "antigravity", "oh-my-pi", "opencode", "portable"]) {
    assert.equal(plugin.manifest.hosts[host].enabled, true, `${host} should be enabled`);
  }
  const claudeManifest = await readJson(path.join(ROOT, "adapters", "claude-code", "tauri-v2-desktop", ".claude-plugin", "plugin.json"));
  const codexManifest = await readJson(path.join(ROOT, "adapters", "codex", "tauri-v2-desktop", ".codex-plugin", "plugin.json"));
  const geminiManifest = await readJson(path.join(ROOT, "adapters", "gemini-cli", "tauri-v2-desktop", "gemini-extension.json"));
  assert.equal(claudeManifest.agents, undefined);
  assert.equal(claudeManifest.version, plugin.manifest.version);
  assert.equal(codexManifest.version, plugin.manifest.version);
  assert.equal(geminiManifest.version, plugin.manifest.version);
  assert.deepEqual(codexManifest.interface.capabilities, ["Read", "Write"]);
  assert.match(plugin.skills[0].frontmatter.description, /Windows, macOS, and Linux/);
  assert.doesNotMatch(`${plugin.manifest.description}\n${plugin.skills[0].body}`, /cce-tauri|nodnarbnitram|claude-code-extensions/i);
});

test("Senior Engineering Workflow targets exactly the six subagent-capable harnesses", async () => {
  const result = await validateRepository();
  const plugin = result.plugins.find((item) => item.manifest.id === "senior-engineering-workflow");
  assert.ok(plugin);
  const supported = ["antigravity", "claude-code", "codex", "gemini-cli", "oh-my-pi", "opencode"];
  assert.deepEqual(Object.entries(plugin.manifest.hosts).filter(([, value]) => value.enabled).map(([key]) => key).sort(), supported);
  assert.equal(plugin.manifest.hosts.portable, undefined);

  for (const role of ["researcher", "engineer", "verifier", "worker"]) {
    assert.ok(await readFile(path.join(ROOT, "adapters", "claude-code", plugin.manifest.id, "agents", `${role}.md`)));
    assert.ok(await readFile(path.join(ROOT, "adapters", "codex", plugin.manifest.id, "companion", "agents", `${plugin.manifest.id}-${role}.toml`)));
    assert.ok(await readFile(path.join(ROOT, "adapters", "gemini-cli", plugin.manifest.id, "agents", `${plugin.manifest.id}-${role}.md`)));
    assert.ok(await readFile(path.join(ROOT, "adapters", "oh-my-pi", plugin.manifest.id, "agents", `${plugin.manifest.id}-${role}.md`)));
    assert.ok(await readFile(path.join(ROOT, "adapters", "opencode", "stable", plugin.manifest.id, ".opencode", "agents", `${plugin.manifest.id}-${role}.md`)));
    await assert.rejects(readFile(path.join(ROOT, "adapters", "antigravity", plugin.manifest.id, "agents", `${plugin.manifest.id}-${role}.md`)), /ENOENT/);
  }
  assert.ok(await readFile(path.join(ROOT, "adapters", "antigravity", plugin.manifest.id, "skills", plugin.manifest.id, "SKILL.md")));
  const ompCatalog = await readJson(path.join(ROOT, ".omp-plugin", "marketplace.json"));
  assert.ok(ompCatalog.plugins.some((entry) => entry.name === plugin.manifest.id));
  await assert.rejects(readFile(path.join(ROOT, "adapters", "portable-agent-skills", plugin.manifest.id, ".agents", "skills", plugin.manifest.id, "SKILL.md")), /ENOENT/);
});

test("active marketplace README versions match canonical manifests", async () => {
  const catalog = await validateRepository();
  const readme = await readFile(path.join(ROOT, "README.md"), "utf8");
  for (const plugin of catalog.plugins) {
    const entry = catalog.catalog.marketplace.plugins.find((item) => item.id === plugin.manifest.id);
    assert.match(readme, new RegExp(`\\| \\[[^\\]]+\\]\\(${entry.path}/\\) \\| ${plugin.manifest.version} \\|`));
  }
  assert.match(await readFile(path.join(ROOT, "plugins", "tauri-v2-desktop", "README.md"), "utf8"), /evals[\s\S]{0,80}security-guidance\.yaml/);
});

test("semantic Tauri profile rejects unsafe guidance mutations", async (t) => {
  const mutations = [
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Application commands registered with `tauri::Builder::invoke_handler` are callable by application windows and webviews by default."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Remote-origin IPC bypasses ACL resolution"],
    ["skills/tauri-v2-desktop/references/versions-and-upgrades.md", "Rust and JavaScript halves of an official plugin may use unrelated releases"],
    ["skills/tauri-v2-desktop/references/desktop-runtime-and-delivery.md", "Updater signatures are optional"],
    ["skills/tauri-v2-desktop/references/testing-and-visual-validation.md", "A successful cross-build proves native runtime behavior"],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "events for small, lossy notifications"],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Capabilities automatically gate ordinary commands registered through invoke_handler."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Bundled local application content cannot invoke ordinary application commands."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Custom application commands are callable by webviews by default."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "A page loaded from a remote HTTPS origin can call every custom command registered in invoke_handler without a matching remote capability."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Remote-origin IPC can bypass ACL resolution."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Remote origins do not need an explicit remote capability."],
    ["skills/tauri-v2-desktop/references/versions-and-upgrades.md", "Rust and JavaScript packages can use different releases."],
    ["skills/tauri-v2-desktop/references/versions-and-upgrades.md", "The Rust crate may be newer than the JavaScript package."],
    ["skills/tauri-v2-desktop/references/versions-and-upgrades.md", "It is not necessary to keep the Rust crate and JavaScript package on the same plugin release."],
    ["skills/tauri-v2-desktop/references/desktop-runtime-and-delivery.md", "Unsigned updates are accepted by the updater."],
    ["skills/tauri-v2-desktop/references/desktop-runtime-and-delivery.md", "Signature verification can be skipped for trusted updates."],
    ["skills/tauri-v2-desktop/references/desktop-runtime-and-delivery.md", "Updater signatures may be omitted from a release."],
    ["skills/tauri-v2-desktop/references/testing-and-visual-validation.md", "A cross-build demonstrates native runtime behavior."],
    ["skills/tauri-v2-desktop/references/testing-and-visual-validation.md", "A mocked test demonstrates native permissions."],
    ["skills/tauri-v2-desktop/references/testing-and-visual-validation.md", "Emulated coverage is native coverage."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Events provide lossy notifications."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Events are fast high-throughput streaming transport."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Channels are unordered and lossy."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Do not require a remote capability for pages loaded from external websites."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Before Tauri 2.11.1, remote origins bypassed ACL resolution, and current releases allow the same behavior."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Do not claim that remote-origin IPC bypasses ACL resolution, because remote websites are actually exempt from capability checks."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Internet-hosted pages sit outside capability enforcement and may dispatch every registered handler."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Current releases do not require an explicit remote capability."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Before Tauri 2.11.1, remote origins could bypass ACL checks. Current releases require an explicit remote capability, but remote-origin IPC is not ACL-resolved."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Do not claim that remote-origin IPC bypasses ACL resolution, remote websites are exempt from capability checks."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "Do not claim that remote-origin IPC bypasses ACL resolution—although remote websites are exempt from capability checks."],
    ["skills/tauri-v2-desktop/references/desktop-runtime-and-delivery.md", "Do not require signatures for updater artifacts served by an internal release system."],
    ["skills/tauri-v2-desktop/references/desktop-runtime-and-delivery.md", "Artifacts from our own release service may omit cryptographic attestations."],
    ["skills/tauri-v2-desktop/references/testing-and-visual-validation.md", "A successful QEMU run is sufficient validation of actual target hardware behavior."],
    ["skills/tauri-v2-desktop/references/security-and-ipc.md", "The event bus may silently lose notifications when saturated."]
  ];
  for (const [relative, unsafePhrase] of mutations) {
    const root = await mkdtemp(path.join(os.tmpdir(), "oovz-tauri-profile-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await cp(path.join(ROOT, "marketplace.json"), path.join(root, "marketplace.json"));
    await cp(path.join(ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
    await cp(path.join(ROOT, "plugins"), path.join(root, "plugins"), { recursive: true });
    const file = path.join(root, "plugins", "tauri-v2-desktop", relative);
    await writeFile(file, `${await readFile(file, "utf8")}\n${unsafePhrase}\n`);
    await assert.rejects(validateRepository(root), /forbidden guidance/);
  }
});

test("semantic Tauri profile accepts explicit refutations", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-tauri-semantic-refutation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(ROOT, "marketplace.json"), path.join(root, "marketplace.json"));
  await cp(path.join(ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
  await cp(path.join(ROOT, "plugins"), path.join(root, "plugins"), { recursive: true });
  const security = path.join(root, "plugins", "tauri-v2-desktop", "skills", "tauri-v2-desktop", "references", "security-and-ipc.md");
  const skill = path.join(root, "plugins", "tauri-v2-desktop", "skills", "tauri-v2-desktop", "SKILL.md");
  await writeFile(security, `${await readFile(security, "utf8")}\nDo not claim that remote-origin IPC bypasses ACL resolution.\n`);
  await writeFile(skill, `${await readFile(skill, "utf8")}\nDo not claim that capabilities automatically restrict ordinary application commands registered through \`invoke_handler\`.\n`);
  await validateRepository(root);
});

test("semantic Tauri checks do not exempt unsafe clauses or unrelated history", async (t) => {
  const contradictoryRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-tauri-semantic-contradiction-"));
  t.after(() => rm(contradictoryRoot, { recursive: true, force: true }));
  await cp(path.join(ROOT, "marketplace.json"), path.join(contradictoryRoot, "marketplace.json"));
  await cp(path.join(ROOT, "schemas"), path.join(contradictoryRoot, "schemas"), { recursive: true });
  await cp(path.join(ROOT, "plugins"), path.join(contradictoryRoot, "plugins"), { recursive: true });
  const security = path.join(contradictoryRoot, "plugins", "tauri-v2-desktop", "skills", "tauri-v2-desktop", "references", "security-and-ipc.md");
  await writeFile(security, `${await readFile(security, "utf8")}\nNever require an explicit remote capability: remote origins can invoke any custom command without a remote capability.\n`);
  await assert.rejects(validateRepository(contradictoryRoot), /forbidden guidance/);

  const commaRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-tauri-semantic-comma-contradiction-"));
  t.after(() => rm(commaRoot, { recursive: true, force: true }));
  await cp(path.join(ROOT, "marketplace.json"), path.join(commaRoot, "marketplace.json"));
  await cp(path.join(ROOT, "schemas"), path.join(commaRoot, "schemas"), { recursive: true });
  await cp(path.join(ROOT, "plugins"), path.join(commaRoot, "plugins"), { recursive: true });
  const commaSecurity = path.join(commaRoot, "plugins", "tauri-v2-desktop", "skills", "tauri-v2-desktop", "references", "security-and-ipc.md");
  await writeFile(commaSecurity, `${await readFile(commaSecurity, "utf8")}\nDo not claim that remote-origin IPC bypasses ACL resolution, but remote origins can invoke any custom command without a remote capability.\n`);
  await assert.rejects(validateRepository(commaRoot), /forbidden guidance/);

  const unrelatedHistoryRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-tauri-semantic-unrelated-history-"));
  t.after(() => rm(unrelatedHistoryRoot, { recursive: true, force: true }));
  await cp(path.join(ROOT, "marketplace.json"), path.join(unrelatedHistoryRoot, "marketplace.json"));
  await cp(path.join(ROOT, "schemas"), path.join(unrelatedHistoryRoot, "schemas"), { recursive: true });
  await cp(path.join(ROOT, "plugins"), path.join(unrelatedHistoryRoot, "plugins"), { recursive: true });
  const delivery = path.join(unrelatedHistoryRoot, "plugins", "tauri-v2-desktop", "skills", "tauri-v2-desktop", "references", "desktop-runtime-and-delivery.md");
  await writeFile(delivery, `${await readFile(delivery, "utf8")}\nBefore Tauri 2.11.1, updater signatures are optional.\n`);
  await assert.rejects(validateRepository(unrelatedHistoryRoot), /forbidden guidance/);

  const historicalRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-tauri-semantic-history-"));
  t.after(() => rm(historicalRoot, { recursive: true, force: true }));
  await cp(path.join(ROOT, "marketplace.json"), path.join(historicalRoot, "marketplace.json"));
  await cp(path.join(ROOT, "schemas"), path.join(historicalRoot, "schemas"), { recursive: true });
  await cp(path.join(ROOT, "plugins"), path.join(historicalRoot, "plugins"), { recursive: true });
  const historicalSecurity = path.join(historicalRoot, "plugins", "tauri-v2-desktop", "skills", "tauri-v2-desktop", "references", "security-and-ipc.md");
  await writeFile(historicalSecurity, `${await readFile(historicalSecurity, "utf8")}\nPrior to Tauri 2.11.1, a missing AppManifest could let remote origins bypass ACL checks. That historical behavior is fixed; supported releases require an explicit remote capability.\n`);
  await validateRepository(historicalRoot);
});

test("semantic Tauri profile requires the remote security version boundary and permits safe rewrites", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-tauri-semantic-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(ROOT, "marketplace.json"), path.join(root, "marketplace.json"));
  await cp(path.join(ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
  await cp(path.join(ROOT, "plugins"), path.join(root, "plugins"), { recursive: true });

  const reference = path.join(root, "plugins", "tauri-v2-desktop", "skills", "tauri-v2-desktop", "references", "security-and-ipc.md");
  const source = await readFile(reference, "utf8");
  await writeFile(reference, source.replace("Tauri 2.11.1 and later", "Tauri current releases and later"));
  await assert.rejects(validateRepository(root), /missing semantic guidance|missing required guidance/);

  await writeFile(reference, source.replace("A remote origin needs an explicit, narrowly scoped remote capability before it can reach a custom command", "Remote origins require a narrowly scoped explicit remote capability before reaching a custom command"));
  const result = await validateRepository(root);
  assert.equal(result.plugins.length, 2);
});

test("Codex capability metadata is explicit, scoped, and single-line", async (t) => {
  const cases = [
    ["wrong-host", (manifest) => { manifest.hosts["claude-code"].capabilities = ["Deploy production"]; }, /only valid for the codex host/],
    ["missing", (manifest) => { delete manifest.hosts.codex.capabilities; }, /hosts\.codex\.capabilities must contain 1-20 entries/],
    ["newline", (manifest) => { manifest.hosts.codex.capabilities = ["Read\nWrite"]; }, /single-line text/],
    ["line-separator", (manifest) => { manifest.hosts.codex.capabilities = ["Read\u2028Write"]; }, /single-line text/],
    ["control", (manifest) => { manifest.hosts.codex.capabilities = ["Read\u0007Write"]; }, /single-line text/],
    ["zero-width", (manifest) => { manifest.hosts.codex.capabilities = ["Read\u200BWrite"]; }, /unsupported invisible/],
    ["word-joiner", (manifest) => { manifest.hosts.codex.capabilities = ["Read\u2060Write"]; }, /unsupported invisible/],
    ["bidi-override", (manifest) => { manifest.hosts.codex.capabilities = ["Read\u202EWrite"]; }, /unsupported invisible/],
    ["byte-order-mark", (manifest) => { manifest.hosts.codex.capabilities = ["\uFEFFRead"]; }, /unsupported invisible/],
    ["unattached-joiner", (manifest) => { manifest.hosts.codex.capabilities = ["Read\u200DWrite"]; }, /unattached zero-width joiner/],
    ["one-sided-joiner-prefix", (manifest) => { manifest.hosts.codex.capabilities = ["Read\u200D💻"]; }, /unsupported invisible/],
    ["one-sided-joiner-suffix", (manifest) => { manifest.hosts.codex.capabilities = ["👩\u200DWrite"]; }, /unsupported invisible/],
    ["emoji-tag", (manifest) => { manifest.hosts.codex.capabilities = ["Read\u{E0061}"]; }, /unsupported invisible/],
    ["invalid-variation-selector", (manifest) => { manifest.hosts.codex.capabilities = ["Read\uFE0F"]; }, /unsupported invisible/],
    ["unpaired-surrogate", (manifest) => { manifest.hosts.codex.capabilities = ["Read\uD800"]; }, /well-formed Unicode/],
    ["canonical-duplicate", (manifest) => { manifest.hosts.codex.capabilities = ["é", "e\u0301"]; }, /duplicates after normalization/],
    ["compatibility-duplicate", (manifest) => { manifest.hosts.codex.capabilities = ["Read", "Ｒｅａｄ"]; }, /duplicates after normalization/],
    ["empty-normalized", (manifest) => { manifest.hosts.codex.capabilities = [" \t"]; }, /must not be empty after normalization/],
    ["too-long", (manifest) => { manifest.hosts.codex.capabilities = ["x".repeat(121)]; }, /at most 120 characters/],
    ["too-many", (manifest) => { manifest.hosts.codex.capabilities = Array.from({ length: 21 }, (_, index) => `capability-${index}`); }, /must contain 1-20 entries/]
  ];
  for (const [name, mutate, expected] of cases) {
    const root = await mkdtemp(path.join(os.tmpdir(), `oovz-codex-capability-${name}-`));
    t.after(() => rm(root, { recursive: true, force: true }));
    await createFixtureMarketplace(root, [{ id: "capability-plugin", version: "1.0.0" }]);
    const manifestFile = path.join(root, "plugins", "capability-plugin", "plugin.json");
    const manifest = await readJson(manifestFile);
    mutate(manifest);
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(validateRepository(root), expected);
  }

  const supportedRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-capability-supported-"));
  t.after(() => rm(supportedRoot, { recursive: true, force: true }));
  await createFixtureMarketplace(supportedRoot, [{ id: "supported-capabilities", version: "1.0.0", options: { codexCapabilities: ["读取文件", "Deploy 👩‍💻", "Review 👩🏽‍💻"] } }]);
  await validateRepository(supportedRoot);

  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-capability-renderer-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{ id: "renderer-plugin", version: "1.0.0" }]);
  const catalog = await discoverMarketplace(root);
  const plugin = await inspectPlugin(catalog.plugins[0]);
  delete plugin.manifest.hosts.codex.capabilities;
  assert.throws(() => codexPluginManifest(plugin), /must declare hosts\.codex\.capabilities/);
});

test("validator CLI executes its platform-safe main entry point", async () => {
  const result = await execFileAsync(process.execPath, [path.join(ROOT, "scripts", "validate.mjs")], { cwd: ROOT });
  const marketplace = await readJson(path.join(ROOT, "marketplace.json"));
  assert.match(result.stdout, new RegExp(`validated ${marketplace.plugins.length} plugins across 7 host targets`));
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
  const alpha = await inspectPlugin(catalog.plugins[0]);
  const declaredCapabilities = codexPluginManifest(alpha).interface.capabilities;
  alpha.agents[0].workspace = "read-only";
  assert.deepEqual(codexPluginManifest(alpha).interface.capabilities, declaredCapabilities);

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

  await mkdir(path.join(root, "release-build", "sew", "package"), { recursive: true });
  await mkdir(path.join(root, "release-build", "sew", "artifacts"), { recursive: true });
  await writeFile(path.join(root, "release-build", "sew", "package", "staged-package"), "preserve package\n");
  await writeFile(path.join(root, "release-build", "sew", "artifacts", "release-artifact"), "preserve release\n");
  const before = await treeDigest(path.join(root, "dist"));
  await runGenerator(["build"], { root, stdout: silent });
  assert.equal(await treeDigest(path.join(root, "dist")), before);
  assert.equal(await readFile(path.join(root, "release-build", "sew", "package", "staged-package"), "utf8"), "preserve package\n");
  assert.equal(await readFile(path.join(root, "release-build", "sew", "artifacts", "release-artifact"), "utf8"), "preserve release\n");

  const marker = path.join(root, "dist", "codex", "beta-plugin", "user-marker");
  await writeFile(marker, "preserve\n");
  await runGenerator(["build", "--plugin", "alpha-plugin", "--host", "codex"], { root, stdout: silent });
  assert.equal(await readFile(marker, "utf8"), "preserve\n", "building one plugin must not touch another plugin's output");
});

test("host projections require functional components and conditional skill pointers", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-host-component-matrix-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "agent-only-plugin",
    version: "1.0.0",
    options: {
      includeSkill: false,
      hosts: {
        "claude-code": { enabled: true },
        codex: { enabled: true, capabilities: ["Read"] },
        portable: { enabled: false }
      }
    }
  }]);
  await runGenerator(["build", "--all"], { root, stdout: silent });
  const claudeManifest = await readJson(path.join(root, "dist", "claude-code", "agent-only-plugin", ".claude-plugin", "plugin.json"));
  assert.equal(claudeManifest.skills, undefined);
  assert.equal(claudeManifest.agents, "./agents/");
  await assert.rejects(lstat(path.join(root, "dist", "codex", "agent-only-plugin")), /ENOENT/);

  await runGenerator(["generate", "--all"], { root, stdout: silent });
  const codexCatalog = await readJson(path.join(root, ".agents", "plugins", "marketplace.json"));
  assert.deepEqual(codexCatalog.plugins, []);

  const portableRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-portable-agent-only-"));
  t.after(() => rm(portableRoot, { recursive: true, force: true }));
  await createFixtureMarketplace(portableRoot, [{
    id: "portable-agent-only",
    version: "1.0.0",
    options: { includeSkill: false, hosts: { portable: { enabled: true } } }
  }]);
  await assert.rejects(validateRepository(portableRoot), /without a functional host component/);
});

test("Codex native host files use recognized manifest components", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-native-components-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "mcp-only-plugin",
    version: "1.0.0",
    options: {
      includeSkill: false,
      includeAgent: false,
      hosts: { codex: { enabled: true } },
      hostFile: { path: "native/.mcp.json", hosts: ["codex"], destination: ".mcp.json", content: "{\"docs\":{\"command\":\"docs-mcp\"}}\n" }
    }
  }]);
  await runGenerator(["build", "--all"], { root, stdout: silent });
  const manifest = await readJson(path.join(root, "dist", "codex", "mcp-only-plugin", ".codex-plugin", "plugin.json"));
  assert.equal(manifest.mcpServers, "./.mcp.json");

  const malformedRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-malformed-native-"));
  t.after(() => rm(malformedRoot, { recursive: true, force: true }));
  await createFixtureMarketplace(malformedRoot, [{
    id: "malformed-native-plugin",
    version: "1.0.0",
    options: {
      includeSkill: false,
      includeAgent: false,
      hosts: { codex: { enabled: true } },
      hostFile: { path: "native/hooks.json", hosts: ["codex"], destination: "hooks/hooks.json", content: "{\n" }
    }
  }]);
  await assert.rejects(validateRepository(malformedRoot), /must contain valid JSON/);

  const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-empty-native-"));
  t.after(() => rm(emptyRoot, { recursive: true, force: true }));
  await createFixtureMarketplace(emptyRoot, [{
    id: "empty-native-plugin",
    version: "1.0.0",
    options: {
      includeSkill: false,
      includeAgent: false,
      hosts: { codex: { enabled: true } },
      hostFile: { path: "native/.mcp.json", hosts: ["codex"], destination: ".mcp.json", content: "{}\n" }
    }
  }]);
  await assert.rejects(validateRepository(emptyRoot), /must declare at least one MCP server/);

  const emptyHooksRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-empty-hooks-"));
  t.after(() => rm(emptyHooksRoot, { recursive: true, force: true }));
  await createFixtureMarketplace(emptyHooksRoot, [{
    id: "empty-hooks-plugin",
    version: "1.0.0",
    options: {
      includeSkill: false,
      includeAgent: false,
      hosts: { codex: { enabled: true } },
      hostFile: { path: "native/hooks.json", hosts: ["codex"], destination: "hooks/hooks.json", content: "{\"hooks\":{\"SessionStart\":[{}]}}\n" }
    }
  }]);
  await assert.rejects(validateRepository(emptyHooksRoot), /must declare at least one hook handler/);

  const duplicateRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-duplicate-native-"));
  t.after(() => rm(duplicateRoot, { recursive: true, force: true }));
  await createFixtureMarketplace(duplicateRoot, [{
    id: "duplicate-native-plugin",
    version: "1.0.0",
    options: {
      includeSkill: false,
      includeAgent: false,
      hosts: { codex: { enabled: true } },
      hostFile: { path: "native/.mcp.json", hosts: ["codex"], destination: ".mcp.json", content: "{\"docs\":{\"command\":\"docs-mcp\"}}\n" }
    }
  }]);
  const duplicateManifestFile = path.join(duplicateRoot, "plugins", "duplicate-native-plugin", "plugin.json");
  const duplicateManifest = await readJson(duplicateManifestFile);
  await mkdir(path.join(duplicateRoot, "plugins", "duplicate-native-plugin", "native"), { recursive: true });
  await writeFile(path.join(duplicateRoot, "plugins", "duplicate-native-plugin", "native", "hooks.json"), "{}\n");
  duplicateManifest.components.hostFiles.push({ id: "fixture-policy", path: "native/hooks.json", hosts: ["codex"], destination: "hooks/hooks.json" });
  await writeFile(duplicateManifestFile, `${JSON.stringify(duplicateManifest, null, 2)}\n`);
  await assert.rejects(validateRepository(duplicateRoot), /duplicate host file id/);

  const invalidRoot = await mkdtemp(path.join(os.tmpdir(), "oovz-codex-invalid-native-"));
  t.after(() => rm(invalidRoot, { recursive: true, force: true }));
  await createFixtureMarketplace(invalidRoot, [{
    id: "invalid-native-plugin",
    version: "1.0.0",
    options: {
      includeSkill: false,
      includeAgent: false,
      hosts: { codex: { enabled: true } },
      hostFile: { path: "native/note.md", hosts: ["codex"], destination: "notes/readme.md", content: "note\n" }
    }
  }]);
  await assert.rejects(validateRepository(invalidRoot), /supported native component/);
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

test("supplemental host files do not make an otherwise empty projection functional", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-host-file-only-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "host-file-only-plugin",
    version: "1.0.0",
    options: {
      includeSkill: false,
      includeAgent: false,
      hosts: { "gemini-cli": { enabled: true } },
      hostFile: { path: "host/policy.toml", hosts: ["gemini-cli"], destination: "policies/policy.toml", content: "enabled = true\n" }
    }
  }]);
  await assert.rejects(validateRepository(root), /without a functional host component/);
});

test("source trees under filesystem aliases preserve logical relative paths", async (t) => {
  const target = await mkdtemp(path.join(os.tmpdir(), "oovz-alias-target-"));
  const parent = await mkdtemp(path.join(os.tmpdir(), "oovz-alias-parent-"));
  const alias = path.join(parent, "alias");
  const root = path.join(alias, "marketplace");
  t.after(() => Promise.all([rm(parent, { recursive: true, force: true }), rm(target, { recursive: true, force: true })]));
  await symlink(target, alias, process.platform === "win32" ? "junction" : "dir");
  await createFixtureMarketplace(root, [{ id: "aliased-plugin", version: "1.0.0" }]);

  const catalog = await discoverMarketplace(root);
  const plugin = await inspectPlugin(catalog.plugins[0]);
  assert.equal(plugin.skills[0].files.find((file) => file.relative === "references/guide.md")?.relative, "references/guide.md");
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

test("permission-inheriting agents add no host-level restrictions", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-inherit-permissions-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "inherit-plugin",
    version: "1.0.0",
    options: {
      permissionPolicy: "inherit",
      hosts: {
        "claude-code": { enabled: true },
        codex: { enabled: true },
        "gemini-cli": { enabled: true },
        antigravity: { enabled: true },
        "oh-my-pi": { enabled: true },
        opencode: { enabled: true },
        portable: { enabled: true },
      },
    },
  }]);
  await addSchemas(root);
  const result = await validateRepository(root);
  const plugin = await inspectPlugin(result.catalog.plugins[0]);
  const { renderHost } = await import("../scripts/lib/hosts.mjs");

  const claude = renderHost(plugin, "claude-code").artifacts
    .find((item) => item.path.endsWith("agents/worker.md")).content.toString("utf8");
  assert.doesNotMatch(claude, /^tools:/mu);
  assert.doesNotMatch(claude, /^disallowedTools:/mu);

  const codex = renderHost(plugin, "codex").artifacts
    .find((item) => item.path.endsWith("inherit-plugin-worker.toml")).content.toString("utf8");
  assert.doesNotMatch(codex, /^sandbox_mode\s*=/mu);

  const stable = renderHost(plugin, "opencode", "stable").artifacts
    .find((item) => item.path.endsWith("inherit-plugin-worker.md")).content.toString("utf8");
  assert.doesNotMatch(stable, /^permission:/mu);

  const gemini = renderHost(plugin, "gemini-cli").artifacts
    .find((item) => item.path.endsWith("inherit-plugin-worker.md")).content.toString("utf8");
  assert.doesNotMatch(gemini, /^tools:/mu);

  const antigravity = renderHost(plugin, "antigravity").artifacts;
  assert.equal(antigravity.some((item) => item.path.endsWith("inherit-plugin-worker.md")), false);

  const omp = renderHost(plugin, "oh-my-pi").artifacts
    .find((item) => item.path.endsWith("inherit-plugin-worker.md")).content.toString("utf8");
  assert.doesNotMatch(omp, /^(tools|spawns|model|thinking-level):/mu);

  assert.throws(
    () => renderHost(plugin, "opencode", "v2-beta"),
    /does not support variant v2-beta/,
  );
});

test("Oh My Pi explicit agents use documented tool names", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-omp-tools-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureMarketplace(root, [{
    id: "omp-tools-plugin",
    version: "1.0.0",
    options: {
      workspace: "workspace-write",
      shell: true,
      external: true,
      delegates: true,
      question: true,
      hosts: {
        "oh-my-pi": { enabled: true },
      },
    },
  }]);
  await addSchemas(root);
  const result = await validateRepository(root);
  const plugin = await inspectPlugin(result.catalog.plugins[0]);
  const { renderHost } = await import("../scripts/lib/hosts.mjs");
  const rendered = renderHost(plugin, "oh-my-pi").artifacts
    .find((item) => item.path.endsWith("omp-tools-plugin-worker.md"));
  const { frontmatter } = parseFrontmatter(rendered.content.toString("utf8"), "Oh My Pi explicit tool fixture");

  assert.deepEqual(frontmatter.tools, ["read", "grep", "glob", "bash", "edit", "write", "web_search", "task", "ask"]);
  assert.equal(frontmatter.tools.includes("web_fetch"), false);
  assert.doesNotThrow(() => assertKnownOhMyPiTools(frontmatter.tools, "fixture agent"));
  assert.throws(() => assertKnownOhMyPiTools([...frontmatter.tools, "web_fetch"], "fixture agent"), /unknown tool web_fetch/);
});

test("commands receive collision-safe flat IDs outside scoped Claude bundles", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-command-namespace-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const command = { id: "review", path: "commands/review.md", hosts: ["claude-code", "gemini-cli", "opencode"] };
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
