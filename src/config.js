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
  if (!Array.isArray(raw.files) || raw.files.length === 0) {
    throw new Error("Configuration requires a non-empty files array.");
  }
  if (typeof raw.output !== "string" || raw.output.length === 0) {
    throw new Error("Configuration requires an output directory.");
  }

  const base = path.dirname(configPath);
  const resolve = (value) => path.resolve(base, value);
  return {
    configPath,
    files: raw.files.map((file) => {
      if (typeof file !== "string" || file.length === 0) throw new Error("Configuration files entries must be paths.");
      return resolve(file);
    }),
    output: resolve(raw.output),
    history: raw.history ? resolve(raw.history) : null,
    dashboard: raw.dashboard ? (/^https?:\/\//i.test(raw.dashboard) ? raw.dashboard : resolve(raw.dashboard)) : null
  };
}
