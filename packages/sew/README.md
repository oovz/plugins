# @oovz/sew

Install, update, diagnose, and optionally configure models for [Senior Engineering Workflow](https://github.com/oovz/plugins/tree/main/plugins/senior-engineering-workflow).

The canonical plugin adds no host-level thinking, tool, permission, sandbox, hook, or turn-limit overrides. It requests or relies on normal parent-model inheritance according to each host. Model configuration created by this package changes only model and host-native thinking fields.

## Requirements

- Node.js 20 or later
- One of: Claude Code, Codex, OpenCode, Gemini CLI, Antigravity, or Oh My Pi (`omp`)

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
| Gemini CLI | CI-built user/project skill and custom-agent payload bundled in the published npm tarball |
| Antigravity | CI-built plugin payload bundled in the published npm tarball; user scope targets Antigravity CLI and project scope targets `.agents/plugins` |

The package records ownership only for static installations from its CI-built release payloads. It refuses unmanaged destination files and refuses to overwrite or remove modified managed files unless `--force` is explicitly supplied. Installation-state roots are validated against the selected host and scope before any managed file is read, changed, or removed.

OpenCode receives one Agent Skill and four Markdown subagents. This is not an OpenCode JavaScript/TypeScript plugin, so it does not appear in the plugin list or the primary-agent switcher. The roles are `mode: subagent` and appear in `opencode agent list`.

After `install` or `update`, `@oovz/sew` runs `opencode agent list` when the OpenCode CLI is available on `PATH`. It reports `verified` only when all four roles are discovered. A fresh OpenCode process that cannot discover the files produces a nonzero result with the missing role names. When the CLI is unavailable, file installation succeeds with a `not-checked` discovery result and an explicit verification command. Restart any OpenCode session that was already running before installation.

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

On Codex, OpenCode, and Gemini CLI, `models configure` edits the installed role agents in place: it inserts or replaces only the model and host-native thinking fields with a targeted drop-in replacement and leaves the prompt, description, and permissions byte-identical to the CI payload. The configuration is recorded in the install state, so `update` and `install --force` restore the payload and re-apply it.

Model configuration is supported only for Codex, OpenCode, and Gemini CLI. Claude Code, Oh My Pi, and Antigravity keep their native inheritance behavior; `models configure` rejects those hosts.

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

`--map researcher=worker,engineer=worker,verifier=inherit,worker=worker` customizes role-to-slot assignment. Slots are exactly `inherit`, `balanced`, and `worker`; no legacy preset or slot aliases are accepted.

Thinking maps to:

| Host | Field |
|---|---|
| Codex | `model_reasoning_effort` |
| OpenCode | `variant` |
| Gemini CLI | No per-agent thinking field; omit the thinking flag |

Restore the CI payload (inheritance) by removing the model/thinking fields:

```bash
npx @oovz/sew models configure --host codex --scope user --preset inherit
```

On editable hosts the edited files remain byte-identical to the CI payload apart from the model block, so `doctor` reports them as current and `update` re-applies the stored configuration. The CLI authorizes edits only when the current file hash matches its recorded state; a generated marker is not treated as ownership. The four role edits and the state update are committed as one rollback-capable transaction.

## 0.10 clean-install boundary

Version 0.10 uses installation-state schema 2 and deliberately does not migrate schema-1 state from 0.9.x. Before replacing a 0.9.x CLI installation, remove its static installation with the matching 0.9.x release, then install 0.10. This keeps obsolete state and ownership paths out of the new implementation. Native marketplace installations owned by Claude Code or Oh My Pi are unaffected.

## Doctor

Doctor is read-only and inspects all six hosts by default:

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
