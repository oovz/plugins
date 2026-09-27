#!/usr/bin/env node
// SEW release version alignment
import { assertSewReleaseVersionAlignment } from "./lib/sew-release-version.mjs";
await assertSewReleaseVersionAlignment({ requireStaged: true });

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readTarEntriesFromGzip } from "./lib/deterministic-npm-tar.mjs";


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_HOSTS = ["claude-code", "codex", "opencode", "cursor", "gemini-cli", "antigravity", "oh-my-pi"];
const CONFIG_FILES = Object.fromEntries(CONFIG_HOSTS.map((host) => [host, ["researcher", "engineer", "verifier"].map((role) => `agents/senior-engineering-workflow-${role}.${host === "codex" ? "toml" : "md"}`)]));

function roleDigest(hostFiles) {
  const hash = createHash("sha256");
  const allFiles = Object.entries(hostFiles).flatMap(([host, files]) => files.map((file) => ({ host, ...file })));
  for (const file of allFiles.sort((left, right) => `${left.host}/${left.path}`.localeCompare(`${right.host}/${right.path}`))) {
    hash.update(`${file.host}/${file.path}`);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function exists(file) {
  try { await lstat(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

export async function checkSewRelease(tag, options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const sourceRoot = path.resolve(options.sourceRoot ?? path.join(root, "tools", "sew"));
  const stageRoot = path.resolve(options.stageRoot ?? path.join(root, "release-build", "sew", "package"));
  const releaseRoot = path.resolve(options.releaseRoot ?? path.join(root, "release-build", "sew", "artifacts"));
  const source = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8"));
  const expectedTag = `sew-v${source.version}`;
  if (tag !== expectedTag) throw new Error(`Release tag ${tag} does not match package version ${source.version}; expected ${expectedTag}.`);
  if (source.private !== true) throw new Error("tools/sew must remain a private source workspace.");
  for (const generated of ["payloads", "templates"]) {
    if (await exists(path.join(sourceRoot, generated))) throw new Error(`Committed package source must not contain ${generated}/.`);
  }

  const staged = JSON.parse(await readFile(path.join(stageRoot, "package.json"), "utf8"));
  if (staged.name !== "@oovz/sew" || staged.version !== source.version || staged.private !== undefined || staged.publishConfig?.access !== "public") {
    throw new Error("The staged npm package manifest does not match the private source package.");
  }
  if (!/^[a-f0-9]{40}$/iu.test(staged.sourceCommit ?? "")) {
    throw new Error("The staged npm package must bind the release to a 40-character sourceCommit SHA.");
  }
  const expectedSourceCommit = options.sourceCommit ?? process.env.SEW_SOURCE_COMMIT ?? process.env.GITHUB_SHA;
  if (expectedSourceCommit !== undefined && expectedSourceCommit !== null && expectedSourceCommit !== "") {
    if (!/^[a-f0-9]{40}$/iu.test(String(expectedSourceCommit))) throw new Error("The expected release source commit must be a 40-character Git commit SHA.");
    if (staged.sourceCommit.toLowerCase() !== String(expectedSourceCommit).toLowerCase()) {
      throw new Error(`The staged sourceCommit ${staged.sourceCommit} does not match the checked-out release commit ${expectedSourceCommit}.`);
    }
  }
  const payload = JSON.parse(await readFile(path.join(stageRoot, "payloads", "manifest.json"), "utf8"));
  const expectedHosts = ["claude-code", "codex", "opencode", "cursor", "gemini-cli", "antigravity", "oh-my-pi"];
  if (payload.schemaVersion !== 1 || payload.packageVersion !== source.version || payload.package !== source.name ||
      payload.roleSourceVersion !== staged.roleSourceVersion || JSON.stringify(Object.keys(payload.hosts ?? {})) !== JSON.stringify(expectedHosts)) {
    throw new Error("The staged configuration manifest does not match the package version or host set.");
  }
  if (!/^[a-f0-9]{64}$/iu.test(payload.roleDigest ?? "")) throw new Error("The staged configuration manifest must bind a 64-character role digest.");
  if (payload.sourceCommit !== staged.sourceCommit) throw new Error("The staged payload manifest sourceCommit does not match the package sourceCommit.");

  const releaseFiles = await readdir(releaseRoot);
  const tarballs = releaseFiles.filter((name) => name.endsWith(".tgz"));
  const expectedTarball = `oovz-sew-${source.version}.tgz`;
  if (tarballs.length !== 1 || tarballs[0] !== expectedTarball || releaseFiles.length !== 2 || !releaseFiles.includes("SHA256SUMS.txt")) {
    throw new Error(`release-build/sew/artifacts must contain only ${expectedTarball} and SHA256SUMS.txt.`);
  }
  const tarball = path.join(releaseRoot, expectedTarball);
  const checksum = path.join(releaseRoot, "SHA256SUMS.txt");
  const tarballBytes = await readFile(tarball);
  const digest = createHash("sha256").update(tarballBytes).digest("hex");
  if (await readFile(checksum, "utf8") !== `${digest}  ${expectedTarball}\n`) throw new Error("SHA256SUMS.txt does not match the release tarball.");
  const entries = readTarEntriesFromGzip(tarballBytes);
  const archiveJson = (entryPath, label) => {
    const matches = entries.filter((entry) => entry.path === entryPath);
    if (matches.length !== 1) throw new Error(`The release tarball must contain exactly one ${label} at ${entryPath}.`);
    try { return JSON.parse(matches[0].content.toString("utf8")); }
    catch (error) { throw new Error(`The release tarball ${label} is invalid: ${error.message}`); }
  };
  const packedManifest = archiveJson("package/package.json", "package manifest");
  const packedPayload = archiveJson("package/payloads/manifest.json", "payload manifest");
  if (packedManifest.name !== staged.name || packedManifest.version !== staged.version || packedManifest.sourceCommit !== staged.sourceCommit || packedManifest.roleSourceVersion !== staged.roleSourceVersion) {
    throw new Error("The release tarball package manifest does not match the staged package identity.");
  }
  if (packedPayload.package !== payload.package || packedPayload.packageVersion !== payload.packageVersion || packedPayload.roleSourceVersion !== payload.roleSourceVersion || packedPayload.sourceCommit !== payload.sourceCommit || packedPayload.roleDigest !== payload.roleDigest || JSON.stringify(packedPayload.hosts) !== JSON.stringify(payload.hosts)) {
    throw new Error("The release tarball payload manifest does not match the staged payload identity.");
  }
  for (const host of CONFIG_HOSTS) {
    if (JSON.stringify(payload.hosts[host]) !== JSON.stringify(CONFIG_FILES[host])) throw new Error(`The staged ${host} role-file list is invalid.`);
  }
  const expectedRoleEntries = CONFIG_HOSTS.flatMap((host) => CONFIG_FILES[host].map((file) => ({ host, path: `package/payloads/config/${host}/${file}` })));
  const actualRoleEntries = entries.filter((entry) => entry.path.startsWith("package/payloads/config/"));
  if (actualRoleEntries.length !== expectedRoleEntries.length) throw new Error("The release tarball does not contain exactly three role files for each host.");
  const hostFiles = Object.fromEntries(CONFIG_HOSTS.map((host) => [host, []]));
  for (const expected of expectedRoleEntries) {
    const matches = entries.filter((entry) => entry.path === expected.path);
    if (matches.length !== 1) throw new Error(`The release tarball must contain exactly one role file at ${expected.path}.`);
    hostFiles[expected.host].push({ path: expected.path.slice(`package/payloads/config/${expected.host}/`.length), content: matches[0].content });
  }
  if (roleDigest(hostFiles) !== payload.roleDigest) throw new Error("The released role files do not match the staged role digest.");
  const payloadEntries = entries.filter((entry) => entry.path.startsWith("package/payloads/")).map((entry) => entry.path);
  if (payloadEntries.some((entry) => !entry.startsWith("package/payloads/config/") && entry !== "package/payloads/manifest.json")) throw new Error("The release tarball contains files outside the configuration payload.");
  return { tag, version: source.version, sourceCommit: staged.sourceCommit, tarball, checksum, digest };
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
