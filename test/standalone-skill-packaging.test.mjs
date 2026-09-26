import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { discoverMarketplace, inspectSkill } from "../scripts/lib/marketplace.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

test("WXT standalone skill keeps MCP setup and references self-contained", async () => {
  const catalog = await discoverMarketplace(ROOT);
  const source = catalog.skills.find((skill) => skill.id === "wxt-extension-test");
  assert.ok(source);
  const skill = await inspectSkill(source);
  const body = await readFile(skill.file, "utf8");
  assert.doesNotMatch(body, /general `chrome-extension-test` skill's `references\/troubleshooting\.md`/u);
  assert.match(body, /references\/chrome-devtools-mcp\.md/u);
  const localReference = skill.files.find((file) => file.relative === "references/chrome-devtools-mcp.md");
  assert.ok(localReference, "standalone WXT package must include its MCP setup reference");
  assert.match(localReference.content.toString("utf8"), /--categoryExtensions/u);
  assert.match(localReference.content.toString("utf8"), /--allowUnrestrictedPaths/u);
});
