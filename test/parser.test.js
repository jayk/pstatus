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
  assert.equal(project.records[0].body, "Body with **Markdown** and unsafe.");
});

test("accepts dated records with or without a colon after the date", () => {
  const withColon = parseStatusFile(`---
2026-08-22: TODO: With colon eta:1h
`, "/tmp/with-colon.md", [], { projectName: "Example" });
  const withoutColon = parseStatusFile(`---
2026-08-22 TODO: Without colon eta:2h
`, "/tmp/without-colon.md", [], { projectName: "Example" });

  assert.equal(withColon.records[0].title, "With colon");
  assert.equal(withColon.records[0].derived.etaMinutes, 60);
  assert.equal(withoutColon.records[0].title, "Without colon");
  assert.equal(withoutColon.records[0].derived.etaMinutes, 120);
});

test("strips html from titles, bodies, and checklist items before storing records", () => {
  const project = parseStatusFile(`---
2026-08-20: TODO: Fix <b>markup</b> ETA:1h

<div>Body</div> text.
- [ ] Review <em>output</em>.
`, "/tmp/STATUS.md", [], { projectName: "Example" });
  assert.equal(project.records[0].title, "Fix markup");
  assert.equal(project.records[0].body, "Body text.\n- [ ] Review output.");
  assert.deepEqual(project.records[0].checklist, [{ done: false, text: "Review output." }]);
});

test("extracts checklist progress from the body of a dated record", () => {
  const project = parseStatusFile(`# Example Project

---
2026-08-20: TODO: Ship parser update. ETA:1h

- [x] Write tests.
- [ ] Update docs.
  - [x] Nested detail should be ignored.
`, "/tmp/STATUS.md", []);
  assert.deepEqual(project.records[0].checklist, [
    { done: true, text: "Write tests." },
    { done: false, text: "Update docs." }
  ]);
  assert.deepEqual(project.records[0].derived, {
    etaMinutes: 60,
    checklistTotal: 2,
    checklistCompleted: 1,
    checklistPercent: 50,
    checklistHasBlockedItem: false
  });
});

test("parses checklist-only sections into multiple records with derived status", () => {
  const project = parseStatusFile(`# Example Project

---
- [x] Align node server configuration with the shipped config files.
  - [x] Decide whether the node server should use identity_file.
  - [x] Update shipped examples.

- [ ] Implement the missing node network abstractions.
  - [ ] Add peerLink.js.
  - [ ] Add wsPeerLink.js.

- [ ] Waiting on upstream BLOCKED API decision.
  - [ ] Follow up with platform team.
`, "/tmp/STATUS.md", [], { mtime: "2026-08-21T17:00:00Z" });
  assert.equal(project.records.length, 3);
  assert.deepEqual(project.records.map((record) => record.status), ["DONE", "TODO", "BLOCKED"]);
  assert.deepEqual(project.records[0].checklist, [
    { done: true, text: "Decide whether the node server should use identity_file." },
    { done: true, text: "Update shipped examples." }
  ]);
  assert.equal(project.records[1].date, "2026-08-21");
  assert.equal(project.records[2].derived.checklistHasBlockedItem, false);
});

test("ignores malformed records and no longer requires a heading for project naming", () => {
  const warnings = [];
  const fallbackProject = parseStatusFile("---\nnot a record", "/tmp/a.md", warnings);
  assert.equal(fallbackProject.name, "/tmp/a.md");
  assert.equal(fallbackProject.records.length, 0);
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
