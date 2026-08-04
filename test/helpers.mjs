import { execFile } from "node:child_process";
import { chmod, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const execFileAsync = promisify(execFile);

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function createFixturePlugin(root, id, version, options = {}) {
  const directory = path.join(root, "plugins", id);
  const skillId = options.skillId ?? `${id}-skill`;
  const roleId = options.roleId ?? "worker";
  const includeSkill = options.includeSkill !== false;
  const includeAgent = options.includeAgent !== false;
  await mkdir(directory, { recursive: true });
  if (includeSkill) await mkdir(path.join(directory, "skills", skillId, "references"), { recursive: true });
  if (includeAgent) await mkdir(path.join(directory, "agents"), { recursive: true });
  await writeFile(path.join(directory, "LICENSE"), options.license ?? "fixture license\n");
  if (includeSkill) {
    await writeFile(path.join(directory, "skills", skillId, "SKILL.md"), `---\nname: ${skillId}\ndescription: Fixture skill for ${id}.\n---\n\n# ${id}\n`);
    await writeFile(path.join(directory, "skills", skillId, "references", "guide.md"), `# ${id} guide\n`);
  }
  if (includeAgent) await writeFile(path.join(directory, "agents", `${roleId}.md`), `---\nname: ${roleId}\ndescription: Fixture role.\n---\n\nAct as a bounded role.\n`);
  if (options.command) {
    await mkdir(path.dirname(path.join(directory, options.command.path)), { recursive: true });
    await writeFile(path.join(directory, options.command.path), options.command.content ?? "Run the fixture command.\n");
  }
  if (options.supportFile) {
    const support = path.join(directory, "skills", skillId, options.supportFile.path);
    await mkdir(path.dirname(support), { recursive: true });
    await writeFile(support, options.supportFile.content);
    if (options.supportFile.executable) await chmod(support, 0o755);
  }
  if (options.hostFile) {
    await mkdir(path.dirname(path.join(directory, options.hostFile.path)), { recursive: true });
    await writeFile(path.join(directory, options.hostFile.path), options.hostFile.content);
  }
  const hostFiles = options.hostFile ? [{ id: "fixture-policy", path: options.hostFile.path, hosts: options.hostFile.hosts, destination: options.hostFile.destination, executable: false }] : [];
  const hosts = options.hosts ?? {
    "claude-code": { enabled: true },
    codex: { enabled: true },
    "gemini-cli": { enabled: true },
    antigravity: { enabled: true },
    opencode: { enabled: true },
    "opencode-v2": { enabled: true, status: "preview" },
    portable: { enabled: true }
  };
  if (hosts.codex?.enabled === true && hosts.codex.capabilities === undefined) {
    hosts.codex.capabilities = options.codexCapabilities ?? ["Read", "Write"];
  }
  await writeJson(path.join(directory, "plugin.json"), {
    schemaVersion: 1,
    id,
    version,
    displayName: id,
    description: `Fixture plugin ${id}.`,
    license: options.licenseId ?? "LicenseRef-Fixture",
    author: { name: "Fixture", url: "https://example.com" },
    keywords: ["fixture"],
    category: "Other",
    components: {
      skills: includeSkill ? [{ id: skillId, path: `skills/${skillId}/SKILL.md` }] : [],
      agents: includeAgent ? [{
        id: roleId,
        path: `agents/${roleId}.md`,
        description: "Fixture role.",
        workspace: options.workspace ?? "read-only",
        shell: options.shell ?? false,
        external: options.external ?? false,
        delegates: options.delegates ?? false,
        question: options.question ?? false,
        model: { policy: "inherit", recommendedTier: "economy" },
        steps: null
      }] : [],
      commands: options.command ? [{ id: options.command.id, path: options.command.path, hosts: options.command.hosts }] : [],
      hostFiles
    },
    hosts
  });
  return directory;
}

export async function createFixtureMarketplace(root, plugins) {
  await cp(path.join(REPOSITORY_ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
  await mkdir(path.join(root, "plugins"), { recursive: true });
  await writeFile(path.join(root, "LICENSE"), "fixture license\n");
  await writeJson(path.join(root, "marketplace.json"), {
    schemaVersion: 1,
    id: "fixture-marketplace",
    displayName: "Fixture marketplace",
    description: "A fixture marketplace.",
    repository: "https://example.com/plugins",
    owner: { name: "Fixture", url: "https://example.com" },
    pluginRoot: "plugins",
    plugins: plugins.map((plugin) => ({ id: plugin.id, path: `plugins/${plugin.id}` }))
  });
  for (const plugin of plugins) await createFixturePlugin(root, plugin.id, plugin.version, plugin.options);
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
