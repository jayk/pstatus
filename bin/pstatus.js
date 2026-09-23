#!/usr/bin/env node
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../src/config.js";
import { filterRecords } from "../src/query.js";
import { dashboardHtml } from "../src/dashboard.js";
import { readSnapshot, regenerate } from "../src/snapshot.js";
import { startStaticServer } from "../src/server.js";
import { startRegenerationWatcher } from "../src/watch.js";

const usage = `pstatus

Usage:
  pstatus [query terms...]
  pstatus -r [query terms...]
  pstatus -l
  pstatus -f
  pstatus -o
  pstatus -s
  pstatus -w [seconds]
  pstatus -w [seconds] -s
  pstatus --static [file.html]
  pstatus --static [file.html] --static-project <label>

Options:
  -c <config.json>       Use a specific configuration file
  -l                     List project query tokens
  -f                     List configured source files
  -r                     Regenerate the snapshot from source files
  -o                     Open the configured dashboard
  -s                     Serve the output directory with a local web server
  -w [seconds]           Watch files and refresh served dashboards every N seconds (default: 10)
  --host <host>          Host for -s (default: 127.0.0.1)
  --port <port>          Port for -s (default: 8080)
  --static [file.html]   Write a self-contained static dashboard
  --static-project <label>
                         Limit static export to one project label
  --overwrite-on-error   Replace the snapshot even if some files fail
  -h, --help             Show this help text
  --version              Show the version

Notes:
  - The CLI reads the existing snapshot by default.
  - Source files are reread only when you use -r.
  - The dashboard and snapshot do not update automatically unless you use -w.

Examples:
  pstatus
  pstatus -l
  pstatus -f
  pstatus -r
  pstatus -s
  pstatus -w -s -o
  pstatus -w 30 -s -o
  pstatus type:write
  pstatus -c work-config.json -r status:WIP
  pstatus --static
  pstatus --static status.html --static-project "Project A"
  pstatus -o`;

const version = "1.0.0";
const openFile = promisify(execFile);

function printAndExit(text) {
  console.log(text);
  process.exit(0);
}

function createDefaultOptions() {
  return {
    configFile: null,
    listFiles: false,
    listProjects: false,
    open: false,
    overwriteOnError: false,
    host: "127.0.0.1",
    port: 8080,
    regenerate: false,
    serve: false,
    static: null,
    staticProject: null,
    terms: [],
    watch: false,
    watchIntervalSeconds: 10
  };
}

function parseArgs(argv) {
  const options = createDefaultOptions();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-r") {
      options.regenerate = true;
      continue;
    }

    if (arg === "-o") {
      options.open = true;
      continue;
    }

    if (arg === "-s") {
      options.serve = true;
      continue;
    }

    if (arg === "-w") {
      options.watch = true;
      if (isNumericValue(argv[index + 1])) options.watchIntervalSeconds = parseWatchInterval(argv[++index]);
      continue;
    }

    if (arg === "-l") {
      options.listProjects = true;
      continue;
    }

    if (arg === "-f") {
      options.listFiles = true;
      continue;
    }

    if (arg === "--overwrite-on-error") {
      options.overwriteOnError = true;
      continue;
    }

    if (arg === "-c") {
      options.configFile = requireValue(argv, ++index, "-c requires a configuration file path.");
      continue;
    }

    if (arg === "--host") {
      options.host = requireValue(argv, ++index, "--host requires a host value.");
      continue;
    }

    if (arg === "--port") {
      options.port = parsePort(requireValue(argv, ++index, "--port requires a port value."));
      continue;
    }

    if (arg === "--static-project") {
      options.staticProject = requireValue(argv, ++index, "--static-project requires a project label.");
      continue;
    }

    if (arg === "--static") {
      const next = argv[index + 1];
      options.static = next?.endsWith(".html") ? argv[++index] : true;
      continue;
    }

    if (arg === "--help" || arg === "-h") printAndExit(usage);
    if (arg === "--version") printAndExit(version);

    options.terms.push(arg);
  }

  return options;
}

function requireValue(argv, index, errorMessage) {
  const value = argv[index];
  if (!value) throw new Error(errorMessage);
  return value;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port requires a number from 0 to 65535.");
  return port;
}

function isNumericValue(value) {
  return /^\d+(?:\.\d+)?$/.test(value || "");
}

function parseWatchInterval(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("-w interval requires a positive number of seconds.");
  return seconds;
}

function formatEta(metadata) {
  if (!metadata?.eta) return "";
  const eta = Array.isArray(metadata.eta) ? metadata.eta.join(", ") : metadata.eta;
  return `\tETA: ${eta}`;
}

function formatTitle(record) {
  return record.label ? `${record.label}: ${record.title}` : record.title;
}

function printSummary(snapshot, terms) {
  const records = sortRecordsForCli(filterRecords(snapshot, terms));

  if (!records.length) {
    console.log("No matching actionable items.");
    return;
  }

  for (const record of records) {
    console.log(`${record.project}\t${record.status}\t${formatTitle(record)}${formatEta(record.metadata)}`);
  }
}

function sortRecordsForCli(records) {
  const grouped = new Map();

  for (const record of records) {
    const group = grouped.get(record.project) ?? [];
    group.push(record);
    grouped.set(record.project, group);
  }

  return [...grouped.values()].flatMap((group) => group.toSorted((left, right) => {
    const leftEta = left.derived.etaMinutes ?? Number.POSITIVE_INFINITY;
    const rightEta = right.derived.etaMinutes ?? Number.POSITIVE_INFINITY;
    if (leftEta !== rightEta) return leftEta - rightEta;

    return left.title.localeCompare(right.title);
  }));
}

function printProjectTokens(snapshot) {
  for (const project of snapshot.projects) {
    console.log(`"project:${project.name}"`);
  }
}

function printConfiguredFiles(config) {
  const seen = new Set();
  for (const project of config.files) {
    for (const entry of project.entries) {
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      console.log(entry.path);
    }
  }
}

function selectStaticSnapshot(snapshot, projectLabel) {
  if (!projectLabel) return snapshot;

  const project = snapshot.projects.find((item) => item.name === projectLabel);
  if (!project) throw new Error(`Project not found for static export: ${projectLabel}`);

  return { ...snapshot, projects: [project] };
}

function resolveStaticOutput(config, staticOption) {
  if (staticOption === true) return path.join(config.output, "pstatus.html");
  return path.resolve(process.cwd(), staticOption);
}

async function writeStaticDashboard(snapshot, config, options) {
  const outputPath = resolveStaticOutput(config, options.static);
  const staticSnapshot = selectStaticSnapshot(snapshot, options.staticProject);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await dashboardHtml(staticSnapshot, config));

  console.log(`Wrote ${outputPath}`);
}

function resolveOpenTarget(target) {
  return target.startsWith("http") ? target : pathToFileURL(target).href;
}

async function openTarget(target) {
  if (!target) throw new Error("No dashboard configured.");

  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", resolveOpenTarget(target)]
    : [resolveOpenTarget(target)];

  await openFile(command, args);
}

async function openDashboard(config) {
  await openTarget(config.dashboard);
}

async function loadSnapshot(config, options) {
  if (!options.regenerate) return readSnapshot(config);

  const result = await regenerate(config, options);
  for (const warning of result.warnings) console.error(`Warning: ${warning}`);

  if (!result.snapshot) {
    process.exitCode = 1;
    return null;
  }

  return result.snapshot;
}

function validateOptions(options) {
  if (options.staticProject && !options.static) {
    throw new Error("--static-project requires --static.");
  }
}

async function serveDashboard(config, options) {
  const server = await startStaticServer({
    root: config.output,
    dashboard: config.dashboard,
    host: options.host,
    port: options.port
  });
  console.error(`Serving ${server.root} at ${server.url}`);

  if (options.open) await openTarget(options.watch ? watchUrl(server.url, options.watchIntervalSeconds) : server.url);
  return server;
}

function watchUrl(url, intervalSeconds) {
  const target = new URL(url);
  target.searchParams.set("watch", String(intervalSeconds));
  return target.href;
}

async function watchProjects(config, options) {
  const reloadConfig = () => loadConfig({ configFile: options.configFile });
  const watcher = await startRegenerationWatcher({
    config,
    reloadConfig,
    regenerate,
    overwriteOnError: options.overwriteOnError
  });
  console.error("Watching configured status files for changes.");
  return watcher;
}

function closeOnSignal(services) {
  const shutdown = async () => {
    for (const service of services) await service.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateOptions(options);

  const config = await loadConfig({ configFile: options.configFile });
  if (config.usedLegacyDefault) {
    console.error(`Warning: using legacy config filename ${config.configPath}. Rename it to ${path.resolve(process.cwd(), "pstatus.conf")}.`);
  }

  if (options.listFiles && !options.regenerate && !options.static && !options.open && !options.serve && !options.watch) {
    printConfiguredFiles(config);
    return;
  }

  if (options.serve || options.watch) {
    const services = [];
    if (options.watch) services.push(await watchProjects(config, options));
    else if (!(await loadSnapshot(config, options))) return;
    if (options.serve) services.push(await serveDashboard(config, options));
    closeOnSignal(services);
    return;
  }

  const snapshot = await loadSnapshot(config, options);
  if (!snapshot) return;

  if (options.static) {
    await writeStaticDashboard(snapshot, config, options);
  }

  if (options.open) await openDashboard(config);

  if (options.listProjects) {
    printProjectTokens(snapshot);
    return;
  }

  if (options.listFiles) {
    printConfiguredFiles(config);
    return;
  }

  if (!options.open && !options.static) {
    printSummary(snapshot, options.terms);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
