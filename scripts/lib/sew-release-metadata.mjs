import { compare, prerelease } from "semver";
import { SEMVER_PATTERN } from "./marketplace.mjs";
import { gitOutput, previousReleaseTag, publishedReleases, releaseSource, renderReleaseNotes, versionFromTag } from "./release-metadata.mjs";

export const SEW_CLI_TAG_PREFIX = "sew-cli-v";
const LEGACY_TAG_PREFIX = "sew-v";

export function isLegacySewCliRelease(release) {
  const version = versionFromTag(release.tag_name, LEGACY_TAG_PREFIX);
  return version !== null && (release.assets ?? []).some((asset) => asset.name === `oovz-sew-${version}.tgz`);
}

export function planSewRelease({ tag, releases, publishedVersions }) {
  if (!Array.isArray(releases) || !Array.isArray(publishedVersions)
    || publishedVersions.some((value) => typeof value !== "string" || !SEMVER_PATTERN.test(value))) {
    throw new Error("Release planning requires a GitHub release list and valid npm versions.");
  }
  const legacy = publishedReleases(releases.filter(isLegacySewCliRelease), LEGACY_TAG_PREFIX);
  const version = versionFromTag(tag, SEW_CLI_TAG_PREFIX) ?? legacy.find((release) => release.tag === tag)?.version;
  if (!version) throw new Error(`Invalid SEW CLI release tag: ${tag}`);
  const isPrerelease = prerelease(version) !== null;
  const published = [...publishedReleases(releases, SEW_CLI_TAG_PREFIX), ...legacy];
  const newerNpmVersion = publishedVersions.some((candidate) => prerelease(candidate) === null && compare(candidate, version) > 0);
  const newerGitHubRelease = published.some((release) => !release.prerelease && compare(release.version, version) > 0);
  return {
    tag,
    version,
    previousTag: previousReleaseTag(published, version),
    npmTag: !isPrerelease && !newerNpmVersion ? "latest" : `release-${version}`,
    makeLatest: !isPrerelease && !newerGitHubRelease,
    prerelease: isPrerelease,
  };
}

export function assertSewPromotion(plan, publishedPackage) {
  const version = versionFromTag(plan.tag, SEW_CLI_TAG_PREFIX) ?? versionFromTag(plan.tag, LEGACY_TAG_PREFIX);
  if (!version || version !== plan.version || prerelease(version) !== null || plan.npmTag !== "latest") {
    throw new Error("Only the newest published stable SEW version may be promoted to npm latest.");
  }
  if (!/^[a-f0-9]{40}$/u.test(plan.sourceCommit ?? "")
    || publishedPackage.name !== "@oovz/sew"
    || publishedPackage.version !== plan.version
    || publishedPackage.roleSourceVersion !== plan.version
    || publishedPackage.sourceCommit !== plan.sourceCommit) {
    throw new Error("Published npm package identity does not match the selected release tag.");
  }
  return `@oovz/sew@${plan.version}`;
}

export async function prepareSewRelease({ root, tag, repository, releases, publishedVersions, sourceCommit }) {
  const plan = planSewRelease({ tag, releases, publishedVersions });
  const target = await releaseSource(root, tag, sourceCommit);
  const manifest = JSON.parse(await gitOutput(root, "show", `${target}:tools/sew/package.json`));
  if (manifest.name !== "@oovz/sew" || manifest.version !== plan.version) {
    throw new Error(`Release tag ${tag} does not match its source package version ${manifest.version}.`);
  }
  const body = await renderReleaseNotes({ root, tag, repository, target, previousTag: plan.previousTag });
  return { plan: { ...plan, sourceCommit: target }, body };
}
