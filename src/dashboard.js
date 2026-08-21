const script = String.raw`
const embedded = window.PSTATUS_EMBEDDED_DATA;
const loadData = () => embedded ? Promise.resolve(embedded) : fetch("pstatus.json").then(response => {
  if (!response.ok) throw new Error("Unable to load pstatus.json");
  return response.json();
});
const order = { BLOCKED: 0, WIP: 1, TODO: 2, DONE: 3 };
const esc = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const markdown = text => esc(text).replace(/\`([^\`]+)\`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
function regex(value) { try { return new RegExp(value, "i"); } catch { throw new Error("Invalid regular expression: " + value); } }
function matches(record, project, terms) {
  return terms.every(term => {
    const colon = term.indexOf(":"); const name = colon > 0 ? term.slice(0, colon).toLowerCase() : null;
    const pattern = regex(name ? term.slice(colon + 1) : term);
    if (name) { const fields = { project, status: record.status, title: record.title, date: record.date }; const value = name in fields ? fields[name] : record.metadata[name]; return (Array.isArray(value) ? value : [value]).filter(Boolean).some(value => pattern.test(value)); }
    return [project, record.status, record.title, record.body, record.date, ...Object.entries(record.metadata).flatMap(([key, value]) => [key, ...(Array.isArray(value) ? value : [value])])].some(value => pattern.test(value));
  });
}
function render(snapshot) {
  const search = document.querySelector("#search"), done = document.querySelector("#done"), error = document.querySelector("#error"), board = document.querySelector("#board"); let limit = null;
  document.querySelectorAll("[data-eta]").forEach(button => button.onclick = () => { limit = button.dataset.eta ? Number(button.dataset.eta) : null; document.querySelectorAll("[data-eta]").forEach(item => item.classList.toggle("active", item === button)); update(); });
  search.oninput = done.onchange = update;
  function update() { try { const terms = search.value.trim().split(/\s+/).filter(Boolean); error.textContent = ""; const columns = snapshot.projects.map(project => ({ ...project, records: project.records.filter(record => (done.checked || record.status !== "DONE") && (limit === null || record.derived.etaMinutes < limit) && matches(record, project.name, terms)).sort((a,b) => order[a.status] - order[b.status]) })); board.innerHTML = columns.map(project => '<section class="column"><h2>' + esc(project.name) + '</h2>' + (project.records.length ? project.records.map((record, index) => '<button class="card '+record.status+'" data-project="'+esc(project.name)+'" data-index="'+index+'"><b>'+esc(record.status)+':</b> '+esc(record.title)+(record.metadata.eta ? '<small>ETA: '+esc(Array.isArray(record.metadata.eta) ? record.metadata.eta.join(", ") : record.metadata.eta)+'</small>' : '')+'</button>').join("") : '<p class="empty">No matching items.</p>') + '</section>').join(""); board.querySelectorAll(".card").forEach(card => card.onclick = () => { const project = columns.find(item => item.name === card.dataset.project); show(project.records[Number(card.dataset.index)], project.name); }); } catch (exception) { error.textContent = exception.message; } }
  function show(record, project) { document.querySelector("#modal").innerHTML = '<button id="close" aria-label="Close details">&times;</button><h2>'+esc(record.title)+'</h2><p><b>Project:</b> '+esc(project)+'<br><b>Status:</b> '+esc(record.status)+'<br><b>Date:</b> '+esc(record.date)+'</p><dl>'+Object.entries(record.metadata).map(([key,value]) => '<dt>'+esc(key)+'</dt><dd>'+esc(Array.isArray(value) ? value.join(", ") : value)+'</dd>').join("")+'</dl><article>'+markdown(record.body)+'</article><p class="source"><b>Source:</b> '+esc(record.source.file)+':'+esc(record.source.line)+'</p>'; document.querySelector("#modal").showModal(); document.querySelector("#close").onclick = () => document.querySelector("#modal").close(); }
  update();
}
loadData().then(render).catch(error => document.querySelector("#error").textContent = error.message);
`;

export function dashboardHtml(snapshot = null) {
  const data = snapshot ? `<script>window.PSTATUS_EMBEDDED_DATA=${JSON.stringify(snapshot).replace(/</g, "\\u003c")}</script>` : "";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Status</title><style>body{font:16px system-ui;margin:2rem;background:#f4f1eb;color:#222}input,button{font:inherit;padding:.5rem}#controls{display:grid;gap:.75rem;max-width:50rem}.active{background:#263f7a;color:#fff}#error{color:#a00;min-height:1.5em}#board{display:flex;gap:1rem;overflow:auto;margin-top:1.5rem}.column{background:#fff;border-radius:.5rem;padding:1rem;box-sizing:border-box;flex:0 0 min(350px,calc(100vw - 4rem));max-width:350px}.card{display:block;width:100%;text-align:left;margin:.75rem 0;border:1px solid #c7c7c7;border-top:6px solid;padding:.75rem;background:#fff;border-radius:.4rem;box-shadow:0 1px 2px #0002}.BLOCKED{border-top-color:#d92d20}.WIP{border-top-color:#12b76a}.TODO{border-top-color:#fdb022}.DONE{border-top-color:#2e90fa}.card small{display:block;margin-top:.4rem}.empty{color:#667085;font-style:italic}dialog{position:relative;max-width:42rem;border:0;border-radius:.5rem;box-shadow:0 12px 32px #0005;padding:1.5rem}dialog::backdrop{background:#0008}#close{position:absolute;top:.5rem;right:.5rem;border:0;background:transparent;font-size:1.75rem;line-height:1;cursor:pointer}.source{font-size:.875rem;color:#667085}dt{font-weight:bold}dd{margin:0 0 .5rem}article{line-height:1.5}</style><main><h1>Project Status</h1><div id="controls"><input id="search" aria-label="Search" placeholder="Search"><div>ETA: <button data-eta="">Any</button> <button data-eta="60">&lt; 1 hour</button> <button data-eta="120">&lt; 2 hours</button> <button data-eta="240">&lt; 4 hours</button></div><label><input id="done" type="checkbox"> Show completed items</label><p id="error" role="alert"></p></div><div id="board"></div></main><dialog id="modal"></dialog>${data}<script>${script}</script></html>`;
}
