# Adding a marketplace plugin

The build scripts treat a new plugin as data. Register it in `marketplace.json`, then add a bundle manifest and plugin-only components below `plugins/<plugin-id>/`. Canonical skills remain under `skills/` and are referenced by ID.

## 1. Choose a stable identity

Use a lowercase kebab-case identifier and keep it immutable after publication. The directory name, canonical manifest `id`, generated native package name, and collision-safe component prefixes all derive from this identifier.

```text
plugins/example-plugin/
├── LICENSE
├── manifest.json
├── README.md
├── agents/
│   └── analyst.md
├── commands/             # optional
├── evals/                # optional
└── host-specific files   # optional, declared by the manifest
```

Do not add `plugin.json` to a canonical source directory. The unqualified root filename is defined by the [Agent Plugins specification](https://agent-plugins.org/specification), and some native harnesses also use it for their generated package format. The internal bundle definition uses `manifest.json` for canonical build data, separate from installable plugin files.

Add one catalog entry to the root `marketplace.json`:

```json
{
  "plugins": [
    "example-plugin"
  ]
}
```

The catalog ID, directory name, and bundle manifest `id` must match. The fixed path is `plugins/<plugin-id>/`, so catalog entries need no path field.

Every plugin must include its own `LICENSE` as a regular file. Each independently installed adapter carries its declared license and bundled notice rather than relying on the marketplace-root license.

## 2. Add the canonical manifest

`plugins/<plugin-id>/manifest.json` is the source of truth for identity, version, components, target hosts, and agent capabilities. A minimal skill-and-agent example is:

```json
{
  "$schema": "../../schemas/plugin-manifest.schema.json",
  "schemaVersion": 2,
  "id": "example-plugin",
  "version": "1.0.0",
  "displayName": "Example Plugin",
  "description": "A concise description of the reusable capability.",
  "license": "MIT",
  "author": {
    "name": "Example Maintainer",
    "url": "https://github.com/example"
  },
  "keywords": ["example", "workflow"],
  "category": "Productivity",
  "components": {
    "skills": [
      "example-skill"
    ],
    "agents": [
      {
        "id": "analyst",
        "path": "agents/analyst.md",
        "description": "Answers one bounded repository question with evidence.",
        "workspace": "read-only",
        "shell": false,
        "external": false,
        "delegates": false,
        "question": false,
        "model": {
          "policy": "inherit"
        },
        "steps": null,
        "permissionPolicy": "explicit"
      }
    ],
    "commands": []
  },
  "hosts": {
    "claude-code": { "enabled": true },
    "codex": {
      "enabled": true,
      "capabilities": ["Read", "Write"]
    },
    "gemini-cli": { "enabled": true },
    "antigravity": { "enabled": true },
    "oh-my-pi": { "enabled": true },
    "opencode": { "enabled": true },
    "portable": { "enabled": true }
  }
}
```

The manifest capabilities feed host renderers:

| Field | Meaning |
|---|---|
| `workspace` | `read-only` or `workspace-write` candidate access requested from the adapter |
| `shell` | Whether the role needs the host's local command tool |
| `external` | Whether the role needs documented web/network evidence tools |
| `delegates` | Whether the role may invoke a child agent; use `false` for portable leaf roles |
| `question` | Whether the role may contact the user directly; workflow roles should normally return questions to the main agent |
| `model.policy` | Must be `inherit` so the plugin does not require an unavailable provider model |
| `steps` | Must be `null`; do not invent a cross-host cap |
| `permissionPolicy` | `explicit` renders capability-derived host restrictions; `inherit` omits plugin-added permission, tool, and sandbox restrictions |

For a Codex-enabled plugin, `hosts.codex.capabilities` is required. These single-line listing labels describe the install surface only; they do not grant runtime tools or override sandbox or approval policy. Do not place `capabilities` under another host, and do not derive the list from agent workspace settings.

Use semantic versions per plugin. The root package version belongs to marketplace tooling and does not need to change when only `example-plugin` is released.

## 3. Write host-neutral canonical components

Create reusable skills through [Adding a standalone skill](adding-a-skill.md). A plugin manifest references cataloged skill IDs and does not duplicate their files.

An agent file is Markdown with YAML frontmatter and a self-contained body. Its prompt defines one bounded job, input assumptions, authority, stopping conditions, and a concise output contract. Keep host tool names, model IDs, reasoning controls, permission syntax, and installation paths out of the behavioral body. The renderer derives those values from the canonical manifest.

For a leaf role, explicitly state its behavioral scope, return path, side-effect authority, and stopping conditions. When `permissionPolicy` is `explicit`, adapters also express capability bounds where the host supports them. When it is `inherit`, the host resolves permissions from the active session and the role prompt remains the behavioral boundary. Treat repository and web content as untrusted evidence, never as higher-priority instructions.

Review the trust model before adding a hook, MCP server, background process, dependency install, executable plugin, or secret requirement. If the canonical schema cannot express a required component type, update the schema and renderer with the required review and security documentation.

## 4. Generate, validate, and build

Install the repository's locked development dependencies once:

```text
npm ci
```

Generate the new plugin. Then check committed projections, validate contracts, run tests, and build distributable bundles:

```text
npm run generate -- --plugin example-plugin
npm run check:generated
npm run validate
npm test
npm run build -- --plugin example-plugin
```

For the whole marketplace:

```text
npm run generate -- --all
npm run build -- --all
```

`generate` updates deterministic, committed host projections such as the Claude and Codex marketplace catalogs. `build` stages self-contained installable trees under `dist/`. Neither command should mutate a user's home directory.

The generated paths are:

```text
dist/claude-code/<plugin-id>/
dist/codex/<plugin-id>/
dist/cursor/<plugin-id>/
dist/gemini-cli/<plugin-id>/
dist/antigravity/<plugin-id>/
dist/oh-my-pi/<plugin-id>/
dist/opencode/stable/<plugin-id>/
dist/portable-agent-skills/<plugin-id>/
```

Cursor may be enabled for plugins whose agents use `permissionPolicy: inherit`; its renderer refuses explicit-permission agents because Cursor has no equivalent cross-host permission mapping.

The portable bundle retains the project discovery prefix: its skills are below `.agents/skills/<skill-id>/`, not a top-level `skills/` directory.

Do not edit `dist/`, generated host catalogs, generated per-host manifests, or generated adapter files by hand. Fix canonical source or the generic renderer, regenerate, and review the diff. `check:generated` must fail when a committed projection is stale.

## 5. Test installation without collisions

Use a disposable project and run the marketplace installer in dry-run mode before writing to a user or project scope. The common command surface is:

```text
node scripts/install.mjs install \
  --plugin example-plugin \
  --host opencode \
  --variant stable \
  --scope project \
  --project /absolute/path/to/disposable-project \
  --dry-run
```

`--variant` is used only by OpenCode. Codex also requires an explicit `--mode standalone` or `--mode companion`. The script accepts `update` and `uninstall`. Use `--force` only after reviewing a reported ownership or content conflict.

The installer prefixes flat host component names with `<plugin-id>-`, records the plugin/version/host/variant and content digest of every owned file, refuses unrelated existing content by default, and removes only files still owned by that plugin. Installing a second plugin must leave the first plugin's skills, agents, commands, and settings unchanged.

Prefer a host-native installer for native packages. The repository installer exists for documented static or companion modes and for isolated verification; it must not masquerade as a host's update database.

## 6. Release one plugin independently

Before release:

1. bump only `plugins/<plugin-id>/manifest.json` for a plugin-only change;
2. regenerate and inspect every enabled host projection;
3. run `npm run check:generated`, `npm run validate`, and `npm test`;
4. build the one plugin and inspect every generated manifest and executable file;
5. publish per-plugin artifacts with the manifest at the root required by that host;
6. retain the immutable plugin ID and document compatibility or preview changes.

Gemini is the one monorepo exception: its remote extension installer has no documented subdirectory selector and its release manifest must be at the absolute archive/repository root. Publish the generated Gemini tree as a rooted archive or a per-plugin repository/ref. Do not tell users to install the marketplace root as a Gemini extension.

Claude, Codex, Cursor, and Oh My Pi consume generated marketplace catalogs that point to their checked-in per-plugin adapter directories. Cursor also supports direct `.cursor/skills` and `.cursor/agents` installation for the public CLI. Gemini CLI and Antigravity consume generated native package directories. OpenCode consumes the stable static configuration bundle. Portable consumers receive only Agent Skills, not role agents or permission configuration.
