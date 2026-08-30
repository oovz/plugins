# @oovz/sew

Install, update, diagnose, and optionally configure models for [Senior Engineering Workflow](https://github.com/oovz/plugins/tree/main/plugins/senior-engineering-workflow).

Canonical plugin roles use each host's normal parent-model inheritance. They add no host-level thinking, tool, permission, sandbox, hook, or turn-limit overrides. Model configuration from this package changes only model and host-native thinking fields.

## Requirements

- Node.js 20 or later
- One of: Claude Code, Codex, OpenCode, Cursor 2.5+, Gemini CLI, Antigravity, or Oh My Pi (`omp`)

## Run without installing globally

```bash
npx @oovz/sew install --host codex --scope user
npx @oovz/sew doctor
```

A global install is also supported:

```bash
npm install --global @oovz/sew
sew --help
```

Human-readable output uses terminal colors when supported. Set `NO_COLOR=1` to disable them or `FORCE_COLOR=1` to enable them for redirected output. JSON output remains ANSI-free.

## Install, update, and uninstall

```bash
npx @oovz/sew install --host <host> --scope user
npx @oovz/sew update --host <host> --scope user
npx @oovz/sew uninstall --host <host> --scope user
```

Use project scope with an explicit project root:

```bash
npx @oovz/sew install --host opencode --scope project --project /absolute/path/to/project
```

`--dry-run` previews an operation. Supported host operations accept `--force` for reviewed replacements.

Installation methods:

| Host | Method |
|---|---|
| Claude Code | Native Claude plugin marketplace commands |
| Oh My Pi | Native OMP marketplace commands |
| Codex | Marketplace skill detected or installed by the CLI; four CI-built companion agents managed by `@oovz/sew` |
| OpenCode | CI-built Agent Skill and four Markdown subagents bundled in the published npm tarball |
| Cursor | CI-built Agent Skill and four custom subagents bundled in the published npm tarball; a native Cursor plugin adapter is generated as well |
| Gemini CLI | CI-built user/project skill and custom-agent payload bundled in the published npm tarball |
| Antigravity | CI-built plugin payload bundled in the published npm tarball; user scope targets Antigravity CLI and project scope targets `.agents/plugins` |

The package records ownership for static installations from its CI-built release payloads. Unmanaged destination files and modified managed files cause the operation to stop. Use `--force` after reviewing the conflict. Before reading or changing a managed file, the CLI validates its installation-state root against the selected host and scope.

OpenCode receives one Agent Skill and four `mode: subagent` Markdown agents. Inspect them with `opencode agent list`.

After `install` or `update`, `@oovz/sew` runs `opencode agent list` when the OpenCode CLI is available on `PATH`. It reports `verified` only when all four roles are discovered. A fresh OpenCode process that cannot discover the files produces a nonzero result with the missing role names. When the CLI is unavailable, file installation succeeds with a `not-checked` discovery result and an explicit verification command. Restart any OpenCode session that was already running before installation.

### Cursor installation

`sew install --host cursor` copies the skill and four custom subagents directly to `~/.cursor/skills` and `~/.cursor/agents`, or to `<project>/.cursor/` for project scope. This direct layout is available to the local Cursor editor and Cursor CLI. CI also generates a native `.cursor-plugin` adapter and root marketplace catalog for Cursor 2.5 and later. Choose the direct CLI or native plugin installation; using both creates duplicate role definitions.

Canonical Cursor agents omit `model`, `readonly`, and `tools`. The adapter therefore does not pin a model or add plugin-level restrictions. Subagent model routing can be configured with `sew models configure --host cursor`, which validates model IDs against `agent models`. Cloud-agent delegation is outside this target.

### Codex hybrid installation

For Codex, the marketplace owns the skill and `@oovz/sew` owns only the four companion-agent TOML files. During `install` and `update`, the CLI checks `codex plugin list --json`:

- when `senior-engineering-workflow@otto-plugins` is installed and enabled, only the companion agents are written;
- when the plugin is missing or disabled, the CLI registers `oovz/plugins`, installs the plugin, and then writes the companion agents;
- `--force` skips the inventory check, reinstalls the marketplace plugin, and replaces conflicting companion-agent files; and
- `uninstall` removes only the companion agents and leaves the marketplace plugin intact.

Host CLIs are resolved from `PATH`. For Codex, the CLI also detects the binary bundled with the current ChatGPT desktop application in `/Applications/ChatGPT.app` or `~/Applications/ChatGPT.app` on macOS and the newest staged build under `%LOCALAPPDATA%\OpenAI\Codex\bin` on Windows. The package uses `cross-spawn` for `PATHEXT`, npm command shims, shebangs, paths with spaces, and Windows argument quoting. Missing executables or working directories produce an explicit error.

The complete Codex projection remains in the CI-built payload for release verification, but the static installer copies and claims ownership only for `companion/agents/*`. `--dry-run` does not invoke Codex; it reports the inventory check and conditional plugin-install commands it would perform.

## Model configuration

`install` and `update` deploy the CI-built role agents unchanged; every role inherits the parent session's model, thinking level, tools, and permissions.

`models configure` customizes subagent model routing using CLI flags. It reads live host capabilities when the target harness documents a machine-readable source.

- Codex uses `codex debug models` and validates both the model ID and the selected model's supported reasoning efforts.
- OpenCode uses `opencode models` and validates the exact `provider/model` ID. OpenCode variants are model-specific but do not have a documented machine-readable list, so a supplied variant is applied with a warning.
- Cursor uses `agent models` and validates the model ID. Cursor custom-agent files do not expose a supported thinking field.
- Gemini CLI has no documented machine-readable model catalog, so a supplied model is applied with a warning. Gemini custom-agent files do not expose a supported thinking field.
- Claude Code, Oh My Pi, and Antigravity remain inheritance-only because `@oovz/sew` does not own editable role files for those hosts.

### CLI configuration

Optional model routing uses three slots:

| Preset | Researcher | Engineer | Verifier | Worker |
|---|---|---|---|---|
| `inherit` | inherit | inherit | inherit | inherit |
| `two-model` | worker | worker | inherit | worker |
| `three-model` | balanced | balanced | inherit | worker |

Two-model example:

```bash
npx @oovz/sew models configure \
  --host codex \
  --scope user \
  --preset two-model \
  --worker-model gpt-5.6-luna \
  --worker-thinking max
```

Three-model example:

```bash
npx @oovz/sew models configure \
  --host opencode \
  --scope project \
  --project /absolute/path/to/project \
  --preset three-model \
  --balanced-model openai/gpt-5.6-terra \
  --balanced-thinking high \
  --worker-model openai/gpt-5.6-luna \
  --worker-thinking max
```

`--map researcher=worker,engineer=worker,verifier=inherit,worker=worker` customizes role-to-slot assignment. Slots are exactly `inherit`, `balanced`, and `worker`.

Thinking maps to:

| Host | Field |
|---|---|
| Codex | `model_reasoning_effort` (validated per model) |
| OpenCode | `variant` (applied with a warning because variants are not exposed as a machine-readable list) |
| Cursor | No supported per-agent thinking field; omit the thinking flag |
| Gemini CLI | No supported per-agent thinking field; omit the thinking flag |
| Claude Code, Antigravity, Oh My Pi | Model configuration is not supported by `sew` |

Restore canonical inheritance by removing the model/thinking fields:

```bash
npx @oovz/sew models configure --host codex --scope user --preset inherit
```

On editable hosts, the model block is the only difference from the CI payload. `doctor` therefore reports the files as current, and `update` reapplies the stored configuration after checking any available live catalog. A listed model or Codex reasoning effort that has disappeared blocks the update; unverifiable values produce a warning. The CLI authorizes edits only when the current file hash matches its recorded state. A generated marker conveys no ownership. Role edits and the state update commit as one rollback-capable transaction.

## Migrate a 0.9.x static installation to 0.10.0 or later

Version 0.10 introduced installation-state schema 2. Upgrading a schema-1 static installation requires manual removal of its managed files and state file before reinstalling. Claude Code and Oh My Pi marketplace installations are host-owned and use their native update path.

First close the affected coding harness. Back up any role or skill file that you edited manually. Delete only the paths for the host and scope you previously installed:

| Host | User-scope payload | Project-scope payload |
|---|---|---|
| Codex | `${CODEX_HOME:-~/.codex}/agents/senior-engineering-workflow-*.toml` | `<project>/.codex/agents/senior-engineering-workflow-*.toml` |
| OpenCode | `${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-~/.config}/opencode}/agents/senior-engineering-workflow-*.md` and `skills/senior-engineering-workflow/` | `<project>/.opencode/agents/senior-engineering-workflow-*.md` and `skills/senior-engineering-workflow/` |
| Gemini CLI | `${GEMINI_CLI_HOME:-~/.gemini}/agents/senior-engineering-workflow-*.md` and `skills/senior-engineering-workflow/` | `<project>/.gemini/agents/senior-engineering-workflow-*.md` and `skills/senior-engineering-workflow/` |
| Antigravity | `~/.gemini/antigravity-cli/plugins/senior-engineering-workflow/` | `<project>/.agents/plugins/senior-engineering-workflow/` |

Do not delete the Codex marketplace-owned skill. Remove only the four companion TOML files listed above.

Then delete the matching installation-state file:

| Scope | State file |
|---|---|
| Windows user | `%LOCALAPPDATA%\oovz\sew\<host>.json` |
| macOS/Linux user | `${XDG_STATE_HOME:-~/.local/state}/oovz/sew/<host>.json` |
| Project | `<project>/.oovz/sew/<host>.json` |

Reinstall after cleanup:

```bash
npx @oovz/sew@latest install --host <host> --scope user
# or
npx @oovz/sew@latest install --host <host> --scope project --project /absolute/path/to/project
```

For the common Windows OpenCode user-scope case, the manual cleanup is:

```powershell
$OpenCode = if ($env:OPENCODE_CONFIG_DIR) {
  $env:OPENCODE_CONFIG_DIR
} elseif ($env:XDG_CONFIG_HOME) {
  Join-Path $env:XDG_CONFIG_HOME "opencode"
} else {
  Join-Path $HOME ".config\opencode"
}

"researcher", "engineer", "verifier", "worker" | ForEach-Object {
  Remove-Item (Join-Path $OpenCode "agents\senior-engineering-workflow-$_.md") -Force -ErrorAction SilentlyContinue
}
Remove-Item (Join-Path $OpenCode "skills\senior-engineering-workflow") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:LOCALAPPDATA "oovz\sew\opencode.json") -Force -ErrorAction SilentlyContinue

npx @oovz/sew@latest install --host opencode --scope user
```

## Doctor

Doctor is read-only and inspects all seven hosts by default:

```bash
npx @oovz/sew doctor
npx @oovz/sew doctor --host claude-code,codex --project /absolute/path/to/project
npx @oovz/sew doctor --json
```

Doctor reports managed-install drift, explicit role model/thinking settings, duplicate definitions, known host-wide model overrides, malformed generated files, and standard user/project configuration locations. Its checks stay local: they invoke no model or repository command and change no files.

## Development and release

`tools/sew/` is a private source workspace. Host payloads are added during release staging, so publish only the staged package produced by `bundle:sew`.

Local validation:

```bash
npm ci
npm run test:sew
npm run bundle:sew
npm run pack:sew
```

`bundle:sew` builds current Senior Engineering Workflow host projections under `dist/` and stages the publishable package under `release-build/sew/package/`. `pack:sew` creates the npm tarball and checksum under `release-build/sew/artifacts/`.

Release staging lives outside `dist/`, so `npm run build -- --all` can replace the host-output tree while leaving staged artifacts intact. After changing canonical plugin or adapter source, run `bundle:sew` again before invoking `node release-build/sew/package/bin/sew.mjs`.

Production publication is performed by `.github/workflows/release-sew.yml` from a `sew-v<version>` tag. The workflow:

1. installs locked dependencies;
2. runs the full repository verification;
3. rebuilds the host projections from canonical plugin source;
4. stages and packs `@oovz/sew`;
5. uploads the tarball and checksum as a workflow artifact;
6. downloads and verifies that exact artifact in a separate release job;
7. publishes the tarball through npm trusted publishing; and
8. attaches the same tarball and `SHA256SUMS.txt` to a GitHub Release.

Configure the package's npm trusted publisher to the `oovz/plugins` repository and `.github/workflows/release-sew.yml` before creating a release tag. The package has one runtime dependency, `cross-spawn`, for reliable cross-platform host command execution.

## Release version contract

The `@oovz/sew` package and the bundled `senior-engineering-workflow` plugin are released in lockstep. Release validation fails when their versions differ. The CI publish step uses npm trusted publishing and explicitly requests provenance.
