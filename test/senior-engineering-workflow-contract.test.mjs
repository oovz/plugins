import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validateRepository } from "../scripts/validate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(ROOT, "plugins", "senior-engineering-workflow");
const SKILL_ROOT = path.join(PLUGIN_ROOT, "skills", "senior-engineering-workflow");
const ROLE_IDS = ["researcher", "engineer", "verifier", "worker"];

async function listFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return files.sort();
}

test("engineering-delivery-v2 uses canonical reference filenames", async () => {
  const manifest = JSON.parse(await readFile(path.join(PLUGIN_ROOT, "plugin.json"), "utf8"));
  assert.equal(manifest.validation.profile, "engineering-delivery-v2");
  assert.equal(
    manifest.validation.contract,
    "skills/senior-engineering-workflow/references/workflow-contract.yaml",
  );
  assert.equal(manifest.validation.evals, "evals/workflow-routing.yaml");

  const sourceFiles = await listFiles(PLUGIN_ROOT);
  assert.equal(
    sourceFiles.some((file) =>
      /(?:workflow-contract|workflow-routing|task-routing|delegation-and-state|verification)-v2\./u.test(file)),
    false,
    "contract versions belong in file content, not validator-sensitive filenames",
  );
});

test("engineering-delivery-v2 contract and eval suite are coherent", async () => {
  const contract = YAML.parse(
    await readFile(path.join(SKILL_ROOT, "references", "workflow-contract.yaml"), "utf8"),
  );
  const suite = YAML.parse(
    await readFile(path.join(PLUGIN_ROOT, "evals", "workflow-routing.yaml"), "utf8"),
  );
  const manifest = JSON.parse(await readFile(path.join(PLUGIN_ROOT, "plugin.json"), "utf8"));

  assert.equal(contract.schema_version, "2.0.0");
  assert.equal(contract.contract_version, "2.0.0");
  assert.equal(contract.profile, "engineering-delivery-v2");
  assert.deepEqual(Object.keys(contract.leaf_roles).sort(), [...ROLE_IDS].sort());
  assert.equal(contract.delegation.required_work_order, "references/delegation-and-state.md");
  assert.equal(contract.runtime_permissions.canonical_policy, "inherit");
  assert.equal(contract.runtime_permissions.host_level_restrictions_emitted_by_plugin, false);
  assert.equal(contract.runtime_permissions.behavioral_scope_remains_work_order_bound, true);
  assert.equal(contract.long_running_operations.avoid_status_only_polling, true);
  assert.equal(contract.long_running_operations.terminal_status_required_for_completion, true);

  assert.deepEqual(manifest.components.agents.map((agent) => agent.id), ROLE_IDS);
  for (const agent of manifest.components.agents) {
    assert.equal(agent.permissionPolicy, "inherit");
    assert.deepEqual(agent.model, { policy: "inherit" });
  }

  assert.equal(suite.schema_version, "2.0.0");
  assert.equal(suite.profile, contract.profile);
  assert.equal(
    suite.contract_ref,
    "../skills/senior-engineering-workflow/references/workflow-contract.yaml",
  );
  assert.equal(
    suite.cases.some((item) => item.capability === "model_profile_portability"),
    false,
    "model configuration is deployment documentation, not workflow semantics",
  );
});

test("skill, role prompts, contract, and routing evals contain no model-selection policy", async () => {
  const files = [
    path.join(SKILL_ROOT, "SKILL.md"),
    path.join(SKILL_ROOT, "references", "workflow-contract.yaml"),
    path.join(PLUGIN_ROOT, "evals", "workflow-routing.yaml"),
    ...ROLE_IDS.map((role) => path.join(PLUGIN_ROOT, "agents", `${role}.md`)),
  ];
  const prohibited = [
    /\brecommendedTier\b/u,
    /\bmodel[_ -]?profile\b/iu,
    /\b(two|three)[-_ ]model\b/iu,
    /\b(worker|balanced)[-_ ]model\b/iu,
    /\bsew-(?:researcher|engineer|verifier|worker)\b/u,
    /\bworker-thinking\b/u,
    /\bbalanced-thinking\b/u,
  ];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const pattern of prohibited) {
      assert.doesNotMatch(content, pattern, `${path.relative(ROOT, file)} must not contain model-selection policy`);
    }
  }
});

test("active workflow references use the four-role architecture", async () => {
  const referenceFiles = [
    "architecture.md",
    "planning.md",
    "engineering.md",
    "evidence-and-research.md",
    "task-routing.md",
    "verification.md",
  ];
  const staleRolePatterns = [
    /\bArchitect is a .*subagent\b/iu,
    /\bPlanner is a .*subagent\b/iu,
    /\bTester\b/u,
    /\bReviewer\b/u,
    /\bManager is a .*subagent\b/iu,
  ];
  for (const name of referenceFiles) {
    const content = await readFile(path.join(SKILL_ROOT, "references", name), "utf8");
    for (const pattern of staleRolePatterns) {
      assert.doesNotMatch(content, pattern, `${name} contains a stale role-stage instruction`);
    }
  }
});

test("repository validator discovers and validates the canonical v2 contract", async () => {
  const { plugins } = await validateRepository(ROOT);
  const plugin = plugins.find((item) => item.manifest.id === "senior-engineering-workflow");
  assert.ok(plugin, "senior-engineering-workflow must be present");
  assert.equal(plugin.manifest.validation.profile, "engineering-delivery-v2");
});
