import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SEW_STAGE_ROOT,
  assertSewReleaseVersionAlignment,
  assertSewSourceVersionAlignment,
} from "./lib/sew-release-version.mjs";

const versions = await assertSewSourceVersionAlignment();
const stagedManifestPath = path.join(SEW_STAGE_ROOT, "package.json");
const stagedManifest = JSON.parse(await readFile(stagedManifestPath, "utf8"));

stagedManifest.version = versions.packageVersion;
stagedManifest.sewPluginVersion = versions.pluginVersion;
delete stagedManifest.private;
stagedManifest.publishConfig = {
  ...(stagedManifest.publishConfig ?? {}),
  access: "public",
  provenance: true,
};

await writeFile(stagedManifestPath, `${JSON.stringify(stagedManifest, null, 2)}\n`, "utf8");

const binEntries = typeof stagedManifest.bin === "string"
  ? [stagedManifest.bin]
  : Object.values(stagedManifest.bin ?? {});
for (const relativePath of binEntries) {
  const absolutePath = path.resolve(SEW_STAGE_ROOT, relativePath);
  if (process.platform !== "win32") await chmod(absolutePath, 0o755);
}

await assertSewReleaseVersionAlignment({ requireStaged: true });
console.log(`finalized @oovz/sew ${versions.packageVersion} with plugin ${versions.pluginVersion}`);
