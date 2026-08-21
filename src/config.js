import path from "node:path";
import { access, readFile } from "node:fs/promises";

export const CONFIG_ENV = "PSTATUS_CONFIG";
export const DEFAULT_CONFIG = "pstatus.json";

/** Resolve and validate the configuration without depending on the shell cwd for its values. */
export async function loadConfig({ cwd = process.cwd(), environment = process.env, configFile = null } = {}) {
  const configPath = path.resolve(cwd, configFile || environment[CONFIG_ENV] || DEFAULT_CONFIG);
  try {
    await access(configPath);
  } catch {
    throw new Error(`Configuration file not found: ${configPath}. Set ${CONFIG_ENV} or create ${DEFAULT_CONFIG}.`);
  }

  let raw;
  try {
    raw = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid configuration ${configPath}: ${error.message}`);
  }
  if (!raw.files || typeof raw.files !== "object" || Array.isArray(raw.files) || Object.keys(raw.files).length === 0) {
    throw new Error("Configuration requires a non-empty files object mapping labels to arrays of paths.");
  }
  if (typeof raw.output !== "string" || raw.output.length === 0) {
    throw new Error("Configuration requires an output directory.");
  }

  const base = path.dirname(configPath);
  const resolve = (value) => path.resolve(base, value);
  return {
    configPath,
    files: Object.entries(raw.files).map(([label, file]) => {
      if (typeof label !== "string" || label.length === 0) throw new Error("Configuration file labels must be non-empty strings.");
      if (!Array.isArray(file) || file.length === 0) throw new Error("Configuration file entries must be non-empty arrays of paths.");
      return {
        label,
        paths: file.map((item) => {
          if (typeof item !== "string" || item.length === 0) throw new Error("Configuration file paths must be non-empty strings.");
          return resolve(item);
        })
      };
    }),
    output: resolve(raw.output),
    history: raw.history ? resolve(raw.history) : null,
    dashboard: raw.dashboard ? (/^https?:\/\//i.test(raw.dashboard) ? raw.dashboard : resolve(raw.dashboard)) : null
  };
}
