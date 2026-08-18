#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Usage: inspect-extension.mjs <extension-directory-or-manifest.json>');
  process.exit(2);
}
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

const resolved = path.resolve(input);
const manifestPath = path.basename(resolved).toLowerCase() === 'manifest.json' ? resolved : path.join(resolved, 'manifest.json');
let manifest;
try {
  const raw = fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
  try {
    manifest = JSON.parse(raw);
  } catch {
    manifest = JSON.parse(stripJsonComments(raw));
  }
} catch (error) {
  console.error(`Cannot read manifest: ${manifestPath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const action = manifest.action || manifest.browser_action || manifest.page_action || null;
const output = {
  directory: path.dirname(manifestPath),
  manifestPath,
  name: manifest.name || null,
  version: manifest.version || null,
  manifestVersion: manifest.manifest_version || null,
  action: action ? {
    configured: true,
    defaultPopup: action.default_popup || null,
    defaultTitle: action.default_title || null,
  } : { configured: false },
  sidePanel: manifest.side_panel ? {
    configured: true,
    defaultPath: manifest.side_panel.default_path || null,
  } : { configured: false },
  options: manifest.options_ui ? {
    configured: true,
    page: manifest.options_ui.page || null,
    openInTab: manifest.options_ui.open_in_tab ?? null,
  } : manifest.options_page ? {
    configured: true,
    page: manifest.options_page,
    openInTab: null,
  } : { configured: false },
  background: manifest.background ? {
    serviceWorker: manifest.background.service_worker || null,
    scripts: manifest.background.scripts || [],
    page: manifest.background.page || null,
    type: manifest.background.type || null,
  } : null,
  contentScripts: (manifest.content_scripts || []).map((entry) => ({
    matches: entry.matches || [],
    excludeMatches: entry.exclude_matches || [],
    js: entry.js || [],
    css: entry.css || [],
    runAt: entry.run_at || null,
    allFrames: entry.all_frames || false,
  })),
  permissions: manifest.permissions || [],
  hostPermissions: manifest.host_permissions || [],
  optionalPermissions: manifest.optional_permissions || [],
};

console.log(JSON.stringify(output, null, 2));
