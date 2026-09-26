import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "extension-build-selection-"));
  const firefox = path.join(root, ".output", "firefox-mv2");
  const chrome = path.join(root, ".output", "chrome-mv3");
  await mkdir(firefox, { recursive: true });
  await mkdir(chrome, { recursive: true });
  await writeFile(path.join(firefox, "manifest.json"), JSON.stringify({ manifest_version: 2, name: "Firefox build", browser_specific_settings: { gecko: { id: "test@example.com" } } }));
  await writeFile(path.join(chrome, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "Chrome build", action: { default_title: "Test" }, background: { service_worker: "background.js" } }));
  await utimes(path.join(firefox, "manifest.json"), new Date("2026-09-09T12:00:00Z"), new Date("2026-09-09T12:00:00Z"));
  await utimes(path.join(chrome, "manifest.json"), new Date("2026-09-09T10:00:00Z"), new Date("2026-09-09T10:00:00Z"));
  return { root, firefox, chrome };
}

for (const script of [
  "skills/chrome-extension-test/scripts/find-extension-build.mjs",
  "skills/wxt-extension-test/scripts/find-extension-build.mjs",
]) {
  test(`${script} identifies MV2-only output as incompatible with current Chrome`, async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "extension-mv2-selection-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const outputDirectory = path.join(root, "dist");
    await mkdir(outputDirectory);
    await writeFile(path.join(outputDirectory, "manifest.json"), JSON.stringify({ manifest_version: 2, name: "Old Chrome build" }));

    const result = spawnSync(process.execPath, [path.join(ROOT, script), root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.recommendation, "no-compatible-chrome-build");
    assert.equal(output.recommended.compatible, false);
    assert.equal(output.recommended.manifestVersion, 2);
  });

  test(`${script} prefers a compatible Chrome build over a newer Firefox build`, async (t) => {
    const { root, chrome } = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [path.join(ROOT, script), root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.recommended.relativePath, path.relative(root, chrome).split(path.sep).join("/"));
    assert.equal(output.recommended.browser, "chrome");
    assert.equal(output.recommendation, "compatible-build");
    assert.equal(output.candidates.find((candidate) => candidate.browser === "firefox").compatible, false);
  });

  for (const metadataKey of ["browser_specific_settings", "applications"]) {
    test(`${script} accepts shared MV3 Chrome manifests with ${metadataKey}`, async (t) => {
      const { root, chrome } = await fixture();
      t.after(() => rm(root, { recursive: true, force: true }));
      await writeFile(path.join(chrome, "manifest.json"), JSON.stringify({
        manifest_version: 3,
        name: "Shared Chrome build",
        version: "1.0.0",
        [metadataKey]: { gecko: { id: "test@example.com" } },
      }));

      const result = spawnSync(process.execPath, [path.join(ROOT, script), root], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      assert.equal(output.recommendation, "compatible-build");
      assert.equal(output.recommended.relativePath, ".output/chrome-mv3");
      assert.equal(output.recommended.browser, "chrome");
      assert.equal(output.recommended.compatible, true);
    });
  }

  test(`${script} keeps an explicit Firefox MV3 target incompatible with Chrome`, async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "extension-firefox-mv3-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const firefox = path.join(root, ".output", "firefox-mv3");
    await mkdir(firefox, { recursive: true });
    await writeFile(path.join(firefox, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "Firefox build", version: "1.0.0" }));

    const result = spawnSync(process.execPath, [path.join(ROOT, script), root, "--output", ".output/firefox-mv3"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.recommendation, "explicit-output");
    assert.equal(output.recommended.browser, "firefox");
    assert.equal(output.recommended.compatible, false);
  });

  test(`${script} selects the requested directory over a newer nested extension`, async (t) => {
    const { root, chrome } = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const nested = path.join(chrome, "fixtures");
    await mkdir(nested);
    await writeFile(path.join(nested, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "Nested extension", version: "1.0.0" }));
    await utimes(path.join(nested, "manifest.json"), new Date("2026-09-10T12:00:00Z"), new Date("2026-09-10T12:00:00Z"));

    const result = spawnSync(process.execPath, [path.join(ROOT, script), root, "--output", ".output/chrome-mv3"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.recommendation, "explicit-output");
    assert.equal(output.recommended.relativePath, ".output/chrome-mv3");
    assert.equal(output.recommended.name, "Chrome build");
    assert.equal(output.candidates.filter((candidate) => candidate.explicitlySelected).length, 1);
  });

  for (const manifestState of ["missing", "invalid"]) {
    test(`${script} rejects an explicit directory whose manifest is ${manifestState} despite a valid descendant`, async (t) => {
      const { root } = await fixture();
      t.after(() => rm(root, { recursive: true, force: true }));
      if (manifestState === "invalid") await writeFile(path.join(root, ".output", "manifest.json"), "{invalid");

      const result = spawnSync(process.execPath, [path.join(ROOT, script), root, "--output", ".output"], { encoding: "utf8" });
      assert.equal(result.status, 2, result.stderr);
      const output = JSON.parse(result.stdout);
      assert.equal(output.recommendation, "requested-output-not-found");
      assert.equal(output.recommended, null);
      assert.equal(output.requestedOutput, path.join(root, ".output"));
    });
  }

  test(`${script} honors an explicitly selected manifest file`, async (t) => {
    const { root, chrome } = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [path.join(ROOT, script), root, "--output", ".output/chrome-mv3/manifest.json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.recommendation, "explicit-output");
    assert.equal(output.recommended.path, chrome);
    assert.equal(output.recommended.explicitlySelected, true);
  });

  test(`${script} honors an explicitly selected output directory`, async (t) => {
    const { root, firefox } = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [path.join(ROOT, script), root, "--output", path.relative(root, firefox)], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.recommended.relativePath, path.relative(root, firefox).split(path.sep).join("/"));
    assert.equal(output.recommendation, "explicit-output");
  });

  test(`${script} discovers an explicitly selected custom output root`, async (t) => {
    const { root } = await fixture();
    const custom = path.join(root, "artifacts", "custom-chrome");
    await mkdir(custom, { recursive: true });
    await writeFile(path.join(custom, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "Custom Chrome build" }));
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [path.join(ROOT, script), root, "--output", path.relative(root, custom)], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.recommended.relativePath, path.relative(root, custom).split(path.sep).join("/"));
    assert.equal(output.recommendation, "explicit-output");
  });

  test(`${script} fails closed when an explicit output is missing`, async (t) => {
    const { root } = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const requested = path.join("artifacts", "does-not-exist");
    const result = spawnSync(process.execPath, [path.join(ROOT, script), root, "--output", requested], { encoding: "utf8" });
    assert.equal(result.status, 2);
    const output = JSON.parse(result.stdout);
    assert.equal(output.recommendation, "requested-output-not-found");
    assert.equal(output.recommended, null);
    assert.equal(output.requestedOutput, path.resolve(root, requested));
  });
}
