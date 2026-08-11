# @oovz/sew-models

Configure only the **subagent model and thinking settings** used with the [Senior Engineering Workflow](https://github.com/oovz/plugins/tree/main/plugins/senior-engineering-workflow).

The package does not install the plugin, edit its skill or role prompts, change permissions, configure hooks, run coding-agent binaries, query model availability, or manage workflow state. Canonical plugin roles continue to inherit the main session configuration.

## Requirements

- Node.js 20 or later
- Senior Engineering Workflow installed through the host's normal marketplace or static-bundle mechanism

## Run without a global install

```bash
npx @oovz/sew-models configure --host codex --scope user --preset two-model --worker-model gpt-5.6-luna --worker-thinking max
npx @oovz/sew-models doctor
```

A global install is also supported:

```bash
npm install --global @oovz/sew-models
sew-models --help
```

## Presets

| Preset | Researcher | Engineer | Verifier | Worker |
| --- | --- | --- | --- | --- |
| `inherit` | inherit | inherit | inherit | inherit |
| `two-model` | worker | worker | inherit | worker |
| `three-model` | balanced | balanced | inherit | worker |

`cost` is accepted as an alias for `two-model`; `balanced` is accepted as an alias for `three-model`.

The generated aliases are `sew-researcher`, `sew-engineer`, `sew-verifier`, and `sew-worker`. They contain the canonical role prompt plus only host-native model and thinking fields. They contain no permission, tool, sandbox, hook, turn-limit, or workflow-policy overrides.

## Configure

### Claude Code

```bash
npx @oovz/sew-models configure \
  --host claude-code \
  --scope user \
  --preset two-model \
  --worker-model haiku \
  --worker-thinking medium
```

The package writes Markdown agents under:

```text
${CLAUDE_CONFIG_DIR:-~/.claude}/agents/
<project>/.claude/agents/
```

It maps thinking to Claude Code's `effort` frontmatter field. Inherited roles use `model: inherit` and omit `effort`.

### Codex

```bash
npx @oovz/sew-models configure \
  --host codex \
  --scope user \
  --preset two-model \
  --worker-model gpt-5.6-luna \
  --worker-thinking max
```

The package writes TOML roles under:

```text
${CODEX_HOME:-~/.codex}/agents/
<project>/.codex/agents/
```

It maps thinking to `model_reasoning_effort`. Inherited roles omit both `model` and `model_reasoning_effort` so Codex applies its normal spawn defaults and parent inheritance.

### OpenCode

```bash
npx @oovz/sew-models configure \
  --host opencode \
  --scope project \
  --project /absolute/path/to/repository \
  --preset three-model \
  --balanced-model openai/gpt-5.6-terra \
  --balanced-thinking high \
  --worker-model openai/gpt-5.6-luna \
  --worker-thinking max
```

The package writes Markdown agents under:

```text
${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-~/.config}/opencode}/agents/
<project>/.opencode/agents/
```

OpenCode model IDs must use `provider/model-id`. Thinking maps to the provider-specific `variant` field and is treated as an opaque value.

### Custom role mapping

```bash
npx @oovz/sew-models configure \
  --host codex \
  --scope user \
  --preset two-model \
  --worker-model gpt-5.6-luna \
  --worker-thinking max \
  --map researcher=inherit,engineer=worker,verifier=inherit,worker=worker
```

Slots are `inherit`, `balanced`, and `worker`.

### Return to canonical inheritance

```bash
npx @oovz/sew-models configure --host codex --scope user --preset inherit
```

This removes only alias files containing the package's generated-file marker. Unmanaged files are preserved. Use `--dry-run` to preview any configure operation. `--force` is required to replace an existing unmarked `sew-*` alias.

## Doctor

Doctor is read-only. It inspects all supported hosts by default:

```bash
npx @oovz/sew-models doctor
```

Filter by host or select a project root:

```bash
npx @oovz/sew-models doctor --host claude-code,codex --project /absolute/path/to/repository
npx @oovz/sew-models doctor --json
```

Doctor examines:

- Claude Code user/project agent files plus `CLAUDE_CODE_SUBAGENT_MODEL` and `CLAUDE_CODE_EFFORT_LEVEL`;
- Codex user/project `config.toml` and `agents/*.toml`, including `[agents]` defaults;
- OpenCode global/project `opencode.json` and Markdown agent files;
- generated markers, explicit model/thinking fields, duplicate names, malformed files, and model-ID syntax relevant to the host.

Doctor does not invoke `claude`, `codex`, or `opencode`; it does not make paid model calls; and it never modifies a file.

## Development

After pulling a repository change that adds or updates this workspace, run `npm ci` before using the root-level `sew-models` command. npm creates workspace links and executable shims during installation; a pre-existing `node_modules` directory is not refreshed merely because `package.json` changed. Use `npm install` instead only when intentionally updating the lockfile.

The CLI reads its displayed version from this package's `package.json`, so the executable and published manifest cannot silently drift.

## Publishing

This is a public scoped package. From the repository root:

```bash
npm pack --workspace @oovz/sew-models
npm publish --workspace @oovz/sew-models --access public
```

The package uses `package.json#bin` to expose `sew-models`, and `package.json#files` limits the published tarball to the executable, library, role templates, README, and license.
