#!/usr/bin/env node
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import YAML from "yaml";
import { allHostTargets, renderHost, resolveHost, supportsHost } from "./lib/hosts.mjs";
import { assert, decodeUtf8, discoverMarketplace, flatAgentId, inspectPlugin, parseFrontmatter, ROOT, walkFiles } from "./lib/marketplace.mjs";
import { assertCatalogMatchesSchemas } from "./lib/schema.mjs";

const GEMINI_TOOLS = new Set(["read_file", "read_many_files", "grep_search", "glob", "list_directory", "replace", "write_file", "run_shell_command", "google_web_search", "web_fetch", "ask_user"]);
const ANTIGRAVITY_TOOLS = new Set(["view_file", "list_dir", "find_by_name", "grep_search", "write_to_file", "replace_file_content", "multi_replace_file_content", "run_command", "search_web", "read_url_content", "invoke_subagent", "ask_question"]);
const CLAUDE_TOOLS = new Set(["Read", "Grep", "Glob", "Write", "Edit", "Bash", "WebSearch", "WebFetch", "Agent", "AskUserQuestion"]);

function artifactMap(artifacts) {
  return new Map(artifacts.map((artifact) => [artifact.path, artifact.content]));
}

function parseMarkdownArtifact(content, label) {
  return parseFrontmatter(content.toString("utf8"), label);
}

function assertDeniedV2(frontmatter, action, label) {
  assert(frontmatter.permissions.some((rule) => rule.action === action && rule.resource === "*" && rule.effect === "deny"), `${label} must deny ${action}`);
}

function validateRenderedAgent(plugin, agent, target, artifacts) {
  const flat = flatAgentId(plugin.manifest.id, agent.id);
  if (target.id === "claude-code") {
    const parsed = parseMarkdownArtifact(artifacts.get(`agents/${agent.id}.md`), `Claude agent ${agent.id}`);
    assert(parsed.frontmatter.name === agent.id && parsed.frontmatter.model === "inherit", `Claude agent ${agent.id} must use scoped id and inherit its model`);
    const tools = new Set(String(parsed.frontmatter.tools).split(/,\s*/).filter(Boolean));
    for (const tool of tools) assert(CLAUDE_TOOLS.has(tool), `Claude agent ${agent.id} has unknown tool ${tool}`);
    if (agent.workspace === "read-only") for (const tool of ["Write", "Edit"]) assert(!tools.has(tool), `Claude read-only agent ${agent.id} exposes ${tool}`);
    if (!agent.shell) assert(!tools.has("Bash"), `Claude shell-denied agent ${agent.id} exposes Bash`);
    if (!agent.external) for (const tool of ["WebSearch", "WebFetch"]) assert(!tools.has(tool), `Claude external-denied agent ${agent.id} exposes ${tool}`);
    if (agent.workspace === "workspace-write") for (const tool of ["Write", "Edit"]) assert(tools.has(tool), `Claude writable agent ${agent.id} must expose ${tool}`);
    if (agent.shell) assert(tools.has("Bash"), `Claude shell-capable agent ${agent.id} must expose Bash`);
    if (agent.external) for (const tool of ["WebSearch", "WebFetch"]) assert(tools.has(tool), `Claude external-capable agent ${agent.id} must expose ${tool}`);
    if (agent.delegates) assert(tools.has("Agent"), `Claude delegating agent ${agent.id} must expose Agent`);
    if (agent.question) assert(tools.has("AskUserQuestion"), `Claude question-capable agent ${agent.id} must expose AskUserQuestion`);
    const denied = String(parsed.frontmatter.disallowedTools ?? "").split(/,\s*/).filter(Boolean);
    if (!agent.delegates) assert(denied.includes("Agent"), `Claude leaf agent ${agent.id} must deny Agent`);
    if (!agent.question) assert(denied.includes("AskUserQuestion"), `Claude agent ${agent.id} must deny direct user questions`);
  } else if (target.id === "codex") {
    const value = parseToml(artifacts.get(`companion/agents/${flat}.toml`).toString("utf8"));
    assert(value.name === flat && value.sandbox_mode === agent.workspace, `Codex agent ${agent.id} has incorrect id or sandbox`);
    assert(value.model === undefined && value.model_reasoning_effort === undefined, `Codex agent ${agent.id} must inherit model and reasoning`);
  } else if (target.id === "gemini-cli") {
    const parsed = parseMarkdownArtifact(artifacts.get(`agents/${flat}.md`), `Gemini agent ${agent.id}`);
    assert(parsed.frontmatter.name === flat && parsed.frontmatter.kind === "local" && parsed.frontmatter.model === "inherit", `Gemini agent ${agent.id} has invalid identity/kind/model`);
    for (const key of ["max_turns", "timeout_mins", "temperature"]) assert(parsed.frontmatter[key] === undefined, `Gemini agent ${agent.id} must not hard-code ${key}`);
    for (const tool of parsed.frontmatter.tools) assert(GEMINI_TOOLS.has(tool), `Gemini agent ${agent.id} has unknown tool ${tool}`);
    if (agent.workspace === "read-only") for (const tool of ["replace", "write_file"]) assert(!parsed.frontmatter.tools.includes(tool), `Gemini read-only agent ${agent.id} exposes ${tool}`);
    if (!agent.shell) assert(!parsed.frontmatter.tools.includes("run_shell_command"), `Gemini shell-denied agent ${agent.id} exposes shell`);
    if (agent.question) assert(parsed.frontmatter.tools.includes("ask_user"), `Gemini question-capable agent ${agent.id} must expose ask_user`);
  } else if (target.id === "antigravity") {
    const parsed = parseMarkdownArtifact(artifacts.get(`agents/${flat}.md`), `Antigravity agent ${agent.id}`);
    const fm = parsed.frontmatter;
    assert(fm.name === flat && fm.mainAgent === false && fm.subagent === true && fm.model === "inherit" && fm.commandExecutionPolicy === "sandbox", `Antigravity agent ${agent.id} has invalid required frontmatter`);
    for (const tool of fm.tools) assert(ANTIGRAVITY_TOOLS.has(tool), `Antigravity agent ${agent.id} has unknown tool ${tool}`);
    if (agent.workspace === "read-only") for (const tool of ["write_to_file", "replace_file_content", "multi_replace_file_content"]) assert(!fm.tools.includes(tool), `Antigravity read-only agent ${agent.id} exposes ${tool}`);
    if (!agent.shell) assert(!fm.tools.includes("run_command"), `Antigravity shell-denied agent ${agent.id} exposes shell`);
    if (agent.delegates) assert(fm.tools.includes("invoke_subagent"), `Antigravity delegating agent ${agent.id} must expose invoke_subagent`);
    if (agent.question) assert(fm.tools.includes("ask_question"), `Antigravity question-capable agent ${agent.id} must expose ask_question`);
  } else if (target.id === "opencode") {
    const parsed = parseMarkdownArtifact(artifacts.get(`.opencode/agents/${flat}.md`), `OpenCode ${target.variant} agent ${agent.id}`);
    const fm = parsed.frontmatter;
    assert(fm.mode === "subagent" && fm.model === undefined && fm.steps === undefined, `OpenCode ${target.variant} agent ${agent.id} must be a model-inheriting subagent without step cap`);
    if (target.variant === "stable") {
      assert(fm.permission && fm.permissions === undefined, `OpenCode stable agent ${agent.id} must use permission`);
      if (!agent.delegates) assert(fm.permission.task?.["*"] === "deny", `OpenCode stable leaf agent ${agent.id} must deny task`);
      assert(fm.permission.external_directory === "deny", `OpenCode stable agent ${agent.id} must deny external_directory`);
      if (agent.workspace === "read-only") assert(fm.permission.edit === "deny", `OpenCode stable read-only agent ${agent.id} must deny edit`);
      if (!agent.shell) assert(fm.permission.bash === "deny", `OpenCode stable agent ${agent.id} must deny bash`);
      if (!agent.external) for (const action of ["webfetch", "websearch"]) assert(fm.permission[action] === "deny", `OpenCode stable agent ${agent.id} must deny ${action}`);
    } else {
      assert(Array.isArray(fm.permissions) && fm.permission === undefined, `OpenCode V2 agent ${agent.id} must use native permissions array`);
      for (const rule of fm.permissions) {
        assert(Object.keys(rule).join(",") === "action,resource,effect", `OpenCode V2 agent ${agent.id} permission rule must use action/resource/effect order`);
        assert(!["bash", "task"].includes(rule.action), `OpenCode V2 agent ${agent.id} uses a V1 action`);
      }
      if (!agent.delegates) assertDeniedV2(fm, "subagent", `OpenCode V2 leaf agent ${agent.id}`);
      assertDeniedV2(fm, "external_directory", `OpenCode V2 agent ${agent.id}`);
      if (agent.workspace === "read-only") assertDeniedV2(fm, "edit", `OpenCode V2 read-only agent ${agent.id}`);
      if (!agent.shell) assertDeniedV2(fm, "shell", `OpenCode V2 shell-denied agent ${agent.id}`);
      if (!agent.external) for (const action of ["webfetch", "websearch"]) assertDeniedV2(fm, action, `OpenCode V2 external-denied agent ${agent.id}`);
    }
  }
}

function validateContract(plugin, contract, label) {
  assert(contract.schema_version && contract.contract_id, `${label} must identify its schema and contract`);
  assert(contract.leaf_roles && Number.isInteger(contract.leaf_role_count), `${label} must declare leaf roles and count`);
  const roles = Object.values(contract.leaf_roles);
  assert(roles.length === contract.leaf_role_count, `${label} leaf_role_count does not match leaf_roles`);
  const manifestIds = new Set(plugin.agents.map((agent) => agent.id));
  const contractIds = new Set(roles.map((role) => role.logical_agent_id));
  assert(manifestIds.size === contractIds.size && [...manifestIds].every((id) => contractIds.has(id)), `${label} roles do not match plugin.json agents`);
  for (const role of roles) assert(role.is_leaf === true && role.delegates === false, `${label} role ${role.logical_agent_id} must be a non-delegating leaf`);
  const fast = contract.routes?.supplied_plan_fast_path;
  assert(fast && fast.required_roles?.includes("engineer") && fast.required_roles?.includes("tester"), `${label} supplied-plan route must hand directly to engineer and tester`);
  for (const role of fast.forbidden_roles_unless_gate_is_invalidated ?? []) assert(!fast.required_roles.includes(role), `${label} supplied-plan route has conflicting required/forbidden role ${role}`);
  const testFast = contract.routes?.supplied_test_plan_fast_path;
  assert(testFast && testFast.production_changes_allowed === false && testFast.required_roles?.includes("tester") && !testFast.required_roles?.includes("engineer"), `${label} supplied-test-plan route must hand directly to Tester without production changes`);
  for (const role of ["manager", "researcher", "architect", "planner", "engineer"]) assert(testFast.forbidden_roles_unless_gate_is_invalidated?.includes(role), `${label} supplied-test-plan route must bypass ${role}`);
  assert(String(contract.supplied_plan_fast_path?.evaluation_order).includes("before"), `${label} must evaluate the supplied-plan fast path before redundant discovery`);
  const cycle = contract.failure_loop?.cycle;
  assert(Array.isArray(cycle) && cycle.length >= 4, `${label} must define the remediation cycle`);
  const firstTester = cycle.findIndex((item) => item.startsWith("Tester"));
  const owner = cycle.findIndex((item) => item.includes("owning role"));
  const rerun = cycle.findIndex((item, index) => index > owner && item.startsWith("Tester") && item.includes("rerun"));
  const reviewer = cycle.findIndex((item, index) => index > rerun && item.startsWith("Reviewer"));
  assert(firstTester === 0 && owner > firstTester && rerun > owner && reviewer > rerun, `${label} remediation sequence must be tester -> owner root cause/fix -> tester rerun -> reviewer closure`);
  const breaker = contract.failure_loop?.no_progress_circuit_breaker;
  assert(Number.isInteger(breaker?.maximum_evidence_backed_no_progress_attempts) && breaker.maximum_evidence_backed_no_progress_attempts > 0, `${label} must bound no-progress attempts`);
  assert(breaker.on_limit?.some((item) => item.includes("stop further mutation")), `${label} circuit breaker must stop further mutation`);
}

async function validatePlugin(plugin) {
  const localLicense = plugin.license.content.toString("utf8");
  assert(localLicense.trim().length > 0, `${plugin.manifest.id} plugin-local LICENSE is empty`);
  if (plugin.manifest.license === "MIT") assert(/MIT License/i.test(localLicense), `${plugin.manifest.id} declares MIT but its LICENSE does not identify the MIT License`);
  if (/^Apache-2\.0$/i.test(plugin.manifest.license)) assert(/Apache License[\s\S]*Version 2\.0/i.test(localLicense), `${plugin.manifest.id} declares Apache-2.0 but its LICENSE does not identify Apache 2.0`);
  for (const agent of plugin.agents) {
    assert(agent.frontmatter.name === agent.id, `${plugin.manifest.id} agent ${agent.id} frontmatter name must match logical id`);
    assert(typeof agent.frontmatter.description === "string" && agent.frontmatter.description.trim(), `${plugin.manifest.id} agent ${agent.id} needs a description`);
    const neutralFields = new Set(["name", "description"]);
    for (const key of Object.keys(agent.frontmatter)) assert(neutralFields.has(key), `${plugin.manifest.id} canonical agent ${agent.id} has host-specific frontmatter field ${key}`);
    assert(agent.body.trim().length > 0, `${plugin.manifest.id} canonical agent ${agent.id} body is empty`);
    if (plugin.manifest.hosts?.["gemini-cli"]?.enabled === true) assert(!agent.delegates, `${plugin.manifest.id} cannot enable Gemini CLI for recursively delegating agent ${agent.id}`);
  }

  for (const target of allHostTargets()) {
    if (!supportsHost(plugin, resolveHost(target.id, target.variant))) continue;
    const rendered = renderHost(plugin, target.id, target.variant);
    const artifacts = artifactMap(rendered.artifacts);
    assert(artifacts.get("LICENSE")?.toString("utf8") === localLicense, `${target.id} bundle for ${plugin.manifest.id} is missing its exact license`);
    for (const agent of plugin.agents) validateRenderedAgent(plugin, agent, target, artifacts);
    for (const skill of plugin.skills) {
      const prefix = target.id === "opencode" ? ".opencode/skills" : target.id === "portable-agent-skills" ? ".agents/skills" : "skills";
      for (const file of skill.files) assert(artifacts.has(path.posix.join(prefix, skill.id, file.relative)), `${target.id} bundle omits ${skill.id}/${file.relative}`);
      assert(artifacts.get(path.posix.join(prefix, skill.id, "LICENSE"))?.toString("utf8") === localLicense, `${target.id} bundle skill ${skill.id} lacks the plugin license`);
    }
    if (target.id === "codex") {
      const manifest = JSON.parse(artifacts.get(".codex-plugin/plugin.json"));
      assert(manifest.name === plugin.manifest.id && manifest.skills === "./skills/" && manifest.agents === undefined, `Codex manifest for ${plugin.manifest.id} is not native`);
    }
    if (target.id === "antigravity") {
      const manifest = JSON.parse(artifacts.get("plugin.json"));
      assert(manifest.name === plugin.manifest.id && manifest.version === undefined, `Antigravity manifest for ${plugin.manifest.id} has invalid fields`);
    }
    if (target.id === "gemini-cli") {
      const manifest = JSON.parse(artifacts.get("gemini-extension.json"));
      assert(manifest.name === plugin.manifest.id && manifest.version === plugin.manifest.version, `Gemini manifest for ${plugin.manifest.id} is invalid`);
    }
  }

  const contractFiles = new Map();
  for (const skill of plugin.skills) {
    for (const file of skill.files.filter((entry) => /workflow-contract\.ya?ml$/i.test(entry.relative))) {
      const parsed = YAML.parse(decodeUtf8(file.content, `${plugin.manifest.id}/${file.relative}`));
      assert(parsed && typeof parsed === "object", `${plugin.manifest.id}/${file.relative} must contain a YAML object`);
      const pluginRelative = path.relative(plugin.directory, file.absolute).split(path.sep).join("/");
      contractFiles.set(pluginRelative, parsed);
    }
  }
  const evalDirectory = path.join(plugin.directory, "evals");
  const evalSuites = new Map();
  try {
    const evalFiles = await walkFiles(evalDirectory, plugin.directory);
    for (const file of evalFiles.filter((entry) => /\.ya?ml$/i.test(entry.relative))) {
      const suite = YAML.parse(decodeUtf8(file.content, `${plugin.manifest.id}/evals/${file.relative}`));
      assert(suite && typeof suite === "object", `${plugin.manifest.id}/evals/${file.relative} must contain a YAML object`);
      evalSuites.set(path.posix.join("evals", file.relative), suite);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (plugin.manifest.validation) {
    assert(plugin.manifest.validation.profile === "engineering-delivery-v1", `unknown declared validation profile: ${plugin.manifest.validation.profile}`);
    const contract = contractFiles.get(plugin.manifest.validation.contract);
    assert(contract, `${plugin.manifest.id} declared contract is missing from its skill tree: ${plugin.manifest.validation.contract}`);
    validateContract(plugin, contract, `${plugin.manifest.id}/${plugin.manifest.validation.contract}`);
    const suite = evalSuites.get(plugin.manifest.validation.evals);
    assert(suite, `${plugin.manifest.id} declared eval suite is missing: ${plugin.manifest.validation.evals}`);
    assert(Array.isArray(suite.cases) && suite.cases.length > 0, `${plugin.manifest.id}/${plugin.manifest.validation.evals} must contain cases`);
    const capabilities = new Set(suite.cases.map((item) => item.capability));
    for (const capability of ["supplied_plan_fast_path", "evidence_backed_remediation", "bounded_failure_loop"]) assert(capabilities.has(capability), `${plugin.manifest.id}/${plugin.manifest.validation.evals} lacks ${capability} coverage`);
  }
}

export async function validateRepository(root = ROOT) {
  const catalog = await discoverMarketplace(root);
  await assertCatalogMatchesSchemas(catalog);
  try { await lstat(path.join(root, "gemini-extension.json")); throw new Error("repository root must not be a Gemini extension; remove gemini-extension.json"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const plugins = await Promise.all(catalog.plugins.map(inspectPlugin));
  const flatIds = new Set();
  const skillIds = new Set();
  for (const plugin of plugins) {
    for (const agent of plugin.agents) {
      const id = flatAgentId(plugin.manifest.id, agent.id);
      assert(!flatIds.has(id), `flat agent id collision: ${id}`);
      flatIds.add(id);
    }
    for (const skill of plugin.skills) {
      assert(!skillIds.has(skill.id), `marketplace skill id collision: ${skill.id}`);
      skillIds.add(skill.id);
    }
    await validatePlugin(plugin);
  }
  return { catalog, plugins };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateRepository().then(({ plugins }) => {
    process.stdout.write(`validated ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} across ${allHostTargets().length} host targets\n`);
  }).catch((error) => {
    process.stderr.write(`validation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
