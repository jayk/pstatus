import test from "node:test";
import assert from "node:assert/strict";
import { parseEta, parseStatusFile } from "../src/parser.js";

test("parses records, trailing metadata, body, and duplicate metadata", () => {
  const warnings = [];
  const project = parseStatusFile(`# Example Project

---
2026-08-20: todo: Investigate title: punctuation. ETA:2h30m type:research tag:one tag:two

Body with **Markdown** and <script>unsafe</script>.

---
2026-08-21: DONE: Finished it. completed:2026-08-22
`, "/tmp/STATUS.md", warnings);
  assert.deepEqual(warnings, []);
  assert.equal(project.name, "Example Project");
  assert.equal(project.records[0].status, "TODO");
  assert.equal(project.records[0].title, "Investigate title: punctuation.");
  assert.deepEqual(project.records[0].metadata, { eta: "2h30m", type: "research", tag: ["one", "two"] });
  assert.equal(project.records[0].derived.etaMinutes, 150);
  assert.equal(project.records[0].source.line, 4);
  assert.equal(project.records[0].body, "Body with **Markdown** and <script>unsafe</script>.");
});

test("warns and ignores malformed records and files without a heading", () => {
  const warnings = [];
  assert.equal(parseStatusFile("---\nnot a record", "/tmp/a.md", warnings), null);
  assert.match(warnings[0], /missing level-1/);
  const project = parseStatusFile("# Project\n---\n2026-02-30: TODO: impossible", "/tmp/b.md", warnings);
  assert.equal(project.records.length, 0);
  assert.match(warnings.at(-1), /invalid date or status/);
});

test("parses supported duration forms and leaves invalid forms unknown", () => {
  assert.equal(parseEta("30m"), 30);
  assert.equal(parseEta("1.5h"), 90);
  assert.equal(parseEta("2h30m"), 150);
  assert.equal(parseEta("soon"), undefined);
});
