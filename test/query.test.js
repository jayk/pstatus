import test from "node:test";
import assert from "node:assert/strict";
import { filterRecords } from "../src/query.js";

const snapshot = { projects: [{ name: "Vouchsafe", records: [
  { status: "TODO", title: "Write article", body: "About revocation", date: "2026-08-20", metadata: { type: "write", tag: ["blog", "security"] }, checklist: [{ text: "Draft outline", done: false }], derived: { etaMinutes: 90, checklistTotal: 1, checklistCompleted: 0, checklistPercent: 0, checklistHasBlockedItem: false } },
  { status: "DONE", title: "Old work", body: "", date: "2026-08-10", metadata: {}, checklist: [], derived: {} }
] }] };

test("queries metadata and plain terms with AND semantics", () => {
  assert.equal(filterRecords(snapshot, ["vouch", "type:write"]).length, 1);
  assert.equal(filterRecords(snapshot, ["tag:security"]).length, 1);
  assert.equal(filterRecords(snapshot, ["outline"]).length, 1);
  assert.equal(filterRecords(snapshot, ["revocation", "type:code"]).length, 0);
  assert.equal(filterRecords(snapshot, [], { etaLimit: 120 }).length, 1);
  assert.equal(filterRecords(snapshot).length, 1);
});

test("rejects invalid regular expressions", () => {
  assert.throws(() => filterRecords(snapshot, ["["]), /Invalid regular expression/);
});
