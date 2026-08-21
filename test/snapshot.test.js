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
  const status2 = path.join(root, "STATUS-2.md");
  const customCss = path.join(root, "custom.css");
  const rootName = path.basename(root);
  await writeFile(status, "# Test\n---\n2026-08-20: TODO: Test task. ETA:1h\n");
  await writeFile(status2, "# Test 2\n---\n2026-08-21: WIP: Second task. ETA:2h\n");
  await writeFile(customCss, ".page-header p { color: rgb(255, 0, 0); }");
  return {
    root,
    rootName,
    status,
    status2,
    config: {
      configPath: path.join(root, "pstatus.json"),
      configDisplayPath: `tmp/${rootName}/pstatus.json`,
      files: [
        { label: "Configured Label", paths: [status, status2], displayPaths: [`tmp/${rootName}/STATUS.md`, `tmp/${rootName}/STATUS-2.md`] },
        { label: "Missing", paths: [path.join(root, "missing.md")], displayPaths: [`tmp/${rootName}/missing.md`] }
      ],
      output: path.join(root, "output"),
      history: null,
      dashboard: path.join(root, "output", "dashboard.html"),
      customCss: ".page-header p { color: rgb(255, 0, 0); }",
      pageTitle: "Custom Title",
      sourcePathDepth: 2
    }
  };
}

test("does not replace the snapshot after a status-file read failure by default", async () => {
  const { config } = await setup();
  const result = await regenerate(config);
  assert.equal(result.snapshot, null);
  assert.match(result.warnings.at(-1), /Snapshot was not replaced/);
  assert.match(result.warnings.join("\n"), /missing\.md/);
  await assert.rejects(readFile(path.join(config.output, "pstatus.json")), /ENOENT/);
});

test("writes snapshots and dashboard when overwrite on error is enabled", async () => {
  const { config, root, rootName } = await setup();
  const result = await regenerate(config, { overwriteOnError: true });
  assert.equal(result.snapshot.projects.length, 1);
  const saved = JSON.parse(await readFile(path.join(config.output, "pstatus.json"), "utf8"));
  assert.equal(saved.config, `tmp/${rootName}/pstatus.json`);
  assert.equal(saved.projects[0].name, "Configured Label");
  assert.equal(saved.projects[0].statusFile, `tmp/${rootName}/STATUS.md`);
  assert.deepEqual(saved.projects[0].statusFiles, config.files[0].displayPaths);
  assert.equal(saved.projects[0].records.length, 2);
  assert.equal(saved.projects[0].records[0].title, "Test task.");
  assert.equal(saved.projects[0].records[1].title, "Second task.");
  assert.equal(saved.projects[0].records[0].source.file, `tmp/${rootName}/STATUS.md`);
  assert.equal(saved.projects[0].records[1].source.file, `tmp/${rootName}/STATUS-2.md`);
  assert.doesNotMatch(JSON.stringify(saved), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const dashboard = await readFile(config.dashboard, "utf8");
  assert.match(dashboard, /fetch\("pstatus.json"\)/);
  assert.match(dashboard, /Custom Title/);
  assert.match(dashboard, /rgb\(255, 0, 0\)/);
});

test("static dashboard embeds data and escapes body HTML before rendering", async () => {
  const html = await dashboardHtml({ projects: [{ name: "Example", records: [{ title: "Task", status: "TODO", date: "2026-08-21", body: "<script>x</script>", metadata: {}, checklist: [{ text: "Ship it", done: true }], derived: { checklistTotal: 1, checklistCompleted: 1, checklistPercent: 100 }, source: { file: "/tmp/STATUS.md", line: 4 } }] }] }, { pageTitle: "PStatus Test", customCss: ":root { --page-bg: #000; }" });
  assert.match(html, /PSTATUS_EMBEDDED_DATA/);
  assert.match(html, /function markdown\(text\)/);
  assert.match(html, /No matching items/);
  assert.match(html, /max-width: 350px/);
  assert.match(html, /aria-label="Close details"/);
  assert.match(html, /--page-bg/);
  assert.match(html, /modal\.innerHTML = renderDetail/);
  assert.doesNotMatch(html, /querySelector\("#detail"\)/);
  assert.match(html, /progress-wrap/);
  assert.match(html, /Checklist/);
  assert.match(html, /PStatus Test/);
  assert.match(html, /board-indicator-left/);
  assert.match(html, /board-indicator-right/);
  assert.match(html, /&#x2190;|←/);
  assert.match(html, /&#x2192;|→/);
});
