import os from "node:os";
import path from "node:path";
import { CliError } from "./errors.mjs";

export const ROLE_IDS = Object.freeze(["researcher", "engineer", "verifier"]);
export const HOST_CONFIG = Object.freeze({
  "claude-code": { directory: ".claude/agents", extension: ".md", userRoot: ({ home, env }) => path.resolve(env.CLAUDE_CONFIG_DIR || path.join(home, ".claude")) },
  codex: { directory: ".codex/agents", extension: ".toml", userRoot: ({ home, env }) => path.resolve(env.CODEX_HOME || path.join(home, ".codex")) },
  opencode: { directory: ".opencode/agents", extension: ".md", userRoot: ({ home, env }) => path.resolve(env.OPENCODE_CONFIG_DIR || path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "opencode")) },
  cursor: { directory: ".cursor/agents", extension: ".md", userRoot: ({ home }) => path.join(home, ".cursor") },
  "gemini-cli": { directory: ".gemini/agents", extension: ".md", userRoot: ({ home, env }) => path.join(path.resolve(env.GEMINI_CLI_HOME || home), ".gemini") },
  antigravity: { directory: ".agents/agents", extension: ".md", userRoot: ({ home }) => path.join(home, ".gemini", "config") },
  "oh-my-pi": { directory: ".omp/agents", extension: ".md", userRoot: ({ home }) => path.join(home, ".omp", "agent") },
});

export function normalizeHome(env = process.env, platform = process.platform) {
  const value = platform === "win32"
    ? env.USERPROFILE || env.HOME || os.homedir()
    : env.HOME || env.USERPROFILE || os.homedir();
  if (typeof value !== "string" || !value.trim()) throw new CliError("Unable to determine the user home directory.");
  return path.resolve(value);
}

export function normalizeHost(host) {
  if (!Object.hasOwn(HOST_CONFIG, host)) throw new CliError(`--host must be one of: ${Object.keys(HOST_CONFIG).join(", ")}`);
  return host;
}

export function roleFileName(host, role) {
  normalizeHost(host);
  if (!ROLE_IDS.includes(role)) throw new CliError(`Unknown role: ${role}`);
  return `senior-engineering-workflow-${role}${HOST_CONFIG[host].extension}`;
}

export function roleAgentRoot(host, scope, project, env = process.env, platform = process.platform) {
  const target = HOST_CONFIG[normalizeHost(host)];
  if (scope === "project") return path.join(path.resolve(project), target.directory);
  if (scope !== "user") throw new CliError(`--scope must be user or project, received: ${scope}`);
  const home = normalizeHome(env, platform);
  return path.join(target.userRoot({ home, env }), "agents");
}

export function packagedRolePath(host, role) {
  return `agents/${roleFileName(host, role)}`;
}
