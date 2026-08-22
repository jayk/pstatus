import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const script = String.raw`
const embedded = window.PSTATUS_EMBEDDED_DATA;
const order = { BLOCKED: 0, WIP: 1, TODO: 2, DONE: 3 };

function loadData() {
  if (embedded) return Promise.resolve(embedded);

  return fetch("pstatus.json").then((response) => {
    if (!response.ok) throw new Error("Unable to load pstatus.json");
    return response.json();
  });
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function markdown(text) {
  return esc(text)
    .replace(/\`([^\`]+)\`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function bodyWithoutChecklist(record) {
  if (!record.checklist?.length) return record.body;

  return record.body
    .split("\n")
    .filter((line) => !/^(- \[[ xX]\] |\s+- \[[ xX]\] )/.test(line))
    .join("\n")
    .trim();
}

function checklistText(checklist) {
  return checklist.flatMap((item) => [item.text, item.done ? "done" : "todo"]);
}

function checklistProgress(record) {
  if (!record.derived.checklistTotal) return "";

  return '<div class="progress-wrap"><div class="progress-label">'
    + esc(record.derived.checklistCompleted)
    + '/'
    + esc(record.derived.checklistTotal)
    + ' complete</div><div class="progress"><span style="width:'
    + esc(record.derived.checklistPercent)
    + '%"></span></div></div>';
}

function checklistDetails(record) {
  if (!record.checklist?.length) return "";

  const items = record.checklist.map((item) => '<li class="'
    + (item.done ? 'done' : 'todo')
    + '"><span class="mark">'
    + (item.done ? '✅' : '⬜')
    + '</span> <span>'
    + esc(item.text)
    + '</span></li>').join('');

  return '<section class="checklist"><h3>Checklist</h3><ul>' + items + '</ul></section>';
}

function regex(value) {
  try {
    return new RegExp(value, "i");
  } catch {
    throw new Error("Invalid regular expression: " + value);
  }
}

function parseEta(value) {
  const match = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m)?$/i.exec(value);
  if (!match || (!match[1] && !match[2])) return undefined;
  return Math.round((Number(match[1] || 0) * 60) + Number(match[2] || 0));
}

function searchableValues(record, project) {
  return [
    project,
    record.status,
    record.title,
    record.body,
    record.date,
    ...Object.entries(record.metadata).flatMap(([key, value]) => [key, ...(Array.isArray(value) ? value : [value])]),
    ...checklistText(record.checklist || [])
  ];
}

function fieldValues(record, project, name) {
  const fields = { project, status: record.status, title: record.title, date: record.date };
  const value = name in fields ? fields[name] : record.metadata[name];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

function matchesEta(record, rawValue) {
  const exact = rawValue.startsWith("=");
  const etaValue = exact ? rawValue.slice(1) : rawValue;
  const etaMinutes = parseEta(etaValue);

  if (etaMinutes === undefined) {
    const pattern = regex(rawValue);
    return fieldValues(record, "", "eta").some((value) => pattern.test(value));
  }

  if (record.derived.etaMinutes === undefined) return false;
  return exact ? record.derived.etaMinutes === etaMinutes : record.derived.etaMinutes <= etaMinutes;
}

function matches(record, project, terms) {
  return terms.every((term) => {
    const colon = term.indexOf(":");
    const name = colon > 0 ? term.slice(0, colon).toLowerCase() : null;
    const value = name ? term.slice(colon + 1) : term;

    if (name === "eta") return matchesEta(record, value);

    const pattern = regex(value);

    if (name) return fieldValues(record, project, name).some((value) => pattern.test(value));
    return searchableValues(record, project).some((value) => pattern.test(value));
  });
}

function getTerms(search) {
  return search.value.trim().split(/\s+/).filter(Boolean);
}

function filterProjectRecords(project, terms, includeDone, etaLimit) {
  const records = project.records
    .filter((record) => (includeDone || record.status !== "DONE") && (etaLimit === null || record.derived.etaMinutes <= etaLimit) && matches(record, project.name, terms))
    .sort((left, right) => order[left.status] - order[right.status]);

  return { ...project, records };
}

function renderCard(record, projectName, index) {
  const eta = record.metadata.eta
    ? '<small>ETA: ' + esc(Array.isArray(record.metadata.eta) ? record.metadata.eta.join(", ") : record.metadata.eta) + '</small>'
    : '';

  return '<button class="card '
    + record.status
    + '" data-project="'
    + esc(projectName)
    + '" data-index="'
    + index
    + '"><b>'
    + esc(record.status)
    + ':</b> '
    + esc(record.title)
    + eta
    + checklistProgress(record)
    + '</button>';
}

function renderColumn(project) {
  const content = project.records.length
    ? project.records.map((record, index) => renderCard(record, project.name, index)).join("")
    : '<p class="empty">No matching items.</p>';

  return '<section class="column"><h2>' + esc(project.name) + '</h2>' + content + '</section>';
}

function renderDetail(record, project) {
  const metadata = Object.entries(record.metadata)
    .map(([key, value]) => '<dt>' + esc(key) + '</dt><dd>' + esc(Array.isArray(value) ? value.join(", ") : value) + '</dd>')
    .join("");

  return '<button id="close" aria-label="Close details">&times;</button><h2>'
    + esc(record.title)
    + '</h2><p><b>Project:</b> '
    + esc(project)
    + '<br><b>Status:</b> '
    + esc(record.status)
    + '<br><b>Date:</b> '
    + esc(record.date)
    + '</p>'
    + checklistProgress(record)
    + '<dl>'
    + metadata
    + '</dl>'
    + checklistDetails(record)
    + '<article>'
    + markdown(bodyWithoutChecklist(record))
    + '</article><p class="source"><b>Source:</b> '
    + esc(record.source.file)
    + ':'
    + esc(record.source.line)
    + '</p>';
}

function createBoardController(snapshot) {
  const search = document.querySelector("#search");
  const done = document.querySelector("#done");
  const error = document.querySelector("#error");
  const board = document.querySelector("#board");
  const leftIndicator = document.querySelector("#board-indicator-left");
  const rightIndicator = document.querySelector("#board-indicator-right");
  const modal = document.querySelector("#modal");
  let limit = null;
  let currentColumns = [];

  function scrollByColumn(direction) {
    const column = board.querySelector(".column");
    if (!column) return;

    const styles = window.getComputedStyle(board);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    board.scrollBy({ left: direction * (column.getBoundingClientRect().width + gap), behavior: "smooth" });
  }

  function updateIndicator() {
    const canScrollLeft = board.scrollLeft > 8;
    const canScrollRight = board.scrollLeft + board.clientWidth < board.scrollWidth - 8;
    leftIndicator.classList.toggle("visible", canScrollLeft);
    rightIndicator.classList.toggle("visible", canScrollRight);
  }

  function updateEtaButtons(activeButton) {
    document.querySelectorAll("[data-eta]").forEach((button) => {
      button.classList.toggle("active", button === activeButton);
    });
  }

    function show(record, project) {
      modal.innerHTML = renderDetail(record, project);
      modal.classList.remove("dialog-tall");
      modal.showModal();
      if (modal.scrollHeight + 16 > window.innerHeight) {
        modal.classList.add("dialog-tall");
      }
      document.querySelector("#close").onclick = () => modal.close();
    }

  function bindCards() {
    board.querySelectorAll(".card").forEach((card) => {
      card.onclick = () => {
        const project = currentColumns.find((item) => item.name === card.dataset.project);
        show(project.records[Number(card.dataset.index)], project.name);
      };
    });
  }

  function update() {
    try {
      error.textContent = "";
      currentColumns = snapshot.projects.map((project) => filterProjectRecords(project, getTerms(search), done.checked, limit));
      board.innerHTML = currentColumns.map(renderColumn).join("");
      bindCards();
      requestAnimationFrame(updateIndicator);
    } catch (exception) {
      error.textContent = exception.message;
    }
  }

  function bindControls() {
    leftIndicator.addEventListener("click", () => scrollByColumn(-1));
    rightIndicator.addEventListener("click", () => scrollByColumn(1));
    board.addEventListener("scroll", updateIndicator, { passive: true });
    window.addEventListener("resize", updateIndicator);

    document.querySelectorAll("[data-eta]").forEach((button) => {
      button.onclick = () => {
        limit = button.dataset.eta ? Number(button.dataset.eta) : null;
        updateEtaButtons(button);
        update();
      };
    });

    search.oninput = update;
    done.onchange = update;
  }

  return { bindControls, update };
}

function render(snapshot) {
  const controller = createBoardController(snapshot);
  controller.bindControls();
  controller.update();
}

loadData().then(render).catch((error) => {
  document.querySelector("#error").textContent = error.message;
});
`;

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const assetPromise = Promise.all([
  readFile(path.join(srcDir, "dashboard.html"), "utf8"),
  readFile(path.join(srcDir, "dashboard.css"), "utf8")
]).then(([template, css]) => ({ template, css }));

function escapeReplacement(value) {
  return value.replaceAll("$", "$$$$");
}

export async function dashboardHtml(snapshot = null, config = {}) {
  const { template, css } = await assetPromise;
  const embeddedData = snapshot ? `<script>window.PSTATUS_EMBEDDED_DATA=${JSON.stringify(snapshot).replace(/</g, "\\u003c")}</script>` : "";
  const pageTitle = config.pageTitle || "PStatus";
  const customCss = config.customCss || "";
  return template
    .replaceAll("{{PAGE_TITLE}}", escapeReplacement(pageTitle))
    .replace("{{STYLES}}", `${css}\n${customCss}`)
    .replace("{{EMBEDDED_DATA}}", embeddedData)
    .replace("{{SCRIPT}}", script);
}
