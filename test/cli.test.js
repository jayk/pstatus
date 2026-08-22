import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("--static-project exports only the requested project", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-cli-"));
  const projectA = path.join(root, "A.md");
  const projectB = path.join(root, "B.md");
  const configPath = path.join(root, "pstatus.json");
  const outputFile = path.join(root, "single.html");
  await writeFile(projectA, "---\n2026-08-20: TODO: Task A.\n");
  await writeFile(projectB, "---\n2026-08-21: TODO: Task B.\n");
  await writeFile(configPath, JSON.stringify({ files: { Alpha: ["A.md"], Beta: ["B.md"] }, output: "out", page_title: "PStatus" }));
  await exec("node", ["bin/pstatus.js", "-c", configPath, "-r", "--overwrite-on-error", "--static", outputFile, "--static-project", "Beta"], { cwd: "/opt/card/dev/projects/pstatus" });
  const html = await readFile(outputFile, "utf8");
  assert.match(html, /"name":"Beta"/);
  assert.doesNotMatch(html, /"name":"Alpha"/);
  assert.match(html, /Task B/);
  assert.doesNotMatch(html, /Task A/);
});

test("--static-project requires --static", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-cli-"));
  const projectA = path.join(root, "A.md");
  const configPath = path.join(root, "pstatus.json");
  await writeFile(projectA, "---\n2026-08-20: TODO: Task A.\n");
  await writeFile(configPath, JSON.stringify({ files: { Alpha: ["A.md"] }, output: "out" }));
  await assert.rejects(
    exec("node", ["bin/pstatus.js", "-c", configPath, "-r", "--overwrite-on-error", "--static-project", "Alpha"], { cwd: "/opt/card/dev/projects/pstatus" }),
    /--static-project requires --static/
  );
});

test("-l lists project query tokens", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-cli-"));
  const projectA = path.join(root, "A.md");
  const projectB = path.join(root, "B.md");
  const configPath = path.join(root, "pstatus.json");
  await writeFile(projectA, "---\n2026-08-20: TODO: Task A.\n");
  await writeFile(projectB, "---\n2026-08-21: TODO: Task B.\n");
  await writeFile(configPath, JSON.stringify({ files: { Alpha: ["A.md"], "Beta Team": ["B.md"] }, output: "out" }));
  await exec("node", ["bin/pstatus.js", "-c", configPath, "-r", "--overwrite-on-error"], { cwd: "/opt/card/dev/projects/pstatus" });
  const { stdout } = await exec("node", ["bin/pstatus.js", "-c", configPath, "-l"], { cwd: "/opt/card/dev/projects/pstatus" });
  assert.equal(stdout.trim(), `"project:Alpha"\n"project:Beta Team"`);
});

test("cli output sorts records within a project by lowest eta first", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-cli-"));
  const projectA = path.join(root, "A.md");
  const configPath = path.join(root, "pstatus.json");
  await writeFile(projectA, "---\n2026-08-20: TODO: Slower task. ETA:2h\n---\n2026-08-20: TODO: Faster task. ETA:30m\n---\n2026-08-20: TODO: No eta task.\n");
  await writeFile(configPath, JSON.stringify({ files: { Alpha: ["A.md"] }, output: "out" }));
  const { stdout } = await exec("node", ["bin/pstatus.js", "-c", configPath, "-r", "--overwrite-on-error"], { cwd: "/opt/card/dev/projects/pstatus" });
  const lines = stdout.trim().split("\n");
  assert.match(lines[0], /Faster task/);
  assert.match(lines[1], /Slower task/);
  assert.match(lines[2], /No eta task/);
});
