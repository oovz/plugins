import { CliError } from "./errors.mjs";
import { defaultSpawnSync, spawnHost } from "./process.mjs";

export const HARNESS_METADATA = Object.freeze({
  "claude-code": Object.freeze({
    host: "claude-code",
    displayName: "Claude Code",
    supportsThinking: false,
  }),
  codex: Object.freeze({
    host: "codex",
    displayName: "Codex",
    executable: "codex",
    queryArgs: Object.freeze(["debug", "models"]),
    modelOutput: "codex",
    supportsThinking: true,
  }),
  opencode: Object.freeze({
    host: "opencode",
    displayName: "OpenCode",
    executable: "opencode",
    queryArgs: Object.freeze(["models"]),
    modelOutput: "opencode",
    supportsThinking: true,
    requireProviderPrefix: true,
  }),
  cursor: Object.freeze({
    host: "cursor",
    displayName: "Cursor",
    executable: "agent",
    queryArgs: Object.freeze(["models"]),
    modelOutput: "cursor",
    supportsThinking: false,
  }),
  "gemini-cli": Object.freeze({
    host: "gemini-cli",
    displayName: "Gemini CLI",
    supportsThinking: false,
  }),
  antigravity: Object.freeze({
    host: "antigravity",
    displayName: "Antigravity",
    supportsThinking: false,
  }),
  "oh-my-pi": Object.freeze({
    host: "oh-my-pi",
    displayName: "Oh My Pi",
    supportsThinking: false,
  }),
});

function modelIdentifier(item) {
  if (typeof item === "string") return item.trim() || null;
  if (!item || typeof item !== "object") return null;
  for (const key of ["slug", "id", "name", "model"]) {
    if (typeof item[key] === "string" && item[key].trim()) return item[key].trim();
  }
  return null;
}

function reasoningIdentifier(item) {
  if (typeof item === "string") return item.trim() || null;
  if (!item || typeof item !== "object") return null;
  for (const key of ["effort", "reasoningEffort", "reasoning_effort", "level", "value", "name", "slug"]) {
    if (typeof item[key] === "string" && item[key].trim()) return item[key].trim().toLowerCase();
  }
  return null;
}

function modelRecords(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.models)) return parsed.models;
  if (Array.isArray(parsed?.data)) return parsed.data;
  return [];
}

function addReasoningMetadata(item, id, reasoningLevelsByModel, defaultReasoningByModel) {
  if (!item || typeof item !== "object") return;
  const rawLevels = item.supported_reasoning_levels ?? item.supportedReasoningLevels ?? item.supported_reasoning_efforts ?? item.supportedReasoningEfforts ?? item.reasoningLevels;
  if (Array.isArray(rawLevels)) {
    const levels = [...new Set(rawLevels.map(reasoningIdentifier).filter(Boolean))];
    if (levels.length > 0) reasoningLevelsByModel[id] = levels;
  }
  const defaultLevel = reasoningIdentifier(item.default_reasoning_level ?? item.defaultReasoningEffort ?? item.default_reasoning_effort);
  if (defaultLevel) defaultReasoningByModel[id] = defaultLevel;
}

function parseCodexModelsOutput(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new CliError(`Could not parse Codex model catalog: ${error.message}`, 1);
  }

  const models = [];
  const disabledModels = [];
  const reasoningLevelsByModel = {};
  const defaultReasoningByModel = {};
  for (const item of modelRecords(parsed)) {
    const id = modelIdentifier(item);
    if (!id) continue;
    addReasoningMetadata(item, id, reasoningLevelsByModel, defaultReasoningByModel);
    const visible = item?.visibility === undefined || item.visibility === "list" || item.visibility === "visible";
    const available = item?.supported_in_api !== false && item?.available !== false && item?.enabled !== false && item?.disabled !== true;
    if (!visible || !available) disabledModels.push(id);
    else models.push(id);
  }

  const disabled = [...new Set(disabledModels)];
  const disabledLower = new Set(disabled.map((model) => model.toLowerCase()));
  return {
    models: [...new Set(models)].filter((model) => !disabledLower.has(model.toLowerCase())),
    disabledModels: disabled,
    reasoningLevelsByModel,
    defaultReasoningByModel,
  };
}

function parseModelLines(stdout, requireProviderPrefix = false) {
  const models = [];
  for (const rawLine of String(stdout ?? "").replaceAll("\r\n", "\n").split("\n")) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#") || /^(available|configured|models?)(?:\s|:|$)/iu.test(line)) continue;
    line = line.replace(/^[-*•]\s+/u, "").trim();
    if (!line) continue;
    const id = line.split(/\s+/u, 1)[0];
    if (!id || id.startsWith("/") || (requireProviderPrefix && !id.includes("/"))) continue;
    if (!/^[^\s/]+(?:\/[^\s/]+)+$/u.test(id) && requireProviderPrefix) continue;
    if (!requireProviderPrefix && !/^[A-Za-z0-9][A-Za-z0-9._:+\-/]*$/u.test(id)) continue;
    models.push(id);
  }
  return { models: [...new Set(models)], disabledModels: [], reasoningLevelsByModel: {}, defaultReasoningByModel: {} };
}

export function parseCliModelsOutput(stdout, format = "generic") {
  if (format === "codex") return parseCodexModelsOutput(String(stdout ?? ""));
  if (format === "opencode") return parseModelLines(stdout, true);
  if (format === "cursor") return parseModelLines(stdout, false);

  if (!stdout || typeof stdout !== "string") return { models: [], disabledModels: [], reasoningLevelsByModel: {}, defaultReasoningByModel: {} };
  try {
    const parsed = JSON.parse(stdout);
    const models = modelRecords(parsed).map(modelIdentifier).filter(Boolean);
    return { models: [...new Set(models)], disabledModels: [], reasoningLevelsByModel: {}, defaultReasoningByModel: {} };
  } catch {
    return parseModelLines(stdout, false);
  }
}

function unavailableCapabilities(meta) {
  const modelWarning = `${meta.displayName} does not expose a documented machine-readable model catalog; model IDs will not be validated.`;
  return {
    ...meta,
    models: null,
    disabledModels: [],
    reasoningLevelsByModel: {},
    defaultReasoningByModel: {},
    defaultModel: null,
    modelValidation: "unvalidated",
    warnings: [modelWarning],
  };
}

export function fetchHarnessCapabilities(host, { project = process.cwd(), env = process.env, spawnSync = defaultSpawnSync } = {}) {
  const meta = HARNESS_METADATA[host];
  if (!meta) throw new CliError(`Unsupported host for capability discovery: ${host}`);
  if (!meta.queryArgs) return unavailableCapabilities(meta);

  let result = spawnHost(meta.executable, meta.queryArgs, { env, cwd: project, spawnSync });
  if (result?.error?.code === "ENOENT") {
    throw new CliError(`Could not find the ${meta.executable} CLI on PATH. Ensure ${meta.displayName} is installed and available to fetch supported models.`, 1);
  }
  if (result?.status !== 0 || !result?.stdout) {
    const detail = result?.stderr || result?.stdout || result?.error?.message || `exit code ${result?.status}`;
    throw new CliError(`Failed to fetch supported models from ${meta.displayName} (${meta.executable}): ${detail}`, 1);
  }

  const parsed = parseCliModelsOutput(String(result.stdout), meta.modelOutput);
  if (parsed.models.length === 0 && parsed.disabledModels.length === 0) {
    throw new CliError(`No available models returned by the ${meta.displayName} harness (${meta.executable}).`, 1);
  }

  return {
    ...meta,
    ...parsed,
    defaultModel: parsed.models[0] ?? null,
    modelValidation: "validated",
    warnings: [],
  };
}

function warningForModelValidation(caps) {
  return caps.warnings?.find((warning) => warning.includes("model IDs will not be validated"))
    ?? `${caps.displayName} model availability could not be validated.`;
}

export function isModelSupported(host, model, capabilities) {
  if (!model) return { supported: false, reason: "Model name is empty." };
  const normalized = String(model).trim();
  const caps = capabilities || HARNESS_METADATA[host];
  if (!caps) return { supported: false, reason: `Unknown host: ${host}` };
  if (normalized.toLowerCase() === "inherit" || normalized.toLowerCase() === "default") {
    return { supported: true, normalizedModel: normalized.toLowerCase(), validated: true };
  }
  if (caps.requireProviderPrefix && !normalized.includes("/")) {
    return {
      supported: false,
      normalizedModel: normalized,
      reason: `${caps.displayName} model IDs must use provider/model syntax (for example, openai/gpt-5): ${normalized}`,
    };
  }
  if (!Array.isArray(caps.models)) {
    return { supported: true, normalizedModel: normalized, validated: false, warning: warningForModelValidation(caps) };
  }

  const disabledMatch = (caps.disabledModels ?? []).find((item) => item.toLowerCase() === normalized.toLowerCase());
  if (disabledMatch) {
    return {
      supported: false,
      normalizedModel: normalized,
      reason: `Model "${normalized}" is currently unavailable in your local ${caps.displayName} catalog.`,
    };
  }

  const found = caps.models.find((item) => item.toLowerCase() === normalized.toLowerCase());
  if (found) return { supported: true, normalizedModel: found, validated: true };
  return {
    supported: false,
    normalizedModel: normalized,
    reason: `Model "${normalized}" is not available in the local ${caps.displayName} catalog. Available models: ${caps.models.slice(0, 10).join(", ")}${caps.models.length > 10 ? ", ..." : ""}`,
  };
}

function findModelKey(model, reasoningLevelsByModel) {
  if (!model || !reasoningLevelsByModel) return null;
  return Object.keys(reasoningLevelsByModel).find((key) => key.toLowerCase() === String(model).trim().toLowerCase()) ?? null;
}

export function isReasoningSupported(host, reasoning, capabilities, model) {
  if (reasoning === undefined || reasoning === null || reasoning === "") return { supported: true, normalizedReasoning: undefined, validated: true };
  const normalized = String(reasoning).trim().toLowerCase();
  const caps = capabilities || HARNESS_METADATA[host];
  if (!caps) return { supported: false, reason: `Unknown host: ${host}` };
  if (!caps.supportsThinking) {
    return {
      supported: false,
      reason: `${caps.displayName} agent files do not expose a supported thinking-level field; omit thinking setting.`,
    };
  }
  if (normalized === "inherit" || normalized === "default") return { supported: true, normalizedReasoning: normalized, validated: true };

  const modelKey = findModelKey(model, caps.reasoningLevelsByModel);
  if (!modelKey) {
    return {
      supported: true,
      normalizedReasoning: normalized,
      validated: false,
      warning: `${caps.displayName} does not expose a machine-readable reasoning-level list for ${model ?? "the selected model"}; "${reasoning}" was not validated.`,
    };
  }
  const levels = caps.reasoningLevelsByModel[modelKey];
  const found = levels.find((item) => item.toLowerCase() === normalized);
  if (found) return { supported: true, normalizedReasoning: found, validated: true };
  return {
    supported: false,
    reason: `Reasoning level "${reasoning}" is not supported by ${caps.displayName} model ${modelKey}. Supported levels: ${levels.join(", ")}`,
  };
}

