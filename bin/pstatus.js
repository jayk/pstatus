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

const usage = `pstatus

Usage:
  pstatus [query terms...]
  pstatus -r [query terms...]
  pstatus -o
  pstatus --static [file.html]
  pstatus --static [file.html] --static-project <label>

Options:
  -c <config.json>       Use a specific configuration file
  -r                     Regenerate the snapshot from source files
  -o                     Open the configured dashboard
  --static [file.html]   Write a self-contained static dashboard
  --static-project <label>
                         Limit static export to one project label
  --overwrite-on-error   Replace the snapshot even if some files fail
  -h, --help             Show this help text
  --version              Show the version

Notes:
  - The CLI reads the existing snapshot by default.
  - Source files are reread only when you use -r.
  - The dashboard and snapshot do not update automatically.

Examples:
  pstatus
  pstatus -r
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
    open: false,
    overwriteOnError: false,
    regenerate: false,
    static: null,
    staticProject: null,
    terms: []
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

    if (arg === "--overwrite-on-error") {
      options.overwriteOnError = true;
      continue;
    }

    if (arg === "-c") {
      options.configFile = requireValue(argv, ++index, "-c requires a configuration file path.");
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

function formatEta(metadata) {
  if (!metadata.eta) return "";
  const eta = Array.isArray(metadata.eta) ? metadata.eta.join(", ") : metadata.eta;
  return `\tETA: ${eta}`;
}

function printSummary(snapshot, terms) {
  const records = filterRecords(snapshot, terms);

  if (!records.length) {
    console.log("No matching actionable items.");
    return;
  }

  for (const record of records) {
    console.log(`${record.project}\t${record.status}\t${record.title}${formatEta(record.metadata)}`);
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

async function openDashboard(config) {
  if (!config.dashboard) throw new Error("No dashboard configured.");

  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", resolveOpenTarget(config.dashboard)]
    : [resolveOpenTarget(config.dashboard)];

  await openFile(command, args);
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateOptions(options);

  const config = await loadConfig({ configFile: options.configFile });
  const snapshot = await loadSnapshot(config, options);
  if (!snapshot) return;

  if (options.static) {
    await writeStaticDashboard(snapshot, config, options);
  }

  if (options.open) {
    await openDashboard(config);
  }

  if (!options.open && !options.static) {
    printSummary(snapshot, options.terms);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
