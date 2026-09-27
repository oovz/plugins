import { parseDocument, stringify as stringifyYaml } from "yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { CliError } from "./errors.mjs";
import { ROLE_IDS } from "./host-config.mjs";

const REASONING_FIELD = Object.freeze({
  "claude-code": "effort",
  codex: "model_reasoning_effort",
  opencode: "variant",
  "oh-my-pi": "thinking-level",
});
const CLAUDE_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const OMP_THINKING_LEVELS = ["inherit", "off", "minimal", "low", "medium", "high", "xhigh", "max"];
const ANTIGRAVITY_MODELS = new Set(["inherit", "flash", "pro"]);

function normalizeModel(host, model) {
  if (model !== undefined) {
    if (typeof model !== "string") throw new CliError("--model must be a non-empty single-line value.");
    model = model.trim();
    if (!model || /[\r\n\u0000-\u001f\u007f]/u.test(model)) throw new CliError("--model must be a non-empty single-line value.");
    if (host === "opencode" && model === "inherit") {
      throw new CliError("--model inherit is not supported for OpenCode. Use --reset to clear model and reasoning overrides.");
    }
    if (host === "opencode" && !/^[^\s/]+(?:\/[^\s/]+)+$/u.test(model)) {
      throw new CliError(`OpenCode models must use provider/model syntax: ${model}`);
    }
    if (host === "antigravity" && !ANTIGRAVITY_MODELS.has(model)) {
      throw new CliError("Antigravity model must be one of: inherit, flash, pro.");
    }
  }
  return model;
}

function normalizeReasoning(host, reasoning) {
  if (reasoning !== undefined) {
    if (typeof reasoning !== "string") throw new CliError("--reasoning must be a non-empty single-line value.");
    reasoning = reasoning.trim();
    if (!reasoning || /[\r\n\u0000-\u001f\u007f]/u.test(reasoning)) throw new CliError("--reasoning must be a non-empty single-line value.");
    if (!REASONING_FIELD[host]) throw new CliError(`${host} has no supported subagent reasoning field.`);
    if (host === "oh-my-pi" && reasoning !== "auto" && (reasoning.length < 2 || OMP_THINKING_LEVELS.filter((level) => level.startsWith(reasoning)).length !== 1)) {
      throw new CliError("Oh My Pi thinking-level must be inherit, off, minimal, low, medium, high, xhigh, max, an unambiguous prefix of at least two characters, or auto.");
    }
    if (host === "claude-code" && !CLAUDE_EFFORTS.has(reasoning)) {
      throw new CliError("Claude Code effort must be one of: low, medium, high, xhigh, max.");
    }
  }
  return reasoning;
}

function normalizeOverrideFields(host, { model, reasoning }) {
  model = normalizeModel(host, model);
  reasoning = normalizeReasoning(host, reasoning);
  return { ...(model !== undefined ? { model } : {}), ...(reasoning !== undefined ? { reasoning } : {}) };
}

export function validateOverride(host, { model, reasoning }) {
  const selected = normalizeOverrideFields(host, { model, reasoning });
  if (model === undefined && reasoning !== undefined) throw new CliError("--reasoning requires --model.");
  return selected;
}

function validateStoredOverrides(host, model, reasoning) {
  if (model !== undefined && typeof model !== "string") throw new CliError(`${host} agent model must be a string.`);
  const field = REASONING_FIELD[host];
  if (reasoning !== undefined && typeof reasoning !== "string") throw new CliError(`${host} agent ${field} must be a string.`);
  const stored = normalizeOverrideFields(host, { model, reasoning });
  if (stored.model !== model) throw new CliError(`${host} agent model must not have leading or trailing whitespace.`);
  if (stored.reasoning !== reasoning) throw new CliError(`${host} agent ${field} must not have leading or trailing whitespace.`);
  return stored;
}

function expectedAgentName(role) {
  if (!ROLE_IDS.includes(role)) throw new CliError(`Unknown role identity: ${role}`);
  return `senior-engineering-workflow-${role}`;
}

function requireText(host, field, value) {
  if (typeof value !== "string" || !value.trim()) throw new CliError(`${host} agent ${field} must be a non-empty string.`);
  return value;
}

function parseFrontmatter(host, content) {
  const source = String(content).replaceAll("\r\n", "\n");
  if (!source.startsWith("---\n")) throw new CliError(`The installed ${host} agent file has no YAML frontmatter.`);
  const close = source.indexOf("\n---\n", 4);
  if (close < 0) throw new CliError(`The installed ${host} agent file has unterminated YAML frontmatter.`);
  const body = source.slice(close + 5);
  if (!body.trim()) throw new CliError(`${host} agent prompt body is empty.`);
  const document = parseDocument(source.slice(4, close), { prettyErrors: false, maxAliasCount: 100, lineWidth: 0 });
  if (document.errors.length) throw new CliError(`The installed ${host} agent file has invalid YAML frontmatter: ${document.errors[0].message}`);
  const value = document.toJS();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CliError(`The installed ${host} agent YAML frontmatter must be a mapping.`);
  return { value, body };
}

export function readRoleConfiguration(host, content, expectedRole) {
  const agentName = expectedAgentName(expectedRole);
  if (host === "codex") {
    let parsed;
    try { parsed = parseToml(String(content)); }
    catch (error) { throw new CliError(`Invalid Codex agent TOML: ${error.message}`); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new CliError("Codex agent TOML must be a table.");
    }
    if (requireText(host, "name", parsed.name) !== agentName) {
      throw new CliError(`Codex agent name must identify the expected role ${agentName}.`);
    }
    const description = requireText(host, "description", parsed.description);
    requireText(host, "developer_instructions", parsed.developer_instructions);
    if (parsed.model !== undefined && typeof parsed.model !== "string") throw new CliError("codex agent model must be a string.");
    if (parsed.model_reasoning_effort !== undefined && typeof parsed.model_reasoning_effort !== "string") throw new CliError("codex agent model_reasoning_effort must be a string.");
    const stored = validateStoredOverrides(host, parsed.model, parsed.model_reasoning_effort);
    return { name: parsed.name, description, model: stored.model, reasoning: stored.reasoning };
  }
  const { value } = parseFrontmatter(host, content);
  const description = requireText(host, "description", value.description);
  const name = host === "opencode" && value.name === undefined ? agentName : value.name;
  if (requireText(host, "name", name) !== agentName) {
    throw new CliError(`${host} agent name must identify the expected role ${agentName}.`);
  }
  if (host === "gemini-cli" && value.kind !== "local") throw new CliError("Gemini CLI custom agents must declare kind: local.");
  if (host === "antigravity" && (value.mainAgent !== false || value.subagent !== true || value.commandExecutionPolicy !== "sandbox" || !Array.isArray(value.tools) || value.tools.some((tool) => typeof tool !== "string"))) {
    throw new CliError("Antigravity custom subagents must declare subagent metadata, sandbox policy, and a string tools list.");
  }
  if (host === "opencode" && value.mode !== "subagent") throw new CliError("OpenCode agents must declare mode: subagent.");
  if (value.model !== undefined && typeof value.model !== "string") throw new CliError(`${host} agent model must be a string.`);
  const reasoningField = REASONING_FIELD[host];
  if (reasoningField && value[reasoningField] !== undefined && typeof value[reasoningField] !== "string") {
    throw new CliError(`${host} agent ${reasoningField} must be a string.`);
  }
  const stored = validateStoredOverrides(host, value.model, reasoningField ? value[reasoningField] : undefined);
  return { name, description, model: stored.model, reasoning: stored.reasoning };
}

export function applyRoleOverride(host, content, override) {
  const selected = normalizeOverrideFields(host, override);
  if (host === "codex") {
    let parsed;
    try { parsed = parseToml(String(content)); }
    catch (error) { throw new CliError(`The installed Codex agent file has invalid TOML: ${error.message}`); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new CliError("The installed Codex agent TOML must be a table.");
    if (override.reset) {
      delete parsed.model;
      delete parsed.model_reasoning_effort;
    } else {
      if (selected.model === "inherit") delete parsed.model;
      else if (selected.model !== undefined) parsed.model = selected.model;
      if (selected.reasoning !== undefined) parsed.model_reasoning_effort = selected.reasoning;
    }
    try { return `${stringifyToml(parsed).trimEnd()}\n`; }
    catch (error) { throw new CliError(`The resulting Codex agent TOML is invalid: ${error.message}`); }
  }

  const { value, body } = parseFrontmatter(host, content);
  if (override.reset) {
    delete value.model;
    if (["gemini-cli", "antigravity"].includes(host)) value.model = "inherit";
  }
  else if (host === "oh-my-pi" && selected.model === "inherit") delete value.model;
  else if (selected.model !== undefined) value.model = selected.model;
  const reasoningField = REASONING_FIELD[host];
  if (reasoningField) {
    if (override.reset) delete value[reasoningField];
    else if (selected.reasoning !== undefined) value[reasoningField] = selected.reasoning;
  }
  const frontmatter = stringifyYaml(value, { lineWidth: 0 }).trimEnd();
  return `---\n${frontmatter}\n---\n${body}`;
}

export function preserveRoleOverrides(host, currentContent, canonicalContent, expectedRole) {
  try {
    const current = readRoleConfiguration(host, currentContent, expectedRole);
    const currentBase = applyRoleOverride(host, currentContent, { reset: true });
    const canonicalBase = applyRoleOverride(host, canonicalContent, { reset: true });
    if (currentBase !== canonicalBase) return null;
    return applyRoleOverride(host, canonicalContent, {
      ...(current.model !== undefined ? { model: current.model } : {}),
      ...(current.reasoning !== undefined ? { reasoning: current.reasoning } : {}),
    });
  } catch (error) {
    if (error instanceof CliError) return null;
    throw error;
  }
}
