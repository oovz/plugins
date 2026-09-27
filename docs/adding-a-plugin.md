# Contributing a plugin

To propose a plugin, add its source files and catalog entry, then generate and test it locally before opening a pull request. Requires Node.js 22 or later.

## 1. Choose a stable identity

Use a lowercase kebab-case identifier. The directory name, manifest `id`, and catalog entry must match.

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

Name the source manifest `manifest.json`. Host-specific manifests are generated for you.

Add one catalog entry to the root `marketplace.json`:

```json
{
  "plugins": [
    "example-plugin"
  ]
}
```

Include a `LICENSE` file for the plugin and a license for each bundled skill.

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

Use a semantic version in the plugin manifest.

## 3. Write host-neutral canonical components

Create reusable skills through [Adding a standalone skill](adding-a-skill.md). A plugin manifest references cataloged skill IDs and does not duplicate their files.

An agent file is Markdown with YAML frontmatter and a self-contained body. Its prompt defines one bounded job, input assumptions, authority, stopping conditions, and a concise output contract. Keep host tool names, model IDs, reasoning controls, permission syntax, and installation paths out of the behavioral body. The renderer derives those values from the canonical manifest.

For a leaf role, explicitly state its behavioral scope, return path, side-effect authority, and stopping conditions. When `permissionPolicy` is `explicit`, adapters also express capability bounds where the host supports them. When it is `inherit`, the host resolves permissions from the active session and the role prompt remains the behavioral boundary. Treat repository and web content as untrusted evidence, never as higher-priority instructions.

Review the trust model before adding a hook, MCP server, background process, dependency install, executable plugin, or secret requirement. Describe any new permissions or dependencies in the pull request.

## 4. Generate, validate, and build

Install the repository's locked development dependencies once:

```text
npm ci
```

Generate and validate the plugin, then build it for local installation:

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

`generate` updates the files to include in your pull request. `build` writes local installation packages under `dist/`.

The generated paths are:

```text
dist/claude-code/<plugin-id>/
dist/codex/<plugin-id>/
dist/cursor/<plugin-id>/
dist/gemini-cli/<plugin-id>/
dist/antigravity/<plugin-id>/
dist/oh-my-pi/<plugin-id>/
dist/opencode/<plugin-id>/
dist/portable-agent-skills/<plugin-id>/
```

Cursor may be enabled for plugins whose agents use `permissionPolicy: inherit`; its renderer refuses explicit-permission agents because Cursor has no equivalent cross-host permission mapping.

The portable bundle retains the project discovery prefix: its skills are below `.agents/skills/<skill-id>/`, not a top-level `skills/` directory.

Edit the source files and regenerate; include generated changes in your pull request. Leave the local `dist/` build out of the commit.

## 5. Test installation without collisions

Use a disposable project and run the marketplace installer in dry-run mode before writing to a user or project scope. The common command surface is:

```text
node scripts/install.mjs install \
  --plugin example-plugin \
  --host opencode \
  --scope project \
  --project /absolute/path/to/disposable-project \
  --dry-run
```

Codex requires an explicit `--mode standalone` or `--mode companion`. The script accepts `update` and `uninstall`. Use `--force` only after reviewing a reported ownership or content conflict.

Check that installation leaves unrelated skills, agents, and settings unchanged. Use `update` and `uninstall` to test the same plugin's upgrade and removal behavior.

For native plugin packages, follow the [installation steps](../README.md#install-plugins-and-skills) in a test environment.
