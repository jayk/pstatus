import { parseEta } from "./parser.js";

function metadataText(metadata) {
  return Object.entries(metadata).flatMap(([key, value]) => [key, ...(Array.isArray(value) ? value : [value])]);
}

function checklistText(checklist = []) {
  return checklist.flatMap((item) => [item.text, item.done ? "done" : "todo"]);
}

function compile(value) {
  try {
    return new RegExp(value, "i");
  } catch {
    throw new Error(`Invalid regular expression: ${value}`);
  }
}

function fieldValue(record, project, name) {
  const reserved = { project, status: record.status, title: record.title, date: record.date };
  if (name in reserved) return [reserved[name]];
  const value = record.metadata[name];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function etaPredicate(rawValue) {
  const exact = rawValue.startsWith("=");
  const etaValue = exact ? rawValue.slice(1) : rawValue;
  const etaMinutes = parseEta(etaValue);

  if (etaMinutes === undefined) {
    const etaRegex = compile(rawValue);
    return (record, project) => fieldValue(record, project, "eta").some((value) => etaRegex.test(String(value)));
  }

  return (record) => {
    if (record.derived.etaMinutes === undefined) return false;
    return exact ? record.derived.etaMinutes === etaMinutes : record.derived.etaMinutes <= etaMinutes;
  };
}

export function filterRecords(snapshot, terms = [], { includeDone = false, etaLimit = null } = {}) {
  const predicates = terms.map((term) => {
    const separator = term.indexOf(":");
    if (separator > 0) {
      const name = term.slice(0, separator).toLowerCase();
      if (name === "eta") return etaPredicate(term.slice(separator + 1));
      const regex = compile(term.slice(separator + 1));
      return (record, project) => fieldValue(record, project, name).some((value) => regex.test(String(value)));
    }
    const regex = compile(term);
    return (record, project) => [project, record.status, record.title, record.body, record.date, ...metadataText(record.metadata), ...checklistText(record.checklist)]
      .some((value) => regex.test(String(value)));
  });
  return snapshot.projects.flatMap((project) => project.records
    .filter((record) => (includeDone || record.status !== "DONE") && (etaLimit === null || record.derived.etaMinutes <= etaLimit))
    .filter((record) => predicates.every((predicate) => predicate(record, project.name)))
    .map((record) => ({ project: project.name, ...record })));
}
