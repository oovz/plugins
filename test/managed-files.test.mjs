import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { commitManagedOperation } from "../scripts/lib/managed-files.mjs";

async function managedPlan(t, { initial = "old bytes\n" } = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), "oovz-managed-files-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, "managed");
  const stateRoot = path.join(base, "state");
  const statePath = path.join(stateRoot, "ownership.json");
  await mkdir(root, { recursive: true });
  const destination = path.join(root, "role.md");
  if (initial !== null) await writeFile(destination, initial);
  const plan = {
    statePath,
    stateAnchor: base,
    roots: {},
    rootAnchors: { [root]: base },
    writes: [{ destination, content: Buffer.from("new bytes\n"), rootPath: root }],
    removals: [],
    nextState: { schemaVersion: 1, files: {} },
    requireRoots: true,
  };
  return { base, root, statePath, destination, plan };
}

test("partial staging writes are removed and do not change the existing destination", async (t) => {
  const { destination, plan } = await managedPlan(t);
  plan.io = {
    async writeFile(file, content, options) {
      if (file.includes(".sew-tmp-")) {
        await writeFile(file, "partial", options);
        throw Object.assign(new Error("staging write failed"), { code: "EIO" });
      }
      return writeFile(file, content, options);
    },
  };

  await assert.rejects(commitManagedOperation("install", plan, { lockHeld: true }), /staging write failed/u);
  assert.equal(await readFile(destination, "utf8"), "old bytes\n");
  assert.deepEqual((await readdir(path.dirname(destination))).sort(), ["role.md"]);
});

test("post-commit cleanup failures retain the prior backup while the new destination is valid", async (t) => {
  const { destination, plan } = await managedPlan(t);
  plan.io = {
    async rm(target, options) {
      if (target.includes(".sew-backup-")) throw Object.assign(new Error("cleanup denied"), { code: "EACCES" });
      return rm(target, options);
    },
  };

  const result = await commitManagedOperation("install", plan, { lockHeld: true });
  assert.equal(await readFile(destination, "utf8"), "new bytes\n");
  assert.equal(result.cleanupFailures.length, 1);
  assert.equal(result.cleanupFailures[0].operation, "remove file backup");
  assert.equal(await readFile(result.cleanupFailures[0].path, "utf8"), "old bytes\n");
});

test("changed trusted anchors stop rollback and preserve the recoverable original", async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), "oovz-managed-anchor-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const anchor = path.join(base, "trusted");
  const retained = path.join(base, "retained-trusted");
  const outside = path.join(base, "outside");
  const root = path.join(anchor, "plugin");
  const stateRoot = path.join(base, "state");
  const statePath = path.join(stateRoot, "ownership.json");
  await mkdir(root, { recursive: true });
  await mkdir(outside, { recursive: true });
  const first = path.join(root, "first.md");
  const second = path.join(root, "second.md");
  await writeFile(first, "old first\n");
  const plan = {
    statePath,
    stateAnchor: base,
    roots: {},
    rootAnchors: { [root]: anchor },
    writes: [
      { destination: first, content: Buffer.from("new first\n"), rootPath: root },
      { destination: second, content: Buffer.from("new second\n"), rootPath: root },
    ],
    removals: [],
    nextState: { schemaVersion: 1, files: {} },
    requireRoots: true,
  };
  let changed = false;
  plan.io = {
    async rename(from, to) {
      await rename(from, to);
      if (!changed && from.includes(".sew-tmp-") && to === first) {
        changed = true;
        await rename(anchor, retained);
        await symlink(outside, anchor, process.platform === "win32" ? "junction" : "dir");
      }
    },
  };

  await assert.rejects(commitManagedOperation("install", plan, { lockHeld: true }), (error) => {
    assert.match(error.message, /rollback incomplete/u);
    assert.match(error.message, /recovery material/u);
    return true;
  });
  const retainedPlugin = path.join(retained, "plugin");
  const recoveryName = (await readdir(retainedPlugin)).find((name) => name.startsWith("first.md.sew-backup-"));
  assert.ok(recoveryName, "the old destination backup remains in the captured directory");
  assert.equal(await readFile(path.join(retainedPlugin, recoveryName), "utf8"), "old first\n");
  assert.deepEqual(await readdir(outside), []);
});

test("an explicit managed root is enforced before any outside destination is written", async (t) => {
  const { base, root, plan } = await managedPlan(t, { initial: null });
  const outside = path.join(base, "outside.md");
  plan.writes[0].destination = outside;

  await assert.rejects(commitManagedOperation("install", plan, { lockHeld: true }), /Managed path escapes its trusted root/u);
  await assert.rejects(readFile(outside), /ENOENT/u);
  assert.deepEqual(await readdir(root), []);
});
