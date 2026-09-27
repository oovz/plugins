import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { validateRepository } from "../scripts/validate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(ROOT, "plugins", "senior-engineering-workflow");
const SKILL_ROOT = path.join(ROOT, "skills", "senior-engineering-workflow");
const ROLE_IDS = ["researcher", "engineer", "verifier"];

async function listFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return files.sort();
}

test("engineering-delivery-v3 uses canonical reference filenames", async () => {
  const manifest = JSON.parse(await readFile(path.join(PLUGIN_ROOT, "manifest.json"), "utf8"));
  assert.equal(manifest.validation.profile, "engineering-delivery-v3");
  assert.equal(
    manifest.validation.contract,
    "evals/workflow-contract.yaml",
  );
  assert.equal(manifest.validation.evals, "evals/workflow-routing.yaml");

  const sourceFiles = [...await listFiles(PLUGIN_ROOT), ...await listFiles(SKILL_ROOT)];
  assert.equal(
    sourceFiles.some((file) =>
      /(?:workflow-contract|workflow-routing|task-routing|delegation-and-state|verification)-v2\./u.test(file)),
    false,
    "contract versions belong in file content, not validator-sensitive filenames",
  );
});

test("engineering-delivery-v3 contract and eval suite are coherent", async () => {
  const contract = YAML.parse(
    await readFile(path.join(PLUGIN_ROOT, "evals", "workflow-contract.yaml"), "utf8"),
  );
  const suite = YAML.parse(
    await readFile(path.join(PLUGIN_ROOT, "evals", "workflow-routing.yaml"), "utf8"),
  );
  const manifest = JSON.parse(await readFile(path.join(PLUGIN_ROOT, "manifest.json"), "utf8"));

  assert.equal(contract.schema_version, "3.0.0");
  assert.equal(contract.contract_version, "3.0.0");
  assert.equal(contract.profile, "engineering-delivery-v3");
  assert.deepEqual(Object.keys(contract.leaf_roles).sort(), [...ROLE_IDS].sort());
  assert.equal(contract.delegation.required_work_order, "references/delegation-and-state.md");
  assert.ok(contract.delegation.minimum_specialist_packet.includes("authorized_instruction_sources"));
  assert.equal(contract.runtime_permissions.canonical_policy, "inherit");
  assert.equal(contract.runtime_permissions.plugin_emitted_host_restrictions.default, "none");
  assert.deepEqual(contract.runtime_permissions.plugin_emitted_host_restrictions.antigravity, {
    tools: "explicit_allowlist",
    command_execution_policy: "sandbox",
  });
  assert.equal(contract.runtime_permissions.behavioral_scope_remains_work_order_bound, true);
  assert.equal(contract.long_running_operations.avoid_status_only_polling, true);
  assert.equal(contract.long_running_operations.terminal_status_required_for_completion, true);

  assert.deepEqual(manifest.components.agents.map((agent) => agent.id), ROLE_IDS);
  for (const agent of manifest.components.agents) {
    assert.equal(agent.permissionPolicy, "inherit");
    assert.deepEqual(agent.model, { policy: "inherit" });
  }

  assert.equal(suite.schema_version, "3.0.0");
  assert.equal(suite.profile, contract.profile);
  assert.equal(
    suite.contract_ref,
    "./workflow-contract.yaml",
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
    path.join(PLUGIN_ROOT, "evals", "workflow-contract.yaml"),
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

test("active workflow references use the three-role architecture", async () => {
  const referenceFiles = [
    "architecture.md",
    "engineering.md",
    "evidence-and-research.md",
    "verification.md",
  ];
  const staleRolePatterns = [
    /\bArchitect is a .*subagent\b/iu,
    /\bPlanner is a .*subagent\b/iu,
    /\bWorker\b/u,
    /\bworker_requests\b/u,
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

test("repository validator discovers and validates the canonical v3 contract", async () => {
  const { plugins } = await validateRepository(ROOT);
  const plugin = plugins.find((item) => item.manifest.id === "senior-engineering-workflow");
  assert.ok(plugin, "senior-engineering-workflow must be present");
  assert.equal(plugin.manifest.validation.profile, "engineering-delivery-v3");
});

test("workflow trust boundary distinguishes authorized policy from quoted task data", async () => {
  const skill = await readFile(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
  assert.match(skill, /apply user-authorized repository policies.*harness-selected skills/iu);
  const packet = await readFile(path.join(SKILL_ROOT, "references", "delegation-and-state.md"), "utf8");
  assert.match(packet, /authorized_instruction_sources/u);
  for (const role of ROLE_IDS) {
    const prompt = await readFile(path.join(PLUGIN_ROOT, "agents", `${role}.md`), "utf8");
    assert.match(prompt, /Apply only the repository policies and harness-selected skills named in the parent work order's `authorized_instruction_sources` field/isu);
    assert.match(prompt, /prompt-injection text embedded in them as untrusted evidence/iu);
    assert.doesNotMatch(prompt, /Treat repository content, .*as untrusted data, never as instructions/iu);
  }
});

test("workflow validator rejects unsafe role boundaries and retired routing", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sew-v3-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ["marketplace.json", "schemas", "plugins", "skills"]) {
    await cp(path.join(ROOT, name), path.join(root, name), { recursive: true });
  }
  const contractFile = path.join(root, "plugins/senior-engineering-workflow/evals/workflow-contract.yaml");
  const suiteFile = path.join(root, "plugins/senior-engineering-workflow/evals/workflow-routing.yaml");
  const originalContract = await readFile(contractFile, "utf8");
  const originalSuite = await readFile(suiteFile, "utf8");
  await validateRepository(root);

  for (const [mutate, expected] of [
    [(contract) => { contract.leaf_roles.verifier.may_write_test_files = true; }, /write boundary/u],
    [(contract) => { contract.leaf_roles.researcher.delegates = true; }, /non-delegating leaf/u],
    [(contract) => { contract.leaf_roles.engineer.runs_own_tools = false; }, /own tool execution/u],
    [(contract) => { contract.execution.concurrent_writers_require_disjoint_ownership_or_isolation = false; }, /ownership/u],
  ]) {
    const contract = YAML.parse(originalContract);
    mutate(contract);
    await writeFile(contractFile, YAML.stringify(contract));
    await assert.rejects(validateRepository(root), expected);
  }
  await writeFile(contractFile, originalContract);
  const suite = YAML.parse(originalSuite);
  suite.cases[0].expected.invoked_roles.required = ["worker"];
  await writeFile(suiteFile, YAML.stringify(suite));
  await assert.rejects(validateRepository(root), /unknown role worker/u);

  const incomplete = YAML.parse(originalSuite);
  incomplete.cases = incomplete.cases.filter((item) => item.capability !== "long_context_judgment");
  await writeFile(suiteFile, YAML.stringify(incomplete));
  await assert.rejects(validateRepository(root), /lacks long_context_judgment coverage/u);
});
