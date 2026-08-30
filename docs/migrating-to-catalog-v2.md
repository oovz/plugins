# Migrating to catalog schema 2

Catalog schema 2 separates reusable skills, plugin bundle definitions, and command-line tools. It removes the schema-1 source layout.

## Source layout changes

| Schema 1 | Schema 2 |
|---|---|
| `plugins/<plugin-id>/plugin.json` | `plugins/<plugin-id>/manifest.json` |
| `plugins/<plugin-id>/skills/<skill-id>/` | `skills/<skill-id>/` |
| `packages/<tool-id>/` | `tools/<tool-id>/` |
| plugin catalog objects with `id` and `path` | plugin ID strings |
| skill component objects with `id` and `path` | skill ID strings |

Each canonical skill now includes its own `LICENSE`. Plugin bundles retain a plugin-local `LICENSE` for plugin-only components and the generated package root.

## Manifest changes

Update the bundle manifest schema and component references:

```json
{
  "$schema": "../../schemas/plugin-manifest.schema.json",
  "schemaVersion": 2,
  "components": {
    "skills": [
      "example-skill"
    ]
  }
}
```

Update the root catalog:

```json
{
  "schemaVersion": 2,
  "plugins": [
    "example-plugin"
  ],
  "skills": [
    "example-skill"
  ]
}
```

## Regenerate projections

Remove schema-1 source paths after moving their contents, then run:

```text
npm install --package-lock-only --ignore-scripts
npm run generate -- --all
npm run verify
```

Generated adapters keep their host-native layouts. Review the adapter diff to confirm that the source-only reorganization did not alter an installed payload.
