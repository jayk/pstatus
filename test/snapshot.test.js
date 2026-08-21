import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { regenerate } from "../src/snapshot.js";
import { dashboardHtml } from "../src/dashboard.js";

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-"));
  const status = path.join(root, "STATUS.md");
  await writeFile(status, "# Test\n---\n2026-08-20: TODO: Test task. ETA:1h\n");
  return { root, status, config: { configPath: path.join(root, "pstatus.json"), files: [status, path.join(root, "missing.md")], output: path.join(root, "output"), history: null, dashboard: path.join(root, "output", "dashboard.html") } };
}

test("does not replace the snapshot after a status-file read failure by default", async () => {
  const { config } = await setup();
  const result = await regenerate(config);
  assert.equal(result.snapshot, null);
  assert.match(result.warnings.at(-1), /Snapshot was not replaced/);
  await assert.rejects(readFile(path.join(config.output, "pstatus.json")), /ENOENT/);
});

test("writes snapshots and dashboard when overwrite on error is enabled", async () => {
  const { config } = await setup();
  const result = await regenerate(config, { overwriteOnError: true });
  assert.equal(result.snapshot.projects.length, 1);
  const saved = JSON.parse(await readFile(path.join(config.output, "pstatus.json"), "utf8"));
  assert.equal(saved.projects[0].records[0].title, "Test task.");
  assert.match(await readFile(config.dashboard, "utf8"), /fetch\("pstatus.json"\)/);
});

test("static dashboard embeds data and escapes body HTML before rendering", () => {
  const html = dashboardHtml({ projects: [] });
  assert.match(html, /PSTATUS_EMBEDDED_DATA/);
  assert.match(html, /const markdown = text => esc\(text\)/);
  assert.match(html, /No matching items/);
  assert.match(html, /max-width:350px/);
  assert.match(html, /aria-label="Close details"/);
  assert.match(html, /BLOCKED\{border-top-color:#d92d20/);
  assert.match(html, /document\.querySelector\("#modal"\)\.innerHTML/);
  assert.doesNotMatch(html, /querySelector\("#detail"\)/);
});
