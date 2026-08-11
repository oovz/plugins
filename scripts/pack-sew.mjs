#!/usr/bin/env node
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeterministicNpmTarball } from "./lib/deterministic-npm-tar.mjs";
import { SEW_STAGE_ROOT, assertSewReleaseVersionAlignment } from "./lib/sew-release-version.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const DEFAULT_RELEASE_ROOT = path.join(REPO_ROOT, "release-build", "sew", "artifacts");

export async function packSew(options = {}) {
  const releaseRoot = path.resolve(options.releaseRoot ?? DEFAULT_RELEASE_ROOT);
  const packageRoot = path.resolve(options.packageRoot ?? SEW_STAGE_ROOT);
  const { stagedManifest } = await assertSewReleaseVersionAlignment({ requireStaged: true });
  const safeName = stagedManifest.name.replace(/^@/, "").replaceAll("/", "-");
  const tarballName = `${safeName}-${stagedManifest.version}.tgz`;
  const tarballPath = path.join(releaseRoot, tarballName);

  await rm(releaseRoot, { recursive: true, force: true });
  const result = await createDeterministicNpmTarball({ packageRoot, outputFile: tarballPath });
  const checksumLine = `${result.sha256}  ${tarballName}\n`;
  const checksumFile = path.join(releaseRoot, "SHA256SUMS.txt");
  await writeFile(checksumFile, checksumLine, "utf8");

  return {
    tarball: tarballPath,
    checksumFile,
    sha256: result.sha256,
    packageName: result.packageName,
    version: result.version,
    files: result.files,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packSew().then((result) => {
    console.log(`packed ${result.packageName} ${result.version}`);
    console.log(`tarball: ${path.relative(REPO_ROOT, result.tarball)}`);
    console.log(`sha256: ${result.sha256}`);
    console.log(`files: ${result.files.length}`);
  }).catch((error) => {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
