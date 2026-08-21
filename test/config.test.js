import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, writeFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";

test("a command-line config file takes precedence over PSTATUS_CONFIG", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-config-"));
  const environmentConfig = path.join(root, "environment.json");
  const commandConfig = path.join(root, "command.json");
  await writeFile(environmentConfig, JSON.stringify({ files: ["environment.md"], output: "environment-output" }));
  await writeFile(commandConfig, JSON.stringify({ files: ["command.md"], output: "command-output" }));
  const config = await loadConfig({ cwd: root, environment: { PSTATUS_CONFIG: environmentConfig }, configFile: commandConfig });
  assert.equal(config.configPath, commandConfig);
  assert.deepEqual(config.files, [path.join(root, "command.md")]);
});
