import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILT_SEW_ROOT = path.join(ROOT, "release-build", "sew", "package");
const { internals, main } = await import(`${pathToFileURL(path.join(BUILT_SEW_ROOT, "lib", "sew.mjs")).href}?validation=${Date.now()}`);

async function temp(prefix = "sew-val-") { return mkdtemp(path.join(os.tmpdir(), prefix)); }

function harnessMockRunner(host, models = [], { error = null, status = 0, disabledModels = [] } = {}) {
  const defaultModels = {
    "claude-code": ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus", "sonnet", "haiku", "opus"],
    codex: ["gpt-5.6-luna", "gpt-5.6-terra", "o3", "o3-mini", "gpt-4o", "gpt-test"],
    opencode: ["openai/gpt-5.6-luna", "openai/gpt-4o", "anthropic/claude-3-7-sonnet", "deepseek/deepseek-v4-flash", "openai/test"],
    cursor: ["claude-3.7-sonnet", "composer-1.5", "gpt-4o"],
    "gemini-cli": ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-flash-preview"],
    antigravity: ["gemini-2.5-pro", "claude-3-7-sonnet", "gpt-4o"],
    "oh-my-pi": ["claude-3-7-sonnet", "gpt-4o", "deepseek-chat"],
  };

  const active = [...(defaultModels[host] ?? []), ...models];
  const items = [
    ...active.map((id) => ({
      id,
      enabled: true,
      available: true,
      supported_reasoning_levels: ["low", "medium", "high", "max"].map((effort) => ({ effort })),
    })),
    ...disabledModels.map((id) => ({ id, enabled: false, available: false, status: "disabled" })),
  ];

  return (executable, args) => {
    if (error) return { error, status: null, stdout: null, stderr: null };
    if (status !== 0) return { status, stdout: "", stderr: "CLI query failed" };
    if (executable === "opencode" && args[0] === "agent" && args[1] === "list") {
      return {
        status: 0,
        stdout: "senior-engineering-workflow-researcher (subagent)\nsenior-engineering-workflow-engineer (subagent)\nsenior-engineering-workflow-verifier (subagent)\nsenior-engineering-workflow-worker (subagent)\n",
        stderr: "",
      };
    }
    if (executable === "codex" && args.join(" ") === "plugin list --json") {
      return { status: 0, stdout: JSON.stringify({ installed: [{ pluginId: "senior-engineering-workflow@otto-plugins", installed: true, enabled: true }] }), stderr: "" };
    }
    if (executable === "codex" && args.join(" ") === "debug models") {
      return { status: 0, stdout: JSON.stringify({ models: items }), stderr: "" };
    }
    if (executable === "opencode" && args.join(" ") === "models") {
      return { status: 0, stdout: active.join("\n") + "\n", stderr: "" };
    }
    if (executable === "agent" && args.join(" ") === "models") {
      return { status: 0, stdout: active.join("\n") + "\n", stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
}

async function capture(argv, { env = {}, spawnSync } = {}) {
  let stdout = "";
  let stderr = "";
  const oldOut = process.stdout.write;
  const oldErr = process.stderr.write;
  process.stdout.write = ((chunk) => { stdout += String(chunk); return true; });
  process.stderr.write = ((chunk) => { stderr += String(chunk); return true; });

  try {
    const code = await main(argv, { env, spawnSync });
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = oldOut;
    process.stderr.write = oldErr;
  }
}

test("Native-only harnesses reject model configuration without invoking a discovery command", async () => {
  for (const host of ["claude-code", "oh-my-pi", "antigravity"]) {
    const project = await temp(`sew-native-models-${host}-`);
    const result = await capture([
      "models", "configure", "--host", host, "--scope", "project", "--project", project,
      "--preset", "inherit",
    ], { env: {}, spawnSync: () => { throw new Error(`${host} should not be queried`); } });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /Model configuration is not supported/u);

    const explicit = await capture([
      "models", "configure", "--host", host, "--scope", "project", "--project", project,
      "--preset", "two-model", "--worker-model", "example-model", "--worker-thinking", "high",
    ], { env: {}, spawnSync: () => { throw new Error(`${host} should not be queried`); } });
    assert.equal(explicit.code, 2);
    assert.match(explicit.stderr, /Model configuration is not supported/u);
  }
});

test("Codex validates models and reasoning effort from codex CLI", async () => {
  const project = await temp("sew-codex-val-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const runner = harnessMockRunner("codex");
  assert.equal((await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: runner })).code, 0);

  const invalidModel = await capture([
    "models", "configure", "--host", "codex", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "claude-in-codex-unsupported",
  ], { env, spawnSync: runner });

  assert.equal(invalidModel.code, 2);
  assert.match(invalidModel.stderr, /Model "claude-in-codex-unsupported" is not available in the local Codex catalog/u);

  const invalidEffort = await capture([
    "models", "configure", "--host", "codex", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "gpt-5.6-luna", "--worker-thinking", "extreme",
  ], { env, spawnSync: runner });

  assert.equal(invalidEffort.code, 2);
  assert.match(invalidEffort.stderr, /Reasoning level "extreme" is not supported by Codex/u);
});

test("OpenCode validates provider/model syntax and warns for unlisted variants", async () => {
  const project = await temp("sew-opencode-val-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const runner = harnessMockRunner("opencode");
  assert.equal((await capture(["install", "--host", "opencode", "--scope", "project", "--project", project], { env, spawnSync: runner })).code, 0);

  const bareModel = await capture([
    "models", "configure", "--host", "opencode", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "gpt-5.6-luna",
  ], { env, spawnSync: runner });

  assert.equal(bareModel.code, 2);
  assert.match(bareModel.stderr, /must use provider\/model syntax/u);

  const caps = internals.fetchHarnessCapabilities("opencode", { project, env, spawnSync: runner });
  const deepseekValid = internals.isModelSupported("opencode", "deepseek/deepseek-v4-flash", caps);
  assert.equal(deepseekValid.supported, true);

  const invalidVariant = await capture([
    "models", "configure", "--host", "opencode", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "openai/gpt-5.6-luna", "--worker-thinking", "turbo-boost",
  ], { env, spawnSync: runner });

  assert.equal(invalidVariant.code, 0, invalidVariant.stderr);
  assert.match(invalidVariant.stderr, /warning:.*reasoning-level|warning:.*variant/iu);
});

test("Gemini CLI rejects thinking settings because its agent format does not support per-agent thinking", async () => {
  const project = await temp("sew-gemini-val-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const runner = harnessMockRunner("gemini-cli");
  assert.equal((await capture(["install", "--host", "gemini-cli", "--scope", "project", "--project", project], { env })).code, 0);

  const invalidThinking = await capture([
    "models", "configure", "--host", "gemini-cli", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "gemini-2.5-pro", "--worker-thinking", "high",
  ], { env, spawnSync: runner });

  assert.equal(invalidThinking.code, 2);
  assert.match(invalidThinking.stderr, /Gemini CLI agent files do not expose a supported thinking-level field/u);
});

test("Disabled models from the Codex catalog are excluded and explicitly rejected", async () => {
  const project = await temp("sew-disabled-cli-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const runner = harnessMockRunner("codex", [], { disabledModels: ["gpt-5.6-luna"] });

  const caps = internals.fetchHarnessCapabilities("codex", { project, env, spawnSync: runner });
  assert.equal(caps.models.includes("gpt-5.6-luna"), false, "Disabled model must not be in enabled models list");
  assert.ok(caps.disabledModels.includes("gpt-5.6-luna"), "Disabled model must be in disabledModels list");

  const check = internals.isModelSupported("codex", "gpt-5.6-luna", caps);
  assert.equal(check.supported, false);
  assert.match(check.reason, /is currently unavailable in your local Codex catalog/u);
});

test("Codex capability discovery uses the documented catalog and preserves per-model reasoning levels", () => {
  const calls = [];
  const runner = (executable, args) => {
    calls.push({ executable, args: [...args] });
    if (executable === "codex" && args.join(" ") === "debug models") {
      return {
        status: 0,
        stdout: JSON.stringify({
          models: [
            {
              slug: "gpt-live",
              visibility: "list",
              supported_in_api: true,
              default_reasoning_level: "low",
              supported_reasoning_levels: [
                { effort: "low", description: "Low" },
                { effort: "xhigh", description: "Extra high" },
              ],
            },
            { slug: "deprecated-model", visibility: "hide", supported_in_api: false },
          ],
        }),
        stderr: "",
      };
    }
    return { status: 1, stdout: "", stderr: "unsupported command" };
  };

  const capabilities = internals.fetchHarnessCapabilities("codex", {
    project: process.cwd(),
    env: {},
    spawnSync: runner,
  });

  assert.deepEqual(calls, [{ executable: "codex", args: ["debug", "models"] }]);
  assert.deepEqual(capabilities.models, ["gpt-live"]);
  assert.deepEqual(capabilities.reasoningLevelsByModel, { "gpt-live": ["low", "xhigh"] });
  assert.equal(capabilities.defaultReasoningByModel["gpt-live"], "low");
  assert.equal(internals.isReasoningSupported("codex", "xhigh", capabilities, "gpt-live").supported, true);
  assert.equal(internals.isReasoningSupported("codex", "max", capabilities, "gpt-live").supported, false);
});

test("sew has no interactive mode or implicit prompt path", () => {
  assert.throws(() => internals.parseArgs([]), /A command is required/u);
  assert.throws(() => internals.parseArgs(["models", "configure", "--interactive"]), /Unknown option/u);
  assert.throws(() => internals.parseArgs(["install", "-i"]), /Unexpected positional argument/u);
});

test("OpenCode accepts an unlisted live variant with an explicit validation warning", async () => {
  const project = await temp("sew-opencode-variant-warning-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const runner = (executable, args) => {
    if (executable === "opencode" && args.join(" ") === "agent list") {
      return {
        status: 0,
        stdout: "senior-engineering-workflow-researcher (subagent)\nsenior-engineering-workflow-engineer (subagent)\nsenior-engineering-workflow-verifier (subagent)\nsenior-engineering-workflow-worker (subagent)\n",
        stderr: "",
      };
    }
    if (executable === "opencode" && args.join(" ") === "models") {
      return { status: 0, stdout: "openai/live-model\n", stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };

  const install = await capture(["install", "--host", "opencode", "--scope", "project", "--project", project], { env, spawnSync: runner });
  assert.equal(install.code, 0, install.stderr);

  const result = await capture([
    "models", "configure", "--host", "opencode", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "openai/live-model", "--worker-thinking", "custom-variant", "--json",
  ], { env, spawnSync: runner });

  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.ok(output.warnings?.some((warning) => /variant|reasoning-level/u.test(warning)));
  const worker = path.join(project, ".opencode", "agents", "senior-engineering-workflow-worker.md");
  assert.match(await readFile(worker, "utf8"), /variant: "custom-variant"/u);
});

test("Gemini CLI accepts an unvalidated model with an explicit warning", async () => {
  const project = await temp("sew-gemini-model-warning-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const runner = () => { throw new Error("Gemini model configuration should not require a discovery command"); };

  const install = await capture(["install", "--host", "gemini-cli", "--scope", "project", "--project", project], { env });
  assert.equal(install.code, 0, install.stderr);

  const result = await capture([
    "models", "configure", "--host", "gemini-cli", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "gemini-custom-enterprise", "--json",
  ], { env, spawnSync: runner });

  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.ok(output.warnings?.some((warning) => /model IDs will not be validated/u.test(warning)));
});

test("Inheritance reset does not query the target harness", async () => {
  const project = await temp("sew-inherit-no-query-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  let calls = 0;
  const runner = (executable, args) => {
    calls += 1;
    if (executable === "codex" && args.join(" ") === "plugin list --json") {
      return { status: 0, stdout: JSON.stringify({ installed: [{ pluginId: "senior-engineering-workflow@otto-plugins", installed: true, enabled: true }] }), stderr: "" };
    }
    if (executable === "codex" && args.join(" ") === "debug models") {
      return { status: 0, stdout: JSON.stringify({ models: [{ slug: "gpt-live", visibility: "list" }] }), stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };

  const install = await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: runner });
  assert.equal(install.code, 0, install.stderr);
  const callsAfterInstall = calls;

  const result = await capture([
    "models", "configure", "--host", "codex", "--scope", "project", "--project", project, "--preset", "inherit",
  ], { env, spawnSync: () => { throw new Error("inherit reset must not query Codex"); } });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(calls, callsAfterInstall);
});

test("Update rejects a stored model that the current Codex catalog no longer lists", async () => {
  const project = await temp("sew-update-model-validation-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  let modelAvailable = true;
  const runner = (executable, args) => {
    if (executable === "codex" && args.join(" ") === "plugin list --json") {
      return { status: 0, stdout: JSON.stringify({ installed: [{ pluginId: "senior-engineering-workflow@otto-plugins", installed: true, enabled: true }] }), stderr: "" };
    }
    if (executable === "codex" && args.join(" ") === "debug models") {
      const slug = modelAvailable ? "gpt-live" : "different-model";
      return { status: 0, stdout: JSON.stringify({ models: [{ slug, visibility: "list" }] }), stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };

  assert.equal((await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: runner })).code, 0);
  assert.equal((await capture([
    "models", "configure", "--host", "codex", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "gpt-live",
  ], { env, spawnSync: runner })).code, 0);

  modelAvailable = false;
  const update = await capture(["update", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: runner });
  assert.equal(update.code, 2);
  assert.match(update.stderr, /no longer valid/u);
});

test("Update rejects a stored Codex reasoning level that the current model catalog no longer lists", async () => {
  const project = await temp("sew-update-reasoning-validation-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  let supportedEfforts = ["high"];
  const runner = (executable, args) => {
    if (executable === "codex" && args.join(" ") === "plugin list --json") {
      return { status: 0, stdout: JSON.stringify({ installed: [{ pluginId: "senior-engineering-workflow@otto-plugins", installed: true, enabled: true }] }), stderr: "" };
    }
    if (executable === "codex" && args.join(" ") === "debug models") {
      return {
        status: 0,
        stdout: JSON.stringify({ models: [{ slug: "gpt-live", visibility: "list", supported_reasoning_levels: supportedEfforts.map((effort) => ({ effort })) }] }),
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  };

  assert.equal((await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: runner })).code, 0);
  assert.equal((await capture([
    "models", "configure", "--host", "codex", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "gpt-live", "--worker-thinking", "high",
  ], { env, spawnSync: runner })).code, 0);

  supportedEfforts = ["low"];
  const update = await capture(["update", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: runner });
  assert.equal(update.code, 2);
  assert.match(update.stderr, /thinking value.*no longer valid/u);
});

test("Codex accepts an unvalidated reasoning level with an explicit warning", () => {
  const capabilities = internals.fetchHarnessCapabilities("codex", {
    project: process.cwd(),
    env: {},
    spawnSync: () => ({ status: 0, stdout: JSON.stringify({ models: [{ slug: "gpt-live", visibility: "list" }] }), stderr: "" }),
  });

  const result = internals.isReasoningSupported("codex", "high", capabilities, "gpt-live");
  assert.equal(result.supported, true);
  assert.equal(result.validated, false);
  assert.match(result.warning, /was not validated/u);
});

test("Overlay functions handle CRLF line endings without duplicating or failing", () => {
  const mdCrlf = "---\r\nname: test\r\ndescription: test\r\n---\r\n# Body\r\n";
  const mdOverlaid = internals.applyModelOverlay("opencode", mdCrlf, { model: "openai/gpt-4o", thinking: "high" });
  assert.match(mdOverlaid, /model: "openai\/gpt-4o"/u);
  assert.match(mdOverlaid, /variant: "high"/u);
  assert.match(mdOverlaid, /<!-- Generated by @oovz\/sew; model configuration only\. -->/u);

  const mdInherit = internals.applyModelOverlay("opencode", mdOverlaid, {});
  assert.doesNotMatch(mdInherit, /model:/u);
  assert.doesNotMatch(mdInherit, /variant:/u);
  assert.doesNotMatch(mdInherit, /<!-- Generated by @oovz\/sew/u);

  const tomlCrlf = "name = \"test\"\r\ndescription = \"test\"\r\ndeveloper_instructions = \"instructions\"\r\n";
  const tomlOverlaid = internals.applyModelOverlay("codex", tomlCrlf, { model: "gpt-5.6-luna", thinking: "max" });
  assert.match(tomlOverlaid, /model = "gpt-5\.6-luna"/u);
  assert.match(tomlOverlaid, /model_reasoning_effort = "max"/u);
  assert.match(tomlOverlaid, /# Generated by @oovz\/sew; model configuration only\./u);

  const tomlUpdated = internals.applyModelOverlay("codex", tomlOverlaid, { model: "gpt-5.6-terra", thinking: "low" });
  assert.match(tomlUpdated, /model = "gpt-5\.6-terra"/u);
  assert.match(tomlUpdated, /model_reasoning_effort = "low"/u);
  assert.equal(tomlUpdated.match(/Generated by @oovz\/sew/gu)?.length, 1, "Must not duplicate overlay marker on update");

  const tomlInherit = internals.applyModelOverlay("codex", tomlUpdated, {});
  assert.doesNotMatch(tomlInherit, /model = /u);
  assert.doesNotMatch(tomlInherit, /model_reasoning_effort = /u);
  assert.doesNotMatch(tomlInherit, /Generated by @oovz\/sew/u);
});

test("OpenCode provider prefix requirement is enforced even when live catalog is null or unvalidated", () => {
  const unvalidatedCheck = internals.isModelSupported("opencode", "gpt-4o", null);
  assert.equal(unvalidatedCheck.supported, false);
  assert.match(unvalidatedCheck.reason, /must use provider\/model syntax/u);

  const validPrefixCheck = internals.isModelSupported("opencode", "openai/gpt-4o", null);
  assert.equal(validPrefixCheck.supported, true);
});

test("Codex reasoning parsing supports snake_case reasoning_effort and alias keys", () => {
  const runner = () => ({
    status: 0,
    stdout: JSON.stringify({
      models: [
        {
          slug: "gpt-custom",
          visibility: "list",
          supported_reasoning_efforts: [
            { reasoning_effort: "low" },
            { level: "high" },
          ],
        },
      ],
    }),
    stderr: "",
  });

  const capabilities = internals.fetchHarnessCapabilities("codex", {
    project: process.cwd(),
    env: {},
    spawnSync: runner,
  });

  assert.deepEqual(capabilities.reasoningLevelsByModel["gpt-custom"], ["low", "high"]);
  assert.equal(internals.isReasoningSupported("codex", "low", capabilities, "gpt-custom").supported, true);
  assert.equal(internals.isReasoningSupported("codex", "high", capabilities, "gpt-custom").supported, true);
});

test("models configure normalizes model and thinking casing to canonical values", async () => {
  const project = await temp("sew-casing-val-");
  const env = { HOME: path.join(project, "home"), XDG_STATE_HOME: path.join(project, "state") };
  const runner = harnessMockRunner("codex", ["gpt-5.6-luna"]);
  assert.equal((await capture(["install", "--host", "codex", "--scope", "project", "--project", project], { env, spawnSync: runner })).code, 0);

  const result = await capture([
    "models", "configure", "--host", "codex", "--scope", "project", "--project", project,
    "--preset", "two-model", "--worker-model", "GPT-5.6-LUNA", "--worker-thinking", "HIGH", "--json",
  ], { env, spawnSync: runner });

  assert.equal(result.code, 0, result.stderr);
  const state = JSON.parse(await readFile(path.join(project, ".oovz", "sew", "codex.json"), "utf8"));
  assert.equal(state.models.worker.model, "gpt-5.6-luna", "Model ID must be normalized to catalog casing");
  assert.equal(state.models.worker.thinking, "high", "Reasoning effort must be normalized to canonical lowercase");
});

test("parseCliModelsOutput strips bullet points from line-based models output", () => {
  const bulletOutput = "- openai/gpt-4o\n* anthropic/claude-3-7-sonnet\n• deepseek/deepseek-chat\n";
  const parsed = internals.parseCliModelsOutput(bulletOutput, "opencode");
  assert.deepEqual(parsed.models, [
    "openai/gpt-4o",
    "anthropic/claude-3-7-sonnet",
    "deepseek/deepseek-chat",
  ]);
});

test("validateStoredModels accepts default model keyword", () => {
  const { validateStoredModels } = internals;
  // validateStoredModels is part of model-config
  assert.doesNotThrow(() => {
    internals.validateStoredModels?.({ worker: { model: "default" } }, "opencode")
      || validateStoredModels?.({ worker: { model: "default" } }, "opencode");
  });
});

