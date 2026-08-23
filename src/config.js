import path from "node:path";
import { access, readFile } from "node:fs/promises";

export const CONFIG_ENV = "PSTATUS_CONFIG";
export const DEFAULT_CONFIG = "pstatus.conf";
export const LEGACY_DEFAULT_CONFIG = "pstatus.json";
export const DEFAULT_DATA_FILE = "pstatus-data.json";

function sanitizePath(filePath, depth) {
  const parts = path.normalize(filePath).split(/[\\/]+/).filter(Boolean);
  const keep = Math.max(1, depth + 1);
  return parts.slice(-keep).join("/");
}

function parseSourcePathDepth(value) {
  if (value === undefined) return 2;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Configuration source_path_depth must be a non-negative integer.");
  }
  return value;
}

function normalizeFileEntry(entry, resolve, sourcePathDepth) {
  if (typeof entry === "string" && entry.length > 0) {
    const pathValue = resolve(entry);
    return {
      path: pathValue,
      displayPath: sanitizePath(pathValue, sourcePathDepth),
      label: null
    };
  }

  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    if (typeof entry.file !== "string" || entry.file.length === 0) {
      throw new Error("Configuration file objects must contain a non-empty file value.");
    }
    if (entry.label !== undefined && (typeof entry.label !== "string" || entry.label.length === 0)) {
      throw new Error("Configuration file object labels must be non-empty strings when present.");
    }

    const pathValue = resolve(entry.file);
    return {
      path: pathValue,
      displayPath: sanitizePath(pathValue, sourcePathDepth),
      label: entry.label ?? null
    };
  }

  throw new Error("Configuration file entries must be strings or objects with label and file.");
}

/** Resolve and validate the configuration without depending on the shell cwd for its values. */
export async function loadConfig({ cwd = process.cwd(), environment = process.env, configFile = null } = {}) {
  const { configPath, usedLegacyDefault } = await resolveConfigPath({ cwd, environment, configFile });

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
  const sourcePathDepth = parseSourcePathDepth(raw.source_path_depth);
  return {
    configPath,
    usedLegacyDefault,
    configDisplayPath: sanitizePath(configPath, sourcePathDepth),
    files: Object.entries(raw.files).map(([label, file]) => {
      if (typeof label !== "string" || label.length === 0) throw new Error("Configuration file labels must be non-empty strings.");
      if (!Array.isArray(file) || file.length === 0) throw new Error("Configuration file entries must be non-empty arrays of paths.");
      const entries = file.map((item) => normalizeFileEntry(item, resolve, sourcePathDepth));
      return {
        label,
        paths: entries.map((item) => item.path),
        displayPaths: entries.map((item) => item.displayPath),
        entries
      };
    }),
    output: resolve(raw.output),
    history: raw.history ? resolve(raw.history) : null,
    dashboard: raw.dashboard ? (/^https?:\/\//i.test(raw.dashboard) ? raw.dashboard : resolve(raw.dashboard)) : null,
    customCss: raw.custom_css ? await readFile(resolve(raw.custom_css), "utf8") : "",
    pageTitle: raw.page_title || "PStatus",
    sourcePathDepth,
    dataFileName: typeof raw.data_file === "string" && raw.data_file.length > 0 ? raw.data_file : DEFAULT_DATA_FILE
  };
}

async function resolveConfigPath({ cwd, environment, configFile }) {
  if (configFile || environment[CONFIG_ENV]) {
    const explicitPath = path.resolve(cwd, configFile || environment[CONFIG_ENV]);
    try {
      await access(explicitPath);
      return { configPath: explicitPath, usedLegacyDefault: false };
    } catch {
      throw new Error(`Configuration file not found: ${explicitPath}. Set ${CONFIG_ENV} or create ${DEFAULT_CONFIG}.`);
    }
  }

  const defaultPath = path.resolve(cwd, DEFAULT_CONFIG);
  try {
    await access(defaultPath);
    return { configPath: defaultPath, usedLegacyDefault: false };
  } catch {}

  const legacyPath = path.resolve(cwd, LEGACY_DEFAULT_CONFIG);
  try {
    await access(legacyPath);
    return { configPath: legacyPath, usedLegacyDefault: true };
  } catch {}

  throw new Error(`Configuration file not found: ${defaultPath}. Set ${CONFIG_ENV} or create ${DEFAULT_CONFIG}.`);
}
