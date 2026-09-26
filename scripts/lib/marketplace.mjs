import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const CAPABILITY_CONTROL_CHARACTER = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/u;
const CAPABILITY_DEFAULT_IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;
const CAPABILITY_EMOJI = /\p{Emoji}/u;
const CAPABILITY_EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const CAPABILITY_VISIBLE_CHARACTER = /[\p{L}\p{N}\p{P}\p{S}\p{Zs}]/u;

function codexNativeComponentKind(destination) {
  if (/^hooks\/[^/]+\.json$/i.test(destination)) return "hooks";
  if (destination === ".mcp.json") return "mcpServers";
  return null;
}

export async function readJson(file) {
  return JSON.parse(decodeUtf8(await readFile(file), file));
}

export function decodeUtf8(content, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
}

export function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertWellFormedUnicode(value, label) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      assert(next >= 0xdc00 && next <= 0xdfff, `${label} must contain well-formed Unicode`);
      index += 1;
    } else {
      assert(codeUnit < 0xdc00 || codeUnit > 0xdfff, `${label} must contain well-formed Unicode`);
    }
  }
}

function supportedCapabilityFormatting(characters, index) {
  const current = characters[index];
  if (current === "\u200d") {
    let previousIndex = index - 1;
    if (/\p{Emoji_Modifier}/u.test(characters[previousIndex] ?? "")) previousIndex -= 1;
    if (characters[previousIndex] === "\ufe0e" || characters[previousIndex] === "\ufe0f") previousIndex -= 1;
    return CAPABILITY_EXTENDED_PICTOGRAPHIC.test(characters[previousIndex] ?? "")
      && CAPABILITY_EXTENDED_PICTOGRAPHIC.test(characters[index + 1] ?? "");
  }
  if (current === "\ufe0e" || current === "\ufe0f") {
    return CAPABILITY_EMOJI.test(characters[index - 1] ?? "");
  }
  return false;
}

export function assertSupportedListingText(value, label) {
  assert(typeof value === "string", `${label} must be a string`);
  assertWellFormedUnicode(value, label);
  const characters = [...value];
  for (const [index, character] of characters.entries()) {
    if (CAPABILITY_DEFAULT_IGNORABLE.test(character)) {
      assert(supportedCapabilityFormatting(characters, index), `${label} contains unsupported invisible or unattached zero-width joiner formatting`);
    }
  }
  const normalized = value.normalize("NFKC");
  assert(normalized.trim().length > 0, `${label} must not be empty after normalization`);
  assert(!CAPABILITY_CONTROL_CHARACTER.test(value), `${label} must be single-line text without control characters`);
  assert(CAPABILITY_VISIBLE_CHARACTER.test(normalized), `${label} must contain visible text`);
  assert(characters.length <= 120, `${label} must be at most 120 characters`);
  return normalized;
}

export function classifyCodexComponents(components) {
  const skills = components?.skills ?? [];
  const agents = components?.agents ?? [];
  const hostFiles = (components?.hostFiles ?? []).filter((file) => file.hosts?.includes("codex"));
  const skillIds = new Set(skills);
  const skillSupportFiles = [];
  const nativeFiles = [];
  const invalidDestinations = [];
  const destinations = new Set();
  const nativeKinds = new Set();
  for (const file of hostFiles) {
    const parts = file.destination.split("/");
    if (parts[0] !== "skills") {
      const nativeKind = codexNativeComponentKind(file.destination);
      if (!nativeKind || nativeKinds.has(nativeKind)) {
        invalidDestinations.push(file);
        continue;
      }
      nativeKinds.add(nativeKind);
      nativeFiles.push({ ...file, nativeKind });
      continue;
    }
    const skillId = parts[1];
    const relative = parts.slice(2).join("/");
    if (!skillId || !skillIds.has(skillId) || !relative) {
      invalidDestinations.push(file);
      continue;
    }
    const firstSegment = parts[2].toLowerCase();
    if (["skill.md", "license"].includes(firstSegment)) {
      invalidDestinations.push(file);
      continue;
    }
    const key = file.destination.toLowerCase();
    if (destinations.has(key)) {
      invalidDestinations.push(file);
      continue;
    }
    destinations.add(key);
    skillSupportFiles.push({ ...file, skillId });
  }
  return {
    standaloneSkills: skills,
    skillSupportFiles,
    companionAgents: agents,
    nativeFiles,
    invalidDestinations,
    hasNativeComponents: skills.length > 0 || nativeFiles.length > 0
  };
}

export function assertRelative(relative, label = "path") {
  assert(typeof relative === "string" && relative.length > 0, `${label} must be a non-empty string`);
  assert(!path.isAbsolute(relative), `${label} must be relative: ${relative}`);
  assert(!relative.includes("\\"), `${label} must use forward slashes: ${relative}`);
  const normalized = path.posix.normalize(relative);
  assert(normalized === relative && normalized !== ".." && !normalized.startsWith("../"), `${label} escapes its root: ${relative}`);
  for (const segment of relative.split("/")) {
    assert(segment.length > 0 && !/[\u0000-\u001f\u007f:]/.test(segment), `${label} contains a non-portable segment: ${segment}`);
    assert(!/[. ]$/.test(segment), `${label} contains a segment ending in a dot or space: ${segment}`);
    assert(!WINDOWS_DEVICE.test(segment), `${label} contains a reserved Windows device name: ${segment}`);
  }
  return normalized;
}

function assertId(id, label) {
  assert(ID_PATTERN.test(id), `invalid ${label}: ${id}`);
  assert(!WINDOWS_DEVICE.test(id), `${label} is a reserved Windows device name: ${id}`);
}

export function within(root, candidate, label = "path") {
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(candidate);
  const relative = path.relative(absoluteRoot, absolute);
  assert(relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)), `${label} escapes ${absoluteRoot}: ${absolute}`);
  return absolute;
}

export async function assertSecureSourcePath(root, candidate, label = "source path") {
  const absoluteRoot = path.resolve(root);
  const absolute = within(absoluteRoot, candidate, label);
  let current = absoluteRoot;
  const rootInfo = await lstat(current);
  assert(!rootInfo.isSymbolicLink(), `${label} root must not be a symlink: ${current}`);
  for (const part of path.relative(absoluteRoot, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = await lstat(current);
    assert(!info.isSymbolicLink(), `${label} must not traverse a symlink: ${current}`);
  }
  const realRoot = await realpath(absoluteRoot);
  const realCandidate = await realpath(absolute);
  within(realRoot, realCandidate, `${label} real path`);
  return absolute;
}

export async function discoverMarketplace(root = ROOT) {
  const manifestPath = path.join(root, "marketplace.json");
  await assertSecureSourcePath(root, manifestPath, "marketplace.json");
  const marketplaceStat = await lstat(manifestPath);
  assert(marketplaceStat.isFile() && !marketplaceStat.isSymbolicLink(), "marketplace.json must be a regular file");
  const marketplace = await readJson(manifestPath);
  assert(marketplace.schemaVersion === 2, "marketplace.json schemaVersion must be 2");
  assertId(marketplace.id, "marketplace id");
  const pluginRoot = within(root, path.join(root, "plugins"), "plugin root");
  const skillRoot = within(root, path.join(root, "skills"), "skill root");
  await assertSecureSourcePath(root, pluginRoot, "pluginRoot");
  await assertSecureSourcePath(root, skillRoot, "skillRoot");

  assert(Array.isArray(marketplace.skills), "marketplace.skills must be an array");
  const skills = [];
  const skillIds = new Set();
  for (const skillId of marketplace.skills) {
    assertId(skillId, "catalog skill id");
    assert(!skillIds.has(skillId), `duplicate catalog skill id: ${skillId}`);
    skillIds.add(skillId);
    const directory = within(skillRoot, path.join(skillRoot, skillId), `catalog skill ${skillId}`);
    await assertSecureSourcePath(skillRoot, directory, `catalog skill ${skillId}`);
    const directoryStat = await lstat(directory);
    assert(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), `catalog skill path must be a regular directory: skills/${skillId}`);
    skills.push({ id: skillId, directory });
  }

  const plugins = [];
  assert(Array.isArray(marketplace.plugins), "marketplace.plugins must be an array");
  assert(marketplace.plugins.length > 0 || marketplace.skills.length > 0, "marketplace must explicitly publish at least one plugin or skill");
  for (const pluginId of marketplace.plugins) {
    assertId(pluginId, "catalog plugin id");
    const directory = within(pluginRoot, path.join(pluginRoot, pluginId), `catalog plugin ${pluginId}`);
    await assertSecureSourcePath(pluginRoot, directory, `catalog plugin ${pluginId}`);
    const directoryStat = await lstat(directory);
    assert(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), `catalog plugin path must be a regular directory: plugins/${pluginId}`);
    const manifestFile = path.join(directory, "manifest.json");
    try {
      await assertSecureSourcePath(directory, manifestFile, `plugin manifest ${pluginId}`);
      const manifestStat = await lstat(manifestFile);
      assert(manifestStat.isFile() && !manifestStat.isSymbolicLink(), `plugin manifest ${pluginId} must be a regular file`);
      const manifest = await readJson(manifestFile);
      validatePluginManifest(manifest, path.basename(directory));
      assert(manifest.id === pluginId, `catalog id ${pluginId} does not match manifest id ${manifest.id}`);
      plugins.push({ directory, manifestFile, manifest, marketplace, catalogSkills: skills });
    } catch (error) {
      throw new Error(`${path.relative(root, manifestFile)}: ${error.message}`, { cause: error });
    }
  }

  const ids = new Set();
  for (const plugin of plugins) {
    assert(!ids.has(plugin.manifest.id), `duplicate plugin id: ${plugin.manifest.id}`);
    ids.add(plugin.manifest.id);
  }
  return { root, marketplace, pluginRoot, skillRoot, skills, plugins };
}

export function validatePluginManifest(manifest, directoryName) {
  assert(manifest && typeof manifest === "object" && !Array.isArray(manifest), "manifest must be an object");
  assert(manifest.schemaVersion === 2, "schemaVersion must be 2");
  assertId(manifest.id, "plugin id");
  assert(manifest.id === directoryName, `plugin id ${manifest.id} must match directory ${directoryName}`);
  assert(SEMVER_PATTERN.test(manifest.version), `invalid semantic version: ${manifest.version}`);
  for (const key of ["displayName", "description", "license"]) assert(typeof manifest[key] === "string" && manifest[key].trim(), `${key} is required`);
  assert(manifest.id.length <= 64, "plugin id must be at most 64 characters");
  assert(manifest.description.length <= 1024, "plugin description must be at most 1024 characters");
  if (manifest.shortDescription !== undefined) assert(typeof manifest.shortDescription === "string" && manifest.shortDescription.trim() && manifest.shortDescription.length <= 60, "shortDescription must be a 1-60 character string when present");
  assert(manifest.author && typeof manifest.author.name === "string" && manifest.author.name.trim(), "author.name is required");
  assert(manifest.author.name.length <= 120, "author.name must be at most 120 characters");
  assert(manifest.components && typeof manifest.components === "object", "components is required");
  for (const kind of ["skills", "agents", "commands"]) assert(Array.isArray(manifest.components[kind]), `components.${kind} must be an array`);
  if (manifest.components.hostFiles !== undefined) assert(Array.isArray(manifest.components.hostFiles), "components.hostFiles must be an array");

  const skillIds = new Set();
  for (const skillId of manifest.components.skills) {
    assertId(skillId, "skill id");
    assert(!skillIds.has(skillId), `duplicate skill id: ${skillId}`);
    skillIds.add(skillId);
  }

  const componentIds = new Map();
  for (const kind of ["agents", "commands"]) {
    for (const component of manifest.components[kind]) {
      assert(component, `${kind} component must be an object`);
      assertId(component.id, `${kind} id`);
      assertRelative(component.path, `${kind}.${component.id}.path`);
      const key = `${kind}:${component.id}`;
      assert(!componentIds.has(key), `duplicate component id: ${key}`);
      componentIds.set(key, true);
    }
  }

  for (const agent of manifest.components.agents) {
    assert(typeof agent.description === "string" && agent.description.trim(), `agent ${agent.id} description is required`);
    assert(["read-only", "workspace-write"].includes(agent.workspace), `agent ${agent.id} has invalid workspace capability`);
    for (const capability of ["shell", "external", "delegates", "question"]) assert(typeof agent[capability] === "boolean", `agent ${agent.id}.${capability} must be boolean`);
    assert(["explicit", "inherit"].includes(agent.permissionPolicy ?? "explicit"), `agent ${agent.id} has invalid permissionPolicy`);
    assert(agent.model?.policy === "inherit", `agent ${agent.id} must inherit its parent model`);
    assert(agent.steps === null, `agent ${agent.id} must not hard-code a step limit`);
  }
  const hostIds = new Set(["claude-code", "codex", "cursor", "gemini-cli", "antigravity", "oh-my-pi", "opencode", "portable"]);
  assert(manifest.hosts && typeof manifest.hosts === "object" && !Array.isArray(manifest.hosts), "hosts is required and must be an object");
  for (const hostId of Object.keys(manifest.hosts ?? {})) assert(hostIds.has(hostId), `unsupported manifest host ${hostId}`);
  assert(Object.values(manifest.hosts).some((host) => host?.enabled === true), "at least one host must be explicitly enabled");
  for (const [hostId, host] of Object.entries(manifest.hosts)) {
    assert(typeof host?.enabled === "boolean", `hosts.${hostId}.enabled must be boolean`);
    assert(hostId === "codex" || host.capabilities === undefined, `hosts.${hostId}.capabilities is only valid for the codex host`);
  }
  if (manifest.hosts.codex?.enabled === true) {
    const capabilities = manifest.hosts.codex.capabilities;
    assert(Array.isArray(capabilities) && capabilities.length > 0 && capabilities.length <= 20, "hosts.codex.capabilities must contain 1-20 entries");
    const normalizedCapabilities = capabilities.map((capability) => assertSupportedListingText(capability, "hosts.codex.capabilities entries"));
    assert(new Set(normalizedCapabilities).size === normalizedCapabilities.length, "hosts.codex.capabilities must not contain duplicates after normalization");
    assert(/^https:\/\//.test(manifest.author.url ?? ""), "Codex-enabled plugins require an HTTPS author.url");
    const categories = new Set(["Productivity", "Creativity", "Developer Tools", "Business & Operations", "Data & Analytics", "Communication", "Education & Research", "Security", "Finance", "Healthcare", "Travel", "Entertainment", "Other"]);
    assert(categories.has(manifest.category ?? "Other"), `unsupported Codex category: ${manifest.category}`);
  }
  const commandHosts = new Set(["claude-code", "cursor", "gemini-cli", "oh-my-pi", "opencode"]);
  for (const command of manifest.components.commands) {
    assert(Array.isArray(command.hosts) && command.hosts.length > 0, `command ${command.id} must declare supported hosts`);
    for (const host of command.hosts) {
      assert(commandHosts.has(host), `command ${command.id} targets a host without a command renderer: ${host}`);
      assert(manifest.hosts[host]?.enabled === true, `command ${command.id} targets disabled host ${host}`);
    }
  }
  const hostFileIds = new Set();
  for (const hostFile of manifest.components.hostFiles ?? []) {
    assert(hostFile, "host file must be an object");
    assertId(hostFile.id, "host file id");
    assert(!hostFileIds.has(hostFile.id), `duplicate host file id: ${hostFile.id}`);
    hostFileIds.add(hostFile.id);
    assertRelative(hostFile.path, `hostFiles.${hostFile.id}.path`);
    assertRelative(hostFile.destination, `hostFiles.${hostFile.id}.destination`);
    assert(Array.isArray(hostFile.hosts) && hostFile.hosts.length > 0, `hostFiles.${hostFile.id}.hosts must not be empty`);
    for (const host of hostFile.hosts) {
      assert(hostIds.has(host), `hostFiles.${hostFile.id} has unsupported host ${host}`);
      assert(manifest.hosts[host]?.enabled === true, `hostFiles.${hostFile.id} targets disabled host ${host}`);
    }
    if (hostFile.hosts.some((host) => host === "opencode")) assert(hostFile.destination.startsWith(".opencode/"), `hostFiles.${hostFile.id} must use an .opencode/ destination for OpenCode`);
    if (hostFile.hosts.includes("portable")) assert(hostFile.destination.startsWith(".agents/"), `hostFiles.${hostFile.id} must use an .agents/ destination for portable Agent Skills`);
    assert(hostFile.executable === undefined || typeof hostFile.executable === "boolean", `hostFiles.${hostFile.id}.executable must be boolean`);
  }
  const codexComponents = classifyCodexComponents(manifest.components);
  for (const file of codexComponents.invalidDestinations) {
    assert(false, `Codex host file ${file.id} must target a declared skill support path or a supported native component and must not overwrite SKILL.md or LICENSE: ${file.destination}`);
  }
  if (manifest.validation !== undefined) {
    assert(manifest.validation && typeof manifest.validation.profile === "string" && manifest.validation.profile, "validation.profile is required");
    if (manifest.validation.contract !== undefined) assertRelative(manifest.validation.contract, "validation.contract");
    assertRelative(manifest.validation.evals, "validation.evals");
  }
}

export async function inspectSkill(skill) {
  const skillFile = path.join(skill.directory, "SKILL.md");
  await assertSecureSourcePath(skill.directory, skillFile, `skill ${skill.id}`);
  const stat = await lstat(skillFile);
  assert(stat.isFile() && !stat.isSymbolicLink(), `skill ${skill.id} must contain a regular SKILL.md`);
  const licenseFile = path.join(skill.directory, "LICENSE");
  await assertSecureSourcePath(skill.directory, licenseFile, `skill ${skill.id} LICENSE`);
  const licenseStat = await lstat(licenseFile);
  assert(licenseStat.isFile() && !licenseStat.isSymbolicLink(), `skill ${skill.id} must contain a regular LICENSE`);
  const files = await walkFiles(skill.directory, skill.directory);
  const parsed = parseFrontmatter(decodeUtf8(await readFile(skillFile), `skills/${skill.id}/SKILL.md`), `skills/${skill.id}/SKILL.md`);
  assert(ID_PATTERN.test(parsed.frontmatter.name) && parsed.frontmatter.name.length <= 64, `skill ${skill.id} has an invalid Agent Skills name`);
  assert(parsed.frontmatter.name === skill.id, `skill ${skill.id} frontmatter name must match its catalog id`);
  assert(path.basename(skill.directory) === skill.id, `skill ${skill.id} directory must match its id`);
  assert(typeof parsed.frontmatter.description === "string" && parsed.frontmatter.description.trim().length > 0 && parsed.frontmatter.description.length <= 1024, `skill ${skill.id} must have a 1-1024 character description`);
  if (parsed.frontmatter.license !== undefined) assert(typeof parsed.frontmatter.license === "string" && parsed.frontmatter.license.trim(), `skill ${skill.id} license must be a non-empty string`);
  if (parsed.frontmatter.compatibility !== undefined) assert(typeof parsed.frontmatter.compatibility === "string" && parsed.frontmatter.compatibility.length <= 500, `skill ${skill.id} compatibility must be a string of at most 500 characters`);
  if (parsed.frontmatter.metadata !== undefined) {
    assert(parsed.frontmatter.metadata && typeof parsed.frontmatter.metadata === "object" && !Array.isArray(parsed.frontmatter.metadata), `skill ${skill.id} metadata must be a string map`);
    for (const [key, value] of Object.entries(parsed.frontmatter.metadata)) assert(typeof key === "string" && typeof value === "string", `skill ${skill.id} metadata values must be strings`);
  }
  if (parsed.frontmatter["allowed-tools"] !== undefined) assert(typeof parsed.frontmatter["allowed-tools"] === "string", `skill ${skill.id} allowed-tools must be a string`);
  return { ...skill, file: skillFile, files, licenseFile, frontmatter: parsed.frontmatter, body: parsed.body };
}

export async function inspectPlugin(plugin) {
  const licenseFile = path.join(plugin.directory, "LICENSE");
  await assertSecureSourcePath(plugin.directory, licenseFile, `${plugin.manifest.id} LICENSE`);
  const licenseStat = await lstat(licenseFile);
  assert(licenseStat.isFile() && !licenseStat.isSymbolicLink(), `${plugin.manifest.id} must contain a regular plugin-local LICENSE`);
  const license = { file: licenseFile, content: await readFile(licenseFile) };
  const skillCatalog = new Map(plugin.catalogSkills.map((skill) => [skill.id, skill]));
  const skills = [];
  for (const skillId of plugin.manifest.components.skills) {
    const source = skillCatalog.get(skillId);
    assert(source, `${plugin.manifest.id} references uncataloged skill ${skillId}`);
    skills.push(source.files ? source : await inspectSkill(source));
  }

  const agents = [];
  for (const component of plugin.manifest.components.agents) {
    const file = within(plugin.directory, path.join(plugin.directory, component.path), `agent ${component.id}`);
    await assertSecureSourcePath(plugin.directory, file, `agent ${component.id}`);
    const stat = await lstat(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), `agent ${component.id} must be a regular file`);
    const source = decodeUtf8(await readFile(file), component.path);
    const parsed = parseFrontmatter(source, component.path);
    agents.push({ ...component, file, source, frontmatter: parsed.frontmatter, body: parsed.body });
  }

  const commands = [];
  for (const component of plugin.manifest.components.commands) {
    const file = within(plugin.directory, path.join(plugin.directory, component.path), `command ${component.id}`);
    await assertSecureSourcePath(plugin.directory, file, `command ${component.id}`);
    const stat = await lstat(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), `command ${component.id} must be a regular file`);
    commands.push({ ...component, file, source: await readFile(file) });
  }
  const hostFiles = [];
  for (const component of plugin.manifest.components.hostFiles ?? []) {
    const file = within(plugin.directory, path.join(plugin.directory, component.path), `host file ${component.id}`);
    await assertSecureSourcePath(plugin.directory, file, `host file ${component.id}`);
    const stat = await lstat(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), `host file ${component.id} must be a regular file`);
    hostFiles.push({ ...component, file, content: await readFile(file) });
  }
  const codexComponents = classifyCodexComponents(plugin.manifest.components);
  for (const component of codexComponents.nativeFiles) {
    const hostFile = hostFiles.find((file) => file.id === component.id);
    let parsed;
    try {
      parsed = JSON.parse(decodeUtf8(hostFile.content, `${plugin.manifest.id}/${hostFile.path}`));
    } catch (error) {
      throw new Error(`Codex ${component.nativeKind} component ${component.id} must contain valid JSON`, { cause: error });
    }
    assert(parsed && typeof parsed === "object" && !Array.isArray(parsed), `Codex ${component.nativeKind} component ${component.id} must contain a JSON object`);
    if (component.nativeKind === "mcpServers") {
      const servers = parsed.mcpServers;
      assert(servers && typeof servers === "object" && !Array.isArray(servers) && Object.keys(servers).length > 0, `Codex mcpServers component ${component.id} must declare at least one MCP server`);
      for (const [name, server] of Object.entries(servers)) {
        assert(server && typeof server === "object" && !Array.isArray(server) && Object.keys(server).length > 0, `Codex MCP server ${name} in ${component.id} must be a non-empty object`);
        assert((typeof server.command === "string" && server.command.trim()) || (typeof server.url === "string" && server.url.trim()), `Codex MCP server ${name} in ${component.id} must declare a command or URL`);
      }
    } else {
      const hooks = parsed.hooks;
      const hasHandler = hooks && typeof hooks === "object" && !Array.isArray(hooks)
        && Object.values(hooks).some((entries) => Array.isArray(entries) && entries.some((entry) => entry && typeof entry === "object" && !Array.isArray(entry)
          && Array.isArray(entry.hooks) && entry.hooks.some((handler) => handler && typeof handler === "object" && !Array.isArray(handler) && Object.keys(handler).length > 0)));
      assert(hasHandler, `Codex hooks component ${component.id} must declare at least one hook handler`);
    }
    hostFile.codexNativeKind = component.nativeKind;
    hostFile.codexNativeFunctional = true;
  }
  return { ...plugin, license, skills, agents, commands, hostFiles };
}

export async function walkFiles(directory, containmentRoot = directory) {
  await assertSecureSourcePath(containmentRoot, directory, "source tree");
  const logicalDirectory = path.resolve(directory);
  const rootReal = await realpath(logicalDirectory);
  const output = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symlinks are not allowed in plugin sources: ${absolute}`);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) {
        const info = await lstat(absolute);
        const relative = path.relative(rootReal, absolute).split(path.sep).join("/");
        assertRelative(relative, "skill support file path");
        output.push({ absolute: path.join(logicalDirectory, ...relative.split("/")), relative, content: await readFile(absolute), executable: (info.mode & 0o111) !== 0 });
      }
      else throw new Error(`unsupported plugin source entry: ${absolute}`);
    }
  }
  await walk(rootReal);
  return output;
}

export function parseFrontmatter(source, label) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert(match, `${label} must contain YAML frontmatter`);
  const frontmatter = YAML.parse(match[1]);
  assert(frontmatter && typeof frontmatter === "object", `${label} frontmatter must be a mapping`);
  return { frontmatter, body: match[2].replace(/^\s+/, "").replace(/\s+$/, "") };
}

export function markdown(frontmatter, body) {
  return `---\n${YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}

export function flatAgentId(pluginId, roleId) {
  return `${pluginId}-${roleId}`;
}

export function copySkillArtifacts(skill, prefix = "skills") {
  return skill.files.map((file) => ({ path: path.posix.join(prefix, skill.id, file.relative), content: file.content, executable: file.executable }));
}

export function uniqueArtifacts(artifacts, context) {
  const sorted = [...artifacts].sort((a, b) => a.path.localeCompare(b.path));
  const seen = new Set();
  const portableSeen = new Map();
  for (const artifact of sorted) {
    assertRelative(artifact.path, `${context} artifact path`);
    assert(!seen.has(artifact.path), `${context} emitted duplicate path ${artifact.path}`);
    seen.add(artifact.path);
    const portableKey = artifact.path.normalize("NFC").toLowerCase();
    assert(!portableSeen.has(portableKey), `${context} emitted a cross-platform path collision: ${portableSeen.get(portableKey)} and ${artifact.path}`);
    portableSeen.set(portableKey, artifact.path);
    artifact.content = Buffer.isBuffer(artifact.content) ? artifact.content : Buffer.from(artifact.content, "utf8");
  }
  return sorted;
}
