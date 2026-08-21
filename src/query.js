function metadataText(metadata) {
  return Object.entries(metadata).flatMap(([key, value]) => [key, ...(Array.isArray(value) ? value : [value])]);
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

export function filterRecords(snapshot, terms = [], { includeDone = false, etaLimit = null } = {}) {
  const predicates = terms.map((term) => {
    const separator = term.indexOf(":");
    if (separator > 0) {
      const name = term.slice(0, separator).toLowerCase();
      const regex = compile(term.slice(separator + 1));
      return (record, project) => fieldValue(record, project, name).some((value) => regex.test(String(value)));
    }
    const regex = compile(term);
    return (record, project) => [project, record.status, record.title, record.body, record.date, ...metadataText(record.metadata)]
      .some((value) => regex.test(String(value)));
  });
  return snapshot.projects.flatMap((project) => project.records
    .filter((record) => (includeDone || record.status !== "DONE") && (etaLimit === null || record.derived.etaMinutes < etaLimit))
    .filter((record) => predicates.every((predicate) => predicate(record, project.name)))
    .map((record) => ({ project: project.name, ...record })));
}
