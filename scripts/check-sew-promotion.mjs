#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { assertSewPromotion } from "./lib/sew-release-metadata.mjs";

const [planFile, packageFile] = process.argv.slice(2);
try {
  if (process.argv.length !== 4) throw new Error("usage: node scripts/check-sew-promotion.mjs <plan.json> <published-package.json>");
  const plan = JSON.parse(await readFile(planFile, "utf8"));
  const publishedPackage = JSON.parse(await readFile(packageFile, "utf8"));
  console.log(`Verified published identity for ${assertSewPromotion(plan, publishedPackage)}.`);
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
}
