import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { assertSecureSourcePath, readJson } from "./marketplace.mjs";

export function assertMatchesSchema(validate, value, label) {
  if (validate(value)) return;
  const details = validate.errors
    .map((error) => `- ${error.instancePath || "/"} ${error.message}`)
    .join("\n");
  throw new Error(`${label} does not match its schema:\n${details}`);
}

export async function loadManifestSchemaValidators(root) {
  const marketplaceSchemaFile = path.join(root, "schemas/marketplace.schema.json");
  const pluginSchemaFile = path.join(root, "schemas/plugin.schema.json");
  await assertSecureSourcePath(root, marketplaceSchemaFile, "marketplace schema");
  await assertSecureSourcePath(root, pluginSchemaFile, "plugin schema");

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return {
    marketplace: ajv.compile(await readJson(marketplaceSchemaFile)),
    plugin: ajv.compile(await readJson(pluginSchemaFile))
  };
}

export async function assertCatalogMatchesSchemas(catalog) {
  const validators = await loadManifestSchemaValidators(catalog.root);
  assertMatchesSchema(validators.marketplace, catalog.marketplace, "marketplace.json");
  for (const plugin of catalog.plugins) {
    assertMatchesSchema(validators.plugin, plugin.manifest, `${plugin.manifest.id}/plugin.json`);
  }
  return catalog;
}
