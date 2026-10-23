# Repository architecture and working guide

This repository distributes Agent Skills, host-specific plugin bundles, and the `@oovz/sew` role-configuration CLI. Use this guide to locate the source of a behavior, understand the design constraints, and choose appropriate validation. Keep `AGENTS.md` outside distribution payloads.

## Products and boundaries

- **Skills** are self-contained instruction packages under `skills/`. Each has canonical `SKILL.md` frontmatter, its own license, and any references, scripts, or assets needed to perform its task. A skill can be distributed alone or included in a plugin.
- **Plugins** select cataloged skills and add roles, commands, host metadata, or MCP configuration. Host renderers produce the native layouts consumed by plugin managers or the generic installer.
- **SEW CLI** installs Researcher, Engineer, and Verifier role files and configures model/reasoning fields. Its `doctor` command inspects local role configuration. Native harnesses own plugin installation, marketplace state, and model execution.

The SEW workflow skill and CLI are separate installations. Updating CLI role files does not update the main agent's skill. The primary agent owns workflow transitions and integration; specialists perform their assigned work, run their own tools, and return results.

## Source map

| Location | Responsibility |
|---|---|
| `marketplace.json` | Catalog IDs, marketplace identity, and registered skills/plugins. |
| `skills/<skill-id>/` | Canonical portable instructions and supporting resources. |
| `plugins/<plugin-id>/manifest.json` | Plugin version, component references, host support, and agent capabilities. |
| `plugins/<plugin-id>/agents/` and `evals/` | Role prompts, workflow reference contracts, and manual scenarios. |
| `schemas/` | Catalog, plugin, and installation-ownership schemas. |
| `scripts/lib/marketplace.mjs` | Catalog loading, source discovery, and component validation. |
| `scripts/lib/hosts.mjs` | Native manifests, role frontmatter, component layouts, and host capability mappings. |
| `scripts/generate.mjs` and `scripts/validate.mjs` | Generation, drift detection, and canonical/native format validation. |
| `scripts/install.mjs` and `scripts/lib/managed-files.mjs` | Generic plugin/skill installation, ownership records, collision checks, and file transactions. |
| `scripts/lib/files.mjs` | Contained, atomic writes for generated files and trees. |
| `tools/sew/lib/` | CLI commands, host paths, role schemas, and model/reasoning updates. |
| `scripts/build-sew-package.mjs` and `scripts/finalize-sew-package.mjs` | Publishable CLI staging and runtime dependencies. |
| `scripts/pack-sew.mjs`, `scripts/check-sew-release.mjs`, and `scripts/smoke-sew-release.mjs` | Archive creation, release identity checks, and installed-package smoke tests. |
| `scripts/prepare-sew-release.mjs`, `scripts/check-sew-promotion.mjs`, and `scripts/lib/sew-release-metadata.mjs` | Tagged-source notes and version/identity checks for publication or promotion. |
| `test/` and `.github/workflows/` | Automated checks and CI/release execution. |

## Generation and packaging

The source flow is:

```text
marketplace.json + skills/ + plugins/
  -> validation -> host renderers
       -> generate: adapters/<host>/<plugin-id>/ + marketplace catalogs
       -> build: dist/<host>/<plugin-id>/
            -> release-build/sew/package/ CLI and role payloads
            -> release-build/sew/artifacts/ npm archive and checksum
```

`generate` refreshes committed projections; `build` creates native bundles under `dist/`. The SEW builder selects the three role definitions from those bundles and stages them with the CLI. `tools/sew` remains a private source workspace; staging creates the publishable package manifest.

Commit canonical changes with their affected adapters and catalogs: `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`, `.cursor-plugin/marketplace.json`, and `.omp-plugin/marketplace.json`. Edit sources or renderers, then regenerate; generated edits are overwritten and drift checking rejects inconsistencies. `dist/` and `release-build/` are reproducible, ignored outputs.

Run generation from the repository root:

```sh
npm run generate -- --plugin <plugin-id>
npm run generate -- --all
```

Use the plugin-specific command for a contained change and `--all` for shared skills, renderers, or changes spanning plugins. Standalone-only skills need no plugin generation.

## Design decisions and invariants

- Author each skill once and reference its catalog ID from consuming plugins. Keep skill and plugin IDs stable because installers and host discovery use them.
- Put native schema differences in renderers and explicit host metadata. Validate against the supported host contract as well as generated-output consistency. Reject unsupported capability combinations or state their supported boundary.
- Keep supporting skill resources self-contained and discoverable through conditional references. Each skill and plugin carries the license needed for independent distribution.
- Use the existing `yaml`, `smol-toml`, and Ajv dependencies for YAML, TOML, and JSON Schema. Dependency changes need evidence from the affected parser or contract.
- Preserve source/target containment, symlink safeguards, ownership checks, and file-collision handling at the boundaries that require them.
- The generic installer protects managed files with ownership records and transactions. SEW instead preflights its three role files and writes them sequentially under a single-writer contract. A SEW write failure can leave a partial update; recovery is to correct the reported issue and rerun. Keep these failure models separate.
- Repeat SEW installation preserves valid model/reasoning-only overrides. `--force` restores packaged defaults for the three role targets. Other host configuration remains outside that operation.
- Model and reasoning validation checks local syntax and schemas. The harness decides availability and effective precedence when it executes a role. Configuration validity is distinct from observed model execution.
- Preserve release artifact identity: the archive checked and smoked is the archive published. Source SHA, role digest, version alignment, and checksum checks support that guarantee.

## Working on changes

Use `senior-engineering-workflow` when available, choosing the lightest sufficient route. Start with the accepted outcome, applicable instructions, and existing changes. Keep related implementation and immediate validation together; delegate when independent evidence or parallel ownership materially helps.

Read [adding a skill](docs/adding-a-skill.md) or [adding a plugin](docs/adding-a-plugin.md) when changing component structure or host metadata. Identify consuming plugins and targets before editing a shared source. Preserve active contracts and unrelated work; make routine reversible decisions within scope.

Write documentation where it helps someone understand or change the relevant behavior. Explain architecture, decisions, setup, usage, migration, and troubleshooting where needed, and link to the authoritative location instead of repeating it. Preserve command syntax, compatibility limits, and meaningful safety constraints when editing prose. Use direct instructions and load detailed skill references only for the branches that need them.

Keep obsolete files out of active paths after a replacement is complete. Retain migration steps that still serve supported installations. Publication and release-tag pushes need authorization from the request or accepted plan; reuse authority already given.

## Testing and verification

Follow the [OpenAI testing and verification guidance](https://developers.openai.com/api/docs/guides/latest-model#gpt-6-astra-testing-and-verification): choose meaningful checks for the changed behavior and complete required gates. Once those pass, broaden or repeat checks only for a subsequent change, failure, or unresolved concern. Reuse evidence for an unchanged candidate; rewriting a commit message alone does not require another test run.

Test observable outcomes and reachable failures at the lowest effective layer. Add a decisive regression for a defect when feasible. Use integration checks for real process, persistence, security, filesystem, or host boundaries. Reuse adequate coverage and identify the evidence gap before adding a test. Review prose and checked-in settings directly. Do not add tests that merely pin wording or copied settings. Exercise configuration through its supported consumer and observable effects; exact assertions need an independently established parser, protocol, serialization, generated-artifact, or program-output contract. Retain valid checks for file writes, refused writes, and data preservation. Test selection alone does not authorize deleting reference contracts.

| Change | Relevant checks |
|---|---|
| Documentation prose | Inspect accuracy, paths, links/anchors, commands, and `git diff --check`. |
| Distributed skill or role instructions | Regenerate affected projections; run `npm run verify` once for the integrated candidate. Use a representative behavioral trial when a changed decision rule warrants it. |
| Plugin metadata, schema, or host renderer | Regenerate affected output and run `npm run verify`; inspect native manifests, paths, licenses, and executable modes. |
| Extension helper | Run `node --test test/extension-build-selection.test.mjs`, then check regenerated consumers. |
| Generic installer/filesystem behavior | Run the affected installer and managed-file tests in disposable projects/homes; use `npm run verify` for shared changes. |
| SEW runtime/configuration | Run `npm run test:sew`; broaden to `npm run verify` when shared contracts or packaging are affected. |
| Package or release candidate | Verify the repository, then pack and smoke the actual archive using the commands below. |

Node.js 22 or later is required. Use `npm ci` for initial setup or dependency changes. `npm run verify` combines canonical validation, generated drift checks, tests, and native distribution builds. `npm test` and `npm run test:sew` stage SEW through their pretest hooks; before directly running a staged CLI test with `node --test`, run `npm run bundle:sew`.

The reference contract in `plugins/senior-engineering-workflow/evals/workflow-contract.yaml` records workflow ownership, role boundaries, and invariants. Keep it aligned with the skill and role instructions through review. The linked scenarios in `workflow-routing.yaml` are inputs for manual agent trials. Evaluate observed decisions and outcomes; neither file requires exact-wording or fixed-configuration tests. For comparisons, hold the task revision, model, host, permissions, and tools constant, and record limitations.

Report exact checks and observed results. Distinguish pre-existing/environmental failures, unrun checks, configuration checks, native execution, and release acceptance. Stop when the requested outcome has sufficient evidence.

## CI and release details

[validate.yml](.github/workflows/validate.yml) calls [validate-reusable.yml](.github/workflows/validate-reusable.yml) on pushes and pull requests. The matrix runs `npm ci` and `npm run verify` on Windows, macOS, and Linux with Node 22 and 24. Local checks and unpushed commits do not establish hosted CI results.

Before distributing changed content, bump each affected plugin version, update displayed versions, and regenerate its projections. Shared skills affect every plugin that bundles them. Keep the SEW plugin and `tools/sew/package.json` versions equal, including the lockfile; the root tooling version is independent.

Plugin/skill updates use committed adapters and native bundles. Gemini requires its extension manifest at the installed archive or repository root. Reserve `sew-v<version>` tags for an authorized CLI release.

```sh
npm run pack:sew
node scripts/smoke-sew-release.mjs release-build/sew/artifacts
```

`pack:sew` stages the CLI and creates one archive plus `SHA256SUMS.txt`. The smoke runner installs that archive in disposable directories and exercises all seven host configurations.

[release-sew.yml](.github/workflows/release-sew.yml) validates the repository, builds a candidate with the tagged source SHA, checks its identity, and smokes that same archive across six OS/Node cells. The publish job verifies its downloaded checksum, publishes with npm provenance, and attaches the archive and checksum to the GitHub release.

Publication jobs share one queue across SEW tags. Within that queue, release planning reads published GitHub releases and npm versions. Only the newest stable version in each service is eligible for its latest marker; older and prerelease npm publications use `release-<version>` tags. Notes list commits from the highest lower published GitHub release to the tagged source, excluding prereleases as the baseline for stable releases. Tag identity and the package version at that commit must agree. Preserve published tags and package bytes when repairing notes or latest markers.

To repair npm's latest marker, manually dispatch `release-sew.yml` with `release_tag` set to the existing newest stable tag. This mode verifies the registry package's version and source against the tag and uses OIDC to update the marker without republishing. It shares the publication queue and requires the npm trusted publisher's **Allow npm dist-tag** permission. The repair job uses npm 11.21.0 for OIDC dist-tag support.

For publication, use a clean source commit and an unpublished matching version. Verify npm trusted-publisher binding for package `@oovz/sew`, owner `oovz`, repository `plugins`, and workflow `release-sew.yml`; configure an environment only when the workflow names one. The workflow uses Node 24 and npm 11.5.1 for publishing, with `id-token: write` confined to the release and promotion jobs. Check account binding and hosted results directly before publication.
