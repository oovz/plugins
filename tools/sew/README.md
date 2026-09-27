# @oovz/sew

`@oovz/sew` installs the three Senior Engineering Workflow role configuration files for seven coding harnesses. The npm CLI writes host-native agent files and optional model/reasoning settings. Plugin marketplaces, plugins, Agent Skills and MCP installation are separate products managed through each harness.

## Install

Requires Node.js 22 or later.

```text
npx @oovz/sew install --host codex --scope user
npx @oovz/sew install --host cursor --scope project --project /absolute/path/to/project
```

`user` is the default scope. Project paths must exist. Existing files that match the installed version are unchanged. A valid model/reasoning-only override is preserved on repeat install; other differences report the path and stop. After review, `--force` replaces only those three role files. Other files and host settings are not touched. `--dry-run` reports planned actions without writing files or creating configuration directories.

Run one SEW operation at a time, and finish editing the selected role files before running it. An installation error can leave some role files updated. Inspect the reported path, correct the problem, and rerun the command.

The SEW installer requires no authentication and does not invoke a harness CLI or model API.

## Locations and platform support

The CLI supports Windows, macOS and Linux.

| Harness | User role files | Project role files | CLI OS | Minimum host version |
|---|---|---|---|---|
| Claude Code | `${CLAUDE_CONFIG_DIR:-~/.claude}/agents` | `<project>/.claude/agents` | Windows/macOS/Linux | Not specified |
| Codex | `${CODEX_HOME:-~/.codex}/agents` | `<project>/.codex/agents` | Windows/macOS/Linux | Not specified |
| OpenCode | `${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-~/.config}/opencode}/agents` | `<project>/.opencode/agents` | Windows/macOS/Linux | Not specified |
| Cursor | `~/.cursor/agents` | `<project>/.cursor/agents` | Windows/macOS/Linux | Not specified |
| Gemini CLI | `${GEMINI_CLI_HOME:-~}/.gemini/agents` | `<project>/.gemini/agents` | Windows/macOS/Linux | Not specified |
| Antigravity CLI (`agy`) | `~/.gemini/config/agents` | `<project>/.agents/agents` | Windows/macOS/Linux | CLI 2.0 custom agents |
| Oh My Pi (`omp`) | `~/.omp/agent/agents` | `<project>/.omp/agents` | Windows/macOS/Linux | Not specified |

The Gemini CLI's `GEMINI_CLI_HOME` is a parent directory. It contains `.gemini`; SEW appends that directory before writing `agents/`. See the [official Gemini CLI configuration reference](https://geminicli.com/docs/reference/configuration/#gemini_cli_home). Antigravity CLI user and project agent locations follow its [official custom-agent documentation](https://antigravity.google/docs/cli/commands/agents).

Native harness execution has not been verified for every listed host. Use `doctor` to check configuration files, then start a session in your harness to confirm the roles load.

## Model and reasoning settings

By default, each role uses the host's inheritance/default resolution. Invocation settings and host-wide overrides can affect the selected model. Configure one role by ID:

```text
npx @oovz/sew models configure --host codex --scope user --role engineer --model YOUR_MODEL_ID --reasoning high
npx @oovz/sew models configure --host opencode --scope project --project /absolute/path/to/project --role researcher --model YOUR_PROVIDER/YOUR_MODEL_ID --reasoning high
npx @oovz/sew models configure --host claude-code --role verifier --model sonnet --reasoning high
npx @oovz/sew models configure --host antigravity --role engineer --model flash
npx @oovz/sew models configure --host cursor --scope user --role verifier --model composer-2.5
```

Use `--model inherit` to restore the harness-native inheritance setting while preserving existing reasoning settings. Supply `--reasoning` to change reasoning in the same operation.

```text
npx @oovz/sew models configure --host codex --role engineer --model inherit
```

| Harness | Configuration written by `--model inherit` |
|---|---|
| Claude Code, Cursor, Gemini CLI, Antigravity CLI | `model: inherit` |
| Codex, Oh My Pi | Removes the `model` field so the host resolves it |
| OpenCode | **Not supported**; the command rejects it without writing |

For OpenCode, use `--reset` to remove both model and reasoning overrides, or configure a concrete `provider/model-id`. OpenCode itself supports inheriting the invoking agent's model when the field is absent; the unsupported option here is SEW's `--model inherit` parameter.

Host precedence still applies: Codex agent defaults or invocation settings and Oh My Pi task settings can take precedence over the parent model. Explicit `inherit` and an omitted field can also differ in Claude Code when environment overrides are set. See [Claude Code](https://code.claude.com/docs/en/sub-agents#choose-a-model), [Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Cursor](https://cursor.com/docs/subagents), [Gemini CLI](https://geminicli.com/docs/core/subagents/#configuration-schema), [Antigravity CLI](https://antigravity.google/docs/subagents?tab=cli), [Oh My Pi](https://github.com/can1357/oh-my-pi/blob/main/docs/task-agent-discovery.md#model-and-structured-output-precedence), and [OpenCode](https://opencode.ai/docs/agents/#model) for native resolution rules.

The command changes only model and host-supported reasoning fields in the selected role file. Existing instructions, descriptions and unrelated frontmatter/TOML fields are preserved. Use `--reset` to remove those override fields from the selected file and let the host resolve configuration normally:

```text
npx @oovz/sew models configure --host codex --role engineer --reset
```

Claude Code uses `effort`, Codex uses `model_reasoning_effort`, OpenCode uses `variant`, and Oh My Pi uses `thinking-level`. Antigravity model values are the documented tiers `inherit`, `flash`, and `pro`. Other supported role formats have no reasoning field; `--reasoning` is rejected for them. Model values are checked for valid host syntax without a live catalog query. Host availability is determined by the harness when the role runs. Oh My Pi accepts `inherit`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, and `auto`. Except for exact `auto`, unambiguous prefixes of at least two characters are accepted, such as `hi`; values are case-sensitive.

## Doctor

Doctor parses documented user and project locations for missing role files, malformed host files, model/reasoning settings, and duplicate definitions. User and project files are reported separately. `coverage` lists the valid scopes for each required role; `duplicates` lists roles that are valid in both scopes. Native effective configuration is resolved by the host. Its `configuration-valid` result describes those file checks only. Doctor is read-only and does not inspect plugin installations, caches or marketplace sources.

```text
npx @oovz/sew doctor --host all --project /absolute/path/to/project --json
```

JSON reports each inventory's scope and each role's path, resolved identity, parse status, and model settings. Text output includes scope, path, and the cause of invalid entries. Errors honor `--json`, including argument errors. Invalid role files produce a nonzero exit status. Missing files are reported as `incomplete` with exit status 0, and an explicitly supplied project directory must exist.

## Host plugins and migration from 0.12.x

The host controls plugin and marketplace installation. Install the marketplace's SEW plugin separately when you want its plugin distribution and skill; use `@oovz/sew` when you want the direct role configuration files. If both define the same active role in a harness, disable one through that harness before relying on the other.

SEW 0.13 removes `update`, `uninstall`, and marketplace management commands. Existing native marketplace installations remain owned by their harness; the new CLI does not edit or remove them. Install role files from the new package and review any conflicts with `--force`.

## Migration from 0.13.x

Version 0.14 packages Researcher, Engineer, and Verifier. Worker is retired. Existing `senior-engineering-workflow-worker.md` or `.toml` files are preserved by install, including `--force`; doctor inventories only the three current roles. Review and remove or disable the retired file in each applicable user/project scope. `models configure --role worker` is rejected.

The retained role prompts have changed. Review conflicts and use `install --force` for the intended scope to replace them. Force restores packaged defaults, including model settings; record and reapply any overrides you want to keep. Native plugin installations remain managed by their harness.

## Local development

From a clone of this repository, use Node.js 22 or later and run:

```text
npm ci
npm run bundle:sew
npm run test:sew
node release-build/sew/package/bin/sew.mjs --help
```

Use the built CLI with a disposable project and `--scope project --project /absolute/path/to/project` when testing configuration changes. Run `npm run verify` for the full repository checks.
