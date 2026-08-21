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
  await Promise.all(config.files.map(async ({ label, paths, displayPaths }) => {
    const fileResults = await Promise.all(paths.map(async (file, index) => {
      try {
        const [content, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
        const project = parseStatusFile(content, displayPaths[index], warnings, { mtime: info.mtime, projectName: label });
        return project ? { file, displayPath: displayPaths[index], project } : null;
      } catch (error) {
        failures.push(`${displayPaths[index]}: ${error.message}`);
        return null;
      }
    }));

    const loadedFiles = fileResults.filter(Boolean);
    if (loadedFiles.length) {
      const records = loadedFiles.flatMap(({ project }) => project.records);
      projects.push({
        name: label,
        statusFile: loadedFiles[0].displayPath,
        statusFiles: loadedFiles.map(({ displayPath }) => displayPath),
        records: records.sort((a, b) => {
          const fileOrder = loadedFiles.findIndex(({ displayPath }) => displayPath === a.source.file) - loadedFiles.findIndex(({ displayPath }) => displayPath === b.source.file);
          return fileOrder || a.source.line - b.source.line;
        })
      });
    }
  }));
  if (projects.length === 0) throw new Error(`No status files loaded.\n${[...warnings, ...failures].join("\n")}`);
  const snapshot = { generated: new Date().toISOString(), config: config.configDisplayPath, projects: projects.sort((a, b) => config.files.findIndex((item) => item.label === a.name) - config.files.findIndex((item) => item.label === b.name)) };
  if (failures.length && !overwriteOnError) return { snapshot: null, warnings: [...warnings, ...failures, "Snapshot was not replaced because one or more files failed to load. Use --overwrite-on-error to replace it."] };
  await writeJson(path.join(config.output, "pstatus.json"), snapshot);
  if (config.history) await writeJson(path.join(config.history, `${snapshot.generated.replace(/[:.]/g, "").replace("Z", "Z")}.json`), snapshot);
  if (config.dashboard && !/^https?:\/\//i.test(config.dashboard)) {
    await mkdir(path.dirname(config.dashboard), { recursive: true });
      await writeFile(config.dashboard, await dashboardHtml(null, config));
  }
  return { snapshot, warnings: [...warnings, ...failures] };
}
