import path from "node:path";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
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
  await Promise.all(config.files.map(async ({ label, paths }) => {
    const records = [];
    const loadedFiles = [];
    await Promise.all(paths.map(async (file) => {
      try {
        const [content, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
        const project = parseStatusFile(content, file, warnings, { mtime: info.mtime, projectName: label });
        if (project) {
          records.push(...project.records);
          loadedFiles.push(file);
        }
      } catch (error) { failures.push(`${file}: ${error.message}`); }
    }));
    if (loadedFiles.length) {
      projects.push({
        name: label,
        statusFile: loadedFiles[0],
        statusFiles: paths,
        records: records.sort((a, b) => loadedFiles.indexOf(a.source.file) - loadedFiles.indexOf(b.source.file) || a.source.line - b.source.line)
      });
    }
  }));
  if (projects.length === 0) throw new Error(`No status files loaded.\n${[...warnings, ...failures].join("\n")}`);
  const snapshot = { generated: new Date().toISOString(), config: config.configPath, projects: projects.sort((a, b) => config.files.findIndex((item) => item.label === a.name) - config.files.findIndex((item) => item.label === b.name)) };
  if (failures.length && !overwriteOnError) return { snapshot: null, warnings: [...warnings, ...failures, "Snapshot was not replaced because one or more files failed to load. Use --overwrite-on-error to replace it."] };
  await writeJson(path.join(config.output, "pstatus.json"), snapshot);
  if (config.history) await writeJson(path.join(config.history, `${snapshot.generated.replace(/[:.]/g, "").replace("Z", "Z")}.json`), snapshot);
  if (config.dashboard && !/^https?:\/\//i.test(config.dashboard)) {
    await mkdir(path.dirname(config.dashboard), { recursive: true });
      await writeFile(config.dashboard, await dashboardHtml(null, config));
  }
  return { snapshot, warnings: [...warnings, ...failures] };
}
