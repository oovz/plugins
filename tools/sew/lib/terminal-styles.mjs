import colors from "picocolors";

const SUCCESS = new Set(["already-installed", "completed", "configured", "healthy", "installed", "uninstalled", "updated", "verified"]);
const ATTENTION = new Set(["conditional", "dry-run", "if-missing-or-disabled", "warnings", "would-inspect", "would-reinstall", "would-run"]);

export function heading(value) {
  return colors.bold(colors.cyan(value));
}

export function status(value) {
  if (SUCCESS.has(value)) return colors.green(value);
  if (ATTENTION.has(value)) return colors.yellow(value);
  if (value === "errors" || value === "installed-but-not-discovered") return colors.red(value);
  return colors.cyan(value);
}

export function action(value) {
  if (value === "remove") return colors.red(value);
  if (value === "unchanged" || value?.startsWith("would-") || value === "if-missing-or-disabled") return colors.yellow(value);
  return colors.green(value);
}

export function warning(value) {
  return colors.yellow(value);
}

export function error(value) {
  return colors.red(value);
}

export function findingLevel(value) {
  if (value === "error") return colors.red(value.toUpperCase());
  if (value === "warning") return colors.yellow(value.toUpperCase());
  return colors.cyan(value.toUpperCase());
}
