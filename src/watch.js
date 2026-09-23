import path from "node:path";
import { watch } from "node:fs";

function watchedPaths(config) {
  return new Set([
    config.configPath,
    ...config.files.flatMap((project) => project.entries.map((entry) => entry.path))
  ].map((file) => path.resolve(file)));
}

function watchDirectories(files, onChange) {
  const directories = new Map();

  for (const file of files) {
    const directory = path.dirname(file);
    const names = directories.get(directory) ?? new Set();
    names.add(path.basename(file));
    directories.set(directory, names);
  }

  return [...directories].map(([directory, names]) => watch(directory, (eventType, filename) => {
    if (!filename || names.has(filename.toString())) onChange();
  }));
}

function closeWatchers(watchers) {
  for (const watcher of watchers) watcher.close();
}

export async function startRegenerationWatcher({ config, reloadConfig, regenerate, overwriteOnError = false, log = console.error }) {
  let currentConfig = config;
  let watchers = [];
  let timer = null;
  let running = false;
  let queued = false;

  const installWatchers = () => {
    closeWatchers(watchers);
    watchers = watchDirectories(watchedPaths(currentConfig), schedule);
  };

  const run = async () => {
    if (running) {
      queued = true;
      return;
    }

    running = true;
    try {
      currentConfig = await reloadConfig();
      const result = await regenerate(currentConfig, { overwriteOnError });
      for (const warning of result.warnings) log(`Warning: ${warning}`);
      if (result.snapshot) log(`Regenerated ${path.join(currentConfig.output, currentConfig.dataFileName)}`);
      installWatchers();
    } catch (error) {
      log(`Error: ${error.message}`);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        schedule();
      }
    }
  };

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 100);
  }

  installWatchers();
  await run();

  return {
    close() {
      clearTimeout(timer);
      closeWatchers(watchers);
    }
  };
}
