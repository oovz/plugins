#!/usr/bin/env node
// SEW release version alignment
import { assertSewReleaseVersionAlignment } from "./lib/sew-release-version.mjs";
await assertSewReleaseVersionAlignment({ requireStaged: true });

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(file) {
  try { await lstat(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

export async function checkSewRelease(tag, options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const sourceRoot = path.join(root, "packages", "sew");
  const stageRoot = path.join(root, "release-build", "sew", "package");
  const releaseRoot = path.join(root, "release-build", "sew", "artifacts");
  const source = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8"));
  const expectedTag = `sew-v${source.version}`;
  if (tag !== expectedTag) throw new Error(`Release tag ${tag} does not match package version ${source.version}; expected ${expectedTag}.`);
  if (source.private !== true) throw new Error("packages/sew must remain a private source workspace.");
  for (const generated of ["payloads", "templates"]) {
    if (await exists(path.join(sourceRoot, generated))) throw new Error(`Committed package source must not contain ${generated}/.`);
  }

  const staged = JSON.parse(await readFile(path.join(stageRoot, "package.json"), "utf8"));
  if (staged.name !== "@oovz/sew" || staged.version !== source.version || staged.private !== undefined || staged.publishConfig?.access !== "public") {
    throw new Error("The staged npm package manifest does not match the private source package.");
  }
  const payload = JSON.parse(await readFile(path.join(stageRoot, "payloads", "manifest.json"), "utf8"));
  const expectedStaticHosts = ["codex", "opencode", "gemini-cli", "antigravity"];
  if (payload.schemaVersion !== 2 || payload.packageVersion !== source.version || payload.package !== source.name ||
      JSON.stringify(payload.staticHosts) !== JSON.stringify(expectedStaticHosts)) {
    throw new Error("The staged payload manifest does not match the package version or static host set.");
  }

  const releaseFiles = await readdir(releaseRoot);
  const tarballs = releaseFiles.filter((name) => name.endsWith(".tgz"));
  const expectedTarball = `oovz-sew-${source.version}.tgz`;
  if (tarballs.length !== 1 || tarballs[0] !== expectedTarball || releaseFiles.length !== 2 || !releaseFiles.includes("SHA256SUMS.txt")) {
    throw new Error(`release-build/sew/artifacts must contain only ${expectedTarball} and SHA256SUMS.txt.`);
  }
  const tarball = path.join(releaseRoot, expectedTarball);
  const checksum = path.join(releaseRoot, "SHA256SUMS.txt");
  const digest = createHash("sha256").update(await readFile(tarball)).digest("hex");
  if (await readFile(checksum, "utf8") !== `${digest}  ${expectedTarball}\n`) throw new Error("SHA256SUMS.txt does not match the release tarball.");
  return { tag, version: source.version, tarball, checksum, digest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2];
  if (!tag) {
    process.stderr.write("usage: node scripts/check-sew-release.mjs sew-v<version>\n");
    process.exitCode = 2;
  } else {
    checkSewRelease(tag).then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch((error) => {
      process.stderr.write(`error: ${error.message}\n`);
      process.exitCode = 1;
    });
  }
}
