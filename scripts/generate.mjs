#!/usr/bin/env node
import { lstat, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { allHostTargets, HOSTS, renderHost, resolveHost, supportsHost } from "./lib/hosts.mjs";
import { assertNoSymlinkAncestors, atomicWriteFile, atomicWriteTree, compareTree } from "./lib/files.mjs";
import { json, ROOT } from "./lib/marketplace.mjs";
import { validateRepository } from "./validate.mjs";

const USAGE = `Usage:
  node scripts/generate.mjs <generate|build|check> (--all | --plugin <id>) [--host <host>] [--variant <variant>]

Hosts: ${Object.keys(HOSTS).join(", ")}
Variants: opencode supports stable (default).

generate  refresh checked-in adapters and host marketplace/plugin manifests
build     create isolated native bundles under dist/
check     fail if checked-in generated files are stale (requires --all)`;

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const operation = argv.shift();
  if (!operation || !["generate", "build", "check"].includes(operation)) throw new Error("first argument must be generate, build, or check");
  const values = {};
  let all = false;
  while (argv.length) {
    const token = argv.shift();
    if (token === "--all") {
      if (all) throw new Error("--all may only be specified once");
      all = true;
    } else if (["--plugin", "--host", "--variant"].includes(token)) {
      if (values[token]) throw new Error(`${token} may only be specified once`);
      const value = argv.shift();
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
      values[token] = value;
    } else throw new Error(`unknown argument: ${token}`);
  }
  if (all && values["--plugin"]) throw new Error("--all and --plugin are mutually exclusive");
  if (!all && !values["--plugin"]) all = true;
  if (operation === "check" && !all) throw new Error("check requires --all so stale files cannot be hidden");
  if (values["--variant"] && !values["--host"]) throw new Error("--variant requires --host");
  if (values["--host"]) resolveHost(values["--host"], values["--variant"]);
  return { operation, all, plugin: values["--plugin"], host: values["--host"], variant: values["--variant"] };
}

function targets(args) {
  if (args.host) {
    const host = resolveHost(args.host, args.variant);
    return [{ id: host.id, variant: host.variant }];
  }
  return allHostTargets();
}

function targetRelative(base, target, pluginId) {
  return path.join(base, target.id, ...(target.variant ? [target.variant] : []), pluginId);
}

function targetPrefix(target, pluginId) {
  return path.posix.join(target.id, ...(target.variant ? [target.variant] : []), pluginId);
}

function enabled(plugin, target) {
  return supportsHost(plugin, resolveHost(target.id, target.variant));
}

function prefixArtifacts(prefix, artifacts) {
  return artifacts.map((artifact) => ({ ...artifact, path: path.posix.join(prefix, artifact.path) }));
}

function claudeMarketplace(catalog) {
  return json({
    name: catalog.marketplace.id,
    owner: catalog.marketplace.owner,
    description: catalog.marketplace.description,
    plugins: catalog.plugins.filter((plugin) => supportsHost(plugin, resolveHost("claude-code"))).map((plugin) => ({
      name: plugin.manifest.id,
      source: `./adapters/claude-code/${plugin.manifest.id}`,
      description: plugin.manifest.description,
      displayName: plugin.manifest.displayName,
      author: plugin.manifest.author,
      homepage: catalog.marketplace.repository,
      repository: catalog.marketplace.repository,
      license: plugin.manifest.license,
      keywords: plugin.manifest.keywords ?? [],
      category: plugin.manifest.category ?? "Other"
    }))
  });
}

function codexMarketplace(catalog) {
  return json({
    name: catalog.marketplace.id,
    interface: { displayName: catalog.marketplace.displayName },
    plugins: catalog.plugins.filter((plugin) => supportsHost(plugin, resolveHost("codex"))).map((plugin) => ({
      name: plugin.manifest.id,
      source: { source: "local", path: `./adapters/codex/${plugin.manifest.id}` },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: plugin.manifest.category ?? "Other"
    }))
  });
}

async function expectedSourceFiles(catalog, plugins) {
  const files = new Map();
  files.set(path.join(catalog.root, ".claude-plugin/marketplace.json"), claudeMarketplace(catalog));
  files.set(path.join(catalog.root, ".agents/plugins/marketplace.json"), codexMarketplace(catalog));
  return files;
}

function possibleSourceManifestFiles(catalog, plugins) {
  return plugins.flatMap((plugin) => [path.join(plugin.directory, ".claude-plugin/plugin.json"), path.join(plugin.directory, ".codex-plugin/plugin.json")]);
}

export async function runGenerator(argv, options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const stdout = options.stdout ?? process.stdout;
  const args = parseArgs([...argv]);
  if (args.help) {
    stdout.write(`${USAGE}\n`);
    return;
  }
  const { catalog, plugins: validatedPlugins } = await validateRepository(root);
  let plugins = validatedPlugins;
  if (!args.all) {
    plugins = plugins.filter((plugin) => plugin.manifest.id === args.plugin);
    if (plugins.length === 0) throw new Error(`unknown plugin: ${args.plugin}`);
  }
  const selectedTargets = targets(args);

  if (args.operation === "build") {
    if (args.all) {
      const base = args.host ? path.join(root, "dist", selectedTargets[0].id, ...(selectedTargets[0].variant ? [selectedTargets[0].variant] : [])) : path.join(root, "dist");
      const artifacts = [];
      for (const plugin of plugins) for (const target of selectedTargets) {
        if (!enabled(plugin, target)) continue;
        const rendered = renderHost(plugin, target.id, target.variant);
        const prefix = args.host ? plugin.manifest.id : targetPrefix(target, plugin.manifest.id);
        artifacts.push(...prefixArtifacts(prefix, rendered.artifacts));
        stdout.write(`built ${targetRelative("dist", target, plugin.manifest.id)}\n`);
      }
      await atomicWriteTree(base, artifacts, path.join(root, "dist"));
      return;
    }
    for (const plugin of plugins) {
      for (const target of selectedTargets) {
        if (!enabled(plugin, target)) {
          if (args.host) throw new Error(`${plugin.manifest.id} does not enable ${target.id}${target.variant ? `/${target.variant}` : ""}`);
          const stale = path.join(root, targetRelative("dist", target, plugin.manifest.id));
          await assertNoSymlinkAncestors(stale, path.join(root, "dist"));
          await rm(stale, { recursive: true, force: true });
          continue;
        }
        const rendered = renderHost(plugin, target.id, target.variant);
        const output = path.join(root, targetRelative("dist", target, plugin.manifest.id));
        await atomicWriteTree(output, rendered.artifacts, path.join(root, "dist"));
        stdout.write(`built ${path.relative(root, output)}\n`);
      }
    }
    return;
  }

  if (args.operation === "generate") {
    if (args.all) {
      const base = args.host ? path.join(root, "adapters", selectedTargets[0].id, ...(selectedTargets[0].variant ? [selectedTargets[0].variant] : [])) : path.join(root, "adapters");
      const artifacts = [];
      for (const plugin of plugins) for (const target of selectedTargets) {
        if (!enabled(plugin, target)) continue;
        const rendered = renderHost(plugin, target.id, target.variant);
        const prefix = args.host ? plugin.manifest.id : targetPrefix(target, plugin.manifest.id);
        artifacts.push(...prefixArtifacts(prefix, rendered.artifacts));
        stdout.write(`generated ${targetRelative("adapters", target, plugin.manifest.id)}\n`);
      }
      await atomicWriteTree(base, artifacts, path.join(root, "adapters"));
    } else {
    for (const plugin of plugins) {
      for (const target of selectedTargets) {
        if (!enabled(plugin, target)) {
          if (args.host) throw new Error(`${plugin.manifest.id} does not enable ${target.id}${target.variant ? `/${target.variant}` : ""}`);
          const stale = path.join(root, targetRelative("adapters", target, plugin.manifest.id));
          await assertNoSymlinkAncestors(stale, path.join(root, "adapters"));
          await rm(stale, { recursive: true, force: true });
          continue;
        }
        const rendered = renderHost(plugin, target.id, target.variant);
        const output = path.join(root, targetRelative("adapters", target, plugin.manifest.id));
        await atomicWriteTree(output, rendered.artifacts, path.join(root, "adapters"));
        stdout.write(`generated ${path.relative(root, output)}\n`);
      }
    }
    }
    const files = await expectedSourceFiles(catalog, validatedPlugins);
    for (const [file, content] of files) await atomicWriteFile(file, content, root);
    for (const file of possibleSourceManifestFiles(catalog, validatedPlugins)) {
      if (files.has(file)) continue;
      await assertNoSymlinkAncestors(file, root);
      await rm(file, { force: true });
    }
    return;
  }

  const problems = [];
  const expectedAdapters = [];
  for (const plugin of validatedPlugins) {
    for (const target of allHostTargets()) {
      if (!enabled(plugin, target)) continue;
      const rendered = renderHost(plugin, target.id, target.variant);
      expectedAdapters.push(...prefixArtifacts(targetPrefix(target, plugin.manifest.id), rendered.artifacts));
    }
  }
  problems.push(...await compareTree(path.join(root, "adapters"), expectedAdapters));
  const sourceFiles = await expectedSourceFiles(catalog, validatedPlugins);
  for (const [file, expected] of sourceFiles) {
    let actual;
    await assertNoSymlinkAncestors(file, root);
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error(`generated source manifest is not a regular file: ${file}`);
      actual = await readFile(file, "utf8");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (actual === undefined) problems.push(`missing ${file}`);
    else if (actual !== expected) problems.push(`stale ${file}`);
  }
  for (const file of possibleSourceManifestFiles(catalog, validatedPlugins)) {
    if (sourceFiles.has(file)) continue;
    try { await lstat(file); problems.push(`unexpected ${file}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (problems.length) throw new Error(`generated files are out of date:\n${problems.map((problem) => `- ${path.relative(root, problem)}`).join("\n")}\nRun npm run generate.`);
  stdout.write("generated files are current\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGenerator(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
