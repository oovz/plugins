#!/usr/bin/env node
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import YAML from "yaml";
import { allHostTargets, renderHost, resolveHost, supportsHost } from "./lib/hosts.mjs";
import { assert, classifyCodexComponents, decodeUtf8, discoverMarketplace, flatAgentId, inspectPlugin, inspectSkill, parseFrontmatter, ROOT, walkFiles } from "./lib/marketplace.mjs";
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
    const parsed = parseMarkdownArtifact(artifacts.get(`agents/${flat}.md`), `Antigravity agent ${agent.id}`);
    const fm = parsed.frontmatter;
    assert(fm.name === flat && fm.mainAgent === false && fm.subagent === true && fm.model === "inherit" && fm.commandExecutionPolicy === "sandbox", `Antigravity agent ${agent.id} has invalid required frontmatter`);
    assert(Array.isArray(fm.tools), `Antigravity agent ${agent.id} must declare its allowed tools`);
    for (const tool of fm.tools) assert(ANTIGRAVITY_TOOLS.has(tool), `Antigravity agent ${agent.id} has unknown tool ${tool}`);
    if (agent.workspace === "read-only") for (const tool of ["write_to_file", "replace_file_content", "multi_replace_file_content"]) assert(!fm.tools.includes(tool), `Antigravity read-only agent ${agent.id} exposes ${tool}`);
    if (!agent.shell) assert(!fm.tools.includes("run_command"), `Antigravity shell-denied agent ${agent.id} exposes shell`);
    if (!agent.external) for (const tool of ["search_web", "read_url_content"]) assert(!fm.tools.includes(tool), `Antigravity external-denied agent ${agent.id} exposes ${tool}`);
    if (!agent.delegates) assert(!fm.tools.includes("invoke_subagent"), `Antigravity leaf agent ${agent.id} exposes subagent invocation`);
    if (agent.delegates) assert(fm.tools.includes("invoke_subagent"), `Antigravity delegating agent ${agent.id} must expose invoke_subagent`);
    if (!agent.question) assert(!fm.tools.includes("ask_question"), `Antigravity agent ${agent.id} exposes user questions without question capability`);
    if (agent.question) assert(fm.tools.includes("ask_question"), `Antigravity question-capable agent ${agent.id} must expose ask_question`);
  } else if (target.id === "cursor") {
    const parsed = parseMarkdownArtifact(artifacts.get(`agents/${flat}.md`), `Cursor agent ${agent.id}`);
    const fm = parsed.frontmatter;
    assert(inheritsPermissions, `Cursor currently supports permission-inheriting agents only: ${agent.id}`);
    assert(fm.name === flat && fm.description === agent.description, `Cursor agent ${agent.id} has invalid identity or description`);
    assert(fm.model === undefined && fm.readonly === undefined && fm.tools === undefined, `Cursor agent ${agent.id} must not pin a model or add readonly/tool restrictions`);
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
    const parsed = parseMarkdownArtifact(artifacts.get(`.opencode/agents/${flat}.md`), `OpenCode agent ${agent.id}`);
    const fm = parsed.frontmatter;
    assert(fm.mode === "subagent" && fm.model === undefined && fm.steps === undefined, `OpenCode agent ${agent.id} must be a model-inheriting subagent without step cap`);
    if (inheritsPermissions) {
      assert(fm.permission === undefined && fm.permissions === undefined, `OpenCode permission-inheriting agent ${agent.id} must not set permission rules`);
      return;
    }
    assert(fm.permission && fm.permissions === undefined, `OpenCode agent ${agent.id} must use permission`);
    if (!agent.delegates) assert(fm.permission.task?.["*"] === "deny", `OpenCode leaf agent ${agent.id} must deny task`);
    assert(fm.permission.external_directory === "deny", `OpenCode agent ${agent.id} must deny external_directory`);
    if (agent.workspace === "read-only") assert(fm.permission.edit === "deny", `OpenCode read-only agent ${agent.id} must deny edit`);
    if (!agent.shell) assert(fm.permission.bash === "deny", `OpenCode agent ${agent.id} must deny bash`);
    if (!agent.external) for (const action of ["webfetch", "websearch"]) assert(fm.permission[action] === "deny", `OpenCode agent ${agent.id} must deny ${action}`);
  }
}

function sourceFiles(plugin) {
  const files = new Map();
  for (const skill of plugin.skills) {
    for (const file of skill.files) {
      const relative = path.posix.join("skills", skill.id, file.relative);
      files.set(relative, file.content);
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
    const catalogPath = `plugins/${plugin.manifest.id}`;
    assert(rows.has(catalogPath), `README.md is missing an Available plugins row for ${plugin.manifest.id}`);
    assert(rows.get(catalogPath) === plugin.manifest.version, `README.md version for ${plugin.manifest.id} does not match ${plugin.manifest.version}`);
  }
  for (const link of rows.keys()) assert(catalog.plugins.some((plugin) => `plugins/${plugin.manifest.id}` === link), `README.md references an uncataloged plugin path: ${link}`);

  const skillHeading = "## Available skills";
  const skillStart = readme.indexOf(skillHeading);
  assert(skillStart >= 0, "README.md must contain an Available skills table");
  const nextSkillHeading = readme.indexOf("\n## ", skillStart + skillHeading.length);
  const skillSection = readme.slice(skillStart, nextSkillHeading < 0 ? readme.length : nextSkillHeading);
  const skillLinks = new Set([...skillSection.matchAll(/\[[^\]]+\]\((skills\/[^)]+)\)/g)].map((match) => match[1].replace(/\/$/, "")));
  for (const skill of catalog.skills) assert(skillLinks.has(`skills/${skill.id}`), `README.md is missing an Available skills row for ${skill.id}`);
  for (const link of skillLinks) assert(catalog.skills.some((skill) => `skills/${skill.id}` === link), `README.md references an uncataloged skill path: ${link}`);
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
    const content = files.get(item.file);
    assert(content !== undefined, `${label}/${item.id} references missing skill file ${item.file}`);
    const source = decodeUtf8(content, `${plugin.manifest.id}/${item.file}`);
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

// BEGIN senior-engineering-workflow engineering-delivery-v3 validator r3
function validateEngineeringContractV3(plugin, contract, label) {
  assert(
    contract?.schema_version === "3.0.0" &&
      contract.contract_id === "senior-engineering-workflow" &&
      contract.contract_version === "3.0.0" &&
      contract.profile === "engineering-delivery-v3",
    `${label} must identify the engineering-delivery-v3 schema and contract`,
  );

  assert(
    contract.leaf_roles && Number.isInteger(contract.leaf_role_count),
    `${label} must declare leaf_roles and leaf_role_count`,
  );

  const expectedRoleIds = new Set(["researcher", "engineer", "verifier"]);
  const roles = Object.values(contract.leaf_roles);
  const manifestIds = new Set(plugin.agents.map((agent) => agent.id));
  const contractIds = new Set(roles.map((role) => role.logical_agent_id));

  assert(
    contract.leaf_role_count === expectedRoleIds.size && roles.length === expectedRoleIds.size,
    `${label} must declare exactly three leaf roles`,
  );
  assert(
    manifestIds.size === expectedRoleIds.size &&
      [...expectedRoleIds].every((id) => manifestIds.has(id)),
    `${label} manifest agents must be researcher, engineer, and verifier`,
  );
  assert(
    contractIds.size === expectedRoleIds.size &&
      [...expectedRoleIds].every((id) => contractIds.has(id)),
    `${label} contract roles must be researcher, engineer, and verifier`,
  );

  assert(
    Object.keys(contract.leaf_roles).length === expectedRoleIds.size &&
      [...expectedRoleIds].every((id) => contract.leaf_roles[id]?.logical_agent_id === id),
    `${label} role keys must match logical identities`,
  );
  for (const role of roles) {
    const mayWrite = role.logical_agent_id === "engineer";
    assert(
      role.may_write_production_files === mayWrite && role.may_write_test_files === mayWrite &&
        role.runs_own_tools === true,
      `${label} role ${role.logical_agent_id} must retain its write boundary and own tool execution`,
    );
    assert(
      role.is_leaf === true && role.delegates === false,
      `${label} role ${role.logical_agent_id} must be a non-delegating leaf`,
    );
    assert(
      role.reports_to === "controller",
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
    contract.delegation.minimum_specialist_packet?.includes("authorized_instruction_sources"),
    `${label} specialist packets must name authorized instruction sources`,
  );
  assert(
    contract.runtime_permissions?.canonical_policy === "inherit" &&
      contract.runtime_permissions.plugin_emitted_host_restrictions?.default === "none" &&
      contract.runtime_permissions.plugin_emitted_host_restrictions?.antigravity?.tools === "explicit_allowlist" &&
      contract.runtime_permissions.plugin_emitted_host_restrictions?.antigravity?.command_execution_policy === "sandbox" &&
      contract.runtime_permissions.behavioral_scope_remains_work_order_bound === true,
    `${label} must document inherited host permissions and the Antigravity role restrictions without weakening bounded work-order behavior`,
  );
  for (const agent of plugin.agents) {
    assert(
      agent.permissionPolicy === "inherit" && agent.model?.policy === "inherit",
      `${label} agent ${agent.id} must inherit host permissions, model, and thinking`,
    );
  }
  assert(
    contract.iteration?.new_evidence_required_for_repeat === true &&
      contract.iteration.repeated_no_progress === "reassess_hypothesis_and_design" &&
      contract.iteration.continue_useful_authorized_diagnosis === true,
    `${label} must declare evidence-driven reassessment and continued useful diagnosis`,
  );
  assert(
    contract.execution?.default === "direct" &&
      contract.execution.preserve_viable_supplied_plan === true &&
      contract.execution.implementation_owns_immediate_validation === true &&
      contract.execution.concurrent_writers_require_disjoint_ownership_or_isolation === true &&
      contract.execution.integrated_candidate_requires_validation === true &&
      contract.delegation.benefit_must_justify_coordination_cost === true &&
      contract.context?.advertised_capacity_is_not_a_routing_threshold === true &&
      contract.context.summaries_retain_evidence_locations === true &&
      contract.verification?.verifier_preserves_candidate === true,
    `${label} must preserve direct execution, ownership, context judgment, and independent verification`,
  );
  assert(
    contract.long_running_operations?.avoid_status_only_polling === true &&
      contract.long_running_operations.prefer_completion_aware_waits === true &&
      contract.long_running_operations.terminal_status_required_for_completion === true,
    `${label} must declare completion-aware waiting and terminal-status requirements`,
  );
}

function validateEngineeringProfileV3(plugin, contract, suite, label) {
  assert(contract, `${label} declared contract is missing`);
  validateEngineeringContractV3(plugin, contract, label);

  assert(
    suite?.schema_version === "3.0.0" &&
      suite.profile === "engineering-delivery-v3" &&
      typeof suite.suite_id === "string" && suite.suite_id.trim(),
    `${label} must identify the engineering-delivery-v3 eval suite`,
  );
  assert(
    suite.contract_ref ===
      "./workflow-contract.yaml",
    `${label} must reference the canonical workflow-contract.yaml path`,
  );
  assert(Array.isArray(suite.cases) && suite.cases.length > 0, `${label} must contain cases`);

  const roleIds = new Set(["researcher", "engineer", "verifier"]);
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
    `${label} result_schema.role_values must match the three v3 roles`,
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
    "specialist_tool_ownership",
    "long_context_judgment",
    "ownership_safety",
    "evidence_driven_iteration",
    "durable_state",
    "instruction_authority",
    "capability_limitation",
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
// END senior-engineering-workflow engineering-delivery-v3 validator r3

const VALIDATION_PROFILES = new Map([
  ["engineering-delivery-v3", validateEngineeringProfileV3],
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
    assert(agent.frontmatter.description === agent.description, `${plugin.manifest.id} agent ${agent.id} template description must match the manifest contract description`);
    const neutralFields = new Set(["name", "description"]);
    for (const key of Object.keys(agent.frontmatter)) assert(neutralFields.has(key), `${plugin.manifest.id} canonical agent ${agent.id} has host-specific frontmatter field ${key}`);
    assert(agent.body.trim().length > 0, `${plugin.manifest.id} canonical agent ${agent.id} body is empty`);
    if (plugin.manifest.hosts?.["gemini-cli"]?.enabled === true) assert(!agent.delegates, `${plugin.manifest.id} cannot enable Gemini CLI for recursively delegating agent ${agent.id}`);
  }

  for (const target of allHostTargets()) {
    const resolvedTarget = resolveHost(target.id);
    if (!supportsHost(plugin, resolvedTarget)) {
      const codex = target.id === "codex" ? classifyCodexComponents(plugin.manifest.components) : null;
      if (target.id === "codex" && plugin.manifest.hosts?.codex?.enabled === true && codex?.companionAgents.length > 0 && !codex.hasNativeComponents) continue;
      const manifestKey = resolvedTarget.manifestKey;
      if (plugin.manifest.hosts?.[manifestKey]?.enabled === true) {
        throw new Error(`${plugin.manifest.id} enables ${target.id} without a functional host component`);
      }
      continue;
    }
    const rendered = renderHost(plugin, target.id);
    const artifacts = artifactMap(rendered.artifacts);
    assert(artifacts.get("LICENSE")?.toString("utf8") === localLicense, `${target.id} bundle for ${plugin.manifest.id} is missing its exact license`);
    for (const agent of plugin.agents) validateRenderedAgent(plugin, agent, target, artifacts);
    for (const skill of plugin.skills) {
      const prefix = target.id === "opencode" ? ".opencode/skills" : target.id === "portable-agent-skills" ? ".agents/skills" : "skills";
      for (const file of skill.files) assert(artifacts.has(path.posix.join(prefix, skill.id, file.relative)), `${target.id} bundle omits ${skill.id}/${file.relative}`);
      const skillLicense = skill.files.find((file) => file.relative === "LICENSE")?.content.toString("utf8");
      assert(skillLicense && artifacts.get(path.posix.join(prefix, skill.id, "LICENSE"))?.toString("utf8") === skillLicense, `${target.id} bundle skill ${skill.id} lacks its canonical license`);
    }
    if (target.id === "claude-code") {
      const manifest = JSON.parse(artifacts.get(".claude-plugin/plugin.json"));
      const skills = plugin.skills.length > 0 ? "./skills/" : undefined;
      assert(manifest.name === plugin.manifest.id && manifest.skills === skills, `Claude manifest for ${plugin.manifest.id} is not native`);
      if (plugin.agents.length > 0) {
        assert(Array.isArray(manifest.agents) && manifest.agents.length === plugin.agents.length && new Set(manifest.agents).size === manifest.agents.length, `Claude manifest for ${plugin.manifest.id} must list each agent file`);
        for (const agentPath of manifest.agents) {
          assert(typeof agentPath === "string" && /^\.\/agents\/[^/]+\.md$/u.test(agentPath) && artifacts.has(agentPath.slice(2)), `Claude agent path must name a packaged Markdown file: ${agentPath}`);
        }
      } else assert(manifest.agents === undefined, `Claude manifest for ${plugin.manifest.id} declares agents without agent files`);
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
    if (target.id === "cursor") {
      const manifest = JSON.parse(artifacts.get(".cursor-plugin/plugin.json"));
      assert(manifest.name === plugin.manifest.id && manifest.version === plugin.manifest.version, `Cursor manifest for ${plugin.manifest.id} is invalid`);
      assert(manifest.skills === (plugin.skills.length > 0 ? "./skills/" : undefined), `Cursor manifest for ${plugin.manifest.id} has invalid skills path`);
      assert(manifest.agents === (plugin.agents.length > 0 ? "./agents/" : undefined), `Cursor manifest for ${plugin.manifest.id} has invalid agents path`);
      assert(manifest.commands === (plugin.commands.some((command) => command.hosts.includes("cursor")) ? "./commands/" : undefined), `Cursor manifest for ${plugin.manifest.id} has invalid commands path`);
      assert(manifest.minClientVersions?.cursor === "2.5.0", `Cursor manifest for ${plugin.manifest.id} must require Cursor 2.5.0 or later`);
    }
  }

  const contractFiles = new Map();
  for (const skill of plugin.skills) {
    for (const file of skill.files.filter((entry) => /workflow-contract\.ya?ml$/i.test(entry.relative))) {
      const parsed = YAML.parse(decodeUtf8(file.content, `${plugin.manifest.id}/${file.relative}`));
      assert(parsed && typeof parsed === "object", `${plugin.manifest.id}/${file.relative} must contain a YAML object`);
      contractFiles.set(path.posix.join("skills", skill.id, file.relative), parsed);
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
      contractFiles.set(path.posix.join("evals", file.relative), suite);
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
  const skills = await Promise.all(catalog.skills.map(inspectSkill));
  const plugins = await Promise.all(catalog.plugins.map((plugin) => inspectPlugin({ ...plugin, catalogSkills: skills })));
  const flatIds = new Set();
  for (const plugin of plugins) {
    for (const agent of plugin.agents) {
      const id = flatAgentId(plugin.manifest.id, agent.id);
      assert(!flatIds.has(id), `flat agent id collision: ${id}`);
      flatIds.add(id);
    }
    await validatePlugin(plugin);
  }
  return { catalog, skills, plugins };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateRepository().then(({ plugins, skills }) => {
    process.stdout.write(`validated ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} and ${skills.length} skill${skills.length === 1 ? "" : "s"} across ${allHostTargets().length} host targets\n`);
  }).catch((error) => {
    process.stderr.write(`validation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
