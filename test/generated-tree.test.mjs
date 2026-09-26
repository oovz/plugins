import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { atomicWriteTree, replaceTree } from "../scripts/lib/files.mjs";

async function treeFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-generated-tree-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, "output");
  const staging = path.join(root, ".output.staging-test");
  const backup = path.join(root, ".output.backup-test");
  await mkdir(target);
  await mkdir(staging);
  await writeFile(path.join(target, "value.txt"), "old product\n");
  await writeFile(path.join(staging, "value.txt"), "new product\n");
  return { root, target, staging, backup };
}

test("generated-tree staging failures preserve the existing output and remove partial staging", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oovz-generated-tree-stage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, "output");
  await mkdir(target);
  await writeFile(path.join(target, "value.txt"), "old product\n");

  await assert.rejects(atomicWriteTree(target, [
    { path: "nested", content: "file where directory is needed" },
    { path: "nested/child.txt", content: "cannot stage" },
  ], root));

  assert.equal(await readFile(path.join(target, "value.txt"), "utf8"), "old product\n");
  assert.deepEqual((await readdir(root)).sort(), ["output"]);
});

test("promotion failure restores the prior tree and propagates the promotion error", async (t) => {
  const { target, staging, backup } = await treeFixture(t);
  const promotionError = Object.assign(new Error("promotion failed"), { code: "EIO" });
  const move = async (from, to) => {
    if (from === staging && to === target) throw promotionError;
    return rename(from, to);
  };

  await assert.rejects(replaceTree(staging, target, backup, { rename: move }), (error) => error === promotionError);
  assert.equal(await readFile(path.join(target, "value.txt"), "utf8"), "old product\n");
  await assert.rejects(readFile(path.join(backup, "value.txt")), /ENOENT/u);
});

test("failed promotion and restoration retain the previous tree and report its recovery path", async (t) => {
  const { target, staging, backup } = await treeFixture(t);
  const promotionError = Object.assign(new Error("promotion failed"), { code: "EIO" });
  const restorationError = Object.assign(new Error("restore failed"), { code: "EPERM" });
  const move = async (from, to) => {
    if (from === staging && to === target) throw promotionError;
    if (from === backup && to === target) throw restorationError;
    return rename(from, to);
  };

  await assert.rejects(replaceTree(staging, target, backup, { rename: move }), (error) => {
    assert.match(error.message, /promotion failed/u);
    assert.match(error.message, /restore failed/u);
    assert.ok(error.message.includes(backup));
    return true;
  });
  assert.equal(await readFile(path.join(backup, "value.txt"), "utf8"), "old product\n");
  await assert.rejects(readFile(path.join(target, "value.txt")), /ENOENT/u);
});

test("backup cleanup failure after promotion leaves the new output usable", async (t) => {
  const { target, staging, backup } = await treeFixture(t);
  const remove = async (destination, options) => {
    if (destination === backup) throw Object.assign(new Error("cleanup failed"), { code: "EACCES" });
    return rm(destination, options);
  };

  await replaceTree(staging, target, backup, { rm: remove });
  assert.equal(await readFile(path.join(target, "value.txt"), "utf8"), "new product\n");
  assert.equal(await readFile(path.join(backup, "value.txt"), "utf8"), "old product\n");
});
