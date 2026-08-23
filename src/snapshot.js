import path from "node:path";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { parseStatusFile } from "./parser.js";
import { dashboardHtml } from "./dashboard.js";

function snapshotPath(config) {
  return path.join(config.output, config.dataFileName);
}

export async function readSnapshot(config) {
  const filePath = snapshotPath(config);
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch { throw new Error(`Current snapshot not found: ${filePath}. Run pstatus -r first.`); }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temp, file);
}

export async function regenerate(config, { overwriteOnError = false } = {}) {
  const warnings = [], projects = [], failures = [];
  await Promise.all(config.files.map(async ({ label, entries }) => {
    const fileResults = await Promise.all(entries.map(async ({ path: file, displayPath, label: fileLabel }) => {
      try {
        const [content, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
        const project = parseStatusFile(content, displayPath, warnings, { mtime: info.mtime, projectName: label });
        if (!project) return null;
        return {
          file,
          displayPath,
          fileLabel,
          project: {
            ...project,
            records: project.records.map((record) => fileLabel ? { ...record, label: fileLabel } : record)
          }
        };
      } catch (error) {
        failures.push(`${displayPath}: ${error.message}`);
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
  await writeJson(snapshotPath(config), snapshot);
  if (config.history) await writeJson(path.join(config.history, `${snapshot.generated.replace(/[:.]/g, "").replace("Z", "Z")}.json`), snapshot);
  if (config.dashboard && !/^https?:\/\//i.test(config.dashboard)) {
    await mkdir(path.dirname(config.dashboard), { recursive: true });
      await writeFile(config.dashboard, await dashboardHtml(null, config));
  }
  return { snapshot, warnings: [...warnings, ...failures] };
}
