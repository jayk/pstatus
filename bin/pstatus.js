#!/usr/bin/env node
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../src/config.js";
import { filterRecords } from "../src/query.js";
import { dashboardHtml } from "../src/dashboard.js";
import { readSnapshot, regenerate } from "../src/snapshot.js";

const usage = `Usage: pstatus [-c config.json] [-r] [-o] [--static [file.html]] [--overwrite-on-error] [query terms...]`;
function parseArgs(args) { const result = { terms: [], regenerate: false, open: false, static: null, overwriteOnError: false, configFile: null }; for (let index = 0; index < args.length; index += 1) { const arg = args[index]; if (arg === "-r") result.regenerate = true; else if (arg === "-o") result.open = true; else if (arg === "-c") { const configFile = args[++index]; if (!configFile) throw new Error("-c requires a configuration file path."); result.configFile = configFile; } else if (arg === "--overwrite-on-error") result.overwriteOnError = true; else if (arg === "--static") { const next = args[index + 1]; result.static = next?.endsWith(".html") ? args[++index] : true; } else if (arg === "--help" || arg === "-h") { console.log(usage); process.exit(0); } else if (arg === "--version") { console.log("1.0.0"); process.exit(0); } else result.terms.push(arg); } return result; }
async function openTarget(target) { const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open"; const args = process.platform === "win32" ? ["/c", "start", "", target] : [target]; await promisify(execFile)(command, args); }
function printSummary(snapshot, terms) { const records = filterRecords(snapshot, terms); if (!records.length) return console.log("No matching actionable items."); for (const record of records) console.log(`${record.project}\t${record.status}\t${record.title}${record.metadata.eta ? `\tETA: ${Array.isArray(record.metadata.eta) ? record.metadata.eta.join(", ") : record.metadata.eta}` : ""}`); }
async function main() { const args = parseArgs(process.argv.slice(2)); const config = await loadConfig({ configFile: args.configFile }); let snapshot; if (args.regenerate) { const result = await regenerate(config, args); result.warnings.forEach(warning => console.error(`Warning: ${warning}`)); snapshot = result.snapshot; if (!snapshot) return process.exitCode = 1; } else snapshot = await readSnapshot(config); if (args.static) { const output = args.static === true ? path.join(config.output, "pstatus.html") : path.resolve(process.cwd(), args.static); await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, dashboardHtml(snapshot)); console.log(`Wrote ${output}`); } if (args.open) { if (!config.dashboard) throw new Error("No dashboard configured."); await openTarget(config.dashboard.startsWith("http") ? config.dashboard : pathToFileURL(config.dashboard).href); } if (!args.open && !args.static) printSummary(snapshot, args.terms); }
main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
