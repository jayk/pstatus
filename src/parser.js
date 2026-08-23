const STATUS_VALUES = new Set(["BLOCKED", "WIP", "TODO", "DONE"]);

function stripHtml(text) {
  return text
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function metadataValue(metadata, name) {
  const value = metadata[name];
  return Array.isArray(value) ? value.at(-1) : value;
}

function checklistSummary(checklist) {
  const checklistTotal = checklist.length;
  const checklistCompleted = checklist.filter((item) => item.done).length;
  const checklistHasBlockedItem = checklist.some((item) => /\bBLOCKED\b/i.test(item.text));
  return {
    checklistTotal,
    checklistCompleted,
    checklistPercent: checklistTotal ? Math.round((checklistCompleted / checklistTotal) * 100) : 0,
    checklistHasBlockedItem
  };
}

function extractChecklist(text) {
  const checklist = [];
  for (const line of text.split("\n")) {
    if (/^\s+- \[[ xX]\] /.test(line)) continue;
    const match = /^- \[([ xX])\] (.+)$/.exec(line.replace(/\r$/, ""));
    if (match) checklist.push({ done: /x/i.test(match[1]), text: stripHtml(match[2]) });
  }
  return checklist;
}

function isoDateFromMtime(mtime) {
  return new Date(mtime).toISOString().slice(0, 10);
}

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
  const match = /^(\d{4}-\d{2}-\d{2})(?::)?\s+([A-Za-z]+):\s*(.*)$/.exec(line);
  const lineNumber = lineOffset + statusIndex + 1;
  if (!match) {
    if (/^\d{4}-\d{2}-\d{2}(?::)?\s+/.test(line) || /^\d{4}-\d{2}-\d{2}:/.test(line)) warnings.push(`${sourceFile}:${lineNumber}: malformed status line ignored.`);
    return null;
  }
  const [, date, rawStatus, remainder] = match;
  const status = rawStatus.toUpperCase();
  if (!isDate(date) || !STATUS_VALUES.has(status)) {
    warnings.push(`${sourceFile}:${lineNumber}: invalid date or status ignored.`);
    return null;
  }
  const { title, metadata } = parseMetadata(remainder);
  const cleanTitle = stripHtml(title);
  if (!cleanTitle) {
    warnings.push(`${sourceFile}:${lineNumber}: empty title ignored.`);
    return null;
  }
  const eta = metadataValue(metadata, "eta");
  const etaMinutes = eta ? parseEta(eta) : undefined;
  const bodyLines = lines.slice(statusIndex + 1);
  while (bodyLines[0]?.trim() === "") bodyLines.shift();
  while (bodyLines.at(-1)?.trim() === "") bodyLines.pop();
  const body = stripHtml(bodyLines.join("\n"));
  const checklist = extractChecklist(body);
  return {
    date, status, title: cleanTitle, body, metadata, checklist,
    derived: { ...(etaMinutes === undefined ? {} : { etaMinutes }), ...checklistSummary(checklist) },
    source: { file: sourceFile, line: lineNumber }
  };
}

function deriveChecklistStatus(title, checklist) {
  if ([title, ...checklist.map((item) => item.text)].some((text) => /\bBLOCKED\b/i.test(text))) return "BLOCKED";
  if (checklist.every((item) => item.done)) return "DONE";
  if (checklist.every((item) => !item.done)) return "TODO";
  return "WIP";
}

function parseChecklistSection(section, lineOffset, sourceFile, mtime) {
  const lines = section.split("\n");
  const records = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\r$/, "");
    const topLevel = /^- \[([ xX])\] (.+)$/.exec(line);
    if (topLevel) {
      if (current) records.push(current);
      current = { title: topLevel[2], line: lineOffset + index + 1, lines: [line], checklist: [] };
      continue;
    }
    if (current) current.lines.push(line);
    const checklistItem = /^ {1,3}- \[([ xX])\] (.+)$/.exec(line);
    if (current && checklistItem) current.checklist.push({ done: /x/i.test(checklistItem[1]), text: stripHtml(checklistItem[2]) });
  }
  if (current) records.push(current);
  return records.map((record) => {
    const checklist = record.checklist;
    const derived = checklistSummary(checklist);
    const cleanTitle = stripHtml(record.title);
    return {
      date: isoDateFromMtime(mtime),
      status: checklist.length ? deriveChecklistStatus(cleanTitle, checklist) : /x/i.test(record.lines[0]) ? "DONE" : /\bBLOCKED\b/i.test(cleanTitle) ? "BLOCKED" : "TODO",
      title: cleanTitle,
      body: stripHtml(record.lines.slice(1).join("\n").trim()),
      metadata: {},
      checklist,
      derived,
      source: { file: sourceFile, line: record.line }
    };
  });
}

/** Parse one status file, recording recoverable record defects as warnings. */
export function parseStatusFile(content, sourceFile, warnings = [], { mtime = Date.now(), projectName = null } = {}) {
  const lines = content.split("\n");
  const separators = lines.reduce((all, line, index) => {
    if (/^[ \t]*---[ \t]*\r?$/.test(line)) all.push(index);
    return all;
  }, []);
  const records = [];
  for (let index = 0; index < separators.length; index += 1) {
    const start = separators[index] + 1;
    const end = separators[index + 1] ?? lines.length;
    const section = lines.slice(start, end).join("\n");
    const record = parseRecord(section, separators[index] + 1, sourceFile, warnings);
    if (record) {
      records.push(record);
      continue;
    }
    const checklistRecords = parseChecklistSection(section, separators[index] + 1, sourceFile, mtime);
    records.push(...checklistRecords);
  }
  return { name: projectName || /^#\s+(.+?)\s*$/m.exec(content)?.[1] || sourceFile, statusFile: sourceFile, records };
}
