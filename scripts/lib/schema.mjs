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
  const pluginSchemaFile = path.join(root, "schemas/plugin-manifest.schema.json");
  await assertSecureSourcePath(root, marketplaceSchemaFile, "marketplace schema");
  await assertSecureSourcePath(root, pluginSchemaFile, "plugin schema");

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return {
    marketplace: ajv.compile(await readJson(marketplaceSchemaFile)),
    plugin: ajv.compile(await readJson(pluginSchemaFile))
  };
}

export async function loadOwnershipSchemaValidator(root) {
  const ownershipSchemaFile = path.join(root, "schemas/ownership.schema.json");
  await assertSecureSourcePath(root, ownershipSchemaFile, "ownership schema");
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(await readJson(ownershipSchemaFile));
}

export async function assertOwnershipRecordMatchesSchema(root, record) {
  const validate = await loadOwnershipSchemaValidator(root);
  assertMatchesSchema(validate, record, "ownership.json");
  return record;
}

export async function assertCatalogMatchesSchemas(catalog) {
  const validators = await loadManifestSchemaValidators(catalog.root);
  assertMatchesSchema(validators.marketplace, catalog.marketplace, "marketplace.json");
  for (const plugin of catalog.plugins) {
    assertMatchesSchema(validators.plugin, plugin.manifest, `${plugin.manifest.id}/manifest.json`);
  }
  return catalog;
}
