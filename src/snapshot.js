import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { parseStatusFile } from "./parser.js";
import { dashboardHtml } from "./dashboard.js";

export async function readSnapshot(config) {
  try { return JSON.parse(await readFile(path.join(config.output, "pstatus.json"), "utf8")); }
  catch { throw new Error(`Current snapshot not found: ${path.join(config.output, "pstatus.json")}. Run pstatus -r first.`); }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temp, file);
}

export async function regenerate(config, { overwriteOnError = false } = {}) {
  const warnings = [], projects = [], failures = [];
  await Promise.all(config.files.map(async (file) => {
    try {
      const project = parseStatusFile(await readFile(file, "utf8"), file, warnings);
      if (project) projects.push(project);
    } catch (error) { failures.push(`${file}: ${error.message}`); }
  }));
  if (projects.length === 0) throw new Error(`No status files loaded.\n${[...warnings, ...failures].join("\n")}`);
  const snapshot = { generated: new Date().toISOString(), config: config.configPath, projects: projects.sort((a, b) => config.files.indexOf(a.statusFile) - config.files.indexOf(b.statusFile)) };
  if (failures.length && !overwriteOnError) return { snapshot: null, warnings: [...warnings, ...failures, "Snapshot was not replaced because one or more files failed to load. Use --overwrite-on-error to replace it."] };
  await writeJson(path.join(config.output, "pstatus.json"), snapshot);
  if (config.history) await writeJson(path.join(config.history, `${snapshot.generated.replace(/[:.]/g, "").replace("Z", "Z")}.json`), snapshot);
  if (config.dashboard && !/^https?:\/\//i.test(config.dashboard)) {
    await mkdir(path.dirname(config.dashboard), { recursive: true });
    await writeFile(config.dashboard, dashboardHtml());
  }
  return { snapshot, warnings: [...warnings, ...failures] };
}
