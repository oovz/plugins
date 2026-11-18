import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { compare, prerelease } from "semver";
import { SEMVER_PATTERN } from "./marketplace.mjs";

const execFileAsync = promisify(execFile);

export function versionFromTag(tag, prefix) {
  if (typeof tag !== "string" || !tag.startsWith(prefix)) return null;
  const version = tag.slice(prefix.length);
  return SEMVER_PATTERN.test(version) ? version : null;
}

export function publishedReleases(releases, prefix) {
  return releases.flatMap((release) => {
    const version = versionFromTag(release.tag_name, prefix);
    if (!version || release.draft || !release.published_at) return [];
    return { tag: release.tag_name, version, prerelease: Boolean(release.prerelease) || prerelease(version) !== null };
  });
}

export function previousReleaseTag(releases, version) {
  const isPrerelease = prerelease(version) !== null;
  const previous = releases
    .filter((release) => compare(release.version, version) < 0 && (isPrerelease || !release.prerelease))
    .sort((left, right) => compare(right.version, left.version))[0];
  return previous?.tag ?? null;
}

export async function gitOutput(root, ...args) {
  return (await execFileAsync("git", args, { cwd: root, encoding: "utf8" })).stdout;
}

async function resolveTagCommit(root, tag) {
  return (await gitOutput(root, "rev-parse", "--verify", `refs/tags/${tag}^{commit}`)).trim();
}

export async function releaseSource(root, tag, sourceCommit) {
  const target = await resolveTagCommit(root, tag);
  if (sourceCommit !== undefined && sourceCommit !== target) {
    throw new Error(`Release tag ${tag} resolves to ${target}, not expected source ${sourceCommit}.`);
  }
  return target;
}

function escapeMarkdown(value) {
  return value.replace(/[\\`*_{}\[\]()<>!]/gu, "\\$&");
}

export async function renderReleaseNotes({ root, tag, repository, target, previousTag, paths = [] }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error("repository must be owner/name");
  const previous = previousTag ? await resolveTagCommit(root, previousTag) : null;
  const history = await gitOutput(root, "log", "--reverse", "--format=%H %s", previous ? `${previous}..${target}` : target, "--", ...paths);
  const baseUrl = `https://github.com/${repository}`;
  const commits = history.trimEnd().split("\n").filter(Boolean).map((line) => {
    const hash = line.slice(0, 40);
    const subject = line.slice(41);
    return `- [\`${hash.slice(0, 7)}\`](${baseUrl}/commit/${hash}) ${escapeMarkdown(subject)}`;
  });
  return [
    `Source: [\`${target.slice(0, 7)}\`](${baseUrl}/commit/${target}) · Tag: \`${tag}\``,
    "",
    previousTag ? `Commits since \`${previousTag}\`:` : "Commits included in this first release:",
    "",
    ...(commits.length ? commits : ["No additional commits in this release range."]),
    "",
    previousTag
      ? `**Full Changelog**: ${baseUrl}/compare/${previousTag}...${tag}`
      : `**History**: ${baseUrl}/commits/${tag}`,
    "",
  ].join("\n");
}
