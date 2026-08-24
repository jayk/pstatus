import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const script = String.raw`
const embedded = window.PSTATUS_EMBEDDED_DATA;
const dataFileName = "__PSTATUS_DATA_FILE__";
const order = { BLOCKED: 0, WIP: 1, TODO: 2, DONE: 3 };

function loadData() {
  if (embedded) return Promise.resolve(embedded);

  return fetch(dataFileName).then((response) => {
    if (!response.ok) throw new Error("Unable to load " + dataFileName);
    return response.json();
  });
}

function template(id) {
  return document.querySelector(id);
}

function cloneTemplate(id) {
  return template(id).content.firstElementChild.cloneNode(true);
}

function cloneFragment(id) {
  return template(id).content.cloneNode(true);
}

function clearChildren(node) {
  node.replaceChildren();
}

function setText(root, selector, value) {
  const node = root.querySelector(selector);
  if (node) node.textContent = value;
}

function toggleHidden(node, hidden) {
  node.hidden = hidden;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
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

function createProgressNode(record) {
  if (!record.derived.checklistTotal) return null;

  const node = cloneTemplate("#template-progress");
  setText(
    node,
    ".progress-label",
    record.derived.checklistCompleted + "/" + record.derived.checklistTotal + " complete"
  );
  node.querySelector(".progress span").style.width = record.derived.checklistPercent + "%";
  return node;
}

function createChecklistItemNode(item) {
  const node = cloneTemplate("#template-checklist-item");
  node.classList.add(item.done ? "done" : "todo");
  setText(node, ".mark", item.done ? "✅" : "⬜");
  setText(node, ".checklist-text", item.text);
  return node;
}

function createChecklistNode(record) {
  if (!record.checklist?.length) return null;

  const node = cloneTemplate("#template-detail").querySelector(".detail-checklist");
  const list = node.querySelector("ul");
  clearChildren(list);
  for (const item of record.checklist) list.append(createChecklistItemNode(item));
  return node;
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
    record.label,
    record.status,
    record.title,
    record.body,
    record.date,
    ...Object.entries(record.metadata).flatMap(([key, value]) => [
      key,
      ...(Array.isArray(value) ? value : [value])
    ]),
    ...checklistText(record.checklist || [])
  ];
}

function fieldValues(record, project, name) {
  const fields = {
    project,
    label: record.label,
    status: record.status,
    title: record.title,
    date: record.date
  };
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
  return exact
    ? record.derived.etaMinutes === etaMinutes
    : record.derived.etaMinutes <= etaMinutes;
}

function matches(record, project, terms) {
  return terms.every((term) => {
    const colon = term.indexOf(":");
    const name = colon > 0 ? term.slice(0, colon).toLowerCase() : null;
    const value = name ? term.slice(colon + 1) : term;

    if (name === "eta") return matchesEta(record, value);

    const pattern = regex(value);
    if (name) {
      return fieldValues(record, project, name).some((entry) => pattern.test(entry));
    }
    return searchableValues(record, project).some((entry) => pattern.test(entry));
  });
}

function getTerms(search) {
  return search.value.trim().split(/\s+/).filter(Boolean);
}

function filterProjectRecords(project, terms, includeDone, etaLimit) {
  const records = project.records
    .filter((record) => {
      const etaOk = etaLimit === null || record.derived.etaMinutes <= etaLimit;
      return (includeDone || record.status !== "DONE")
        && etaOk
        && matches(record, project.name, terms);
    })
    .sort((left, right) => order[left.status] - order[right.status]);

  return { ...project, records };
}

function createCardNode(record, projectName, index) {
  const node = cloneTemplate("#template-card");
  node.classList.add(record.status);
  node.dataset.project = projectName;
  node.dataset.index = String(index);
  setText(node, ".card-status", record.status + ":");
  setText(node, ".card-title", record.title);

  const progressSlot = node.querySelector(".card-progress-slot");
  const progress = createProgressNode(record);
  if (progress) progressSlot.append(progress);

      const label = node.querySelector(".card-label");
      const eta = node.querySelector(".card-eta");
      if (record.label) {
        label.textContent = record.label;
      } else {
        label.remove();
      }
      toggleHidden(eta, !record.metadata.eta);
      if (record.metadata.eta) {
        eta.textContent = Array.isArray(record.metadata.eta)
          ? record.metadata.eta.join(", ")
          : record.metadata.eta;
      }

  const footer = node.querySelector(".card-footer");
  toggleHidden(footer, !record.label && !record.metadata.eta);
  return node;
}

function createColumnNode(project) {
  const node = cloneTemplate("#template-column");
  setText(node, ".column-title", project.name);
  if (!project.records.length) node.classList.add("is-empty");

  const body = node.querySelector(".column-body");
  clearChildren(body);
  if (!project.records.length) {
    body.append(cloneTemplate("#template-empty-column"));
    return node;
  }

  project.records.forEach((record, index) => {
    body.append(createCardNode(record, project.name, index));
  });
  return node;
}

  function appendMetadata(detailNode, record) {
    const container = detailNode.querySelector(".detail-metadata");
    clearChildren(container);
    for (const [key, value] of Object.entries(record.metadata)) {
      if (key.toLowerCase() === "eta") continue;
      const fragment = cloneFragment("#template-metadata-item");
      fragment.querySelector(".metadata-key").textContent = key;
      fragment.querySelector(".metadata-value").textContent = Array.isArray(value)
        ? value.join(", ")
        : value;
      container.append(fragment);
    }
  }

function appendChecklist(detailNode, record) {
  const section = detailNode.querySelector(".detail-checklist");
  if (!record.checklist?.length) {
    section.remove();
    return;
  }

  const list = section.querySelector("ul");
  clearChildren(list);
  for (const item of record.checklist) list.append(createChecklistItemNode(item));
}

function appendDetailEta(detailNode, record) {
  const container = detailNode.querySelector(".detail-eta");
  if (!record.metadata.eta) {
    clearChildren(container);
    container.hidden = true;
    return;
  }

  container.hidden = false;
  const node = cloneTemplate("#template-detail-eta");
  const value = Array.isArray(record.metadata.eta)
    ? record.metadata.eta.join(", ")
    : record.metadata.eta;
  node.querySelector("strong").textContent = value;
  clearChildren(container);
  container.append(node);
}

function createDetailNode(record, project) {
  const node = cloneTemplate("#template-detail");
  node.querySelector(".detail-header").classList.add(record.status);
  setText(node, ".detail-status", record.status);
  setText(node, ".detail-title", record.title);
  setText(node, ".detail-project-name", project);
  setText(node, ".detail-date-value", record.date);
  setText(node, ".detail-source-file", record.source.file);
  setText(node, ".detail-source-line", record.source.line);

      const label = node.querySelector(".detail-label");
      if (record.label) {
        label.textContent = record.label;
      } else {
        label.remove();
      }

  appendDetailEta(node, record);
  appendMetadata(node, record);
  appendChecklist(node, record);

  const progressSlot = node.querySelector(".detail-progress-slot");
  const progress = createProgressNode(record);
  if (progress) progressSlot.append(progress);

  node.querySelector(".detail-body").innerHTML = markdown(bodyWithoutChecklist(record));
  return node;
}

function createBoardController(snapshot) {
  const search = document.querySelector("#search");
  const done = document.querySelector("#done");
  const hideEmpty = document.querySelector("#hide-empty");
  const error = document.querySelector("#error");
  const boardEmpty = document.querySelector("#board-empty");
  const board = document.querySelector("#board");
  const leftIndicator = document.querySelector("#board-indicator-left");
  const rightIndicator = document.querySelector("#board-indicator-right");
  const modal = document.querySelector("#modal");
  let limit = null;
  let currentColumns = [];

  function scrollByColumn(direction) {
    const positions = getColumnPositions();
    if (!positions.length) return;

    const epsilon = 8;
    const current = board.scrollLeft;
    let targetIndex = 0;

    if (direction > 0) {
      targetIndex = positions.findIndex((position) => position > current + epsilon);
      if (targetIndex === -1) targetIndex = positions.length - 1;
    } else {
      const exactIndex = positions.findIndex((position) => Math.abs(position - current) <= epsilon);
      if (exactIndex !== -1) {
        targetIndex = Math.max(0, exactIndex - 1);
      } else {
        targetIndex = positions.findIndex((position) => position > current + epsilon);
        if (targetIndex === -1) {
          targetIndex = positions.length - 1;
        } else {
          targetIndex = Math.max(0, targetIndex - 1);
        }
      }
    }

    board.scrollTo({
      left: positions[targetIndex],
      behavior: "smooth"
    });
  }

  function getColumnPositions() {
    const boardRect = board.getBoundingClientRect();
    return [...board.querySelectorAll(".column")]
      .filter((column) => column.offsetParent !== null)
      .map((column) => board.scrollLeft + column.getBoundingClientRect().left - boardRect.left);
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
    const content = createDetailNode(record, project);
    clearChildren(modal);
    modal.append(content);
    modal.classList.remove("dialog-tall");
    modal.classList.remove("BLOCKED", "WIP", "TODO", "DONE");
    modal.classList.add(record.status);
    modal.showModal();
    if (modal.scrollHeight + 16 > window.innerHeight) {
      modal.classList.add("dialog-tall");
    }

    requestAnimationFrame(() => {
      const top = modal.getBoundingClientRect().top;
      if (top < 16) {
        window.scrollBy({ top: top - 16, behavior: "smooth" });
      }
    });

    modal.querySelector("#close").onclick = () => modal.close();
  }

  function bindCards() {
    board.querySelectorAll(".card").forEach((card) => {
      card.onclick = () => {
        const project = currentColumns.find((item) => item.name === card.dataset.project);
        show(project.records[Number(card.dataset.index)], project.name);
      };
    });
  }

  function renderColumns() {
    clearChildren(board);
    currentColumns.forEach((project) => board.append(createColumnNode(project)));
  }

  function updateBoardState() {
    board.classList.toggle("hide-empty-projects", hideEmpty.checked);
    const visible = hideEmpty.checked
      ? currentColumns.filter((project) => project.records.length > 0)
      : currentColumns;
    boardEmpty.classList.toggle("visible", visible.length === 0);
  }

  function update() {
    try {
      error.textContent = "";
      currentColumns = snapshot.projects.map((project) => {
        return filterProjectRecords(project, getTerms(search), done.checked, limit);
      });
      renderColumns();
      updateBoardState();
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
    hideEmpty.onchange = update;
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
  const runtimeScript = script.replace("__PSTATUS_DATA_FILE__", config.dataFileName || "pstatus-data.json");
  return template
    .replaceAll("{{PAGE_TITLE}}", escapeReplacement(pageTitle))
    .replace("{{STYLES}}", `${css}\n${customCss}`)
    .replace("{{EMBEDDED_DATA}}", embeddedData)
    .replace("{{SCRIPT}}", runtimeScript);
}
