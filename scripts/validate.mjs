import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { AGENT_ROLE_NAMES, installAdapters } from "./install-adapters.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "senior-engineering-workflow";
const CATALOG_NAME = "oovz-agents";
const PLUGIN = path.join(ROOT, "plugins", NAME);
const errors = [];

const ROLES = Object.freeze([
  {
    id: "workflow-researcher",
    candidateWrite: false,
    nestedRoles: ["workflow-researcher", "workflow-reviewer"],
  },
  {
    id: "workflow-architect",
    candidateWrite: true,
    nestedRoles: ["workflow-researcher", "workflow-reviewer"],
  },
  {
    id: "workflow-engineer",
    candidateWrite: true,
    nestedRoles: ["workflow-researcher", "workflow-engineer", "workflow-tester", "workflow-reviewer"],
  },
  {
    id: "workflow-tester",
    candidateWrite: true,
    nestedRoles: ["workflow-researcher", "workflow-tester", "workflow-reviewer"],
  },
  {
    id: "workflow-reviewer",
    candidateWrite: false,
    nestedRoles: ["workflow-researcher", "workflow-reviewer"],
  },
]);

const REFERENCES = Object.freeze([
  "task-routing.md",
  "manager.md",
  "architecture.md",
  "engineering.md",
  "verification.md",
  "review.md",
  "delegation-and-state.md",
  "prohibited-patterns.md",
]);
const TEXT_FILENAMES = new Set(["LICENSE", ".gitattributes", ".gitignore"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".mjs", ".toml", ".yaml", ".yml"]);

function check(condition, message) {
  if (!condition) errors.push(message);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

function frontmatterBlock(text) {
  return text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1] ?? "";
}

function frontmatter(text) {
  const block = frontmatterBlock(text);
  return block ? (parseYaml(block) ?? {}) : {};
}

async function checkAgentDirectory(relativeDirectory, extension) {
  const actual = (await readdir(path.join(ROOT, relativeDirectory)))
    .filter((file) => file.endsWith(`.${extension}`))
    .sort();
  const expected = AGENT_ROLE_NAMES.map((role) => `${role}.${extension}`).sort();
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${relativeDirectory} must contain exactly the five current agent roles`,
  );
}

async function validateLineEndings(directory = ROOT) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await validateLineEndings(file);
      continue;
    }
    if (!TEXT_FILENAMES.has(entry.name) && !TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
    const contents = await readFile(file);
    check(!contents.includes(13), `${path.relative(ROOT, file)} must use LF line endings`);
  }
}

async function validateClaudeAgent(role) {
  const file = path.join(PLUGIN, "agents", `${role.id}.md`);
  const text = await readFile(file, "utf8");
  const meta = frontmatter(text);
  const denied = new Set((meta.disallowedTools ?? "").split(/\s*,\s*/).filter(Boolean));

  check(meta.name === role.id, `Claude ${role.id} agent name is invalid`);
  check(meta.model === "inherit", `Claude ${role.id} must inherit the parent model`);
  check(meta.effort === undefined, `Claude ${role.id} must inherit the session effort`);
  check(meta.maxTurns === undefined, `Claude ${role.id} must not set a plugin turn limit`);
  check(meta.tools === undefined, `Claude ${role.id} must inherit the parent tool set`);
  check(!denied.has("Agent"), `Claude ${role.id} must not deny Agent`);
  if (role.candidateWrite) {
    check(meta.disallowedTools === undefined, `Claude ${role.id} must inherit editing and shell tools`);
  } else {
    for (const tool of ["Write", "Edit", "NotebookEdit"]) {
      check(denied.has(tool), `Claude ${role.id} must deny candidate-writing tool ${tool}`);
    }
    check(!denied.has("Bash") && !denied.has("PowerShell"), `Claude ${role.id} must retain shell capability`);
  }
}

async function validateCodexAgent(role) {
  const text = await readFile(path.join(ROOT, "adapters", "codex", "agents", `${role.id}.toml`), "utf8");
  const config = parseToml(text);
  const expectedSandbox = role.candidateWrite ? "workspace-write" : "read-only";

  check(config.name === role.id, `Codex ${role.id} agent name is invalid`);
  check((config.description ?? "").length > 40, `Codex ${role.id} description is too short`);
  check(config.sandbox_mode === expectedSandbox, `Codex ${role.id} sandbox does not match candidate ownership`);
  check(typeof config.developer_instructions === "string", `Codex ${role.id} instructions are missing`);
  check(/nested delegation/i.test(config.developer_instructions ?? ""), `Codex ${role.id} must define scoped nested delegation`);
  check(!/Do not [^.\n]*spawn agents/i.test(config.developer_instructions ?? ""), `Codex ${role.id} must not prohibit nested delegation`);
  check(config.model === undefined, `Codex ${role.id} must inherit the configured model`);
  check(config.model_reasoning_effort === undefined, `Codex ${role.id} must inherit configured reasoning effort`);
}

async function validateGeminiAgent(role) {
  const text = await readFile(path.join(ROOT, "adapters", "gemini", "agents", `${role.id}.md`), "utf8");
  const meta = frontmatter(text);

  check(meta.name === role.id, `Gemini ${role.id} agent name is invalid`);
  check(meta.kind === "local", `Gemini ${role.id} must be a local subagent`);
  check(meta.model === "inherit", `Gemini ${role.id} must inherit the session model`);
  check(meta.max_turns === undefined, `Gemini ${role.id} must not set a plugin turn limit`);
  if (role.candidateWrite) {
    check(meta.tools === undefined, `Gemini ${role.id} must inherit the parent tool set`);
  } else {
    const tools = new Set(meta.tools ?? []);
    check(tools.has("run_shell_command"), `Gemini ${role.id} must retain shell capability`);
    check(!tools.has("replace") && !tools.has("write_file"), `Gemini ${role.id} must not receive candidate-writing tools`);
  }
}

async function validateOpenCodeAgent(role) {
  const text = await readFile(path.join(ROOT, "adapters", "opencode", "agents", `${role.id}.md`), "utf8");
  const meta = frontmatter(text);

  check(meta.mode === "subagent", `OpenCode ${role.id} must use subagent mode`);
  check(meta.model === undefined, `OpenCode ${role.id} must inherit the primary model`);
  check(meta.reasoningEffort === undefined, `OpenCode ${role.id} must not pin provider-specific reasoning effort`);
  check(meta.steps === undefined, `OpenCode ${role.id} must not set a plugin step limit`);
  if (role.candidateWrite) {
    check(meta.permission?.edit === undefined, `OpenCode ${role.id} must inherit edit permissions`);
  } else {
    check(meta.permission?.edit === "deny", `OpenCode ${role.id} must deny candidate edits`);
  }
  check(meta.permission?.bash === undefined, `OpenCode ${role.id} must inherit shell permissions`);
  check(meta.permission?.task?.["*"] === "deny", `OpenCode ${role.id} must deny unrelated nested agents`);
  const allowedNestedRoles = Object.entries(meta.permission?.task ?? {})
    .filter(([nestedRole, action]) => nestedRole !== "*" && action === "allow")
    .map(([nestedRole]) => nestedRole)
    .sort();
  check(
    JSON.stringify(allowedNestedRoles) === JSON.stringify([...role.nestedRoles].sort()),
    `OpenCode ${role.id} nested role allowlist exceeds or omits its authority`,
  );
}

async function validateInstallerPlans() {
  const dryRunProject = path.join(ROOT, ".validation-adapter-target");
  for (const host of ["codex", "opencode", "gemini"]) {
    const plans = await installAdapters({
      host,
      scope: "project",
      project: dryRunProject,
      dryRun: true,
      force: true,
    });
    const extension = host === "codex" ? ".toml" : ".md";
    const installedAgents = plans
      .map((plan) => path.basename(plan.destination))
      .filter((file) => file.startsWith("workflow-") && file.endsWith(extension))
      .sort();
    const expectedAgents = AGENT_ROLE_NAMES.map((role) => `${role}${extension}`).sort();
    check(
      JSON.stringify(installedAgents) === JSON.stringify(expectedAgents),
      `${host} installer plan must contain exactly the five current agents`,
    );

    if (host !== "codex") {
      check(
        plans.some((plan) => plan.destination.endsWith(path.join("senior-engineering-workflow", "SKILL.md"))),
        `${host} installer plan must include the workflow skill`,
      );
    }
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agents-adapter-validation-"));
  try {
    for (const host of ["codex", "opencode", "gemini"]) {
      const project = path.join(temporaryRoot, host);
      const plans = await installAdapters({
        host,
        scope: "project",
        project,
        dryRun: false,
        force: false,
      });
      check(plans.every((plan) => plan.status === "copied"), `${host} integration install did not copy every file`);

      const extension = host === "codex" ? "toml" : "md";
      const hostAgentDirectory = host === "codex"
        ? path.join(project, ".codex", "agents")
        : host === "opencode"
          ? path.join(project, ".opencode", "agents")
          : path.join(project, "agents");

      for (const role of AGENT_ROLE_NAMES) {
        const file = `${role}.${extension}`;
        const source = await readFile(path.join(ROOT, "adapters", host, "agents", file));
        const installed = await readFile(path.join(hostAgentDirectory, file));
        check(source.equals(installed), `${host} installed ${file} differs from its adapter source`);
      }
      check(
        !(await exists(path.join(hostAgentDirectory, `workflow-executor.${extension}`))),
        `${host} integration install produced the obsolete executor role`,
      );

      if (host !== "codex") {
        const skillRoot = host === "opencode"
          ? path.join(project, ".opencode", "skills", NAME)
          : path.join(project, "skills", NAME);
        check(await exists(path.join(skillRoot, "SKILL.md")), `${host} integration install omitted the skill`);
        for (const reference of REFERENCES) {
          check(
            await exists(path.join(skillRoot, "references", reference)),
            `${host} integration install omitted ${reference}`,
          );
        }
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function validateRepository() {
  errors.length = 0;
  const [packageManifest, codex, claude, gemini, codexMarket, claudeMarket] = await Promise.all([
    json("package.json"),
    json("plugins/senior-engineering-workflow/.codex-plugin/plugin.json"),
    json("plugins/senior-engineering-workflow/.claude-plugin/plugin.json"),
    json("gemini-extension.json"),
    json(".agents/plugins/marketplace.json"),
    json(".claude-plugin/marketplace.json"),
  ]);
  const claudeCatalogEntry = claudeMarket.plugins?.find((plugin) => plugin.name === NAME);
  const codexCatalogEntry = codexMarket.plugins?.find((plugin) => plugin.name === NAME);

  check(packageManifest.name === "agents", "Package name must be agents");
  check(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageManifest.version), "Package version is invalid");
  for (const manifest of [codex, claude, gemini]) {
    check(manifest.name === NAME, `Manifest name must be ${NAME}`);
    check(manifest.version === packageManifest.version, `${manifest.name} version must match package.json`);
    check(typeof manifest.description === "string" && manifest.description.length > 20, "Manifest description is too short");
  }

  check(gemini.contextFileName === undefined, "Gemini manifest must not reference an absent context file");
  check(codex.skills === "./skills/", "Codex skills path is invalid");
  check(codex.author?.name && codex.author?.url, "Codex plugin author must include name and url");
  check(codex.homepage && codex.repository, "Codex plugin must have homepage and repository");
  check(codex.license === "MIT", "Codex plugin license must be MIT");
  check(Array.isArray(codex.keywords) && codex.keywords.length >= 3, "Codex plugin must have at least 3 keywords");
  check(codex.interface?.developerName, "Codex plugin interface must have developerName");
  check(codex.interface?.websiteURL, "Codex plugin interface must have websiteURL");
  check(codex.interface?.brandColor, "Codex plugin interface must have brandColor");
  check(
    Array.isArray(codex.interface?.defaultPrompt)
      && codex.interface.defaultPrompt.length > 0
      && codex.interface.defaultPrompt.length <= 3,
    "Codex defaultPrompt must contain one to three prompts",
  );

  check(claude.displayName === "Senior Engineering Workflow", "Claude plugin must have displayName");
  check(claude.author?.name && claude.author?.url, "Claude plugin author must include name and url");
  check(claude.homepage && claude.repository, "Claude plugin must have homepage and repository");
  check(claude.license === "MIT", "Claude plugin license must be MIT");
  check(Array.isArray(claude.keywords) && claude.keywords.length >= 3, "Claude plugin must have at least 3 keywords");
  check(claude.skills === "./skills/", "Claude plugin skills path is invalid");
  check(claude.agents === "./agents/", "Claude plugin agents path is invalid");

  check(claudeMarket.name === CATALOG_NAME, "Claude catalog name is invalid");
  check(claudeMarket.owner?.name && claudeMarket.owner?.url, "Claude marketplace owner is incomplete");
  check(typeof claudeMarket.description === "string", "Claude marketplace description is missing");
  check(claudeCatalogEntry?.source === `./plugins/${NAME}`, "Claude marketplace source is invalid");
  check(claudeCatalogEntry?.version === packageManifest.version, "Claude marketplace plugin version must match");
  check(claudeCatalogEntry?.license === "MIT", "Claude marketplace plugin entry must declare MIT license");
  check(claudeCatalogEntry?.category === "Productivity", "Claude marketplace plugin entry must have category");

  check(codexMarket.name === CATALOG_NAME, "Codex catalog name is invalid");
  check(codexMarket.interface?.displayName === "oovz Agents", "Codex catalog display name is invalid");
  check(codexCatalogEntry?.source?.path === `./plugins/${NAME}`, "Codex marketplace source is invalid");
  check(codexCatalogEntry?.policy?.installation === "AVAILABLE", "Codex plugin installation policy is invalid");
  check(codexCatalogEntry?.policy?.authentication === "ON_INSTALL", "Codex authentication policy is invalid");
  check(codexCatalogEntry?.category === "Productivity", "Codex marketplace category is invalid");

  const licenseText = await readFile(path.join(ROOT, "LICENSE"), "utf8");
  check(/MIT License/.test(licenseText), "LICENSE file must contain MIT License text");

  const skillText = await readFile(path.join(PLUGIN, "skills", NAME, "SKILL.md"), "utf8");
  const skillMeta = frontmatter(skillText);
  check(skillMeta.name === NAME, "Skill name does not match its directory");
  check(typeof skillMeta.description === "string" && skillMeta.description.length > 40, "Skill description is missing or too short");
  check(!/workflow[-_]executor/.test(skillText), "Skill must not reference the removed executor role");
  for (const role of AGENT_ROLE_NAMES) {
    check(skillText.includes(role), `Skill must route the ${role} role`);
  }
  for (const reference of REFERENCES) {
    check(
      await exists(path.join(PLUGIN, "skills", NAME, "references", reference)),
      `Skill reference is missing: ${reference}`,
    );
  }

  await Promise.all([
    checkAgentDirectory("plugins/senior-engineering-workflow/agents", "md"),
    checkAgentDirectory("adapters/codex/agents", "toml"),
    checkAgentDirectory("adapters/gemini/agents", "md"),
    checkAgentDirectory("adapters/opencode/agents", "md"),
    ...ROLES.flatMap((role) => [
      validateClaudeAgent(role),
      validateCodexAgent(role),
      validateGeminiAgent(role),
      validateOpenCodeAgent(role),
    ]),
  ]);

  check(
    ROLES.map((role) => role.id).join("|") === AGENT_ROLE_NAMES.join("|"),
    "Installer and validation role order differ",
  );
  await validateInstallerPlans();

  const rootReadmeText = await readFile(path.join(ROOT, "README.md"), "utf8");
  const publicText = (
    await Promise.all([
      readFile(path.join(PLUGIN, "README.md"), "utf8"),
      readFile(path.join(PLUGIN, ".codex-plugin", "plugin.json"), "utf8"),
      readFile(path.join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"),
      readFile(path.join(ROOT, ".agents", "plugins", "marketplace.json"), "utf8"),
    ])
  ).concat(rootReadmeText).join("\n");
  check(!/workflow[-_]executor/.test(publicText), "Public documentation must not reference the removed executor role");
  check(!/gpt-5\.6-(?:sol|terra|luna)/i.test(publicText), "Public documentation must not pin volatile model tiers");
  check(!/\bthree tiered subagents?\b/i.test(publicText), "Public documentation still describes the old topology");
  check(!/\ba marketplace repository\b/i.test(publicText), "The repository must not describe itself as a marketplace");
  check(
    rootReadmeText.startsWith(
      "# Agent Plugins\n\nCross-host packaging for the Senior Engineering Workflow plugin",
    ),
    "The repository README must describe the shipped workflow directly",
  );

  const attributesText = await readFile(path.join(ROOT, ".gitattributes"), "utf8");
  check(/^\* text=auto eol=lf$/m.test(attributesText), ".gitattributes must enforce LF for text files");
  await validateLineEndings();

  const pluginStat = await stat(PLUGIN);
  check(pluginStat.isDirectory(), "Plugin directory is missing");
  return [...errors];
}

if (typeof process !== "undefined" && fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const validationErrors = await validateRepository();
  if (validationErrors.length) {
    for (const error of validationErrors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Repository validation passed.");
  }
}
