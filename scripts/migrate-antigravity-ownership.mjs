#!/usr/bin/env node
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { assertSafePath, capturePathAnchor } from "./lib/managed-files.mjs";
import { acquireOwnershipRecordLock } from "./install.mjs";

function parseArgs(argv) {
  const values = {};
  let apply = false;
  while (argv.length > 0) {
    const token = argv.shift();
    if (token === "--apply") {
      if (apply) throw new Error("--apply may only be specified once");
      apply = true;
      continue;
    }
    if (token === "--record" || token === "--old-root") {
      if (values[token]) throw new Error(`${token} may only be specified once`);
      const value = argv.shift();
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
      values[token] = value;
      continue;
    }
    throw new Error(`unknown argument: ${token}`);
  }
  if (!values["--record"] || !values["--old-root"]) throw new Error("--record and --old-root are required");
  return { record: path.resolve(values["--record"]), oldRoot: path.resolve(values["--old-root"]), apply };
}

function isContained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function removeLegacyAntigravityOwnership(record, oldRoot) {
  if (!record || record.schemaVersion !== 1 || !record.files || typeof record.files !== "object" || Array.isArray(record.files)) {
    throw new Error("ownership record must use schemaVersion 1 with a files object");
  }
  const root = path.resolve(oldRoot);
  const retiredPlugin = path.basename(root);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/iu.test(retiredPlugin)) throw new Error("old-root must name one retired plugin directory");
  const next = structuredClone(record);
  const removed = [];
  for (const [destination, entry] of Object.entries(record.files)) {
    if (entry?.plugin === retiredPlugin && entry.host === "antigravity" && entry.scope === "user" && isContained(root, destination)) {
      delete next.files[destination];
      removed.push(destination);
    } else if (entry && typeof entry === "object" && Object.hasOwn(entry, "variant")) {
      // The host variant selector was removed. Normalize retained ownership
      // entries so the resulting ledger conforms to the current schema.
      const normalized = { ...entry };
      delete normalized.variant;
      next.files[destination] = normalized;
    }
  }
  return { record: next, removed };
}

async function run(argv) {
  const args = parseArgs(argv);
  const recordRoot = path.dirname(path.resolve(args.record));
  const anchor = await capturePathAnchor(path.dirname(recordRoot));
  const lockPlan = { recordFile: args.record, recordRoot, stateAnchor: anchor };
  const release = await acquireOwnershipRecordLock(lockPlan);
  try {
    const current = JSON.parse(await readFile(args.record, "utf8"));
    const result = removeLegacyAntigravityOwnership(current, args.oldRoot);
    if (args.apply && (result.removed.length > 0 || JSON.stringify(result.record) !== JSON.stringify(current))) {
      const temporary = `${args.record}.tmp-${process.pid}`;
      try {
        await assertSafePath(recordRoot, temporary, anchor);
        await writeFile(temporary, `${JSON.stringify(result.record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        await assertSafePath(recordRoot, args.record, anchor);
        await rename(temporary, args.record);
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {});
        throw error;
      }
    }
    process.stdout.write(`${JSON.stringify({ record: args.record, oldRoot: path.resolve(args.oldRoot), apply: args.apply, removed: result.removed }, null, 2)}\n`);
  } finally {
    await release();
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) run(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`error: ${error.message}\n`);
  process.exitCode = 1;
});
