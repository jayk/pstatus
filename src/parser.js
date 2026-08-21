const STATUS_VALUES = new Set(["BLOCKED", "WIP", "TODO", "DONE"]);

export function parseEta(value) {
  const match = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m)?$/i.exec(value);
  if (!match || (!match[1] && !match[2])) return undefined;
  return Math.round((Number(match[1] || 0) * 60) + Number(match[2] || 0));
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function parseMetadata(text) {
  const metadata = {};
  let title = text.trim();
  // Only consume valid metadata from the end so colons in the title stay literal.
  while (true) {
    const match = /(?:^|\s)([A-Za-z][A-Za-z0-9_-]*):([^\s:]+)$/.exec(title);
    if (!match) break;
    const [, name, value] = match;
    const key = name.toLowerCase();
    const current = metadata[key];
    metadata[key] = current === undefined ? value : Array.isArray(current) ? [value, ...current] : [value, current];
    title = title.slice(0, match.index).trimEnd();
  }
  return { title, metadata };
}

function parseRecord(section, lineOffset, sourceFile, warnings) {
  const lines = section.split("\n");
  const statusIndex = lines.findIndex((line) => line.trim().length > 0);
  if (statusIndex === -1) return null;
  const line = lines[statusIndex].replace(/\r$/, "");
  const match = /^(\d{4}-\d{2}-\d{2}):\s*([A-Za-z]+):\s*(.*)$/.exec(line);
  const lineNumber = lineOffset + statusIndex + 1;
  if (!match) {
    warnings.push(`${sourceFile}:${lineNumber}: malformed status line ignored.`);
    return null;
  }
  const [, date, rawStatus, remainder] = match;
  const status = rawStatus.toUpperCase();
  if (!isDate(date) || !STATUS_VALUES.has(status)) {
    warnings.push(`${sourceFile}:${lineNumber}: invalid date or status ignored.`);
    return null;
  }
  const { title, metadata } = parseMetadata(remainder);
  if (!title) {
    warnings.push(`${sourceFile}:${lineNumber}: empty title ignored.`);
    return null;
  }
  const etaValue = metadata.eta;
  const eta = Array.isArray(etaValue) ? etaValue.at(-1) : etaValue;
  const etaMinutes = eta ? parseEta(eta) : undefined;
  const bodyLines = lines.slice(statusIndex + 1);
  while (bodyLines[0]?.trim() === "") bodyLines.shift();
  while (bodyLines.at(-1)?.trim() === "") bodyLines.pop();
  return {
    date, status, title, body: bodyLines.join("\n"), metadata,
    derived: etaMinutes === undefined ? {} : { etaMinutes },
    source: { file: sourceFile, line: lineNumber }
  };
}

/** Parse one status file, recording recoverable record defects as warnings. */
export function parseStatusFile(content, sourceFile, warnings = []) {
  const heading = /^#\s+(.+?)\s*$/m.exec(content);
  if (!heading) {
    warnings.push(`${sourceFile}: missing level-1 project heading; file ignored.`);
    return null;
  }
  const lines = content.split("\n");
  const separators = lines.reduce((all, line, index) => {
    if (/^[ \t]*---[ \t]*\r?$/.test(line)) all.push(index);
    return all;
  }, []);
  const records = [];
  for (let index = 0; index < separators.length; index += 1) {
    const start = separators[index] + 1;
    const end = separators[index + 1] ?? lines.length;
    const record = parseRecord(lines.slice(start, end).join("\n"), separators[index] + 1, sourceFile, warnings);
    if (record) records.push(record);
  }
  return { name: heading[1], statusFile: sourceFile, records };
}
