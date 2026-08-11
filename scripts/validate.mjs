#!/usr/bin/env node
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import YAML from "yaml";
import { allHostTargets, renderHost, resolveHost, supportsHost } from "./lib/hosts.mjs";
import { assert, classifyCodexComponents, decodeUtf8, discoverMarketplace, flatAgentId, inspectPlugin, parseFrontmatter, ROOT, walkFiles } from "./lib/marketplace.mjs";
import { assertCatalogMatchesSchemas } from "./lib/schema.mjs";

const GEMINI_TOOLS = new Set(["read_file", "read_many_files", "grep_search", "glob", "list_directory", "replace", "write_file", "run_shell_command", "google_web_search", "web_fetch", "ask_user"]);
const ANTIGRAVITY_TOOLS = new Set(["view_file", "list_dir", "find_by_name", "grep_search", "write_to_file", "replace_file_content", "multi_replace_file_content", "run_command", "search_web", "read_url_content", "invoke_subagent", "ask_question"]);
const CLAUDE_TOOLS = new Set(["Read", "Grep", "Glob", "Write", "Edit", "Bash", "WebSearch", "WebFetch", "Agent", "AskUserQuestion"]);
const OH_MY_PI_TOOLS = new Set([
  "ask",
  "ast_edit",
  "ast_grep",
  "bash",
  "browser",
  "checkpoint",
  "computer",
  "debug",
  "edit",
  "eval",
  "generate_image",
  "github",
  "glob",
  "grep",
  "hub",
  "inspect_image",
  "learn",
  "lsp",
  "manage_skill",
  "memory_edit",
  "read",
  "recall",
  "reflect",
  "retain",
  "rewind",
  "security_scan",
  "task",
  "todo",
  "tts",
  "web_search",
  "write",
]);

export function assertKnownOhMyPiTools(tools, label = "Oh My Pi agent") {
  assert(Array.isArray(tools), `${label} must declare tools as an array`);
  for (const tool of tools) assert(OH_MY_PI_TOOLS.has(tool), `${label} has unknown tool ${tool}`);
}

function artifactMap(artifacts) {
  return new Map(artifacts.map((artifact) => [artifact.path, artifact.content]));
}

function parseMarkdownArtifact(content, label) {
  return parseFrontmatter(content.toString("utf8"), label);
}


function validateRenderedAgent(plugin, agent, target, artifacts) {
  const flat = flatAgentId(plugin.manifest.id, agent.id);
  const inheritsPermissions = agent.permissionPolicy === "inherit";
  if (target.id === "claude-code") {
    const parsed = parseMarkdownArtifact(artifacts.get(`agents/${agent.id}.md`), `Claude agent ${agent.id}`);
    assert(parsed.frontmatter.name === agent.id && parsed.frontmatter.model === "inherit", `Claude agent ${agent.id} must use scoped id and inherit its model`);
    if (inheritsPermissions) {
      assert(parsed.frontmatter.tools === undefined, `Claude permission-inheriting agent ${agent.id} must not set a tools allowlist`);
      assert(parsed.frontmatter.disallowedTools === undefined, `Claude permission-inheriting agent ${agent.id} must not set disallowedTools`);
      return;
    }
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
    assert(value.name === flat, `Codex agent ${agent.id} has incorrect id`);
    if (inheritsPermissions) assert(value.sandbox_mode === undefined, `Codex permission-inheriting agent ${agent.id} must not override sandbox_mode`);
    else assert(value.sandbox_mode === agent.workspace, `Codex agent ${agent.id} has incorrect sandbox`);
    assert(value.model === undefined && value.model_reasoning_effort === undefined, `Codex agent ${agent.id} must inherit model and reasoning`);
  } else if (target.id === "gemini-cli") {
    const parsed = parseMarkdownArtifact(artifacts.get(`agents/${flat}.md`), `Gemini agent ${agent.id}`);
    assert(parsed.frontmatter.name === flat && parsed.frontmatter.kind === "local" && parsed.frontmatter.model === "inherit", `Gemini agent ${agent.id} has invalid identity/kind/model`);
    for (const key of ["max_turns", "timeout_mins", "temperature"]) assert(parsed.frontmatter[key] === undefined, `Gemini agent ${agent.id} must not hard-code ${key}`);
    if (inheritsPermissions) {
      assert(parsed.frontmatter.tools === undefined, `Gemini permission-inheriting agent ${agent.id} must omit tools so the parent tool set is inherited`);
      return;
    }
    assert(Array.isArray(parsed.frontmatter.tools), `Gemini explicit agent ${agent.id} must declare tools`);
    for (const tool of parsed.frontmatter.tools) assert(GEMINI_TOOLS.has(tool), `Gemini agent ${agent.id} has unknown tool ${tool}`);
    if (agent.workspace === "read-only") for (const tool of ["replace", "write_file"]) assert(!parsed.frontmatter.tools.includes(tool), `Gemini read-only agent ${agent.id} exposes ${tool}`);
    if (!agent.shell) assert(!parsed.frontmatter.tools.includes("run_shell_command"), `Gemini shell-denied agent ${agent.id} exposes shell`);
    if (agent.question) assert(parsed.frontmatter.tools.includes("ask_user"), `Gemini question-capable agent ${agent.id} must expose ask_user`);
  } else if (target.id === "antigravity") {
    if (inheritsPermissions) {
      assert(!artifacts.has(`agents/${flat}.md`), `Antigravity permission-inheriting agent ${agent.id} must use the skill's generic inherited subagent route instead of a tool-empty static definition`);
      return;
    }
    const parsed = parseMarkdownArtifact(artifacts.get(`agents/${flat}.md`), `Antigravity agent ${agent.id}`);
    const fm = parsed.frontmatter;
    assert(fm.name === flat && fm.mainAgent === false && fm.subagent === true && fm.model === "inherit" && fm.commandExecutionPolicy === "sandbox", `Antigravity agent ${agent.id} has invalid required frontmatter`);
    for (const tool of fm.tools) assert(ANTIGRAVITY_TOOLS.has(tool), `Antigravity agent ${agent.id} has unknown tool ${tool}`);
    if (agent.workspace === "read-only") for (const tool of ["write_to_file", "replace_file_content", "multi_replace_file_content"]) assert(!fm.tools.includes(tool), `Antigravity read-only agent ${agent.id} exposes ${tool}`);
    if (!agent.shell) assert(!fm.tools.includes("run_command"), `Antigravity shell-denied agent ${agent.id} exposes shell`);
    if (agent.delegates) assert(fm.tools.includes("invoke_subagent"), `Antigravity delegating agent ${agent.id} must expose invoke_subagent`);
    if (agent.question) assert(fm.tools.includes("ask_question"), `Antigravity question-capable agent ${agent.id} must expose ask_question`);
  } else if (target.id === "oh-my-pi") {
    const parsed = parseMarkdownArtifact(artifacts.get(`agents/${flat}.md`), `Oh My Pi agent ${agent.id}`);
    const fm = parsed.frontmatter;
    assert(fm.name === flat && fm.description === agent.description, `Oh My Pi agent ${agent.id} has invalid identity or description`);
    assert(fm.model === undefined && fm["thinking-level"] === undefined && fm.thinking === undefined, `Oh My Pi agent ${agent.id} must inherit model and thinking`);
    if (inheritsPermissions) {
      assert(fm.tools === undefined && fm.spawns === undefined, `Oh My Pi permission-inheriting agent ${agent.id} must not narrow tools or spawn policy`);
      return;
    }
    assertKnownOhMyPiTools(fm.tools, `Oh My Pi agent ${agent.id}`);
    for (const tool of ["read", "grep", "glob"]) assert(fm.tools.includes(tool), `Oh My Pi explicit agent ${agent.id} must expose ${tool}`);
    if (agent.workspace === "read-only") for (const tool of ["edit", "write", "ast_edit"]) assert(!fm.tools.includes(tool), `Oh My Pi read-only agent ${agent.id} exposes ${tool}`);
    if (agent.workspace === "workspace-write") for (const tool of ["edit", "write"]) assert(fm.tools.includes(tool), `Oh My Pi writable agent ${agent.id} must expose ${tool}`);
    if (agent.shell) assert(fm.tools.includes("bash"), `Oh My Pi shell-capable agent ${agent.id} must expose bash`);
    else assert(!fm.tools.includes("bash"), `Oh My Pi shell-denied agent ${agent.id} exposes bash`);
    if (agent.external) assert(fm.tools.includes("web_search"), `Oh My Pi external-capable agent ${agent.id} must expose web_search`);
    else assert(!fm.tools.includes("web_search"), `Oh My Pi external-denied agent ${agent.id} exposes web_search`);
    if (agent.delegates) assert(fm.tools.includes("task"), `Oh My Pi delegating agent ${agent.id} must expose task`);
    else assert(!fm.tools.includes("task"), `Oh My Pi leaf agent ${agent.id} exposes task`);
    if (agent.question) assert(fm.tools.includes("ask"), `Oh My Pi question-capable agent ${agent.id} must expose ask`);
    else assert(!fm.tools.includes("ask"), `Oh My Pi agent ${agent.id} exposes ask without question capability`);
  } else if (target.id === "opencode") {
    const parsed = parseMarkdownArtifact(artifacts.get(`.opencode/agents/${flat}.md`), `OpenCode ${target.variant} agent ${agent.id}`);
    const fm = parsed.frontmatter;
    assert(fm.mode === "subagent" && fm.model === undefined && fm.steps === undefined, `OpenCode ${target.variant} agent ${agent.id} must be a model-inheriting subagent without step cap`);
    if (inheritsPermissions) {
      assert(fm.permission === undefined && fm.permissions === undefined, `OpenCode permission-inheriting agent ${agent.id} must not set permission rules`);
      return;
    }
    assert(target.variant === "stable", `unsupported OpenCode variant ${target.variant}`);
    assert(fm.permission && fm.permissions === undefined, `OpenCode stable agent ${agent.id} must use permission`);
    if (!agent.delegates) assert(fm.permission.task?.["*"] === "deny", `OpenCode stable leaf agent ${agent.id} must deny task`);
    assert(fm.permission.external_directory === "deny", `OpenCode stable agent ${agent.id} must deny external_directory`);
    if (agent.workspace === "read-only") assert(fm.permission.edit === "deny", `OpenCode stable read-only agent ${agent.id} must deny edit`);
    if (!agent.shell) assert(fm.permission.bash === "deny", `OpenCode stable agent ${agent.id} must deny bash`);
    if (!agent.external) for (const action of ["webfetch", "websearch"]) assert(fm.permission[action] === "deny", `OpenCode stable agent ${agent.id} must deny ${action}`);
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

function sourceFiles(plugin) {
  const files = new Map();
  for (const skill of plugin.skills) {
    for (const file of skill.files) {
      const relative = path.relative(plugin.directory, file.absolute).split(path.sep).join("/");
      files.set(relative, decodeUtf8(file.content, `${plugin.manifest.id}/${relative}`));
    }
  }
  return files;
}

async function validateActiveMarketplaceReadme(catalog) {
  let readme;
  try {
    readme = await readFile(path.join(catalog.root, "README.md"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const heading = "## Available plugins";
  const start = readme.indexOf(heading);
  assert(start >= 0, "README.md must contain an Available plugins table");
  const nextHeading = readme.indexOf("\n## ", start + heading.length);
  const section = readme.slice(start, nextHeading < 0 ? readme.length : nextHeading);
  const rows = new Map();
  const rowPattern = /^\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|/gm;
  for (const match of section.matchAll(rowPattern)) {
    const link = match[1].replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
    assert(!rows.has(link), `README.md contains duplicate marketplace plugin row: ${link}`);
    rows.set(link, match[2].trim());
  }
  assert(rows.size > 0, "README.md Available plugins table must contain plugin rows");
  for (const plugin of catalog.plugins) {
    const catalogPath = plugin.marketplace.plugins.find((entry) => entry.id === plugin.manifest.id)?.path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
    assert(catalogPath && rows.has(catalogPath), `README.md is missing an Available plugins row for ${plugin.manifest.id}`);
    assert(rows.get(catalogPath) === plugin.manifest.version, `README.md version for ${plugin.manifest.id} does not match ${plugin.manifest.version}`);
  }
  for (const link of rows.keys()) assert(catalog.plugins.some((plugin) => plugin.marketplace.plugins.find((entry) => entry.id === plugin.manifest.id)?.path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "") === link), `README.md references an uncataloged plugin path: ${link}`);
}

function normalizedGuidance(source) {
  return source
    .normalize("NFKC")
    .replace(/[`*>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guidanceSentences(source) {
  return source
    .normalize("NFKC")
    .replace(/[`*>#]/g, " ")
    .split(/\r?\n+|(?<=[.!?])\s+(?=[A-Z0-9])/u)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function guidanceCandidates(source) {
  const sentences = guidanceSentences(source);
  return [...sentences, ...sentences.flatMap((sentence) => {
    const historicalPrefix = /^\s*(?:before|prior to|pre[- ]?)\s*Tauri\s+2\.11\.1\b/iu.test(sentence);
    const separator = historicalPrefix
      ? /[:;()—]|\b(?:although|and|because|but|however|while|whereas|yet)\b/iu
      : /[:,;()—]|\b(?:although|and|because|but|however|while|whereas|yet)\b/iu;
    return sentence.split(separator).map((clause) => clause.trim()).filter(Boolean);
  })];
}

function isExplicitRefutation(sentence) {
  const normalized = sentence.toLowerCase().trim();
  return /\b(?:do not|don't|never|avoid)\s+(?:claim|say|describe|state|treat|assume|suggest)\b/.test(normalized)
    || /^(?:it is|this is|that is)\s+(?:false|incorrect|unsafe|not true|not correct)\s+(?:to\s+)?(?:claim|say|describe|state|treat|assume|suggest)\b/.test(normalized);
}

function isHistoricalContext(sentence, item, source) {
  if (item.historical_scope !== "remote-ipc"
    || !/\b(?:before|prior to|pre[- ]?)\s*Tauri\s+2\.11\.1\b/i.test(sentence)
    || !/\b(?:remote|ACL|IPC|command|AppManifest)\b/i.test(sentence)) return false;
  const normalizedSource = normalizedGuidance(source);
  const normalizedSentence = normalizedGuidance(sentence);
  const index = normalizedSource.lastIndexOf(normalizedSentence);
  if (index < 0) return false;
  const correctionWindow = normalizedSource.slice(index, index + normalizedSentence.length + 400);
  const capabilityCorrected = /\b(?:current|supported)\s+releases?\b(?:(?!\b(?:do not|don\x27t|never|not)\b).){0,180}\brequire(?:s|d)?\b.{0,100}\bexplicit\b.{0,80}\bremote capability\b/i.test(correctionWindow);
  const aclCorrected = /\bhistorical behavior\s+is\s+fixed\b/i.test(correctionWindow)
    || /\b(?:current|supported)\s+releases?\b(?:(?!\b(?:do not|don\x27t|never|not)\b).){0,180}\b(?:(?:always|remain(?:s|ed)?)\b.{0,80}\bACL[- ]resolved|subject to ACL)\b/i.test(correctionWindow);
  return capabilityCorrected && aclCorrected;
}

function unrefutedPhrasePresent(source, phrase, item) {
  const normalizedPhrase = normalizedGuidance(phrase);
  return guidanceCandidates(source).some((candidate) => candidate.includes(normalizedPhrase) && !isExplicitRefutation(candidate) && !isHistoricalContext(candidate, item, source));
}

function compileSemanticPattern(pattern, label) {
  assert(typeof pattern === "string" && pattern.trim(), `${label} semantic patterns must be non-empty strings`);
  try {
    return new RegExp(pattern, "i");
  } catch (error) {
    throw new Error(`${label} contains an invalid semantic pattern: ${pattern}`, { cause: error });
  }
}
function validateSemanticCase(source, item, label) {
  const violation = semanticCaseViolation(source, item, label);
  assert(!violation, violation);
}

function semanticCaseViolation(source, item, label) {
  for (const kind of ["required", "forbidden"]) {
    assert(Array.isArray(item[kind]) && item[kind].length > 0, `${label} must declare ${kind} phrases`);
    for (const phrase of item[kind]) assert(typeof phrase === "string" && phrase.length > 0, `${label} ${kind} phrases must be non-empty strings`);
  }
  for (const phrase of item.required) if (!source.includes(phrase)) return `${label} is missing required guidance: ${phrase}`;
  for (const phrase of item.forbidden) if (unrefutedPhrasePresent(source, phrase, item)) return `${label} contains forbidden guidance: ${phrase}`;
  const semantic = item.semantic;
  assert(semantic && typeof semantic === "object" && !Array.isArray(semantic), `${label} semantic checks are required`);
  for (const kind of ["required_patterns", "forbidden_patterns"]) assert(Array.isArray(semantic[kind]) && semantic[kind].length > 0, `${label} must declare ${kind}`);
  const normalized = normalizedGuidance(source);
  const candidates = guidanceCandidates(source);
  for (const pattern of semantic.required_patterns) {
    const matcher = compileSemanticPattern(pattern, label);
    if (!matcher.test(normalized)) return `${label} is missing semantic guidance: ${pattern}`;
  }
  for (const pattern of semantic.forbidden_patterns) {
    const matcher = compileSemanticPattern(pattern, label);
    if (candidates.some((candidate) => !isExplicitRefutation(candidate) && !isHistoricalContext(candidate, item, source) && matcher.test(candidate))) return `${label} contains forbidden guidance (semantic pattern): ${pattern}`;
  }
  return null;
}

function validateSemanticProfile(plugin, suite, label) {
  assert(suite?.schema_version === 1, `${label} must declare schema_version 1`);
  assert(Array.isArray(suite.cases) && suite.cases.length > 0, `${label} must contain cases`);
  const files = sourceFiles(plugin);
  const ids = new Set();
  for (const item of suite.cases) {
    assert(item && typeof item.id === "string" && item.id.trim(), `${label} case id is required`);
    assert(!ids.has(item.id), `${label} contains duplicate case ${item.id}`);
    ids.add(item.id);
    assert(typeof item.file === "string" && item.file.trim(), `${label}/${item.id} file is required`);
    assert(item.historical_scope === undefined || item.historical_scope === "remote-ipc", `${label}/${item.id} has an unsupported historical scope`);
    const source = files.get(item.file);
    assert(source !== undefined, `${label}/${item.id} references missing skill file ${item.file}`);
    validateSemanticCase(source, item, `${label}/${item.id}`);
    const corpus = item.corpus;
    assert(corpus && Array.isArray(corpus.unsafe) && corpus.unsafe.length >= 3, `${label}/${item.id} must declare at least three unsafe corpus examples`);
    assert(Array.isArray(corpus.safe) && corpus.safe.length >= 2, `${label}/${item.id} must declare at least two safe corpus examples`);
    for (const mutation of corpus.unsafe) {
      assert(typeof mutation === "string" && mutation.trim(), `${label}/${item.id} unsafe corpus entries must be non-empty strings`);
      const violation = semanticCaseViolation(`${source}\n${mutation}`, item, `${label}/${item.id}`);
      assert(violation, `${label}/${item.id} unsafe corpus example was accepted: ${mutation}`);
    }
    for (const mutation of corpus.safe) {
      assert(typeof mutation === "string" && mutation.trim(), `${label}/${item.id} safe corpus entries must be non-empty strings`);
      validateSemanticCase(`${source}\n${mutation}`, item, `${label}/${item.id}`);
    }
  }
}

function validateEngineeringProfile(plugin, contract, suite, label) {
  assert(contract, `${label} declared contract is missing from its skill tree`);
  validateContract(plugin, contract, label);
  assert(Array.isArray(suite?.cases) && suite.cases.length > 0, `${label} must contain cases`);
  const capabilities = new Set(suite.cases.map((item) => item.capability));
  for (const capability of ["supplied_plan_fast_path", "evidence_backed_remediation", "bounded_failure_loop"]) assert(capabilities.has(capability), `${label} lacks ${capability} coverage`);
}

// BEGIN senior-engineering-workflow engineering-delivery-v2 validator r3
function validateEngineeringContractV2(plugin, contract, label) {
  assert(
    contract?.schema_version === "2.0.0" &&
      contract.contract_id === "senior-engineering-workflow" &&
      contract.contract_version === "2.0.0" &&
      contract.profile === "engineering-delivery-v2",
    `${label} must identify the engineering-delivery-v2 schema and contract`,
  );

  assert(
    contract.leaf_roles && Number.isInteger(contract.leaf_role_count),
    `${label} must declare leaf_roles and leaf_role_count`,
  );

  const expectedRoleIds = new Set(["researcher", "engineer", "verifier", "worker"]);
  const roles = Object.values(contract.leaf_roles);
  const manifestIds = new Set(plugin.agents.map((agent) => agent.id));
  const contractIds = new Set(roles.map((role) => role.logical_agent_id));

  assert(
    contract.leaf_role_count === expectedRoleIds.size && roles.length === expectedRoleIds.size,
    `${label} must declare exactly four leaf roles`,
  );
  assert(
    manifestIds.size === expectedRoleIds.size &&
      [...expectedRoleIds].every((id) => manifestIds.has(id)),
    `${label} plugin.json agents must be researcher, engineer, verifier, and worker`,
  );
  assert(
    contractIds.size === expectedRoleIds.size &&
      [...expectedRoleIds].every((id) => contractIds.has(id)),
    `${label} contract roles must be researcher, engineer, verifier, and worker`,
  );

  for (const role of roles) {
    assert(
      role.is_leaf === true && role.delegates === false,
      `${label} role ${role.logical_agent_id} must be a non-delegating leaf`,
    );
    assert(
      role.reports_to === "controller" ||
        (role.logical_agent_id === "worker" && role.reports_to === "caller"),
      `${label} role ${role.logical_agent_id} has an invalid report target`,
    );
  }

  assert(
    contract.controller?.kind === "primary_engineering_owner" &&
      contract.controller.is_leaf_role === false,
    `${label} must define the main agent as the non-leaf primary engineering owner`,
  );
  assert(
    contract.delegation?.availability_is_not_a_trigger === true &&
      contract.delegation.inline_execution_is_first_class === true &&
      contract.delegation.specialist_may_invoke_agents === false &&
      contract.delegation.required_work_order === "references/delegation-and-state.md",
    `${label} delegation policy is incomplete or references a version-suffixed work-order file`,
  );
  assert(
    contract.runtime_permissions?.canonical_policy === "inherit" &&
      contract.runtime_permissions.host_level_restrictions_emitted_by_plugin === false &&
      contract.runtime_permissions.behavioral_scope_remains_work_order_bound === true,
    `${label} must inherit host permissions without weakening bounded work-order behavior`,
  );
  for (const agent of plugin.agents) {
    assert(
      agent.permissionPolicy === "inherit" && agent.model?.policy === "inherit",
      `${label} agent ${agent.id} must inherit host permissions, model, and thinking`,
    );
  }
  assert(
    contract.iteration?.maximum_candidate_repair_cycles === 2 &&
      contract.iteration.maximum_evidence_backed_no_progress_attempts === 2 &&
      contract.iteration.new_evidence_required_for_repeat === true,
    `${label} must declare the bounded repair policy`,
  );
  assert(
    contract.long_running_operations?.avoid_status_only_polling === true &&
      contract.long_running_operations.prefer_completion_aware_waits === true &&
      contract.long_running_operations.terminal_status_required_for_completion === true,
    `${label} must declare completion-aware waiting and terminal-status requirements`,
  );
}

function validateEngineeringProfileV2(plugin, contract, suite, label) {
  assert(contract, `${label} declared contract is missing from its skill tree`);
  validateEngineeringContractV2(plugin, contract, label);

  assert(
    suite?.schema_version === "2.0.0" &&
      suite.profile === "engineering-delivery-v2" &&
      typeof suite.suite_id === "string" && suite.suite_id.trim(),
    `${label} must identify the engineering-delivery-v2 eval suite`,
  );
  assert(
    suite.contract_ref ===
      "../skills/senior-engineering-workflow/references/workflow-contract.yaml",
    `${label} must reference the canonical workflow-contract.yaml path`,
  );
  assert(Array.isArray(suite.cases) && suite.cases.length > 0, `${label} must contain cases`);

  const roleIds = new Set(["researcher", "engineer", "verifier", "worker"]);
  const requiredResultFields = new Set([
    "activation",
    "route",
    "invoked_roles",
    "role_resolution",
    "behavior",
  ]);
  const declaredResultFields = new Set(suite.result_schema?.required_fields ?? []);
  const declaredRoleIds = new Set(suite.result_schema?.role_values ?? []);

  assert(
    [...requiredResultFields].every((field) => declaredResultFields.has(field)),
    `${label} result_schema.required_fields is incomplete`,
  );
  assert(
    declaredRoleIds.size === roleIds.size && [...roleIds].every((id) => declaredRoleIds.has(id)),
    `${label} result_schema.role_values must match the four v2 roles`,
  );

  const caseIds = new Set();
  const capabilities = new Set();
  for (const item of suite.cases) {
    assert(item && typeof item.id === "string" && item.id.trim(), `${label} case id is required`);
    assert(!caseIds.has(item.id), `${label} contains duplicate case ${item.id}`);
    caseIds.add(item.id);
    assert(
      typeof item.capability === "string" && item.capability.trim(),
      `${label}/${item.id} capability is required`,
    );
    capabilities.add(item.capability);
    assert(
      typeof item.prompt === "string" && item.prompt.trim(),
      `${label}/${item.id} prompt is required`,
    );
    assert(
      item.expected && typeof item.expected === "object" && !Array.isArray(item.expected),
      `${label}/${item.id} expected result is required`,
    );
    assert(
      typeof item.expected.activation === "boolean" &&
        typeof item.expected.route === "string" && item.expected.route.trim(),
      `${label}/${item.id} must declare activation and route`,
    );

    const invoked = item.expected.invoked_roles;
    assert(
      invoked && Array.isArray(invoked.required) && Array.isArray(invoked.forbidden),
      `${label}/${item.id} invoked_roles must use required/forbidden arrays`,
    );
    const requiredSet = new Set(invoked.required);
    for (const role of [...invoked.required, ...invoked.forbidden]) {
      assert(roleIds.has(role), `${label}/${item.id} references unknown role ${role}`);
    }
    for (const role of invoked.forbidden) {
      assert(!requiredSet.has(role), `${label}/${item.id} both requires and forbids role ${role}`);
    }

    const resolution = item.expected.role_resolution;
    assert(
      resolution && typeof resolution === "object" && !Array.isArray(resolution),
      `${label}/${item.id} role_resolution must be an object`,
    );
    for (const role of Object.keys(resolution)) {
      assert(
        roleIds.has(role) && requiredSet.has(role),
        `${label}/${item.id} role_resolution references a non-required role ${role}`,
      );
    }
    for (const role of requiredSet) {
      assert(
        typeof resolution[role] === "string" && resolution[role].trim(),
        `${label}/${item.id} lacks role_resolution for required role ${role}`,
      );
    }

    assert(
      Array.isArray(item.expected.behavior) &&
        item.expected.behavior.length > 0 &&
        item.expected.behavior.every((entry) => typeof entry === "string" && entry.trim()),
      `${label}/${item.id} behavior must be a non-empty string array`,
    );
  }

  for (const capability of [
    "inline_execution",
    "supplied_plan_preservation",
    "context_isolation",
    "controller_mediated_worker_fanout",
    "bounded_implementation",
    "risk_triggered_verification",
    "verifier_independence",
    "evidence_backed_remediation",
    "hallucination_resistance",
    "bounded_failure_loop",
    "completion_aware_waiting",
    "test_only_delivery",
  ]) {
    assert(capabilities.has(capability), `${label} lacks ${capability} coverage`);
  }
}
// END senior-engineering-workflow engineering-delivery-v2 validator r3

const VALIDATION_PROFILES = new Map([
  ["engineering-delivery-v1", validateEngineeringProfile],
  ["engineering-delivery-v2", validateEngineeringProfileV2],
  ["semantic-guidance-v1", (plugin, _contract, suite, label) => validateSemanticProfile(plugin, suite, label)]
]);

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
    const resolvedTarget = resolveHost(target.id, target.variant);
    if (!supportsHost(plugin, resolvedTarget)) {
      const codex = target.id === "codex" ? classifyCodexComponents(plugin.manifest.components) : null;
      if (target.id === "codex" && plugin.manifest.hosts?.codex?.enabled === true && codex?.companionAgents.length > 0 && !codex.hasNativeComponents) continue;
      const manifestKey = typeof resolvedTarget.manifestKey === "function" ? resolvedTarget.manifestKey(resolvedTarget.variant) : resolvedTarget.manifestKey;
      if (plugin.manifest.hosts?.[manifestKey]?.enabled === true) {
        throw new Error(`${plugin.manifest.id} enables ${target.id}${target.variant ? `/${target.variant}` : ""} without a functional host component`);
      }
      continue;
    }
    const rendered = renderHost(plugin, target.id, target.variant);
    const artifacts = artifactMap(rendered.artifacts);
    assert(artifacts.get("LICENSE")?.toString("utf8") === localLicense, `${target.id} bundle for ${plugin.manifest.id} is missing its exact license`);
    for (const agent of plugin.agents) validateRenderedAgent(plugin, agent, target, artifacts);
    for (const skill of plugin.skills) {
      const prefix = target.id === "opencode" ? ".opencode/skills" : target.id === "portable-agent-skills" ? ".agents/skills" : "skills";
      for (const file of skill.files) assert(artifacts.has(path.posix.join(prefix, skill.id, file.relative)), `${target.id} bundle omits ${skill.id}/${file.relative}`);
      assert(artifacts.get(path.posix.join(prefix, skill.id, "LICENSE"))?.toString("utf8") === localLicense, `${target.id} bundle skill ${skill.id} lacks the plugin license`);
    }
    if (target.id === "claude-code") {
      const manifest = JSON.parse(artifacts.get(".claude-plugin/plugin.json"));
      const agents = plugin.agents.length > 0 ? "./agents/" : undefined;
      const skills = plugin.skills.length > 0 ? "./skills/" : undefined;
      assert(manifest.name === plugin.manifest.id && manifest.skills === skills && manifest.agents === agents, `Claude manifest for ${plugin.manifest.id} is not native`);
    }
    if (target.id === "codex") {
      const manifest = JSON.parse(artifacts.get(".codex-plugin/plugin.json"));
      const skills = plugin.skills.length > 0 ? "./skills/" : undefined;
      const codexComponents = classifyCodexComponents(plugin.manifest.components);
      const hooks = codexComponents.nativeFiles.find((file) => file.nativeKind === "hooks");
      const mcpServers = codexComponents.nativeFiles.find((file) => file.nativeKind === "mcpServers");
      assert(manifest.name === plugin.manifest.id
        && manifest.skills === skills
        && manifest.hooks === (hooks ? `./${hooks.destination}` : undefined)
        && manifest.mcpServers === (mcpServers ? `./${mcpServers.destination}` : undefined)
        && manifest.agents === undefined,
      `Codex manifest for ${plugin.manifest.id} is not native`);
      for (const file of plugin.hostFiles.filter((entry) => entry.hosts.includes("codex"))) {
        assert(artifacts.has(file.destination), `Codex bundle for ${plugin.manifest.id} omits ${file.destination}`);
      }
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
    const validation = plugin.manifest.validation;
    const profile = VALIDATION_PROFILES.get(validation.profile);
    assert(profile, `unknown declared validation profile: ${validation.profile}`);
    const suite = evalSuites.get(validation.evals);
    assert(suite, `${plugin.manifest.id} declared eval suite is missing: ${validation.evals}`);
    const contract = validation.contract ? contractFiles.get(validation.contract) : undefined;
    profile(plugin, contract, suite, `${plugin.manifest.id}/${validation.evals}`);
  }
}

export async function validateRepository(root = ROOT) {
  const catalog = await discoverMarketplace(root);
  await assertCatalogMatchesSchemas(catalog);
  await validateActiveMarketplaceReadme(catalog);
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
