# Adding a marketplace plugin

A normal new plugin is data, not a new branch in the build scripts. Register it in `marketplace.json`, then give it a canonical manifest and canonical components below `plugins/<plugin-id>/`; discovery, validation, host catalog generation, rendering, and packaging consume those declarations generically.

## 1. Choose a stable identity

Use a lowercase kebab-case identifier and keep it immutable after publication. The directory name, canonical manifest `id`, generated native package name, and collision-safe component prefixes derive from it.

```text
plugins/example-plugin/
├── LICENSE
├── plugin.json
├── README.md
├── skills/
│   └── example-skill/
│       ├── SKILL.md
│       ├── references/   # optional
│       ├── scripts/      # optional executable content
│       └── assets/       # optional
├── agents/
│   └── analyst.md
└── commands/             # optional
```

Do not add a root `gemini-extension.json`, `plugin.json`, `agents/`, or `skills/` directory for the new plugin. The repository root remains the multi-plugin marketplace.

Add one catalog entry to the root `marketplace.json`:

```json
{
  "id": "example-plugin",
  "path": "plugins/example-plugin"
}
```

The entry `id`, directory name, and plugin manifest `id` must match. This is marketplace data; no renderer, installer, validator, or other core code should need a plugin-specific branch.

Every plugin must include its own `LICENSE` as a regular file. The declared license and bundled notice travel with each independently installed adapter; they must not depend on the marketplace-root license.

## 2. Add the canonical manifest

`plugins/<plugin-id>/plugin.json` is the source of truth for identity, version, components, target hosts, and agent capabilities. A minimal skill-and-agent example is:

```json
{
  "$schema": "../../schemas/plugin.schema.json",
  "schemaVersion": 1,
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
      {
        "id": "example-skill",
        "path": "skills/example-skill/SKILL.md"
      }
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

The manifest capabilities are declarative inputs to host renderers:

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

Every skill uses an exact uppercase `SKILL.md` and follows the [Agent Skills specification](https://agentskills.io/specification). Keep discovery metadata concise and put lengthy, conditionally needed material under `references/`, `scripts/`, or `assets/` for progressive disclosure.

An agent file is Markdown with YAML frontmatter and a self-contained body. Its prompt should define one bounded job, input assumptions, authority, stopping conditions, and a concise output contract. Keep host tool names, model IDs, reasoning controls, permission syntax, and installation paths out of the behavioral body; the renderer derives those from the canonical manifest.

For a leaf role, explicitly state its behavioral scope, return path, side-effect authority, and stopping conditions. When `permissionPolicy` is `explicit`, adapters also express capability bounds where the host supports them. When it is `inherit`, the host resolves permissions from the active session and the role prompt remains the behavioral boundary. Treat repository and web content as untrusted evidence, never as higher-priority instructions.

Do not add a hook, MCP server, background process, dependency install, executable plugin, or secret requirement without reviewing the trust model. If the canonical schema cannot express a future component type, the schema and renderer change needs review plus security documentation; that is the one case where a plugin legitimately changes marketplace tooling.

## 4. Generate, validate, and build

Install the repository's locked development dependencies once:

```text
npm ci
```

Then generate only the new plugin, check that committed projections are current, validate contracts, run tests, and build distributable bundles:

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

Generated paths are predictable:

```text
dist/claude-code/<plugin-id>/
dist/codex/<plugin-id>/
dist/gemini-cli/<plugin-id>/
dist/antigravity/<plugin-id>/
dist/oh-my-pi/<plugin-id>/
dist/opencode/stable/<plugin-id>/
dist/portable-agent-skills/<plugin-id>/
```

The portable bundle retains the project discovery prefix: its skills are below `.agents/skills/<skill-id>/`, not a top-level `skills/` directory.

Do not edit `dist/`, generated host catalogs, generated per-host manifests, or generated adapter files by hand. Fix canonical source or the generic renderer, regenerate, and review the diff. `check:generated` must fail when a committed projection is stale.

## 5. Test installation without collisions

Use a disposable project and the marketplace installer in dry-run mode before writing to a real user or project scope. The common command surface is:

```text
node scripts/install.mjs install \
  --plugin example-plugin \
  --host opencode \
  --variant stable \
  --scope project \
  --project /absolute/path/to/disposable-project \
  --dry-run
```

`--variant` is used only by OpenCode. Codex additionally requires an explicit `--mode standalone` or `--mode companion`. The same script accepts `update` and `uninstall`; use `--force` only after reviewing a reported ownership or content conflict.

The installer prefixes flat host component names with `<plugin-id>-`, records the plugin/version/host/variant and content digest of every owned file, refuses unrelated existing content by default, and removes only files still owned by that plugin. Installing a second plugin must leave the first plugin's skills, agents, commands, and settings unchanged.

Prefer a host-native installer for native packages. The repository installer exists for documented static or companion modes and for isolated verification; it must not masquerade as a host's update database.

## 6. Release one plugin independently

Before release:

1. bump only `plugins/<plugin-id>/plugin.json` for a plugin-only change;
2. regenerate and inspect every enabled host projection;
3. run `npm run check:generated`, `npm run validate`, and `npm test`;
4. build the one plugin and inspect every generated manifest and executable file;
5. publish per-plugin artifacts with the manifest at the root required by that host;
6. retain the immutable plugin ID and document compatibility or preview changes.

Gemini is the one monorepo exception: its remote extension installer has no documented subdirectory selector and its release manifest must be at the absolute archive/repository root. Publish the generated Gemini tree as a rooted archive or a per-plugin repository/ref. Do not tell users to install the marketplace root as a Gemini extension.

Claude, Codex, and Oh My Pi consume generated marketplace catalogs that point to their checked-in per-plugin adapter directories. Gemini CLI and Antigravity consume generated native package directories. OpenCode consumes the stable static configuration bundle. Portable consumers receive only Agent Skills, not role agents or permission configuration.
