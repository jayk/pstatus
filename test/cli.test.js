import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repo = "/opt/card/dev/projects/pstatus";

function startCli(args) {
  const child = spawn("node", ["bin/pstatus.js", ...args], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
  child.stdoutText = "";
  child.stderrText = "";
  child.stdout.on("data", (chunk) => { child.stdoutText += chunk; });
  child.stderr.on("data", (chunk) => { child.stderrText += chunk; });
  return child;
}

function matchCount(text, regex) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return [...text.matchAll(new RegExp(regex.source, flags))].length;
}

function waitForStderr(child, regex, count = 1) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${regex}. stderr: ${child.stderrText}`)), 5000);
    const check = () => {
      if (matchCount(child.stderrText, regex) >= count) {
        clearTimeout(timer);
        child.stderr.off("data", check);
        resolve(child.stderrText);
      }
    };
    child.stderr.on("data", check);
    child.once("exit", (code) => reject(new Error(`CLI exited with ${code}. stderr: ${child.stderrText}`)));
    check();
  });
}

async function stopCli(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

test("--static-project exports only the requested project", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-cli-"));
  const projectA = path.join(root, "A.md");
  const projectB = path.join(root, "B.md");
  const configPath = path.join(root, "pstatus.json");
  const outputFile = path.join(root, "single.html");
  await writeFile(projectA, "---\n2026-08-20: TODO: Task A.\n");
  await writeFile(projectB, "---\n2026-08-21: TODO: Task B.\n");
  await writeFile(configPath, JSON.stringify({ files: { Alpha: ["A.md"], Beta: ["B.md"] }, output: "out", page_title: "PStatus" }));
  await exec("node", ["bin/pstatus.js", "-c", configPath, "-r", "--overwrite-on-error", "--static", outputFile, "--static-project", "Beta"], { cwd: repo });
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
    exec("node", ["bin/pstatus.js", "-c", configPath, "-r", "--overwrite-on-error", "--static-project", "Alpha"], { cwd: repo }),
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
  await exec("node", ["bin/pstatus.js", "-c", configPath, "-r", "--overwrite-on-error"], { cwd: repo });
  const { stdout } = await exec("node", ["bin/pstatus.js", "-c", configPath, "-l"], { cwd: repo });
  assert.equal(stdout.trim(), `"project:Alpha"\n"project:Beta Team"`);
});

test("-f lists configured source files without requiring a snapshot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-cli-"));
  const projectA = path.join(root, "A.md");
  const projectB = path.join(root, "B.md");
  const configPath = path.join(root, "pstatus.json");
  await writeFile(projectA, "---\n2026-08-20: TODO: Task A.\n");
  await writeFile(projectB, "---\n2026-08-21: TODO: Task B.\n");
  await writeFile(configPath, JSON.stringify({
    files: {
      Alpha: ["A.md", { label: "again", file: "A.md" }],
      Beta: [{ label: "api", file: "B.md" }]
    },
    output: "out"
  }));

  const { stdout } = await exec("node", ["bin/pstatus.js", "-c", configPath, "-f"], { cwd: repo });
  assert.equal(stdout.trim(), `${projectA}\n${projectB}`);
});

test("cli output sorts records within a project by lowest eta first", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-cli-"));
  const projectA = path.join(root, "A.md");
  const configPath = path.join(root, "pstatus.json");
  await writeFile(projectA, "---\n2026-08-20: TODO: Slower task. ETA:2h\n---\n2026-08-20: TODO: Faster task. ETA:30m\n---\n2026-08-20: TODO: No eta task.\n");
  await writeFile(configPath, JSON.stringify({ files: { Alpha: [{ label: "backend", file: "A.md" }] }, output: "out" }));
  const { stdout } = await exec("node", ["bin/pstatus.js", "-c", configPath, "-r", "--overwrite-on-error"], { cwd: repo });
  const lines = stdout.trim().split("\n");
  assert.match(lines[0], /backend: Faster task/);
  assert.match(lines[1], /backend: Slower task/);
  assert.match(lines[2], /No eta task/);
});

test("-s serves the generated dashboard and snapshot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-cli-"));
  const projectA = path.join(root, "A.md");
  const configPath = path.join(root, "pstatus.json");
  await writeFile(projectA, "---\n2026-08-20: TODO: Served task.\n");
  await writeFile(configPath, JSON.stringify({ files: { Alpha: ["A.md"] }, output: "out", dashboard: "out/index.html" }));

  const child = startCli(["-c", configPath, "-r", "--overwrite-on-error", "-s", "--port", "0"]);
  try {
    const stderr = await waitForStderr(child, /Serving .* at (http:\/\/[^\s]+)/);
    const [, url] = /Serving .* at (http:\/\/[^\s]+)/.exec(stderr);
    const [html, jsonResponse] = await Promise.all([
      fetch(url).then((response) => response.text()),
      fetch(new URL("pstatus-data.json", url))
    ]);
    const json = await jsonResponse.json();
    const unchanged = await fetch(new URL("pstatus-data.json", url), { headers: { "if-none-match": jsonResponse.headers.get("etag") } });
    assert.match(html, /Cross-project status dashboard/);
    assert.equal(json.projects[0].records[0].title, "Served task.");
    assert.equal(unchanged.status, 304);
  } finally {
    await stopCli(child);
  }
});

test("-w regenerates when a configured status file changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pstatus-cli-"));
  const projectA = path.join(root, "A.md");
  const configPath = path.join(root, "pstatus.json");
  const snapshotPath = path.join(root, "out", "pstatus-data.json");
  await writeFile(projectA, "---\n2026-08-20: TODO: Initial task.\n");
  await writeFile(configPath, JSON.stringify({ files: { Alpha: ["A.md"] }, output: "out", dashboard: "out/index.html" }));

  const child = startCli(["-c", configPath, "--overwrite-on-error", "-w"]);
  try {
    await waitForStderr(child, /Regenerated/);
    await writeFile(projectA, "---\n2026-08-20: TODO: Updated task.\n");
    await waitForStderr(child, /Regenerated/, 2);
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    assert.equal(snapshot.projects[0].records[0].title, "Updated task.");
  } finally {
    await stopCli(child);
  }
});

test("-w rejects non-positive refresh intervals", async () => {
  await assert.rejects(
    exec("node", ["bin/pstatus.js", "-w", "0"], { cwd: repo }),
    /-w interval requires a positive number of seconds/
  );
});
