import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { assertSewPromotion, planSewRelease, prepareSewRelease } from "../scripts/lib/sew-release-metadata.mjs";

const execFileAsync = promisify(execFile);
const repository = "oovz/plugins";

function release(tag, overrides = {}) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

async function git(root, ...args) {
  const { stdout } = await execFileAsync("git", [
    "-c", "core.hooksPath=", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false",
    ...args,
  ], { cwd: root, encoding: "utf8" });
  return stdout.trim();
}

async function repositoryFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sew-release-metadata-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, "init", "--initial-branch=main");
  await git(root, "config", "user.name", "SEW Release Test");
  await git(root, "config", "user.email", "sew-release-test@example.invalid");
  await mkdir(path.join(root, "tools", "sew"), { recursive: true });
  let sequence = 0;
  return {
    root,
    async commit(version, subject) {
      sequence += 1;
      await writeFile(path.join(root, "tools", "sew", "package.json"), JSON.stringify({
        name: "@oovz/sew",
        version,
      }));
      await writeFile(path.join(root, "change.txt"), `${sequence}\n`);
      await git(root, "add", ".");
      await git(root, "commit", "-m", subject);
      return git(root, "rev-parse", "HEAD");
    },
  };
}

function assertCommitLinks(body, included, excluded = []) {
  for (const commit of included) {
    assert.ok(body.includes(`https://github.com/${repository}/commit/${commit}`),
      `release notes must link included commit ${commit}`);
  }
  for (const commit of excluded) {
    assert.ok(!body.includes(commit), `release notes must exclude commit ${commit}`);
  }
}

test("release planning orders semantic versions and ignores drafts and unrelated tags", () => {
  assert.deepEqual(planSewRelease({
    tag: "sew-v0.14.11",
    releases: [
      release("sew-v0.14.9", { published_at: "2026-10-20T00:00:00Z" }),
      release("sew-v0.14.10", { published_at: "2026-10-01T00:00:00Z" }),
      release("sew-v0.14.11-rc.1", { prerelease: true }),
      release("sew-v0.14.12-rc.1", { prerelease: true }),
      release("sew-v0.14.12", { draft: true }),
      release("other-v99.0.0"),
      release("sew-v01.14.10"),
    ],
    publishedVersions: ["0.14.9", "0.14.10", "0.14.12-rc.1"],
  }), {
    tag: "sew-v0.14.11",
    version: "0.14.11",
    previousTag: "sew-v0.14.10",
    npmTag: "latest",
    makeLatest: true,
    prerelease: false,
  });
});

test("late older releases cannot downgrade npm or GitHub latest", () => {
  assert.deepEqual(planSewRelease({
    tag: "sew-v0.14.9",
    releases: [release("sew-v0.14.8"), release("sew-v0.14.10")],
    publishedVersions: ["0.14.8", "0.14.10"],
  }), {
    tag: "sew-v0.14.9",
    version: "0.14.9",
    previousTag: "sew-v0.14.8",
    npmTag: "release-0.14.9",
    makeLatest: false,
    prerelease: false,
  });
});

test("npm and GitHub latest decisions use their own published versions", () => {
  const npmAhead = planSewRelease({
    tag: "sew-v1.2.0",
    releases: [release("sew-v1.1.0")],
    publishedVersions: ["1.3.0"],
  });
  assert.equal(npmAhead.npmTag, "release-1.2.0");
  assert.equal(npmAhead.makeLatest, true);

  const githubAhead = planSewRelease({
    tag: "sew-v1.2.0",
    releases: [release("sew-v1.1.0"), release("sew-v1.3.0")],
    publishedVersions: ["1.1.0"],
  });
  assert.equal(githubAhead.npmTag, "latest");
  assert.equal(githubAhead.makeLatest, false);
});

test("prereleases use version-specific npm tags and never become latest", () => {
  assert.deepEqual(planSewRelease({
    tag: "sew-v1.2.0-rc.10",
    releases: [
      release("sew-v1.1.0"),
      release("sew-v1.2.0-rc.2", { prerelease: true }),
      release("sew-v1.2.0-rc.9", { prerelease: true }),
      release("sew-v1.2.0-rc.11", { prerelease: true }),
    ],
    publishedVersions: ["1.1.0", "1.2.0-rc.9"],
  }), {
    tag: "sew-v1.2.0-rc.10",
    version: "1.2.0-rc.10",
    previousTag: "sew-v1.2.0-rc.9",
    npmTag: "release-1.2.0-rc.10",
    makeLatest: false,
    prerelease: true,
  });
});

test("the first release has no previous tag", () => {
  assert.equal(planSewRelease({
    tag: "sew-v1.0.0",
    releases: [release("other-v0.9.0"), release("sew-v0.9.0", { draft: true })],
    publishedVersions: [],
  }).previousTag, null);
});

test("promotion verifies the published package against the newest stable tag", () => {
  const plan = {
    ...planSewRelease({ tag: "sew-v0.14.3", releases: [], publishedVersions: ["0.14.2", "0.14.3"] }),
    sourceCommit: "a".repeat(40),
  };
  const published = { name: "@oovz/sew", version: "0.14.3", roleSourceVersion: "0.14.3", sourceCommit: plan.sourceCommit };
  assert.equal(assertSewPromotion(plan, published), "@oovz/sew@0.14.3");
  for (const mismatch of [
    { name: "another-package" }, { version: "0.14.2" },
    { roleSourceVersion: "0.14.2" }, { sourceCommit: "b".repeat(40) },
  ]) {
    assert.throws(() => assertSewPromotion(plan, { ...published, ...mismatch }), /identity/u);
  }
});

test("promotion refuses an older version or prerelease even when its package identity matches", () => {
  for (const version of ["0.14.2", "0.15.0-rc.1"]) {
    const plan = {
      ...planSewRelease({ tag: `sew-v${version}`, releases: [], publishedVersions: ["0.14.3", version] }),
      sourceCommit: "a".repeat(40),
    };
    const published = { name: "@oovz/sew", version, roleSourceVersion: version, sourceCommit: plan.sourceCommit };
    assert.throws(() => assertSewPromotion(plan, published), /newest published stable/u);
  }
});

test("release targets require a strict sew-v semantic version", () => {
  for (const tag of [
    "v1.2.3", "sew-v1.2", "sew-v01.2.3", "sew-v1.2.3-01",
    "sew-v1.2.3-", "sew-v1.2.3+", "sew-v1.2.3\n", "sew-v1.2.3/extra",
  ]) {
    assert.throws(() => planSewRelease({ tag, releases: [], publishedVersions: [] }),
      { name: "Error" }, `must reject invalid release target ${JSON.stringify(tag)}`);
  }
});

test("release notes list every commit after the previous release through the tagged source", async (t) => {
  const fixture = await repositoryFixture(t);
  const initial = await fixture.commit("0.14.8", "initial source");
  const previous = await fixture.commit("0.14.9", "previous release");
  await git(fixture.root, "tag", "sew-v0.14.9");
  const ordinary = await fixture.commit("0.14.9", "fix: ordinary commit without a pull request");
  const target = await fixture.commit("0.14.10", "fix: handle [edge] *cases* <script>");
  await git(fixture.root, "tag", "-a", "sew-v0.14.10", "-m", "release target");
  const later = await fixture.commit("0.14.11", "later unreleased change");
  await writeFile(path.join(fixture.root, "tools", "sew", "package.json"),
    JSON.stringify({ name: "@oovz/sew", version: "0.14.12" }));

  const { plan, body } = await prepareSewRelease({
    root: fixture.root,
    tag: "sew-v0.14.10",
    repository,
    releases: [release("sew-v0.14.9")],
    publishedVersions: ["0.14.9"],
    sourceCommit: target,
  });

  assert.equal(plan.sourceCommit, target);
  assert.equal(plan.previousTag, "sew-v0.14.9");
  assertCommitLinks(body, [ordinary, target], [initial, previous, later]);
  assert.ok(body.includes("ordinary commit without a pull request"));
  assert.ok(!body.includes("later unreleased change"));
  assert.ok(!body.includes("[edge] *cases* <script>"), "commit subjects must not inject Markdown or HTML");
  assert.match(body, /\\\[edge\\\]/u);
  assert.match(body, /\\\*cases\\\*/u);
  assert.ok(!body.includes("<script>"), "commit subjects must escape raw HTML");
});

test("first-release notes include the real history through the target", async (t) => {
  const fixture = await repositoryFixture(t);
  const initial = await fixture.commit("0.1.0", "initial implementation");
  const target = await fixture.commit("0.1.0", "prepare first release");
  await git(fixture.root, "tag", "sew-v0.1.0");
  const later = await fixture.commit("0.2.0", "future work");

  const { plan, body } = await prepareSewRelease({
    root: fixture.root, tag: "sew-v0.1.0", repository,
    releases: [], publishedVersions: [],
  });

  assert.equal(plan.previousTag, null);
  assert.equal(plan.sourceCommit, target);
  assertCommitLinks(body, [initial, target], [later]);
  assert.ok(body.includes("initial implementation"));
  assert.ok(body.includes("prepare first release"));
});

test("release notes support a previous release on divergent history", async (t) => {
  const fixture = await repositoryFixture(t);
  const base = await fixture.commit("0.14.8", "shared source");
  await git(fixture.root, "checkout", "-b", "maintenance");
  const maintenance = await fixture.commit("0.14.9", "maintenance release only");
  await git(fixture.root, "tag", "sew-v0.14.9");
  await git(fixture.root, "checkout", "main");
  const target = await fixture.commit("0.14.10", "main release only");
  await git(fixture.root, "tag", "sew-v0.14.10");

  const { plan, body } = await prepareSewRelease({
    root: fixture.root, tag: "sew-v0.14.10", repository,
    releases: [release("sew-v0.14.9")], publishedVersions: ["0.14.9"],
  });

  assert.equal(plan.previousTag, "sew-v0.14.9");
  assertCommitLinks(body, [target], [base, maintenance]);
  assert.ok(body.includes("main release only"));
});

test("release preparation rejects a tag whose committed package version disagrees", async (t) => {
  const fixture = await repositoryFixture(t);
  await fixture.commit("0.14.9", "wrong version at tag");
  await git(fixture.root, "tag", "sew-v0.14.10");
  await fixture.commit("0.14.10", "matching working history cannot repair the tag");

  await assert.rejects(prepareSewRelease({
    root: fixture.root, tag: "sew-v0.14.10", repository,
    releases: [], publishedVersions: [],
  }), /version|match/iu);
});

test("release preparation rejects a requested source commit different from the tag", async (t) => {
  const fixture = await repositoryFixture(t);
  const wrongSource = await fixture.commit("0.14.9", "earlier source");
  await fixture.commit("0.14.10", "tagged release source");
  await git(fixture.root, "tag", "sew-v0.14.10");

  await assert.rejects(prepareSewRelease({
    root: fixture.root, tag: "sew-v0.14.10", repository,
    releases: [], publishedVersions: [], sourceCommit: wrongSource,
  }), /source|commit|match/iu);
});
