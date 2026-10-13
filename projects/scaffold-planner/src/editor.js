import { DUTY_CLASSES, SYSTEMS, bayLengthsOf } from "./catalog.js";
import { planSvg } from "./drawing.js";
import { SHAPES, usesDepth } from "./job.js";
import { esc, field, metres, opt, seg, stepper, underlayOf } from "./ui.js";

const ICON_SIDES = {
  wall: ["M6 6H34"],
  L: ["M6 6H34", "M34 6V24"],
  U: ["M6 24V6", "M6 6H34", "M34 6V24"],
  rect: ["M6 6H34V24H6Z"],
  custom: ["M6 6H22", "M22 6V14H34", "M34 14V24"],
  plan: ["M12 4H28V26H12Z", "M15 10H25V20H15Z"],
};

const shapeIcon = (type) =>
  `<svg viewBox="0 0 40 30" aria-hidden="true"><rect x="9" y="9" width="22" height="12" class="ico-bldg"/>${ICON_SIDES[type].map((d) => `<path d="${d}" class="ico-scaf"/>`).join("")}</svg>`;

const HOPS = [
  { value: 0, label: "None" },
  { value: 1, label: "1 deck" },
  { value: 2, label: "2 decks" },
];

const DIRS = [
  { value: "N", label: "↑" },
  { value: "E", label: "→" },
  { value: "S", label: "↓" },
  { value: "W", label: "←" },
];

function jobPanel(job) {
  return `<div class="panel">
    <div class="panel-head"><h2>Job</h2><button class="btn small" data-act="new">New job</button></div>
    <div class="grid2">
      ${field("Job name", `<input id="job-name" data-k="name" value="${esc(job.name)}" enterkeyhint="next"/>`, "span-all")}
      ${field("Client", `<input id="job-client" data-k="client" value="${esc(job.client)}" enterkeyhint="next"/>`)}
      ${field("Site address", `<input id="job-site" data-k="site" value="${esc(job.site)}" enterkeyhint="done"/>`)}
    </div>
  </div>`;
}

function shapePicker(state) {
  const current =
    state.job.shape?.type ?? (state.job.fromPlan ? "plan" : "custom");
  const buttons = [
    ...Object.entries(SHAPES),
    ["plan", { label: "Builder's plan" }],
    ["custom", { label: "Custom" }],
  ]
    .map(
      ([type, def]) =>
        `<button type="button" class="shape-btn" data-act="${type === "plan" ? "import-plan" : "shape"}" data-id="${type}" aria-pressed="${type === current || (type === "plan" && !state.job.shape && Boolean(state.job.fromPlan))}">${shapeIcon(type)}<span>${def.label}</span></button>`,
    )
    .join("");
  const confirm = state.confirmShape
    ? `<div class="confirm"><span>Replace your custom sides with “${SHAPES[state.confirmShape].label}”?</span><button class="btn small primary" data-act="shape-yes">Replace</button><button class="btn small" data-act="shape-no">Cancel</button></div>`
    : "";
  return `<div class="shapes" role="group" aria-label="What are you scaffolding">${buttons}</div>${confirm}`;
}

function shapeInputs(shape) {
  const s = (key, label, step, min) =>
    field(
      label,
      stepper({
        id: `shape-${key}`,
        attrs: `data-shape="${key}"`,
        value: shape[key],
        step,
        min,
        label,
      }),
    );
  return `<div class="grid2">
    ${s("length", "Length (m)", 0.5, 0.5)}
    ${usesDepth(shape.type) ? s("depth", "Depth (m)", 0.5, 0.5) : ""}
    ${s("height", "Work height (m)", 0.5, 0.5)}
    ${s("ladders", "Ladder access bays", 1, 0)}
    ${s("stairs", "Stair towers", 1, 0)}
  </div>
  ${field("Hop-ups (inside, every working deck)", seg({ scope: "shape", key: "hopUps", current: Number(shape.hopUps) || 0, label: "Hop-ups", options: HOPS }))}
  ${field(
    "Boarded decks",
    seg({
      scope: "shape",
      key: "decks",
      current: shape.decks,
      label: "Boarded decks",
      options: [
        { value: "top", label: "Top deck only" },
        { value: "all", label: "Every lift" },
      ],
    }),
  )}`;
}

function systemInputs(job) {
  const sys = SYSTEMS[job.system];
  return `<div class="grid2">
    ${field("System", seg({ scope: "job", key: "system", current: job.system, label: "System", options: Object.values(SYSTEMS).map((s) => ({ value: s.id, label: s.name.replace("Scafom ", "") })) }), "span-all")}
    ${field("Width (m)", seg({ scope: "job", key: "width", current: job.width, label: "Width", options: sys.widths.map((w) => ({ value: w.width, label: w.width.toFixed(2) })) }))}
    ${field("Lift", seg({ scope: "job", key: "liftHeight", current: job.liftHeight, label: "Lift height", options: sys.liftHeights.map((l) => ({ value: l, label: `${l.toFixed(1)} m` })) }))}
  </div>`;
}

export function sideSummary(built) {
  if (!built) return "";
  return built.runs
    .map(
      (r) =>
        `<li><b>${esc(r.run.label)}</b><span>${metres(r.run.length)} wall</span><span>${r.bays.length} bays · ${metres(r.scaffoldLength)}</span><span>${r.levels.lifts} lifts · deck +${r.levels.topDeck}</span></li>`,
    )
    .join("");
}

function scaffoldPanel(state) {
  const { job } = state;
  const body = job.shape
    ? `${shapeInputs(job.shape)}<button class="linkish" data-act="customise">Different heights or odd walls? Edit each side</button>`
    : '<p class="note">Edit each side below. Each side starts where the last one ended.</p>';
  return `<div class="panel">
    <div class="panel-head"><h2>Scaffold</h2></div>
    ${systemInputs(job)}
    <h3>What are you scaffolding?</h3>
    ${shapePicker(state)}
    ${body}
    <ul class="sides" id="side-summary">${sideSummary(state.built)}</ul>
    <div class="drawing mini" id="mini-plan">${state.built ? planSvg(state.built, undefined, { underlay: underlayOf(state) }) : ""}</div>
  </div>`;
}

export function runMeta(r) {
  return `${r.bays.length} bays (${r.bays.join(" + ")}) = ${metres(r.scaffoldLength)} · ${r.levels.lifts} lifts · top deck +${r.levels.topDeck} m`;
}

function runCard(run, i, built) {
  const id = run.id;
  const rstep = (k, label, step, min) =>
    field(
      label,
      stepper({
        id: `${id}-${k}`,
        attrs: `data-run="${id}" data-rk="${k}"`,
        value: run[k],
        step,
        min,
        label,
      }),
    );
  return `<div class="run">
    <div class="run-head">
      <input aria-label="Side name" id="${id}-label" data-run="${id}" data-rk="label" value="${esc(run.label)}"/>
      <button class="btn small" data-act="up" data-id="${id}" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button>
      <button class="btn small danger" data-act="remove" data-id="${id}" aria-label="Remove side">✕</button>
    </div>
    ${run.angle === undefined ? field("Direction from the last side", seg({ scope: "run", key: "direction", id, current: run.direction, label: "Direction", options: DIRS })) : `<p class="note mono">From plan · ${Math.round(((run.angle % 360) + 360) % 360)}°</p>`}
    <div class="grid2">
      ${rstep("length", "Wall length (m)", 0.5, 0.5)}
      ${rstep("height", "Work height (m)", 0.5, 0.5)}
      ${rstep("ladderBays", "Ladder bays", 1, 0)}
      ${rstep("stairBays", "Stair towers", 1, 0)}
      ${field(
        "Decks",
        seg({
          scope: "run",
          key: "decks",
          id,
          current: run.decks,
          label: "Boarded decks",
          options: [
            { value: "top", label: "Top" },
            { value: "all", label: "Every lift" },
          ],
        }),
      )}
    </div>
    ${field("Hop-ups", seg({ scope: "run", key: "hopUps", id, current: Number(run.hopUps) || 0, label: "Hop-ups", options: HOPS }))}
    <label class="check"><input type="checkbox" id="${id}-flip" data-run="${id}" data-rk="flip"${run.flip ? " checked" : ""}/> Scaffold on the other side of this wall</label>
    <div class="run-meta">${built?.runs[i] ? esc(runMeta(built.runs[i])) : ""}</div>
  </div>`;
}

function sidesPanel(state) {
  return `<div class="panel">
    <div class="panel-head"><h2>Sides</h2><button class="btn small primary" data-act="add">Add side</button></div>
    ${state.job.runs.map((r, i) => runCard(r, i, state.built)).join("")}
  </div>`;
}

function morePanel(job, open) {
  const ledgers = bayLengthsOf(SYSTEMS[job.system]);
  const n = (key, label, step, hint = "") =>
    field(
      label,
      stepper({
        id: `job-${key}`,
        attrs: `data-k="${key}"`,
        value: job[key],
        step,
        min: 0,
        label,
      }),
      "",
      hint,
    );
  return `<details class="panel more" id="more-settings"${open ? " open" : ""}>
    <summary><h2>More settings</h2><span class="note">Bay size, bracing, ties, duty. Defaults suit most jobs.</span></summary>
    <div class="grid2">
      ${field("Largest bay", `<select id="job-maxBay" data-k="maxBay" data-type="num">${ledgers.map((l) => opt(l, `${l} m`, job.maxBay)).join("")}</select>`)}
      ${field(
        "Duty",
        `<select id="job-duty" data-k="duty">${Object.entries(DUTY_CLASSES)
          .map(([k, d]) => opt(k, `${d.label} (${d.kgPerBay} kg)`, job.duty))
          .join("")}</select>`,
      )}
      ${n("wallGap", "Gap to wall (m)", 0.05)}
      ${n("loadedDecks", "Decks loaded at once", 1)}
      ${n("braceEvery", "Brace every", 1, "bays, plus both end bays of each side · 0 = none")}
      ${n("tieEveryBays", "Tie every", 1, "standards · 0 = none")}
      ${n("tieVertical", "Tie height spacing (m)", 0.5, "0 = freestanding")}
      <label class="check"><input type="checkbox" id="job-innerGuardrail" data-k="innerGuardrail"${job.innerGuardrail ? " checked" : ""}/> Inner guardrails</label>
    </div>
  </details>`;
}

export function editorHtml(state) {
  return (
    jobPanel(state.job) +
    scaffoldPanel(state) +
    (state.job.shape ? "" : sidesPanel(state)) +
    morePanel(state.job, state.moreOpen)
  );
}
