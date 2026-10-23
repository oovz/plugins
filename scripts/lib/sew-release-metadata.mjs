import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { compare, prerelease } from "semver";
import { SEMVER_PATTERN } from "./marketplace.mjs";

const execFileAsync = promisify(execFile);

function versionFromTag(tag) {
  if (typeof tag !== "string" || !tag.startsWith("sew-v")) return null;
  const version = tag.slice("sew-v".length);
  return SEMVER_PATTERN.test(version) ? version : null;
}

export function planSewRelease({ tag, releases, publishedVersions }) {
  const version = versionFromTag(tag);
  if (!version) throw new Error(`Invalid SEW release tag: ${tag}`);
  if (!Array.isArray(releases) || !Array.isArray(publishedVersions)
    || publishedVersions.some((value) => typeof value !== "string" || !SEMVER_PATTERN.test(value))) {
    throw new Error("Release planning requires a GitHub release list and valid npm versions.");
  }
  const isPrerelease = prerelease(version) !== null;
  const published = releases.flatMap((release) => {
    const candidate = versionFromTag(release.tag_name);
    if (!candidate || release.draft || !release.published_at) return [];
    return [{ tag: release.tag_name, version: candidate, prerelease: Boolean(release.prerelease) || prerelease(candidate) !== null }];
  });
  const previous = published
    .filter((release) => compare(release.version, version) < 0 && (isPrerelease || !release.prerelease))
    .sort((left, right) => compare(right.version, left.version))[0];
  const newerNpmVersion = publishedVersions.some((candidate) => prerelease(candidate) === null && compare(candidate, version) > 0);
  const newerGitHubRelease = published.some((release) => !release.prerelease && compare(release.version, version) > 0);
  return {
    tag,
    version,
    previousTag: previous?.tag ?? null,
    npmTag: !isPrerelease && !newerNpmVersion ? "latest" : `release-${version}`,
    makeLatest: !isPrerelease && !newerGitHubRelease,
    prerelease: isPrerelease,
  };
}

export function assertSewPromotion(plan, publishedPackage) {
  if (versionFromTag(plan.tag) !== plan.version || prerelease(plan.version) !== null || plan.npmTag !== "latest") {
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

function escapeMarkdown(value) {
  return value.replace(/[\\`*_{}\[\]()<>!]/gu, "\\$&");
}

export async function prepareSewRelease({ root, tag, repository, releases, publishedVersions, sourceCommit }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error("repository must be owner/name");
  const plan = planSewRelease({ tag, releases, publishedVersions });
  const git = async (...args) => (await execFileAsync("git", args, { cwd: root, encoding: "utf8" })).stdout;
  const target = (await git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`)).trim();
  if (sourceCommit !== undefined && sourceCommit !== target) {
    throw new Error(`Release tag ${tag} resolves to ${target}, not expected source ${sourceCommit}.`);
  }
  const manifest = JSON.parse(await git("show", `${target}:tools/sew/package.json`));
  if (manifest.name !== "@oovz/sew" || manifest.version !== plan.version) {
    throw new Error(`Release tag ${tag} does not match its source package version ${manifest.version}.`);
  }
  const previous = plan.previousTag
    ? (await git("rev-parse", "--verify", `refs/tags/${plan.previousTag}^{commit}`)).trim()
    : null;
  const history = await git("log", "--reverse", "--format=%H %s", previous ? `${previous}..${target}` : target, "--");
  const baseUrl = `https://github.com/${repository}`;
  const commits = history.trimEnd().split("\n").filter(Boolean).map((line) => {
    const hash = line.slice(0, 40);
    const subject = line.slice(41);
    return `- [\`${hash.slice(0, 7)}\`](${baseUrl}/commit/${hash}) ${escapeMarkdown(subject)}`;
  });
  const body = [
    `Source: [\`${target.slice(0, 7)}\`](${baseUrl}/commit/${target}) · Tag: \`${tag}\``,
    "",
    plan.previousTag ? `Commits since \`${plan.previousTag}\`:` : "Commits included in this first release:",
    "",
    ...(commits.length ? commits : ["No additional commits in this release range."]),
    "",
    plan.previousTag
      ? `**Full Changelog**: ${baseUrl}/compare/${plan.previousTag}...${tag}`
      : `**History**: ${baseUrl}/commits/${tag}`,
    "",
  ].join("\n");
  return { plan: { ...plan, sourceCommit: target }, body };
}
