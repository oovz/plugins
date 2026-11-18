#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { prerelease } from "semver";
import { json, validatePluginManifest } from "./lib/marketplace.mjs";
import { gitOutput, previousReleaseTag, publishedReleases, releaseSource, renderReleaseNotes, versionFromTag } from "./lib/release-metadata.mjs";
import { isLegacySewCliRelease } from "./lib/sew-release-metadata.mjs";

const PLUGINS_BY_PREFIX = new Map([
  ["sew", "senior-engineering-workflow"],
  ["tauri", "tauri-v2-desktop"],
  ["ced", "chrome-extension-debugger"],
]);

async function main(args) {
  const [tag, repository, releasesFile, outputDirectory] = args;
  if (args.length !== 4) throw new Error("usage: node scripts/prepare-plugin-release.mjs <tag> <owner/repo> <releases.json> <output-directory>");
  const [abbreviation] = tag.split("-v", 1);
  const pluginId = PLUGINS_BY_PREFIX.get(abbreviation);
  const prefix = `${abbreviation}-v`;
  const version = versionFromTag(tag, prefix);
  if (!pluginId || !version) {
    const formats = [...PLUGINS_BY_PREFIX.keys()].map((key) => `${key}-v<version>`).join(", ");
    throw new Error(`Invalid plugin release tag ${tag}. Use one of ${formats}.`);
  }

  const root = process.cwd();
  const target = await releaseSource(root, tag, process.env.PLUGIN_SOURCE_COMMIT);
  const catalog = JSON.parse(await gitOutput(root, "show", `${target}:marketplace.json`));
  if (!catalog.plugins.includes(pluginId)) throw new Error(`Plugin ${pluginId} is not cataloged at ${tag}.`);

  const pluginPath = `plugins/${pluginId}`;
  const manifest = JSON.parse(await gitOutput(root, "show", `${target}:${pluginPath}/manifest.json`));
  validatePluginManifest(manifest, pluginId);
  if (manifest.version !== version) {
    throw new Error(`Release tag ${tag} does not match its plugin manifest version ${manifest.version}.`);
  }

  const releases = JSON.parse(await readFile(releasesFile, "utf8")).flat();
  const previousTag = previousReleaseTag(publishedReleases(releases.filter((release) => !isLegacySewCliRelease(release)), prefix), version);
  const paths = [
    pluginPath,
    ...manifest.components.skills.map((id) => `skills/${id}`),
    `:(glob)adapters/*/${pluginId}/**`,
  ];
  const notes = await renderReleaseNotes({ root, tag, repository, target, previousTag, paths });
  const install = `[Installation guide](https://github.com/${repository}/blob/${target}/README.md#install-plugins-and-skills)`;
  const plan = {
    tag, pluginId, version, previousTag, sourceCommit: target,
    title: `${manifest.displayName} ${version}`,
    prerelease: prerelease(version) !== null,
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "notes.md"), `${install}\n\n${notes}`);
  await writeFile(path.join(outputDirectory, "plan.json"), json(plan));
  process.stdout.write(json(plan));
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`error: ${error.message}\n`);
  process.exitCode = 1;
});
