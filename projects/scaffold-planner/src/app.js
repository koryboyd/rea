import { SYSTEMS } from "./catalog.js";
import { planSvg } from "./drawing.js";
import { editorHtml, runMeta, sideSummary } from "./editor.js";
import { buildJob } from "./engine.js";
import { partsCsv, planPdf, saveFile, slug } from "./export.js";
import {
  blankJob,
  conformToSystem,
  exampleJob,
  newId,
  newRun,
  withShape,
} from "./job.js";
import { jobLoads } from "./loads.js";
import { quoteJob } from "./quote.js";
import { openStore } from "./store.js";
import { STATUS_TEXT, esc, money } from "./ui.js";
import { TOOLS, VIEWS } from "./views.js";

const $ = (sel) => document.querySelector(sel);
const wide = () => globalThis.matchMedia?.("(min-width: 980px)").matches;
const TAB_KEY = "scaffold-planner.tab";

const state = {
  job: exampleJob(),
  tab: wide() ? "plan" : "edit",
  elevRun: 0,
  jobs: [],
  store: null,
  settings: { overrides: {} },
  confirmDelete: null,
  confirmShape: null,
  tool: null,
  moreOpen: false,
  saved: "Not saved",
  view3d: null,
};

try {
  state.tab = localStorage.getItem(TAB_KEY) || state.tab;
} catch {
  /* per-viewer convenience only */
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
    `<span><b>${money(quote.total)}</b> inc GST</span>`,
    `<span class="chip ${status}">${STATUS_TEXT[status]}</span>`,
  ].join("");
}

function renderEdit() {
  $("#pane-edit").innerHTML = editorHtml(state);
}

function refreshEditor() {
  const summary = $("#side-summary");
  if (summary) summary.innerHTML = sideSummary(state.built);
  const mini = $("#mini-plan");
  if (mini && state.built) mini.innerHTML = planSvg(state.built);
  document.querySelectorAll("#pane-edit .run").forEach((el, i) => {
    const r = state.built?.runs[i];
    if (r) el.querySelector(".run-meta").textContent = runMeta(r);
  });
}

async function show3d() {
  const pane = $("#pane-view");
  if (state.view3d && $("#view3d")) {
    state.view3d.update(state.built);
    $("#legend3d").innerHTML = state.legend3d?.(state.built) ?? "";
    return;
  }
  pane.innerHTML = `<div class="panel"><div class="panel-head"><h2>3D</h2><span class="note">Drag to turn · pinch to zoom</span></div><div id="view3d"><p class="note" style="padding:16px">Loading 3D view…</p></div><div id="legend3d"></div></div>`;
  try {
    const { mount3d, legend3d } = await import("./view3d.js");
    if (state.tab !== "3d") return;
    state.view3d = await mount3d($("#view3d"), state.built);
    state.legend3d = legend3d;
    $("#legend3d").innerHTML = legend3d(state.built);
  } catch {
    $("#view3d").innerHTML =
      '<p class="note warn" style="padding:16px">The 3D viewer could not load. Check your connection and open this tab again.</p>';
    state.view3d = null;
  }
}

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
  pane.innerHTML = VIEWS[state.tab](state);
}

function rerenderViewKeepingFocus() {
  const active = document.activeElement;
  const id = active?.id && $("#pane-view").contains(active) ? active.id : null;
  renderView();
  if (id) document.getElementById(id)?.focus();
}

function update({ structural = false, persist = true } = {}) {
  compute();
  if (structural) renderEdit();
  else refreshEditor();
  renderStrip();
  if (state.tab === "3d" && state.view3d) {
    state.view3d.update(state.built);
    const legendEl = $("#legend3d");
    if (legendEl) legendEl.innerHTML = state.legend3d?.(state.built) ?? "";
  } else if (state.tab !== "edit") rerenderViewKeepingFocus();
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
  "name",
]);

function setJob(next, opts) {
  state.job = { ...next, example: false };
  update(opts);
}

function onJobInput(el) {
  const key = el.dataset.k;
  if (el.value === "" && !OPTIONAL.has(key) && el.type !== "checkbox") return;
  setJob({ ...state.job, [key]: parseValue(el) });
}

function onShapeInput(el) {
  if (el.value === "" || Number(el.value) < Number(el.min || 0)) return;
  const shape = { ...state.job.shape, [el.dataset.shape]: Number(el.value) };
  setJob(withShape(state.job, shape));
}

function onRunInput(el) {
  const { run: id, rk } = el.dataset;
  if (el.type === "number" && el.value === "") return;
  const runs = state.job.runs.map((r) =>
    r.id === id ? { ...r, [rk]: parseValue(el) } : r,
  );
  if (runs.every((r) => r.length > 0 && r.height > 0))
    setJob({ ...state.job, runs });
}

function onQuoteInput(el) {
  if (el.value === "") return;
  setJob({
    ...state.job,
    quote: { ...state.job.quote, [el.dataset.q]: Number(el.value) || 0 },
  });
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
  else if (el.dataset.shape) onShapeInput(el);
  else if (el.dataset.run) onRunInput(el);
  else if (el.dataset.q) onQuoteInput(el);
  else if (el.dataset.rate) onRateInput(el);
  else if (el.matches("[data-elev]")) {
    state.elevRun = Number(el.value);
    renderView();
  }
}

function onSegment(btn) {
  const { set, key, id } = btn.dataset;
  const value = "num" in btn.dataset ? Number(btn.dataset.v) : btn.dataset.v;
  if (set === "job") {
    const next = { ...state.job, [key]: value };
    if (key === "system") next.braceEvery = undefined;
    setJob(key === "system" ? conformToSystem(next) : next, {
      structural: true,
    });
  } else if (set === "shape") {
    setJob(withShape(state.job, { ...state.job.shape, [key]: value }), {
      structural: true,
    });
  } else if (set === "run") {
    const runs = state.job.runs.map((r) =>
      r.id === id ? { ...r, [key]: value } : r,
    );
    setJob({ ...state.job, runs }, { structural: true });
  }
}

function onStep(btn) {
  const input = document.getElementById(btn.dataset.for);
  if (!input) return;
  const step = Number(btn.dataset.step);
  const min = Number(input.min || 0);
  const next = Math.max(
    min,
    Math.round(((Number(input.value) || 0) + step) * 100) / 100,
  );
  input.value = String(next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function openJob(job) {
  state.job = conformToSystem(job);
  state.elevRun = 0;
  state.confirmDelete = null;
  state.confirmShape = null;
  state.saved = "Saved";
  update({ structural: true, persist: false });
}

function selectTab(tab) {
  state.tab = tab;
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* per-viewer convenience only */
  }
  renderView();
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

function shapeFromRuns(type) {
  const [first, second] = state.job.runs;
  return {
    type,
    length: first?.length ?? 10,
    depth: second?.length ?? 8,
    height: first?.height ?? 4,
    decks: first?.decks ?? "top",
    ladders: 1,
  };
}

const ACTIONS = {
  shape: (type) => {
    if (type === "custom") return ACTIONS.customise();
    if (state.job.shape) {
      setJob(withShape(state.job, { ...state.job.shape, type }), {
        structural: true,
      });
      return;
    }
    state.confirmShape = type;
    renderEdit();
  },
  "shape-yes": () => {
    const type = state.confirmShape;
    state.confirmShape = null;
    setJob(withShape(state.job, shapeFromRuns(type)), { structural: true });
  },
  "shape-no": () => {
    state.confirmShape = null;
    renderEdit();
  },
  "import-plan": async () => {
    const { openPlanImport } = await import("./planimport.js");
    const shape = state.job.shape ?? {};
    openPlanImport({
      defaults: {
        height: shape.height ?? state.job.runs[0]?.height ?? 4,
        decks: shape.decks ?? "top",
        ladders: 1,
        hopUps: shape.hopUps ?? 0,
      },
      onDone: (runs) => {
        setJob(
          { ...state.job, shape: null, closed: true, fromPlan: true, runs },
          { structural: true },
        );
        toast(`Mapped ${runs.length} sides from the plan`);
      },
    });
  },
  customise: () => {
    if (!state.job.shape) return;
    setJob({ ...state.job, shape: null }, { structural: true });
  },
  add: () => {
    const last = state.job.runs.at(-1);
    const next = { E: "S", S: "W", W: "N", N: "E" }[last?.direction ?? "N"];
    const run = newRun({
      label: `Side ${state.job.runs.length + 1}`,
      direction: next,
      height: last?.height ?? 4,
    });
    setJob(
      { ...state.job, runs: [...state.job.runs, run] },
      { structural: true },
    );
  },
  remove: (id) => {
    if (state.job.runs.length === 1)
      return toast("A job needs at least one side.");
    setJob(
      { ...state.job, runs: state.job.runs.filter((r) => r.id !== id) },
      { structural: true },
    );
  },
  up: (id) => {
    const runs = [...state.job.runs];
    const i = runs.findIndex((r) => r.id === id);
    if (i > 0) [runs[i - 1], runs[i]] = [runs[i], runs[i - 1]];
    setJob({ ...state.job, runs }, { structural: true });
  },
  new: () => {
    openJob(blankJob(exampleJob()));
    state.saved = "Not saved";
    scheduleSave();
    if (!wide()) selectTab("edit");
    $("#job-name")?.select();
  },
  save: () => saveNow(),
  open: (id) => {
    const found = state.jobs.find((j) => j.job.id === id);
    if (!found) return;
    openJob(found.job);
    if (!wide()) selectTab("edit");
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
  "clear-edits": () => {
    setJob({ ...state.job, overrides: {} }, { structural: false });
    toast("Hand edits cleared");
  },
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

function hopDecks(width) {
  return (
    state.built.system.hopUps?.find((h) => Math.abs(h.bracket - width) < 1e-6)
      ?.decks ?? 0
  );
}

function editBay(o, r, i, tool) {
  const b = { ...o.bays?.[i] };
  if (tool === "brace") b.brace = !r.bracedBays.has(i);
  if (tool === "ladder") {
    b.ladder = !r.ladderBays.has(i);
    if (b.ladder) b.stair = false;
  }
  if (tool === "stair") {
    b.stair = !r.stairBays.has(i);
    if (b.stair) b.ladder = false;
  }
  if (tool === "hop1") b.hopUps = hopDecks(r.bayHops[i]) === 1 ? 0 : 1;
  if (tool === "hop2") b.hopUps = hopDecks(r.bayHops[i]) === 2 ? 0 : 2;
  if (tool === "decks") b.decks = r.bayDecks[i].length > 1 ? "top" : "all";
  return b;
}

function applyTool(runIndex, key, tool) {
  const r = state.built?.runs[runIndex];
  const run = state.job.runs[runIndex];
  if (!r || !run) return;
  const overrides = structuredClone(state.job.overrides ?? {});
  const o = (overrides[run.id] ??= {});
  o.bays ??= {};
  if (key === "corner") {
    if (tool === "reset") delete o.corner;
    else if (tool === "brace") o.corner = { brace: !r.cornerBraced };
    else return toast("Corner bays take braces only.");
  } else if (tool === "reset") {
    delete o.bays[key];
  } else {
    o.bays[key] = editBay(o, r, Number(key), tool);
  }
  setJob({ ...state.job, overrides }, { structural: false });
  const before = r.stairBays.size + r.ladderBays.size;
  const after = state.built.runs[runIndex];
  if (
    (tool === "stair" || tool === "ladder") &&
    after &&
    after.stairBays.size + after.ladderBays.size === before
  ) {
    toast(
      tool === "stair"
        ? "A stair needs a 2.57 m bay."
        : "A ladder hatch needs a 2.57 or 3.07 m bay.",
    );
  }
}

function bayTarget(node) {
  const bay = node?.closest?.("[data-bay]");
  const side = node?.closest?.("[data-run-index]");
  if (!bay || !side) return null;
  return { runIndex: Number(side.dataset.runIndex), key: bay.dataset.bay };
}

const drag = {
  tool: null,
  ghost: null,
  moved: false,
  x0: 0,
  y0: 0,
  suppress: false,
};

function onPointerDown(e) {
  const chip = e.target.closest("[data-tool]");
  if (!chip) return;
  drag.tool = chip.dataset.tool;
  drag.moved = false;
  drag.x0 = e.clientX;
  drag.y0 = e.clientY;
}

function onPointerMove(e) {
  if (!drag.tool) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8)
    return;
  drag.moved = true;
  if (!drag.ghost) {
    drag.ghost = Object.assign(document.createElement("div"), {
      className: "drag-ghost",
    });
    drag.ghost.textContent = TOOLS.find((t) => t.id === drag.tool)?.label ?? "";
    document.body.append(drag.ghost);
  }
  drag.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
}

function onPointerUp(e) {
  if (!drag.tool) return;
  if (drag.moved) {
    drag.suppress = true;
    setTimeout(() => (drag.suppress = false), 0);
    const target = bayTarget(document.elementFromPoint(e.clientX, e.clientY));
    if (target) applyTool(target.runIndex, target.key, drag.tool);
  }
  drag.ghost?.remove();
  Object.assign(drag, { tool: null, ghost: null, moved: false });
}

function onClick(e) {
  if (drag.suppress) {
    drag.suppress = false;
    return;
  }
  const chip = e.target.closest("[data-tool]");
  if (chip) {
    state.tool = state.tool === chip.dataset.tool ? null : chip.dataset.tool;
    renderView();
    return;
  }
  if (state.tool && state.tab === "plan") {
    const target = bayTarget(e.target);
    if (target) return applyTool(target.runIndex, target.key, state.tool);
  }
  const tab = e.target.closest(".tabs button");
  if (tab) return selectTab(tab.dataset.tab);
  const segBtn = e.target.closest("[data-set]");
  if (segBtn) return onSegment(segBtn);
  const stepBtn = e.target.closest("[data-step]");
  if (stepBtn) return onStep(stepBtn);
  const side = e.target.closest("[data-run-index]");
  if (side && state.tab === "plan") {
    state.elevRun = Number(side.dataset.runIndex);
    renderView();
    $("#elevation")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const btn = e.target.closest("[data-act]");
  if (btn) ACTIONS[btn.dataset.act]?.(btn.dataset.id);
}

function onToggle(e) {
  if (e.target.id === "more-settings") state.moreOpen = e.target.open;
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
document.addEventListener("pointerdown", onPointerDown);
document.addEventListener("pointermove", onPointerMove);
document.addEventListener("pointerup", onPointerUp);
document.addEventListener("pointercancel", () => {
  drag.ghost?.remove();
  Object.assign(drag, { tool: null, ghost: null, moved: false });
});
document.addEventListener("toggle", onToggle, true);
compute();
renderEdit();
renderStrip();
renderView();
connectStore();
