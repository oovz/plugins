import { stringify as stringifyToml } from "smol-toml";
import { assert, assertSupportedListingText, classifyCodexComponents, copySkillArtifacts, flatAgentId, json, markdown, uniqueArtifacts } from "./marketplace.mjs";

function hostFiles(plugin, hostKey) {
  return plugin.hostFiles
    .filter((file) => file.hosts.includes(hostKey))
    .map((file) => ({ path: file.destination, content: file.content, executable: file.executable === true }));
}

function skills(plugin, prefix = "skills") {
  return plugin.skills.flatMap((skill) => {
    const artifacts = copySkillArtifacts(skill, prefix);
    const license = artifacts.find((artifact) => artifact.path.toLowerCase() === pathForSkill(prefix, skill.id, "LICENSE").toLowerCase());
    if (license) {
      if (!Buffer.from(license.content).equals(plugin.license.content)) throw new Error(`skill ${skill.id} LICENSE conflicts with plugin-local LICENSE`);
    } else {
      artifacts.push({ path: pathForSkill(prefix, skill.id, "LICENSE"), content: plugin.license.content });
    }
    return artifacts;
  });
}

function pathForSkill(prefix, skillId, relative) {
  return [prefix, skillId, relative].filter(Boolean).join("/");
}

function leafGuard(agent) {
  const constraints = [];
  if (!agent.delegates) constraints.push("Do not create, invoke, or delegate to another agent.");
  if (!agent.question) constraints.push("Return unresolved questions to the parent; do not contact the user directly.");
  if (agent.workspace === "read-only") constraints.push("Do not modify workspace files.");
  if (!agent.shell) constraints.push("Do not run shell commands.");
  if (!agent.external) constraints.push("Do not access external systems or the network.");
  return `${agent.body.trim()}\n\nRole constraints\n${constraints.map((item) => `- ${item}`).join("\n")}`;
}

function claudeTools(agent) {
  const tools = ["Read", "Grep", "Glob"];
  if (agent.workspace === "workspace-write") tools.push("Write", "Edit");
  if (agent.shell) tools.push("Bash");
  if (agent.external) tools.push("WebSearch", "WebFetch");
  if (agent.delegates) tools.push("Agent");
  if (agent.question) tools.push("AskUserQuestion");
  return tools.join(", ");
}

function compact(text, maximum) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 3).trimEnd()}...`;
}

export function codexPluginManifest(plugin, repository = plugin.marketplace?.repository ?? plugin.manifest.author.url) {
  const firstSkill = plugin.skills[0]?.id;
  const capabilities = plugin.manifest.hosts?.codex?.capabilities;
  const codexComponents = classifyCodexComponents(plugin.manifest.components);
  assert(codexComponents.invalidDestinations.length === 0, `${plugin.manifest.id} has unsupported Codex host-file destinations: ${codexComponents.invalidDestinations.map((file) => file.id).join(", ")}`);
  if (plugin.manifest.hosts?.codex?.enabled === true && capabilities === undefined) {
    throw new Error(`${plugin.manifest.id} must declare hosts.codex.capabilities before rendering its Codex manifest`);
  }
  if (capabilities !== undefined) {
    assert(Array.isArray(capabilities), `${plugin.manifest.id} hosts.codex.capabilities must be an array`);
    for (const capability of capabilities) assertSupportedListingText(capability, `${plugin.manifest.id} Codex capability`);
  }
  return {
    name: plugin.manifest.id,
    version: plugin.manifest.version,
    description: plugin.manifest.description,
    author: plugin.manifest.author,
    homepage: repository,
    repository,
    license: plugin.manifest.license,
    keywords: plugin.manifest.keywords ?? [],
    ...(plugin.skills.length > 0 ? { skills: "./skills/" } : {}),
    ...(codexComponents.nativeFiles.some((file) => file.nativeKind === "hooks") ? { hooks: `./${codexComponents.nativeFiles.find((file) => file.nativeKind === "hooks").destination}` } : {}),
    ...(codexComponents.nativeFiles.some((file) => file.nativeKind === "mcpServers") ? { mcpServers: `./${codexComponents.nativeFiles.find((file) => file.nativeKind === "mcpServers").destination}` } : {}),
    interface: {
      displayName: compact(plugin.manifest.displayName, 30),
      shortDescription: compact(plugin.manifest.description, 30),
      longDescription: plugin.manifest.description,
      developerName: plugin.manifest.author.name,
      category: plugin.manifest.category ?? "Other",
      ...(capabilities === undefined ? {} : { capabilities }),
      defaultPrompt: [compact(firstSkill ? `Use $${firstSkill} for this task.` : `Use ${plugin.manifest.displayName} for this task.`, 128)],
      websiteURL: repository
    }
  };
}

function renderClaude(plugin) {
  const artifacts = [
    {
      path: ".claude-plugin/plugin.json",
      content: json(claudePluginManifest(plugin))
    },
    ...skills(plugin)
  ];
  for (const agent of plugin.agents) {
    const disallowedTools = [!agent.delegates && "Agent", !agent.question && "AskUserQuestion"].filter(Boolean).join(", ");
    const frontmatter = { name: agent.id, description: agent.description, model: "inherit", tools: claudeTools(agent) };
    if (disallowedTools) frontmatter.disallowedTools = disallowedTools;
    artifacts.push({
      path: `agents/${agent.id}.md`,
      content: markdown(frontmatter, leafGuard(agent))
    });
  }
  for (const command of plugin.commands.filter((item) => item.hosts.includes("claude-code"))) artifacts.push({ path: `commands/${command.id}.md`, content: command.source });
  return [...artifacts, ...hostFiles(plugin, "claude-code")];
}

export function claudePluginManifest(plugin, repository = plugin.marketplace?.repository ?? plugin.manifest.author.url) {
  const manifest = {
    $schema: "https://json.schemastore.org/claude-code-plugin-manifest.json",
    name: plugin.manifest.id,
    displayName: plugin.manifest.displayName,
    version: plugin.manifest.version,
    description: plugin.manifest.description,
    author: plugin.manifest.author,
    homepage: repository,
    repository,
    license: plugin.manifest.license,
    keywords: plugin.manifest.keywords ?? []
  };
  if (plugin.skills.length > 0) manifest.skills = "./skills/";
  if (plugin.agents.length > 0) manifest.agents = "./agents/";
  return manifest;
}

function renderCodex(plugin) {
  const artifacts = [
    {
      path: ".codex-plugin/plugin.json",
      content: json(codexPluginManifest(plugin))
    },
    ...skills(plugin)
  ];
  for (const agent of plugin.agents) {
    const flatId = flatAgentId(plugin.manifest.id, agent.id);
    artifacts.push({
      path: `companion/agents/${flatId}.toml`,
      content: stringifyToml({
        name: flatId,
        description: agent.description,
        sandbox_mode: agent.workspace,
        developer_instructions: leafGuard(agent)
      })
    });
  }
  return [...artifacts, ...hostFiles(plugin, "codex")];
}

const GEMINI_READ_TOOLS = ["read_file", "read_many_files", "grep_search", "glob", "list_directory"];
function geminiTools(agent) {
  const result = [...GEMINI_READ_TOOLS];
  if (agent.workspace === "workspace-write") result.push("replace", "write_file");
  if (agent.shell) result.push("run_shell_command");
  if (agent.external) result.push("google_web_search", "web_fetch");
  if (agent.question) result.push("ask_user");
  return result;
}

function renderGemini(plugin) {
  const recursive = plugin.agents.find((agent) => agent.delegates);
  if (recursive) throw new Error(`${plugin.manifest.id} cannot enable Gemini CLI for recursively delegating agent ${recursive.id}`);
  const artifacts = [
    {
      path: "gemini-extension.json",
      content: json({ name: plugin.manifest.id, version: plugin.manifest.version, description: plugin.manifest.description })
    },
    ...skills(plugin)
  ];
  for (const agent of plugin.agents) {
    const flatId = flatAgentId(plugin.manifest.id, agent.id);
    artifacts.push({
      path: `agents/${flatId}.md`,
      content: markdown({ name: flatId, description: agent.description, kind: "local", tools: geminiTools(agent), model: "inherit" }, leafGuard(agent))
    });
  }
  for (const command of plugin.commands.filter((item) => item.hosts.includes("gemini-cli"))) {
    artifacts.push({
      path: `commands/${flatAgentId(plugin.manifest.id, command.id)}.toml`,
      content: stringifyToml({ description: command.id, prompt: command.source.toString("utf8") })
    });
  }
  return [...artifacts, ...hostFiles(plugin, "gemini-cli")];
}

const ANTIGRAVITY_READ_TOOLS = ["view_file", "list_dir", "find_by_name", "grep_search"];
function antigravityTools(agent) {
  const result = [...ANTIGRAVITY_READ_TOOLS];
  if (agent.workspace === "workspace-write") result.push("write_to_file", "replace_file_content", "multi_replace_file_content");
  if (agent.shell) result.push("run_command");
  if (agent.external) result.push("search_web", "read_url_content");
  if (agent.delegates) result.push("invoke_subagent");
  if (agent.question) result.push("ask_question");
  return result;
}

function renderAntigravity(plugin) {
  const artifacts = [
    {
      path: "plugin.json",
      content: json({ $schema: "https://antigravity.google/schemas/v1/plugin.json", name: plugin.manifest.id, description: plugin.manifest.description })
    },
    ...skills(plugin)
  ];
  for (const agent of plugin.agents) {
    const flatId = flatAgentId(plugin.manifest.id, agent.id);
    artifacts.push({
      path: `agents/${flatId}.md`,
      content: markdown({
        name: flatId,
        description: agent.description,
        tools: antigravityTools(agent),
        mainAgent: false,
        subagent: true,
        model: "inherit",
        commandExecutionPolicy: "sandbox"
      }, leafGuard(agent))
    });
  }
  return [...artifacts, ...hostFiles(plugin, "antigravity")];
}

function stablePermission(agent) {
  const permission = {};
  if (agent.workspace === "read-only") permission.edit = "deny";
  if (!agent.shell) permission.bash = "deny";
  if (!agent.delegates) permission.task = { "*": "deny" };
  permission.external_directory = "deny";
  if (!agent.external) {
    permission.webfetch = "deny";
    permission.websearch = "deny";
  }
  if (!agent.question) permission.question = "deny";
  return permission;
}

function v2Permissions(agent) {
  const denied = [];
  if (agent.workspace === "read-only") denied.push("edit");
  if (!agent.shell) denied.push("shell");
  if (!agent.delegates) denied.push("subagent");
  denied.push("external_directory");
  if (!agent.external) denied.push("webfetch", "websearch");
  if (!agent.question) denied.push("question");
  return denied.map((action) => ({ action, resource: "*", effect: "deny" }));
}

function renderOpenCode(plugin, variant) {
  const artifacts = [...skills(plugin, ".opencode/skills")];
  for (const agent of plugin.agents) {
    const flatId = flatAgentId(plugin.manifest.id, agent.id);
    const frontmatter = { description: agent.description, mode: "subagent" };
    if (variant === "stable") frontmatter.permission = stablePermission(agent);
    else frontmatter.permissions = v2Permissions(agent);
    artifacts.push({ path: `.opencode/agents/${flatId}.md`, content: markdown(frontmatter, leafGuard(agent)) });
  }
  const commandHost = variant === "stable" ? "opencode" : "opencode-v2";
  for (const command of plugin.commands.filter((item) => item.hosts.includes(commandHost))) artifacts.push({ path: `.opencode/commands/${flatAgentId(plugin.manifest.id, command.id)}.md`, content: command.source });
  return [...artifacts, ...hostFiles(plugin, variant === "stable" ? "opencode" : "opencode-v2")];
}

function renderPortable(plugin) {
  return [...skills(plugin, ".agents/skills"), ...hostFiles(plugin, "portable")];
}

export const HOSTS = Object.freeze({
  "claude-code": { variants: [null], manifestKey: "claude-code", render: renderClaude },
  codex: { variants: [null], manifestKey: "codex", render: renderCodex },
  "gemini-cli": { variants: [null], manifestKey: "gemini-cli", render: renderGemini },
  antigravity: { variants: [null], manifestKey: "antigravity", render: renderAntigravity },
  opencode: { variants: ["stable", "v2-beta"], manifestKey: (variant) => variant === "stable" ? "opencode" : "opencode-v2", render: renderOpenCode },
  "portable-agent-skills": { variants: [null], manifestKey: "portable", render: renderPortable }
});

export function resolveHost(host, variant) {
  const entry = HOSTS[host];
  if (!entry) throw new Error(`unsupported host ${host}; expected one of ${Object.keys(HOSTS).join(", ")}`);
  const selectedVariant = entry.variants[0] === null ? null : (variant ?? "stable");
  if (!entry.variants.includes(selectedVariant)) throw new Error(`host ${host} does not support variant ${selectedVariant}`);
  if (entry.variants[0] === null && variant !== undefined && variant !== null) throw new Error(`--variant is only valid for a variant host`);
  return { id: host, variant: selectedVariant, ...entry };
}

export function supportsHost(plugin, host) {
  const key = typeof host.manifestKey === "function" ? host.manifestKey(host.variant) : host.manifestKey;
  if (plugin.manifest.hosts?.[key]?.enabled !== true) return false;
  const components = plugin.manifest.components;
  const skillsList = plugin.skills ?? components.skills;
  const agentsList = plugin.agents ?? components.agents;
  const commandsList = plugin.commands ?? components.commands;
  const hostFilesList = plugin.hostFiles ?? components.hostFiles ?? [];
  if (host.id === "codex") {
    return skillsList.length > 0 || hostFilesList.some((file) => file.codexNativeFunctional === true);
  }
  if (host.id === "portable-agent-skills") return skillsList.length > 0;
  const commandHost = key;
  return skillsList.length > 0
    || agentsList.length > 0
    || commandsList.some((command) => command.hosts.includes(commandHost));
}

export function renderHost(plugin, hostId, variant, options = {}) {
  const host = resolveHost(hostId, variant);
  const allowCompanion = options.allowCompanion === true
    && host.id === "codex"
    && plugin.manifest.hosts?.codex?.enabled === true
    && plugin.agents.length > 0;
  if (!supportsHost(plugin, host) && !allowCompanion) throw new Error(`${plugin.manifest.id} does not enable host ${hostId}${host.variant ? `/${host.variant}` : ""}: projection has no functional component`);
  const artifacts = [{ path: "LICENSE", content: plugin.license.content }, ...host.render(plugin, host.variant === "v2-beta" ? "v2-beta" : host.variant)];
  return { host, artifacts: uniqueArtifacts(artifacts, `${hostId}/${host.variant ?? "default"}/${plugin.manifest.id}`) };
}

export function allHostTargets() {
  return Object.entries(HOSTS).flatMap(([id, host]) => host.variants.map((variant) => ({ id, variant })));
}
