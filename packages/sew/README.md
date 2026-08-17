# @oovz/sew

Install, update, diagnose, and optionally configure models for [Senior Engineering Workflow](https://github.com/oovz/plugins/tree/main/plugins/senior-engineering-workflow).

The canonical plugin adds no host-level thinking, tool, permission, sandbox, hook, or turn-limit overrides. It requests or relies on normal parent-model inheritance according to each host. Model configuration created by this package changes only model and host-native thinking fields.

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

`--dry-run` previews an operation. `--force` is accepted only where the selected host operation supports a safe forced replacement.

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

The package records ownership only for static installations from its CI-built release payloads. It refuses unmanaged destination files and refuses to overwrite or remove modified managed files unless `--force` is explicitly supplied. Installation-state roots are validated against the selected host and scope before any managed file is read, changed, or removed.

OpenCode receives one Agent Skill and four Markdown subagents. This is not an OpenCode JavaScript/TypeScript plugin, so it does not appear in the plugin list or the primary-agent switcher. The roles are `mode: subagent` and appear in `opencode agent list`.

After `install` or `update`, `@oovz/sew` runs `opencode agent list` when the OpenCode CLI is available on `PATH`. It reports `verified` only when all four roles are discovered. A fresh OpenCode process that cannot discover the files produces a nonzero result with the missing role names. When the CLI is unavailable, file installation succeeds with a `not-checked` discovery result and an explicit verification command. Restart any OpenCode session that was already running before installation.

### Cursor installation

`sew install --host cursor` copies the skill and four custom subagents directly to `~/.cursor/skills` and `~/.cursor/agents`, or to `<project>/.cursor/` for project scope. This direct layout is available to the local Cursor editor and Cursor CLI. CI also generates a native `.cursor-plugin` adapter and root marketplace catalog for Cursor 2.5 and later. Use either the direct CLI installation or a native plugin installation, not both, to avoid duplicate role definitions.

Canonical Cursor agents omit `model`, `readonly`, and `tools`. The adapter therefore does not pin a model or add plugin-level restrictions. Subagent model routing can be configured with `sew models configure --host cursor`, which validates model IDs against `agent models`. Cloud-agent delegation is outside this target.

### Codex hybrid installation

For Codex, the marketplace owns the skill and `@oovz/sew` owns only the four companion-agent TOML files. During `install` and `update`, the CLI checks `codex plugin list --json`:

- when `senior-engineering-workflow@otto-plugins` is installed and enabled, only the companion agents are written;
- when the plugin is missing or disabled, the CLI registers `oovz/plugins`, installs the plugin, and then writes the companion agents;
- `--force` skips the inventory check, reinstalls the marketplace plugin, and replaces conflicting companion-agent files; and
- `uninstall` removes only the companion agents and leaves the marketplace plugin intact.

Host CLIs must be available on `PATH`. The package uses `cross-spawn` for `PATHEXT`, npm command shims, shebangs, paths with spaces, and Windows argument quoting. It does not search private desktop-application bundle directories. Missing executables and missing or invalid working directories fail explicitly.

The complete Codex projection remains in the CI-built payload for release verification, but the static installer copies and claims ownership only for `companion/agents/*`. `--dry-run` does not invoke Codex; it reports the inventory check and conditional plugin-install commands it would perform.

## Model configuration

`install` and `update` deploy the CI-built role agents unchanged; every role inherits the parent session's model, thinking level, tools, and permissions.

`models configure` customizes subagent model routing using CLI flags. It queries live host capabilities when the target harness documents a machine-readable source and never maintains its own model-ID catalog.

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

On editable hosts the edited files remain byte-identical to the CI payload apart from the model block, so `doctor` reports them as current and `update` re-applies the stored configuration after revalidating any available live catalog. A listed model or Codex reasoning effort that is no longer available blocks the update; unverifiable values produce a warning. The CLI authorizes edits only when the current file hash matches its recorded state; a generated marker is not treated as ownership. The role edits and the state update are committed as one rollback-capable transaction.

## Migrate a 0.9.x static installation to 0.10.0 or later

Version 0.10 introduced installation-state schema 2 and deliberately does not read or migrate schema-1 state. Manually delete the files owned by the old static installation, delete its state file, and reinstall. Claude Code and Oh My Pi marketplace installations are host-owned and do not use this cleanup.

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

It reports managed-install drift, explicit role model/thinking settings, duplicate definitions, known host-wide model overrides, malformed generated files, and standard user/project configuration locations. It does not invoke a model, run repository commands, or modify a file.

## Development and release

`packages/sew/` is a private source workspace. It intentionally contains no host payloads and no duplicated role templates. Do not publish it directly.

Local validation:

```bash
npm ci
npm run test:sew
npm run bundle:sew
npm run pack:sew
```

`bundle:sew` builds current Senior Engineering Workflow host projections under `dist/` and stages the publishable package under `release-build/sew/package/`. `pack:sew` creates the npm tarball and checksum under `release-build/sew/artifacts/`.

Release staging is outside `dist/`, so `npm run build -- --all` can replace the complete host-output tree without deleting the staged package or release artifacts. After changing canonical plugin or adapter source, run `bundle:sew` again before invoking `node release-build/sew/package/bin/sew.mjs` so the staged package is current.

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
