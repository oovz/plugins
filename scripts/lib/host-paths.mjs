import path from "node:path";

export function antigravityCliRoot(home) {
  return path.join(path.resolve(home), ".gemini", "antigravity-cli");
}

export function antigravityPluginRoot(scope, project, home, pluginId) {
  const base = scope === "project"
    ? path.join(path.resolve(project), ".agents", "plugins")
    : path.join(antigravityCliRoot(home), "plugins");
  return path.join(base, pluginId);
}
