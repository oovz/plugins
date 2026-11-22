#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const browsers = ['chrome', 'edge', 'firefox', 'safari'];

function parseArgs(argv) {
  let root = null;
  let output = null;
  let browser = 'chrome';
  while (argv.length > 0) {
    const token = argv.shift();
    if (token === "--output") {
      if (!argv[0] || argv[0].startsWith("--")) throw new Error("--output requires a directory");
      output = argv.shift();
    } else if (token === "--browser") {
      browser = argv.shift();
      if (!browsers.includes(browser)) throw new Error(`--browser must be one of: ${browsers.join(", ")}`);
    } else if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    } else if (root === null) {
      root = token;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }
  return { root: path.resolve(root || process.cwd()), output, browser };
}

const args = parseArgs(process.argv.slice(2));
const root = args.root;
const explicitOutput = args.output ? path.resolve(root, args.output) : null;
const explicitManifest = explicitOutput && (statSafe(explicitOutput)?.isDirectory()
  ? path.join(explicitOutput, 'manifest.json')
  : explicitOutput);
const maxDepth = 4;
const ignored = new Set(['node_modules', '.git', '.hg', '.svn', '.cache', '.next', 'coverage']);

function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i + 1 < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    try {
      const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
      return JSON.parse(stripJsonComments(raw));
    } catch {
      return null;
    }
  }
}

function statSafe(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function browserFor(relativePath) {
  for (const segment of relativePath.toLowerCase().split('/').reverse()) {
    const tokens = segment.split(/[^a-z0-9]+/);
    const browser = browsers.find((target) => tokens.includes(target));
    if (browser) return browser;
    if (tokens.includes('chromium')) return 'chrome';
    if (tokens.includes('mozilla')) return 'firefox';
  }
  return "unknown";
}

function isCompatible(manifest, browser) {
  if (browser !== 'unknown' && browser !== args.browser) return false;
  const { manifest_version: version, background } = manifest;
  const hasBackgroundPage = background?.page || background?.scripts?.length;
  if (args.browser === 'firefox') {
    return (version === 2 || version === 3) && (!background?.service_worker || Boolean(hasBackgroundPage));
  }
  if (args.browser === 'safari') return version === 2 || version === 3;
  return version === 3 && (!hasBackgroundPage || Boolean(background?.service_worker));
}

const pkg = readJson(path.join(root, 'package.json')) || {};
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const isWxt = Object.prototype.hasOwnProperty.call(deps, 'wxt') ||
  ['wxt.config.ts', 'wxt.config.js', 'wxt.config.mjs', 'wxt.config.cjs'].some((f) => fs.existsSync(path.join(root, f)));

const manifests = [];
const seen = new Set();

function considerManifest(file) {
  const abs = path.resolve(file);
  if (seen.has(abs)) return;
  seen.add(abs);
  const manifest = readJson(abs);
  if (!manifest || !manifest.manifest_version || !manifest.name) return;
  const dir = path.dirname(abs);
  const st = statSafe(abs);
  const rel = (path.relative(root, dir) || '.').split(path.sep).join('/');
  const browser = browserFor(rel);
  let score = 0;
  const lower = rel.toLowerCase();
  if (lower.startsWith('.output') || lower.includes('/.output')) score += 60;
  if (/(^|\/)(dist|build|out)([\\/]|$)/.test(lower)) score += 35;
  if (lower.includes('mv3')) score += 15;
  if (manifest.manifest_version === 3) score += 20;
  if (manifest.side_panel) score += 4;
  if (manifest.background?.service_worker) score += 4;
  if (isWxt && (lower.startsWith('.output') || lower.includes('/.output'))) score += 30;
  if (dir === root) score += 5;
  manifests.push({
    path: dir,
    relativePath: rel,
    manifestVersion: manifest.manifest_version,
    name: manifest.name,
    version: manifest.version || null,
    hasSidePanel: Boolean(manifest.side_panel),
    hasAction: Boolean(manifest.action || manifest.browser_action || manifest.page_action),
    hasServiceWorker: Boolean(manifest.background?.service_worker),
    modifiedMs: st?.mtimeMs || 0,
    score,
    browser,
    manifestCompatibility: manifest.manifest_version === 3 ? "mv3" : manifest.manifest_version === 2 ? "mv2" : "unsupported",
    compatible: isCompatible(manifest, browser),
    explicitlySelected: abs === explicitManifest,
  });
}

// Check root manifest.json
considerManifest(path.join(root, 'manifest.json'));

const preferredRoots = ['.output', 'dist', 'build', 'out', 'extension', '.wxt'];
if (explicitManifest) considerManifest(explicitManifest);
for (const name of preferredRoots) {
  const start = path.join(root, name);
  if (!statSafe(start)?.isDirectory()) continue;
  walk(start, 0);
}

// Also check monorepo workspaces (packages/*, apps/*)
for (const workspaceParent of ['packages', 'apps']) {
  const parentDir = path.join(root, workspaceParent);
  if (!statSafe(parentDir)?.isDirectory()) continue;
  try {
    const subs = fs.readdirSync(parentDir, { withFileTypes: true });
    for (const sub of subs) {
      if (!sub.isDirectory() || ignored.has(sub.name)) continue;
      for (const name of preferredRoots) {
        const start = path.join(parentDir, sub.name, name);
        if (!statSafe(start)?.isDirectory()) continue;
        walk(start, 0);
      }
      considerManifest(path.join(parentDir, sub.name, 'manifest.json'));
    }
  } catch {}
}

function walk(dir, depth) {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === 'manifest.json') considerManifest(full);
    else if (entry.isDirectory()) walk(full, depth + 1);
  }
}

// Explicit output wins. Automatic selection ranks compatible named builds
// ahead of shared output and uses recency within those groups.
const explicitCandidates = manifests.filter((candidate) => candidate.explicitlySelected);
if (explicitOutput && explicitCandidates.length === 0) {
  console.log(JSON.stringify({
    root,
    framework: isWxt ? 'wxt' : 'generic-or-unknown',
    targetBrowser: args.browser,
    recommendation: "requested-output-not-found",
    requestedOutput: explicitOutput,
    recommended: null,
    candidates: manifests,
  }, null, 2));
  process.exitCode = 2;
} else {
  manifests.sort((a, b) =>
    Number(b.explicitlySelected) - Number(a.explicitlySelected)
    || Number(b.compatible) - Number(a.compatible)
    || Number(b.browser === args.browser) - Number(a.browser === args.browser)
    || (b.modifiedMs - a.modifiedMs)
    || (b.score - a.score)
    || a.relativePath.localeCompare(b.relativePath));

  const recommended = manifests[0] || null;
  const recommendation = recommended
    ? recommended.explicitlySelected ? "explicit-output" : recommended.compatible ? "compatible-build" : `no-compatible-${args.browser}-build`
    : "no-builds";

  console.log(JSON.stringify({
    root,
    framework: isWxt ? 'wxt' : 'generic-or-unknown',
    targetBrowser: args.browser,
    recommendation,
    requestedOutput: explicitOutput,
    recommended,
    candidates: manifests,
  }, null, 2));
  process.exitCode = manifests.length ? 0 : 2;
}
