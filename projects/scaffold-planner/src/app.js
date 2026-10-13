import { DUTY_CLASSES, SYSTEMS, getSystem, lengthsOf } from "./catalog.js";
import { elevationSvg, planSvg } from "./drawing.js";
import { buildJob } from "./engine.js";
import { partsCsv, planPdf, saveFile, slug } from "./export.js";
import { conformToSystem, exampleJob, newId, newRun } from "./job.js";
import { jobLoads } from "./loads.js";
import { quoteJob } from "./quote.js";
import { openStore } from "./store.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const m = (n) => `${Number(Number(n).toFixed(2))} m`;
const DIR_LABEL = { E: "→ East", S: "↓ South", W: "← West", N: "↑ North" };

const state = {
  job: exampleJob(),
  tab: "plan",
  elevRun: 0,
  jobs: [],
  store: null,
  settings: { overrides: {} },
  confirmDelete: null,
  saved: "Not saved",
  view3d: null,
};

try {
  state.tab = localStorage.getItem("scaffold-planner.tab") || "plan";
} catch {
  state.tab = "plan";
}

function compute() {
  const job = {
    ...state.job,
    catalogOverrides: state.settings.overrides?.[state.job.system] ?? {},
  };
  try {
    state.built = buildJob(job);
    state.loads = jobLoads(state.built, job);
    state.quote = quoteJob(state.built, job.quote);
    state.error = null;
  } catch (e) {
    state.error = e.message;
  }
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

function worstStatus() {
  if (!state.loads) return "unchecked";
  if (state.loads.some((l) => l.status === "over")) return "over";
  if (state.loads.some((l) => l.status === "unchecked")) return "unchecked";
  return "ok";
}

const STATUS_TEXT = {
  ok: "Loads OK",
  over: "Over capacity",
  unchecked: "Loads not checked",
};

function renderStrip() {
  const { job, built, quote } = state;
  $("#strip-job").textContent = job.name || "Untitled job";
  $("#strip-system").textContent = SYSTEMS[job.system].name;
  $("#strip-example").hidden = !job.example;
  $("#strip-save").textContent = state.saved;
  if (!built || state.error) {
    $("#strip-totals").innerHTML =
      `<span class="status-over">${esc(state.error)}</span>`;
    return;
  }
  const status = worstStatus();
  $("#strip-totals").innerHTML = [
    `<span><b>${built.runs.reduce((a, r) => a + r.bays.length, 0)}</b> bays</span>`,
    `<span><b>${built.totalPieces}</b> pieces</span>`,
    `<span><b>${(built.totalWeight / 1000).toFixed(2)}</b> t</span>`,
    `<span><b>${built.faceArea}</b> m² face</span>`,
    `<span><b>${money(quote.total)}</b> inc GST</span>`,
    `<span class="chip ${status}">${STATUS_TEXT[status]}</span>`,
  ].join("");
}

const opt = (value, label, current) =>
  `<option value="${esc(value)}"${String(value) === String(current) ? " selected" : ""}>${esc(label)}</option>`;

function field(label, inner, cls = "", hint = "") {
  return `<label class="f ${cls}">${label}${inner}${hint ? `<span class="hint">${hint}</span>` : ""}</label>`;
}

const num = (key, value, step = "0.1", attrs = "") =>
  `<input type="number" inputmode="decimal" step="${step}" id="job-${key}" data-k="${key}" value="${esc(value)}" ${attrs}/>`;

function jobPanel() {
  const { job } = state;
  const sys = SYSTEMS[job.system];
  const ledgers = lengthsOf(sys, "ledger");
  return `<div class="panel">
    <div class="panel-head"><h2>Job</h2><button class="btn small" data-act="new">New job</button></div>
    <div class="grid2">
      ${field("Job name", `<input id="job-name" data-k="name" value="${esc(job.name)}"/>`, "span-all")}
      ${field("Client", `<input id="job-client" data-k="client" value="${esc(job.client)}"/>`)}
      ${field("Site", `<input id="job-site" data-k="site" value="${esc(job.site)}"/>`)}
    </div>
    <h3>System</h3>
    <div class="grid2">
      ${field(
        "Scaffold system",
        `<select id="job-system" data-k="system">${Object.values(SYSTEMS)
          .map((s) => opt(s.id, s.name, job.system))
          .join("")}</select>`,
        "span-all",
        "Parts and bay sizes come from this system only.",
      )}
      ${field("Width", `<select id="job-width" data-k="width" data-type="num">${sys.widths.map((w) => opt(w.width, `${w.width} m · ${w.boards} boards`, job.width)).join("")}</select>`)}
      ${field("Max bay", `<select id="job-maxBay" data-k="maxBay" data-type="num">${ledgers.map((l) => opt(l, `${l} m`, job.maxBay)).join("")}</select>`)}
      ${field("Lift height", `<select id="job-liftHeight" data-k="liftHeight" data-type="num">${sys.liftHeights.map((l) => opt(l, `${l} m`, job.liftHeight)).join("")}</select>`)}
      ${field("Gap to wall (m)", num("wallGap", job.wallGap, "0.05", 'min="0"'))}
    </div>
    <h3>Bracing, ties and duty</h3>
    <div class="grid2">
      ${field(
        "Duty class",
        `<select id="job-duty" data-k="duty">${Object.entries(DUTY_CLASSES)
          .map(([k, d]) =>
            opt(k, `${d.label} · ${d.kgPerBay} kg/bay`, job.duty),
          )
          .join("")}</select>`,
      )}
      ${field("Decks loaded at once", num("loadedDecks", job.loadedDecks, "1", 'min="1"'))}
      ${field("Face brace every", num("braceEvery", job.braceEvery, "1", 'min="0"'), "", "bays (0 = none)")}
      ${field("Ties every", num("tieEveryBays", job.tieEveryBays, "1", 'min="0"'), "", "standards (0 = none)")}
      ${field("Tie height spacing (m)", num("tieVertical", job.tieVertical, "0.5", 'min="0"'), "", "0 = freestanding")}
      <label class="check"><input type="checkbox" id="job-innerGuardrail" data-k="innerGuardrail"${job.innerGuardrail ? " checked" : ""}/> Inner guardrails</label>
    </div>
  </div>`;
}

function runCard(run, i, built) {
  const r = built?.runs[i];
  const meta = r
    ? `${r.bays.length} bays (${r.bays.join(" + ")}) = ${m(r.scaffoldLength)} · ${r.levels.lifts} lifts · top deck +${r.levels.topDeck} m`
    : "";
  const id = run.id;
  const rf = (key, inner, cls = "") => field(key, inner, cls);
  const rnum = (k, step, attrs = "") =>
    `<input type="number" inputmode="decimal" step="${step}" id="${id}-${k}" data-run="${id}" data-rk="${k}" value="${esc(run[k])}" ${attrs}/>`;
  return `<div class="run">
    <div class="run-head">
      <input aria-label="Run name" id="${id}-label" data-run="${id}" data-rk="label" value="${esc(run.label)}"/>
      <button class="btn small" data-act="up" data-id="${id}" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button>
      <button class="btn small danger" data-act="remove" data-id="${id}" aria-label="Remove run">✕</button>
    </div>
    <div class="grid3">
      ${rf(
        "Direction",
        `<select id="${id}-direction" data-run="${id}" data-rk="direction">${Object.entries(
          DIR_LABEL,
        )
          .map(([k, l]) => opt(k, l, run.direction))
          .join("")}</select>`,
      )}
      ${rf("Wall length (m)", rnum("length", "0.1", 'min="0.5"'))}
      ${rf("Work height (m)", rnum("height", "0.1", 'min="0.5"'))}
      ${rf("Boarded decks", `<select id="${id}-decks" data-run="${id}" data-rk="decks">${opt("top", "Top only", run.decks)}${opt("all", "Every lift", run.decks)}</select>`)}
      ${rf("Ladder bays", rnum("ladderBays", "1", 'min="0"'))}
      <label class="check"><input type="checkbox" id="${id}-flip" data-run="${id}" data-rk="flip"${run.flip ? " checked" : ""}/> Other side</label>
    </div>
    <div class="run-meta">${esc(meta)}</div>
  </div>`;
}

function runsPanel() {
  return `<div class="panel">
    <div class="panel-head"><h2>Runs</h2><button class="btn small primary" data-act="add">Add run</button></div>
    <p class="note">Each run starts where the last one ended. Enter the wall length and the height of the top working deck.</p>
    ${state.job.runs.map((r, i) => runCard(r, i, state.built)).join("")}
  </div>`;
}

function renderEdit() {
  $("#pane-edit").innerHTML = jobPanel() + runsPanel();
}

function refreshRunMeta() {
  document.querySelectorAll("#pane-edit .run").forEach((el, i) => {
    const r = state.built?.runs[i];
    if (!r) return;
    el.querySelector(".run-meta").textContent =
      `${r.bays.length} bays (${r.bays.join(" + ")}) = ${m(r.scaffoldLength)} · ${r.levels.lifts} lifts · top deck +${r.levels.topDeck} m`;
  });
}

function legend() {
  const item = (v, l) =>
    `<span><i style="background:var(${v})"></i>${l}</span>`;
  return `<div class="legend">${item("--steel", "Standards, ledgers, rails")}${item("--deck", "Working deck")}${item("--accent", "Ladder access bay")}${item("--brace", "Face brace")}${item("--tie", "Tie")}</div>`;
}

function planView() {
  const { built } = state;
  const runIdx = Math.min(state.elevRun, built.runs.length - 1);
  const r = built.runs[runIdx];
  return `<div class="panel">
    <div class="panel-head"><h2>Plan view</h2><button class="btn small primary" data-act="pdf">Export PDF</button></div>
    <div class="drawing">${planSvg(built)}</div>
    ${legend()}
  </div>
  <div class="panel">
    <div class="panel-head"><h2>Elevation</h2>
      <select id="elev-run" data-elev aria-label="Run to show">${built.runs.map((x, i) => opt(i, x.run.label, runIdx)).join("")}</select>
    </div>
    <div class="drawing elev">${elevationSvg(r)}</div>
    <p class="note">Outer face shown. T marks tie levels. Deck levels are measured from the base plate.</p>
  </div>`;
}

function partsView() {
  const { built } = state;
  const rows = built.parts
    .map(
      (p) =>
        `<tr><td class="mono">${esc(p.code)}</td><td>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n">${p.weight}</td><td class="n">${p.totalWeight}</td></tr>`,
    )
    .join("");
  const missing = built.missing.length
    ? `<p class="note warn">No catalogue part for: ${esc(built.missing.join(", "))}.</p>`
    : "";
  return `<div class="panel">
    <div class="panel-head"><h2>Parts list · ${esc(built.system.name)}</h2>
      <div class="row"><button class="btn small" data-act="csv">Export CSV</button><button class="btn small primary" data-act="pdf">Export PDF</button></div>
    </div>
    ${missing}
    <div class="tablewrap"><table>
      <thead><tr><th>Code</th><th>Description</th><th class="n">Qty</th><th class="n">Unit kg</th><th class="n">Total kg</th></tr></thead>
      <tbody>${rows}<tr class="total"><td></td><td>Total</td><td class="n">${built.totalPieces}</td><td></td><td class="n">${built.totalWeight}</td></tr></tbody>
    </table></div>
    <p class="note">Counts each run on its own. Corner bays, hop-ups, stair towers and sheeting are not included yet.</p>
  </div>`;
}

function quoteView() {
  const { quote, built, job } = state;
  const q = job.quote;
  const qn = (k, label, step, hint = "") =>
    field(
      label,
      `<input type="number" inputmode="decimal" step="${step}" id="q-${k}" data-q="${k}" value="${esc(q[k])}" min="0"/>`,
      "",
      hint,
    );
  const line = (l, v, cls = "") =>
    `<tr class="${cls}"><td>${l}</td><td class="n">${money(v)}</td></tr>`;
  return `<div class="panel">
    <div class="panel-head"><h2>Quote</h2><button class="btn small primary" data-act="pdf">Export PDF</button></div>
    <div class="grid3">
      ${qn("weeks", "Hire weeks", "1")}
      ${qn("erectRate", "Erect $/m²", "0.5")}
      ${qn("dismantleRate", "Dismantle $/m²", "0.5")}
      ${qn("cartage", "Cartage $ each way", "10")}
      ${qn("marginPct", "Margin %", "1")}
      ${qn("gstPct", "GST %", "1")}
    </div>
    <div class="tablewrap"><table><tbody>
      ${line(`Hire, ${quote.weeks} weeks`, quote.hire)}
      ${line(`Erect, ${built.faceArea} m²`, quote.erect)}
      ${line(`Dismantle, ${built.faceArea} m²`, quote.dismantle)}
      ${line("Cartage, delivery and return", quote.cartage)}
      ${line(`Margin ${q.marginPct}%`, quote.margin)}
      ${line("Total ex GST", quote.exGst, "total")}
      ${line("GST", quote.gst)}
      ${line("Total inc GST", quote.total, "total")}
    </tbody></table></div>
    <p class="note">Hire rates come from the Rates tab. Face area is scaffold length × (top deck + 1 m guardrail).</p>
  </div>`;
}

function loadsView() {
  const { job, loads } = state;
  const rows = loads
    .map(
      (l) =>
        `<tr><td>${esc(l.label)}</td><td class="n">${l.selfKN}</td><td class="n">${l.liveKN}</td><td class="n"><b>${l.legKN}</b></td><td class="n">${l.utilisation === null ? "–" : `${Math.round(l.utilisation * 100)}%`}</td><td class="n">${l.bearingKPa}</td><td class="n">${l.ties}</td><td class="status-${l.status}">${STATUS_TEXT[l.status]}</td></tr>`,
    )
    .join("");
  const notes = loads.flatMap((l) => l.notes.map((n) => `${l.label}: ${n}`));
  return `<div class="panel">
    <div class="panel-head"><h2>Load check</h2></div>
    <div class="grid3">
      ${field("Allowable leg load (kN)", num("allowableLegKN", job.allowableLegKN, "0.5", 'min="0" placeholder="From Scafom data"'), "", "Manufacturer's figure for this lift height")}
      ${field("Ground bearing (kPa)", num("groundBearingKPa", job.groundBearingKPa, "5", 'min="0" placeholder="Site value"'))}
      ${field("Sole board area (m²)", num("soleArea", job.soleArea, "0.005", 'min="0.01"'))}
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Run</th><th class="n">Self kN</th><th class="n">Live kN</th><th class="n">Leg kN</th><th class="n">Use</th><th class="n">Base kPa</th><th class="n">Ties</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${notes.map((n) => `<p class="note warn">${esc(n)}</p>`).join("")}
    <p class="note">Worst standard per run: self weight of the column, ledgers, transoms, decks and toe boards it carries, plus ${DUTY_CLASSES[job.duty].label.toLowerCase()} (${DUTY_CLASSES[job.duty].kgPerBay} kg per bay) on ${job.loadedDecks} deck(s), shared half to each adjacent standard. Wind, tie forces, sheeting, hop-ups and loading bays are not included. Indicative only: a competent person must verify the design to AS/NZS 1576 and AS/NZS 4576.</p>
  </div>`;
}

function ratesView() {
  const sys = getSystem(
    state.job.system,
    state.settings.overrides?.[state.job.system] ?? {},
  );
  const rows = sys.components
    .map(
      (c) => `<tr><td class="mono">${esc(c.code)}</td><td>${esc(c.name)}</td>
      <td class="n"><input type="number" step="0.1" id="rate-${esc(c.code)}-weight" data-rate="${esc(c.code)}" data-rf="weight" value="${c.weight}" aria-label="${esc(c.code)} weight"/></td>
      <td class="n"><input type="number" step="0.05" id="rate-${esc(c.code)}-hire" data-rate="${esc(c.code)}" data-rf="hire" value="${c.hire}" aria-label="${esc(c.code)} hire rate"/></td></tr>`,
    )
    .join("");
  return `<div class="panel">
    <div class="panel-head"><h2>Rates · ${esc(sys.name)}</h2><button class="btn small" data-act="reset-rates">Reset to defaults</button></div>
    <p class="note warn">Weights and hire rates start as example figures. Replace them with your Scafom and supplier catalogue values. Changes apply to every job using this system.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Code</th><th>Component</th><th class="n">kg</th><th class="n">$/week</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function jobsView() {
  const where =
    state.store?.mode === "cloud"
      ? "Saved jobs are shared with everyone who can edit this page."
      : "Saved jobs live in this browser only.";
  const items = [...state.jobs]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(({ job, updatedAt }) => {
      const confirming = state.confirmDelete === job.id;
      const actions = confirming
        ? `<span class="note">Delete this job?</span><button class="btn small danger" data-act="del-yes" data-id="${esc(job.id)}">Delete</button><button class="btn small" data-act="del-no">Keep</button>`
        : `<button class="btn small primary" data-act="open" data-id="${esc(job.id)}">Open</button><button class="btn small" data-act="dup" data-id="${esc(job.id)}">Duplicate</button><button class="btn small danger" data-act="del" data-id="${esc(job.id)}">Delete</button>`;
      return `<div class="jobitem"><div><div>${esc(job.name)}${job.id === state.job.id ? " · open" : ""}</div><div class="meta">${esc(SYSTEMS[job.system]?.name)} · ${esc(job.client)} · ${esc(String(updatedAt).slice(0, 10))}</div></div><div class="row">${actions}</div></div>`;
    })
    .join("");
  return `<div class="panel">
    <div class="panel-head"><h2>Jobs</h2><div class="row"><button class="btn small primary" data-act="new">New job</button><button class="btn small" data-act="save">Save now</button></div></div>
    <p class="note">${where} Jobs save automatically as you edit.</p>
    <div class="joblist">${items || '<p class="note">No saved jobs yet. Edit the example or start a new job and it saves here.</p>'}</div>
  </div>`;
}

async function show3d() {
  const pane = $("#pane-view");
  if (state.view3d && $("#view3d")) {
    state.view3d.update(state.built);
    return;
  }
  pane.innerHTML = `<div class="panel"><div class="panel-head"><h2>3D view</h2><span class="note">Drag to orbit · pinch or scroll to zoom</span></div><div id="view3d"><p class="note" style="padding:16px">Loading 3D view…</p></div>${legend()}</div>`;
  try {
    const { mount3d } = await import("./view3d.js");
    if (state.tab !== "3d") return;
    state.view3d = await mount3d($("#view3d"), state.built);
  } catch {
    $("#view3d").innerHTML =
      '<p class="note warn" style="padding:16px">The 3D viewer could not load. Check your connection and open this tab again.</p>';
    state.view3d = null;
  }
}

const VIEWS = {
  plan: planView,
  parts: partsView,
  quote: quoteView,
  loads: loadsView,
  rates: ratesView,
  jobs: jobsView,
};

const wide = () => globalThis.matchMedia?.("(min-width: 980px)").matches;

function renderView() {
  const pane = $("#pane-view");
  if (state.tab === "edit" && wide()) state.tab = "plan";
  document
    .querySelectorAll(".tabs button")
    .forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)),
    );
  $("#pane-edit").hidden = state.tab !== "edit";
  pane.hidden = state.tab === "edit";
  if (state.tab === "edit") return;
  if (state.error && state.tab !== "jobs" && state.tab !== "rates") {
    pane.innerHTML = `<div class="panel"><p class="status-over">${esc(state.error)}</p></div>`;
    return;
  }
  if (state.tab === "3d") {
    show3d();
    return;
  }
  state.view3d = null;
  pane.innerHTML = VIEWS[state.tab]();
}

function rerenderViewKeepingFocus() {
  const active = document.activeElement;
  const id = active?.id && $("#pane-view").contains(active) ? active.id : null;
  const caret =
    id && active.selectionStart !== undefined ? active.selectionStart : null;
  renderView();
  if (id) {
    const el = document.getElementById(id);
    el?.focus();
    if (caret !== null && el?.setSelectionRange && el.type !== "number")
      el.setSelectionRange(caret, caret);
  }
}

function update({ structural = false, persist = true } = {}) {
  compute();
  if (structural) renderEdit();
  else refreshRunMeta();
  renderStrip();
  if (state.tab === "3d" && state.view3d) state.view3d.update(state.built);
  else if (state.tab !== "edit") rerenderViewKeepingFocus();
  if (persist) scheduleSave();
}

function scheduleSave() {
  if (!state.store) return;
  state.saved = "Saving…";
  renderStrip();
  clearTimeout(scheduleSave.timer);
  scheduleSave.timer = setTimeout(saveNow, 900);
}

async function saveNow() {
  try {
    await state.store.saveJob(state.job);
    state.saved =
      state.store.mode === "cloud" ? "Saved" : "Saved on this device";
  } catch (e) {
    state.saved = "Not saved";
    toast(
      e?.code === "invalid_argument"
        ? "You can view this page but not save jobs."
        : "Save failed. Your edits are still on screen.",
    );
  }
  renderStrip();
}

function parseValue(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number" || el.dataset.type === "num")
    return el.value === "" ? "" : Number(el.value);
  return el.value;
}

const OPTIONAL = new Set([
  "allowableLegKN",
  "groundBearingKPa",
  "client",
  "site",
]);

function onJobInput(el) {
  const key = el.dataset.k;
  if (el.value === "" && !OPTIONAL.has(key) && el.type !== "checkbox") return;
  state.job = { ...state.job, [key]: parseValue(el), example: false };
  const structural = key === "system";
  if (structural) state.job = conformToSystem(state.job);
  update({ structural });
}

function onRunInput(el) {
  const { run: id, rk } = el.dataset;
  state.job = {
    ...state.job,
    example: false,
    runs: state.job.runs.map((r) =>
      r.id === id ? { ...r, [rk]: parseValue(el) } : r,
    ),
  };
  const valid = state.job.runs.every((r) => r.length > 0 && r.height > 0);
  if (valid) update();
}

let settingsTimer;
function onRateInput(el) {
  const sys = state.job.system;
  const code = el.dataset.rate;
  const overrides = state.settings.overrides ?? {};
  const forSys = overrides[sys] ?? {};
  state.settings = {
    ...state.settings,
    overrides: {
      ...overrides,
      [sys]: {
        ...forSys,
        [code]: { ...forSys[code], [el.dataset.rf]: Number(el.value) || 0 },
      },
    },
  };
  compute();
  renderStrip();
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(
    () =>
      state.store
        ?.saveSettings(state.settings)
        .catch(() => toast("Rates not saved.")),
    900,
  );
}

function onInput(e) {
  const el = e.target;
  if (el.dataset.k) onJobInput(el);
  else if (el.dataset.run) onRunInput(el);
  else if (el.dataset.q) {
    state.job = {
      ...state.job,
      quote: { ...state.job.quote, [el.dataset.q]: Number(el.value) || 0 },
    };
    update();
  } else if (el.dataset.rate) onRateInput(el);
  else if (el.matches("[data-elev]")) {
    state.elevRun = Number(el.value);
    renderView();
  }
}

function openJob(job) {
  state.job = conformToSystem(job);
  state.elevRun = 0;
  state.confirmDelete = null;
  state.saved = "Saved";
  update({ structural: true, persist: false });
}

async function exportPdf() {
  toast("Building PDF…");
  try {
    const blob = await planPdf(
      state.job,
      state.built,
      state.quote,
      state.loads,
    );
    await saveFile(`${slug(state.job.name)}-plan.pdf`, blob);
  } catch {
    toast("PDF export failed. Check your connection and try again.");
  }
}

const ACTIONS = {
  add: () => {
    const last = state.job.runs.at(-1);
    const next = { E: "S", S: "W", W: "N", N: "E" }[last?.direction ?? "N"];
    state.job = {
      ...state.job,
      runs: [
        ...state.job.runs,
        newRun({
          label: `Run ${state.job.runs.length + 1}`,
          direction: next,
          height: last?.height ?? 4,
        }),
      ],
    };
    update({ structural: true });
  },
  remove: (id) => {
    if (state.job.runs.length === 1)
      return toast("A job needs at least one run.");
    state.job = {
      ...state.job,
      runs: state.job.runs.filter((r) => r.id !== id),
    };
    update({ structural: true });
  },
  up: (id) => {
    const runs = [...state.job.runs];
    const i = runs.findIndex((r) => r.id === id);
    if (i > 0) [runs[i - 1], runs[i]] = [runs[i], runs[i - 1]];
    state.job = { ...state.job, runs };
    update({ structural: true });
  },
  new: () => {
    const fresh = exampleJob();
    openJob({
      ...fresh,
      example: false,
      name: "New job",
      client: "",
      site: "",
      runs: [newRun({ label: "Front", length: 10, height: 4 })],
    });
    state.saved = "Not saved";
    scheduleSave();
  },
  save: () => saveNow(),
  open: (id) => {
    const found = state.jobs.find((j) => j.job.id === id);
    if (found) openJob(found.job);
  },
  dup: (id) => {
    const found = state.jobs.find((j) => j.job.id === id);
    if (!found) return;
    openJob({
      ...found.job,
      id: newId("job"),
      name: `${found.job.name} (copy)`,
    });
    scheduleSave();
  },
  del: (id) => {
    state.confirmDelete = id;
    renderView();
  },
  "del-no": () => {
    state.confirmDelete = null;
    renderView();
  },
  "del-yes": async (id) => {
    state.confirmDelete = null;
    await state.store?.deleteJob(id).catch(() => toast("Delete failed."));
    toast("Job deleted");
  },
  csv: () =>
    saveFile(
      `${slug(state.job.name)}-parts.csv`,
      new Blob([partsCsv(state.built)], { type: "text/csv" }),
    ),
  pdf: () => exportPdf(),
  "reset-rates": () => {
    const { [state.job.system]: _dropped, ...rest } =
      state.settings.overrides ?? {};
    state.settings = { ...state.settings, overrides: rest };
    state.store
      ?.saveSettings(state.settings)
      .catch(() => toast("Rates not saved."));
    update({ persist: false });
  },
};

function onClick(e) {
  const tab = e.target.closest(".tabs button");
  if (tab) {
    state.tab = tab.dataset.tab;
    try {
      localStorage.setItem("scaffold-planner.tab", state.tab);
    } catch {
      /* per-viewer convenience only */
    }
    renderView();
    return;
  }
  const btn = e.target.closest("[data-act]");
  if (btn) ACTIONS[btn.dataset.act]?.(btn.dataset.id);
}

async function connectStore() {
  state.store = await openStore();
  try {
    const settings = await state.store.loadSettings();
    if (settings) state.settings = settings;
  } catch {
    /* defaults stay in place */
  }
  state.store.watchJobs(
    (jobs) => {
      state.jobs = jobs.filter((j) => j?.job?.id);
      if (state.tab === "jobs") renderView();
    },
    () => toast("Saved jobs could not be loaded."),
  );
  update({ persist: false });
}

document.addEventListener("input", onInput);
document.addEventListener("click", onClick);
compute();
renderEdit();
renderStrip();
renderView();
connectStore();
