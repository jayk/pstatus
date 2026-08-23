import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, writeFile } from "node:fs/promises";
import { DEFAULT_CONFIG, DEFAULT_DATA_FILE, loadConfig } from "../src/config.js";

test("a command-line config file takes precedence over PSTATUS_CONFIG", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-config-"));
  const environmentConfig = path.join(root, "environment.json");
  const commandConfig = path.join(root, "command.json");
  const customCss = path.join(root, "custom.css");
  await writeFile(customCss, ":root { --accent: hotpink; }");
  await writeFile(environmentConfig, JSON.stringify({ files: { Environment: ["environment.md"] }, output: "environment-output" }));
  await writeFile(commandConfig, JSON.stringify({ files: { Command: [{ label: "cli label", file: "command.md" }] }, output: "command-output", custom_css: "custom.css", page_title: "My Status" }));
  const config = await loadConfig({ cwd: root, environment: { PSTATUS_CONFIG: environmentConfig }, configFile: commandConfig });
  assert.equal(config.configPath, commandConfig);
  assert.equal(config.configDisplayPath, `tmp/${path.basename(root)}/command.json`);
  assert.equal(config.sourcePathDepth, 2);
  assert.equal(config.dataFileName, DEFAULT_DATA_FILE);
  assert.deepEqual(config.files, [{ label: "Command", paths: [path.join(root, "command.md")], displayPaths: [`tmp/${path.basename(root)}/command.md`], entries: [{ path: path.join(root, "command.md"), displayPath: `tmp/${path.basename(root)}/command.md`, label: "cli label" }] }]);
  assert.equal(config.pageTitle, "My Status");
  assert.match(config.customCss, /hotpink/);
});

test("uses pstatus.conf by default and falls back to pstatus.json", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-config-"));
  const defaultConfig = path.join(root, DEFAULT_CONFIG);
  await writeFile(defaultConfig, JSON.stringify({ files: { Example: ["status.md"] }, output: "out", data_file: "custom-data.json" }));
  const config = await loadConfig({ cwd: root, environment: {} });
  assert.equal(config.configPath, defaultConfig);
  assert.equal(config.dataFileName, "custom-data.json");
});
