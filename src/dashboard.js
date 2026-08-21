import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const script = String.raw`
const embedded = window.PSTATUS_EMBEDDED_DATA;
const loadData = () => embedded ? Promise.resolve(embedded) : fetch("pstatus.json").then(response => {
  if (!response.ok) throw new Error("Unable to load pstatus.json");
  return response.json();
});
const order = { BLOCKED: 0, WIP: 1, TODO: 2, DONE: 3 };
const esc = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const markdown = text => esc(text).replace(/\`([^\`]+)\`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
const bodyWithoutChecklist = record => record.checklist?.length ? record.body.split("\n").filter(line => !/^(- \[[ xX]\] |\s+- \[[ xX]\] )/.test(line)).join("\n").trim() : record.body;
const checklistText = checklist => checklist.flatMap(item => [item.text, item.done ? "done" : "todo"]);
const checklistProgress = record => record.derived.checklistTotal ? '<div class="progress-wrap"><div class="progress-label">'+esc(record.derived.checklistCompleted)+'/'+esc(record.derived.checklistTotal)+' complete</div><div class="progress"><span style="width:'+esc(record.derived.checklistPercent)+'%"></span></div></div>' : '';
const checklistDetails = record => record.checklist?.length ? '<section class="checklist"><h3>Checklist</h3><ul>'+record.checklist.map(item => '<li class="'+(item.done ? 'done' : 'todo')+'"><span class="mark">'+(item.done ? '✅' : '⬜')+'</span> <span>'+esc(item.text)+'</span></li>').join('')+'</ul></section>' : '';
function regex(value) { try { return new RegExp(value, "i"); } catch { throw new Error("Invalid regular expression: " + value); } }
function matches(record, project, terms) {
  return terms.every(term => {
    const colon = term.indexOf(":"); const name = colon > 0 ? term.slice(0, colon).toLowerCase() : null;
    const pattern = regex(name ? term.slice(colon + 1) : term);
    if (name) { const fields = { project, status: record.status, title: record.title, date: record.date }; const value = name in fields ? fields[name] : record.metadata[name]; return (Array.isArray(value) ? value : [value]).filter(Boolean).some(value => pattern.test(value)); }
    return [project, record.status, record.title, record.body, record.date, ...Object.entries(record.metadata).flatMap(([key, value]) => [key, ...(Array.isArray(value) ? value : [value])]), ...checklistText(record.checklist || [])].some(value => pattern.test(value));
  });
}
function render(snapshot) {
  const search = document.querySelector("#search"), done = document.querySelector("#done"), error = document.querySelector("#error"), board = document.querySelector("#board"), leftIndicator = document.querySelector("#board-indicator-left"), rightIndicator = document.querySelector("#board-indicator-right"); let limit = null;
  function scrollByColumn(direction) {
    const column = board.querySelector(".column");
    if (!column) return;
    const styles = window.getComputedStyle(board);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    board.scrollBy({ left: direction * (column.getBoundingClientRect().width + gap), behavior: "smooth" });
  }
  function updateIndicator() {
    const left = board.scrollLeft > 8;
    const right = board.scrollLeft + board.clientWidth < board.scrollWidth - 8;
    leftIndicator.classList.toggle("visible", left);
    rightIndicator.classList.toggle("visible", right);
  }
  leftIndicator.addEventListener("click", () => scrollByColumn(-1));
  rightIndicator.addEventListener("click", () => scrollByColumn(1));
  document.querySelectorAll("[data-eta]").forEach(button => button.onclick = () => { limit = button.dataset.eta ? Number(button.dataset.eta) : null; document.querySelectorAll("[data-eta]").forEach(item => item.classList.toggle("active", item === button)); update(); });
  search.oninput = done.onchange = update;
  function update() { try { const terms = search.value.trim().split(/\s+/).filter(Boolean); error.textContent = ""; const columns = snapshot.projects.map(project => ({ ...project, records: project.records.filter(record => (done.checked || record.status !== "DONE") && (limit === null || record.derived.etaMinutes <= limit) && matches(record, project.name, terms)).sort((a,b) => order[a.status] - order[b.status]) })); board.innerHTML = columns.map(project => '<section class="column"><h2>' + esc(project.name) + '</h2>' + (project.records.length ? project.records.map((record, index) => '<button class="card '+record.status+'" data-project="'+esc(project.name)+'" data-index="'+index+'"><b>'+esc(record.status)+':</b> '+esc(record.title)+(record.metadata.eta ? '<small>ETA: '+esc(Array.isArray(record.metadata.eta) ? record.metadata.eta.join(", ") : record.metadata.eta)+'</small>' : '')+checklistProgress(record)+'</button>').join("") : '<p class="empty">No matching items.</p>') + '</section>').join(""); board.querySelectorAll(".card").forEach(card => card.onclick = () => { const project = columns.find(item => item.name === card.dataset.project); show(project.records[Number(card.dataset.index)], project.name); }); requestAnimationFrame(updateIndicator); } catch (exception) { error.textContent = exception.message; } }
  board.addEventListener("scroll", updateIndicator, { passive: true });
  window.addEventListener("resize", updateIndicator);
  function show(record, project) { document.querySelector("#modal").innerHTML = '<button id="close" aria-label="Close details">&times;</button><h2>'+esc(record.title)+'</h2><p><b>Project:</b> '+esc(project)+'<br><b>Status:</b> '+esc(record.status)+'<br><b>Date:</b> '+esc(record.date)+'</p>'+checklistProgress(record)+'<dl>'+Object.entries(record.metadata).map(([key,value]) => '<dt>'+esc(key)+'</dt><dd>'+esc(Array.isArray(value) ? value.join(", ") : value)+'</dd>').join("")+'</dl>'+checklistDetails(record)+'<article>'+markdown(bodyWithoutChecklist(record))+'</article><p class="source"><b>Source:</b> '+esc(record.source.file)+':'+esc(record.source.line)+'</p>'; document.querySelector("#modal").showModal(); document.querySelector("#close").onclick = () => document.querySelector("#modal").close(); }
  update();
}
loadData().then(render).catch(error => document.querySelector("#error").textContent = error.message);
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
