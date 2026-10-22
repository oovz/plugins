import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, cp, readFile, writeFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import crossSpawn from "cross-spawn";
import {
  createDeterministicNpmTarball,
  readTarEntriesFromGzip,
} from "../scripts/lib/deterministic-npm-tar.mjs";
import { buildSewPackage } from "../scripts/build-sew-package.mjs";
import { checkSewRelease } from "../scripts/check-sew-release.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const execFileAsync = promisify(execFile);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

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

  const installRoot = path.join(temp, "installed");
  const installed = crossSpawn.sync("npm", [
    "install", "--prefix", installRoot, "--ignore-scripts", "--offline",
    "--no-audit", "--no-fund", first,
  ], {
    cwd: temp,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, NPM_CONFIG_CACHE: path.join(temp, "npm-cache") },
  });
  if (installed.error) throw installed.error;
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  const installedPackage = path.join(installRoot, "node_modules", "@oovz", "sew-test");
  assert.equal(await readFile(path.join(installedPackage, "说明.md"), "utf8"), "unicode payload\n");
  assert.equal(await readFile(path.join(installedPackage, "nested", "a".repeat(130), "long-name.txt"), "utf8"), "long payload\n");
  assert.equal(await readFile(path.join(installedPackage, "scripts", "helper.sh"), "utf8"), "#!/bin/sh\necho helper\n");
  assert.equal((await execFileAsync(process.execPath, [path.join(installedPackage, "bin", "sew.mjs")])).stdout.trim(), "ok");

  // Windows bsdtar can reject valid Unicode names during code-page conversion:
  // https://github.com/libarchive/libarchive/pull/3696
  // npm installation above checks the actual consumer on every platform.
  await t.test("system tar preserves paths and executable modes", { skip: process.platform === "win32" }, async (t) => {
    const extraction = path.join(temp, "extracted");
    await mkdir(extraction, { recursive: true });
    try {
      await execFileAsync("tar", ["-xzf", first, "-C", extraction]);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      t.skip("independent tar executable unavailable");
      return;
    }
    assert.equal(await readFile(path.join(extraction, "package", "nested", "a".repeat(130), "long-name.txt"), "utf8"), "long payload\n");
    assert.equal(await readFile(path.join(extraction, "package", "说明.md"), "utf8"), "unicode payload\n");
    const extractedHelper = await stat(path.join(extraction, "package", "scripts", "helper.sh"));
    assert.equal(extractedHelper.mode & 0o111, 0o111);
  });
});
