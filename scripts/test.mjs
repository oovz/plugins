#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test");

const entries = await readdir(TEST_ROOT, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((entry) => path.join(TEST_ROOT, entry.name));

if (files.length === 0) throw new Error(`no test files found in ${TEST_ROOT}`);

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
