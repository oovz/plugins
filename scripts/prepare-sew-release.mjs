#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { prepareSewRelease } from "./lib/sew-release-metadata.mjs";

async function main(args) {
  const [tag, repository, releasesFile, versionsFile, outputDirectory] = args;
  if (args.length !== 5) throw new Error("usage: node scripts/prepare-sew-release.mjs <tag> <owner/repo> <releases.json> <npm-versions.json> <output-directory>");
  const releases = JSON.parse(await readFile(releasesFile, "utf8"));
  const versions = JSON.parse(await readFile(versionsFile, "utf8"));
  const { plan, body } = await prepareSewRelease({
    root: process.cwd(), tag, repository,
    releases: releases.flat(),
    publishedVersions: typeof versions === "string" ? [versions] : versions,
    sourceCommit: process.env.SEW_SOURCE_COMMIT,
  });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "notes.md"), body);
  await writeFile(path.join(outputDirectory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, [
      `version=${plan.version}`, `npm_tag=${plan.npmTag}`,
      `make_latest=${plan.makeLatest}`, `prerelease=${plan.prerelease}`,
      `source_commit=${plan.sourceCommit}`, "",
    ].join("\n"));
  }
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
