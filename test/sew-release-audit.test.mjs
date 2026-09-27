import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, cp, readFile, writeFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  createDeterministicNpmTarball,
  readTarEntriesFromGzip,
} from "../scripts/lib/deterministic-npm-tar.mjs";
import { buildSewPackage } from "../scripts/build-sew-package.mjs";
import { assertSewSourceVersionAlignment } from "../scripts/lib/sew-release-version.mjs";
import { checkSewRelease } from "../scripts/check-sew-release.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MARKETPLACE_SCHEMA = "https://json.schemastore.org/claude-code-marketplace.json";
const execFileAsync = promisify(execFile);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("SEW package and plugin versions are released in lockstep", async () => {
  const versions = await assertSewSourceVersionAlignment();
  assert.equal(versions.packageVersion, versions.pluginVersion);
  assert.equal(versions.packageManifest.publishConfig?.provenance, true);
});

test("staged SEW metadata binds payloads to an explicit source commit", async (t) => {
  const outputRoot = await mkdtemp(path.join(ROOT, "release-build", "source-commit-test-"));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const output = path.join(outputRoot, "package");
  const sourceCommit = "a".repeat(40);
  await buildSewPackage({ root: ROOT, output, sourceCommit });
  const staged = JSON.parse(await readFile(path.join(output, "package.json"), "utf8"));
  const payload = JSON.parse(await readFile(path.join(output, "payloads", "manifest.json"), "utf8"));
  assert.equal(staged.sourceCommit, sourceCommit);
  assert.equal(payload.sourceCommit, sourceCommit);
  assert.equal(payload.roleSourceVersion, staged.roleSourceVersion);
  assert.equal(Object.keys(payload.hosts).length, 7);
  assert.match(payload.roleDigest, /^[a-f0-9]{64}$/u);
  const packagedFiles = await readdir(path.join(output, "payloads", "config", "cursor", "agents"));
  assert.equal(packagedFiles.length, 3);
  assert.equal((await readdir(path.join(output, "payloads", "config", "codex", "agents"))).length, 3);
  assert.equal((await readdir(path.join(output, "payloads", "config", "oh-my-pi", "agents"))).length, 3);
  assert.deepEqual((await readdir(path.join(output, "payloads", "config", "cursor", "agents"))).sort(), [
    "senior-engineering-workflow-engineer.md",
    "senior-engineering-workflow-researcher.md",
    "senior-engineering-workflow-verifier.md",
  ]);
});

test("release verification rejects a mixed stage and tarball identity", async (t) => {
  const stageRoot = await mkdtemp(path.join(ROOT, "release-build", "release-check-stage-"));
  const releaseRoot = await mkdtemp(path.join(ROOT, "release-build", "release-check-artifacts-"));
  t.after(() => Promise.all([
    rm(stageRoot, { recursive: true, force: true }),
    rm(releaseRoot, { recursive: true, force: true }),
  ]));
  await cp(path.join(ROOT, "release-build", "sew", "package"), stageRoot, { recursive: true });
  const sourceCommit = "a".repeat(40);
  const stageManifestPath = path.join(stageRoot, "package.json");
  const stagePayloadPath = path.join(stageRoot, "payloads", "manifest.json");
  const stageManifest = await readJson(stageManifestPath);
  const stagePayload = await readJson(stagePayloadPath);
  stageManifest.sourceCommit = sourceCommit;
  stagePayload.sourceCommit = sourceCommit;
  await writeFile(stageManifestPath, `${JSON.stringify(stageManifest, null, 2)}\n`);
  await writeFile(stagePayloadPath, `${JSON.stringify(stagePayload, null, 2)}\n`);
  await (await import("../scripts/pack-sew.mjs")).packSew({ packageRoot: stageRoot, releaseRoot });
  await assert.doesNotReject(checkSewRelease(`sew-v${stageManifest.version}`, { root: ROOT, stageRoot, releaseRoot, sourceCommit }));
  stageManifest.sourceCommit = "b".repeat(40);
  stagePayload.sourceCommit = stageManifest.sourceCommit;
  await writeFile(stageManifestPath, `${JSON.stringify(stageManifest, null, 2)}\n`);
  await writeFile(stagePayloadPath, `${JSON.stringify(stagePayload, null, 2)}\n`);
  await assert.rejects(checkSewRelease(`sew-v${stageManifest.version}`, { root: ROOT, stageRoot, releaseRoot, sourceCommit: stageManifest.sourceCommit }), /release tarball package manifest does not match/u);
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

test("release workflow gates the package build on the full validation matrix", async () => {
  const release = await readFile(path.join(ROOT, ".github", "workflows", "release-sew.yml"), "utf8");
  const reusable = await readFile(path.join(ROOT, ".github", "workflows", "validate-reusable.yml"), "utf8");
  assert.match(release, /validation:\s*[\s\S]*uses:\s+\.\/\.github\/workflows\/validate-reusable\.yml/u);
  assert.match(release, /build:\s*[\s\S]*needs:\s+validation/u);
  assert.match(release, /SEW_SOURCE_COMMIT:\s*\$\{\{ github\.sha \}\}/u);
  assert.match(release, /git rev-parse HEAD/u);
  assert.match(release, /Upload the immutable candidate tarball/u);
  assert.match(release, /smoke:[\s\S]*needs: build/u);
  assert.match(release, /os:\s*\[ubuntu-latest, macos-latest, windows-latest\]/u);
  assert.match(release, /node:\s*\[22, 24\]/u);
  assert.match(release, /scripts\/smoke-sew-release\.mjs/u);
  assert.match(release, /release:\s*[\s\S]*needs: smoke/u);
  assert.match(release, /npm publish "\$\{tarballs\[0\]\}" --access public --provenance/u);
  assert.match(reusable, /workflow_call/u);
  assert.match(reusable, /ref:\s*\$\{\{ github\.sha \}\}/u);
  assert.match(reusable, /os:\s*\[ubuntu-latest, macos-latest, windows-latest\]/u);
  assert.match(reusable, /node:\s*\[22, 24\]/u);
});

test("reusable validation pins the released checkout commit", async () => {
  const reusable = await readFile(path.join(ROOT, ".github", "workflows", "validate-reusable.yml"), "utf8");
  const checkout = reusable.match(/uses:\s*actions\/checkout@([a-f0-9]+)/u)?.[1];
  assert.equal(checkout, "d23441a48e516b6c34aea4fa41551a30e30af803");
  assert.equal(checkout.length, 40);
  for (const sha of reusable.matchAll(/uses:\s*[^@\s]+@([a-f0-9]+)/gu)) assert.equal(sha[1].length, 40);
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
  const helper = path.join(packageRoot, "scripts", "helper.sh");
  await mkdir(path.dirname(helper), { recursive: true });
  await writeFile(helper, "#!/bin/sh\necho helper\n");
  if (process.platform !== "win32") await chmod(helper, 0o755);
  await writeFile(path.join(packageRoot, "README.md"), "test\n");
  await writeFile(path.join(packageRoot, "说明.md"), "unicode payload\n");
  const longDirectory = path.join(packageRoot, "nested", "a".repeat(130));
  await mkdir(longDirectory, { recursive: true });
  await writeFile(path.join(longDirectory, "long-name.txt"), "long payload\n");

  const first = path.join(temp, "first.tgz");
  const second = path.join(temp, "second.tgz");
  await createDeterministicNpmTarball({ packageRoot, outputFile: first });
  await createDeterministicNpmTarball({ packageRoot, outputFile: second });
  const [firstBytes, secondBytes] = await Promise.all([readFile(first), readFile(second)]);
  assert.deepEqual(firstBytes, secondBytes);

  const entries = readTarEntriesFromGzip(firstBytes);
  const bin = entries.find((entry) => entry.path === "package/bin/sew.mjs");
  const readme = entries.find((entry) => entry.path === "package/README.md");
  const unicode = entries.find((entry) => entry.path === "package/说明.md");
  const longName = entries.find((entry) => entry.path === `package/nested/${"a".repeat(130)}/long-name.txt`);
  const helperEntry = entries.find((entry) => entry.path === "package/scripts/helper.sh");
  assert.equal(bin?.mode, 0o755);
  assert.equal(readme?.mode, 0o644);
  assert.equal(unicode?.size, Buffer.byteLength("unicode payload\n"));
  assert.equal(longName?.size, Buffer.byteLength("long payload\n"));
  assert.equal(helperEntry?.mode, process.platform === "win32" ? 0o644 : 0o755);
  assert.equal(firstBytes[9], 255, "gzip OS byte must be normalized");

  try {
    const extraction = path.join(temp, "extracted");
    await mkdir(extraction, { recursive: true });
    await execFileAsync("tar", ["-xzf", first, "-C", extraction]);
    assert.equal(await readFile(path.join(extraction, "package", "nested", "a".repeat(130), "long-name.txt"), "utf8"), "long payload\n");
    if (process.platform !== "win32") assert.equal(await readFile(path.join(extraction, "package", "说明.md"), "utf8"), "unicode payload\n");
    const extractedHelper = await stat(path.join(extraction, "package", "scripts", "helper.sh"));
    assert.equal(extractedHelper.mode & 0o111, process.platform === "win32" ? 0 : 0o111);
    const findPayload = async (directory) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          const found = await findPayload(absolute);
          if (found) return found;
        } else if (entry.isFile() && (await readFile(absolute, "utf8")) === "unicode payload\n") return absolute;
      }
      return null;
    };
    assert.ok(await findPayload(path.join(extraction, "package")), "independent extraction must preserve the Unicode payload");
  } catch (error) {
    if (error?.code === "ENOENT") t.skip("independent tar executable unavailable");
    else throw error;
  }
});
