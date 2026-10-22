#!/usr/bin/env node
import { lstat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import { allHostTargets, renderHost, resolveHost, supportsHost } from "./lib/hosts.mjs";
import { assert, classifyCodexComponents, discoverMarketplace, flatAgentId, inspectPlugin, inspectSkill, parseFrontmatter, ROOT } from "./lib/marketplace.mjs";
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

async function validatePlugin(plugin) {
  const localLicense = plugin.license.content.toString("utf8");
  assert(localLicense.trim().length > 0, `${plugin.manifest.id} plugin-local LICENSE is empty`);
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
}

export async function validateRepository(root = ROOT) {
  const catalog = await discoverMarketplace(root);
  await assertCatalogMatchesSchemas(catalog);
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
