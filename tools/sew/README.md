# @oovz/sew

`@oovz/sew` installs the four Senior Engineering Workflow role configuration files for seven coding harnesses. The npm CLI writes host-native agent files and optional model/reasoning settings. Plugin marketplaces, plugins, Agent Skills and MCP installation are separate products managed through each harness.

## Install

Requires Node.js 22 or later.

```text
npx @oovz/sew install --host codex --scope user
npx @oovz/sew install --host cursor --scope project --project /absolute/path/to/project
```

`user` is the default scope. Project paths must exist. Install preflights all four SEW role targets before writing. If a target matches the packaged file, it is unchanged. A valid model/reasoning-only override is preserved on repeat install; other differences report the path and stop. After review, `--force` replaces only those four role files. Other files and host settings are not touched. `--dry-run` reports planned actions without writing files or creating configuration directories.

Run one SEW operation at a time, and finish editing the selected role files before running it. SEW checks all four targets, then writes them in sequence. A filesystem error can leave earlier writes in place. Inspect the reported path, correct the problem, and rerun the command.

There are no SEW installation-state files. A repeat install is determined from the four selected host files. The SEW installer does not invoke a harness CLI, native marketplace command or model API and requires no authentication.

## Locations and platform support

The npm command entry point and configuration file operations support Windows, macOS and Linux. Native release CI installs and smoke-tests the exact package archive on all three operating systems with Node 22 and 24.

| Harness | User role files | Project role files | CLI OS | Minimum host version | Last harness-native test |
|---|---|---|---|---|
| Claude Code | `${CLAUDE_CONFIG_DIR:-~/.claude}/agents` | `<project>/.claude/agents` | Windows/macOS/Linux | Not specified in reviewed upstream agent docs | Not run; generated files checked |
| Codex | `${CODEX_HOME:-~/.codex}/agents` | `<project>/.codex/agents` | Windows/macOS/Linux | Not specified in reviewed upstream agent docs | Not run; TOML parsed |
| OpenCode | `${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-~/.config}/opencode}/agents` | `<project>/.opencode/agents` | Windows/macOS/Linux | Not specified in reviewed upstream agent docs | Not run; frontmatter checked |
| Cursor | `~/.cursor/agents` | `<project>/.cursor/agents` | Windows/macOS/Linux | Not specified in upstream direct-agent docs | Not run; frontmatter checked |
| Gemini CLI | `${GEMINI_CLI_HOME:-~}/.gemini/agents` | `<project>/.gemini/agents` | Windows/macOS/Linux | Not specified in reviewed upstream agent docs | Not run; frontmatter checked |
| Antigravity CLI (`agy`) | `~/.gemini/config/agents` | `<project>/.agents/agents` | Windows/macOS/Linux | CLI 2.0 custom agents | Not run; frontmatter/tool lists checked |
| Oh My Pi (`omp`) | `~/.omp/agent/agents` | `<project>/.omp/agents` | Windows/macOS/Linux | Not specified in reviewed upstream agent docs | Not run; frontmatter checked |

The Gemini CLI's `GEMINI_CLI_HOME` is a parent directory. It contains `.gemini`; SEW appends that directory before writing `agents/`. See the [official Gemini CLI configuration reference](https://geminicli.com/docs/reference/configuration/#gemini_cli_home). Antigravity CLI user and project agent locations follow its [official custom-agent documentation](https://antigravity.google/docs/cli/commands/agents).

The release smoke verifies file creation, repeat installation, model settings, doctor results and the npm command on native OS runners. It does not claim that a harness has loaded a role or successfully executed a model. Native harness acceptance is recorded only after a real harness is exercised.

## Model and reasoning settings

By default, each role inherits the parent session's model. Configure one role by ID:

```text
npx @oovz/sew models configure --host codex --scope user --role worker --model gpt-5.6-luna --reasoning high
npx @oovz/sew models configure --host opencode --scope project --project /absolute/path/to/project --role researcher --model openai/gpt-5.6-terra --reasoning high
npx @oovz/sew models configure --host claude-code --role verifier --model sonnet --reasoning high
npx @oovz/sew models configure --host antigravity --role worker --model flash
npx @oovz/sew models configure --host cursor --scope user --role verifier --model composer-2.5
```

The command changes only model and host-supported reasoning fields in the selected role file. Existing instructions, descriptions and unrelated frontmatter/TOML fields are preserved. Use `--reset` to remove those override fields from the selected file and let the host resolve configuration normally:

```text
npx @oovz/sew models configure --host codex --role worker --reset
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

SEW 0.13 removes `update` and `uninstall`, old installation-state files, marketplace commands, Codex app-server adapters, cache/ref verification, and marketplace recovery. Existing native marketplace installations remain owned by their harness; the new CLI does not edit or remove them. Install role files from the new package and review any conflicts with `--force`.

## Development and release

`tools/sew/` is the private source workspace. The build packages only the four role files generated from the canonical plugin role sources for each enabled host. It does not publish plugin manifests, skills, MCP declarations, marketplace records or host caches.

```text
npm ci
npm run verify
npm run bundle:sew
npm run pack:sew
```

`bundle:sew` generates host projections under `dist/` and stages the CLI under `release-build/sew/package/`. `pack:sew` builds one npm tarball and checksum. The release workflow uploads that candidate once, tests it on Windows/macOS/Linux with Node 22/24, then publishes the same checked artifact.

## Release setup

npm trusted publishing requires Node.js 22.14.0 or later and npm 11.5.1 or later. Before tagging a release, configure the npm trusted publisher for package `@oovz/sew` with owner/user `oovz`, repository `plugins`, and workflow filename `release-sew.yml` (omit `.github/workflows/`). Permit the workflow's direct `npm publish` action. Configure a GitHub environment only if the workflow uses that exact environment name.

The publish job uses Node 24, installs npm 11.5.1, and grants `id-token: write` only after the exact archive has passed all six Windows/macOS/Linux × Node 22/24 smoke cells. The npm account association and hosted job results must be checked before publishing; repository tests cannot establish either.

Tag only a clean source commit after `npm run verify`, `npm run pack:sew`, and the installed-package smoke pass. Confirm the plugin/package versions match, use the `sew-v<version>` tag, and verify the tarball's embedded source SHA and checksum. If that package version already exists on npm, choose the next version before creating the tag.
