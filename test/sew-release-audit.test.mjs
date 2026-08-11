import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createDeterministicNpmTarball,
  readTarEntriesFromGzip,
} from "../scripts/lib/deterministic-npm-tar.mjs";
import { assertSewSourceVersionAlignment } from "../scripts/lib/sew-release-version.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MARKETPLACE_SCHEMA = "https://json.schemastore.org/claude-code-marketplace.json";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("SEW package and plugin versions are released in lockstep", async () => {
  const versions = await assertSewSourceVersionAlignment();
  assert.equal(versions.packageVersion, versions.pluginVersion);
  assert.equal(versions.packageManifest.publishConfig?.provenance, true);
});

test("Claude-compatible marketplaces use the live SchemaStore URL", async () => {
  for (const relativePath of [
    ".claude-plugin/marketplace.json",
    ".omp-plugin/marketplace.json",
  ]) {
    const manifest = await readJson(path.join(ROOT, relativePath));
    assert.equal(manifest.$schema, MARKETPLACE_SCHEMA, relativePath);
  }
});

test("Antigravity plugin manifests are minimal and schema-free", async () => {
  for (const plugin of ["senior-engineering-workflow", "tauri-v2-desktop"]) {
    const manifest = await readJson(path.join(ROOT, "adapters", "antigravity", plugin, "plugin.json"));
    assert.equal(Object.hasOwn(manifest, "$schema"), false, plugin);
    assert.equal(manifest.name, plugin);
  }
});

test("release workflow explicitly requests provenance", async () => {
  const workflow = await readFile(path.join(ROOT, ".github", "workflows", "release-sew.yml"), "utf8");
  assert.match(workflow, /npm publish[^\n]*--provenance/);
});

test("deterministic npm tarballs normalize bin mode and bytes", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sew-tar-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const packageRoot = path.join(temp, "package");
  await mkdir(path.join(packageRoot, "bin"), { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({
    name: "@oovz/sew-test",
    version: "1.0.0",
    bin: { "sew-test": "./bin/sew.mjs" },
  }, null, 2));
  await writeFile(path.join(packageRoot, "bin", "sew.mjs"), "#!/usr/bin/env node\nconsole.log('ok');\n");
  await writeFile(path.join(packageRoot, "README.md"), "test\n");

  const first = path.join(temp, "first.tgz");
  const second = path.join(temp, "second.tgz");
  await createDeterministicNpmTarball({ packageRoot, outputFile: first });
  await createDeterministicNpmTarball({ packageRoot, outputFile: second });
  const [firstBytes, secondBytes] = await Promise.all([readFile(first), readFile(second)]);
  assert.deepEqual(firstBytes, secondBytes);

  const entries = readTarEntriesFromGzip(firstBytes);
  const bin = entries.find((entry) => entry.path === "package/bin/sew.mjs");
  const readme = entries.find((entry) => entry.path === "package/README.md");
  assert.equal(bin?.mode, 0o755);
  assert.equal(readme?.mode, 0o644);
  assert.equal(firstBytes[9], 255, "gzip OS byte must be normalized");
});
