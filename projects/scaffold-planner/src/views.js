import { DUTY_CLASSES, SYSTEMS, getSystem } from "./catalog.js";
import { elevationSvg, planSvg } from "./drawing.js";
import {
  STATUS_TEXT,
  esc,
  field,
  money,
  opt,
  stepper,
  underlayOf,
} from "./ui.js";

export const TOOLS = [
  { id: "brace", label: "Brace" },
  { id: "ladder", label: "Ladder hatch" },
  { id: "stair", label: "Stair" },
  { id: "hop1", label: "Hop-up 1" },
  { id: "hop2", label: "Hop-up 2" },
  { id: "decks", label: "Board every lift" },
  { id: "reset", label: "Reset bay" },
];

function builderPlan(state) {
  const u = state.job.fromPlan && state.job.underlay;
  const body = u
    ? `<label class="check"><input type="checkbox" id="show-underlay" data-underlay${state.showUnderlay !== false ? " checked" : ""}/> Show the builder's plan under the scaffold</label>${u.local ? '<p class="note warn">This plan was not saved with the job and shows for this visit only.</p>' : ""}`
    : '<p class="note">Upload the builder\'s PDF or a photo of the plan, pick the floor plan page, and tap the outside corners of the house. The scaffold is mapped around it and the plan sits underneath.</p>';
  return `<div class="panel">
    <div class="panel-head"><h3>Builder's plan</h3><button class="btn small primary" data-act="import-plan">${u ? "Replace plan" : "Upload builder's plan"}</button></div>
    ${body}
  </div>`;
}

function toolbar(state) {
  const chips = TOOLS.map(
    (t) =>
      `<button type="button" class="tool" data-tool="${t.id}" aria-pressed="${state.tool === t.id}">${t.label}</button>`,
  ).join("");
  const edits = Object.keys(state.job.overrides ?? {}).length > 0;
  return `<div class="panel tools-panel">
    <div class="panel-head"><h3>Hand edit</h3>${edits ? '<button class="btn small" data-act="clear-edits">Clear hand edits</button>' : ""}</div>
    <div class="tools" role="toolbar" aria-label="Parts to place">${chips}</div>
    <p class="note">${state.tool ? `Tap bays on the plan to add or remove: <b>${TOOLS.find((t) => t.id === state.tool).label}</b>. Tap the part again when you're done.` : "Pick a part, then tap bays on the plan. You can also drag a part onto a bay. Tapping a bay again takes it off."}</p>
  </div>`;
}

function planView(state) {
  const { built } = state;
  const runIdx = Math.min(state.elevRun, built.runs.length - 1);
  const r = built.runs[runIdx];
  const checks = [
    ...built.notes,
    ...built.missing.map((x) => `No catalogue part for ${x}.`),
  ];
  const checkPanel = checks.length
    ? `<div class="panel checks"><h3>Check before you build</h3><ul>${checks.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`
    : "";
  return (
    checkPanel +
    builderPlan(state) +
    toolbar(state) +
    `<div class="panel">
    <div class="panel-head"><h2>Plan</h2><button class="btn small primary" data-act="pdf">PDF</button></div>
    <div class="drawing">${planSvg(built, undefined, { underlay: underlayOf(state) })}</div>
    <p class="note">Each bay shows width × length and the working deck height. Colours match bay sizes. Tap a side to see its elevation.</p>
  </div>
  <div class="panel" id="elevation">
    <div class="panel-head"><h2>Elevation</h2>
      <select id="elev-run" data-elev aria-label="Side to show">${built.runs.map((x, i) => opt(i, x.run.label, runIdx)).join("")}</select>
    </div>
    <div class="drawing elev">${elevationSvg(built, runIdx)}</div>
    <p class="note">Outer face. T marks tie levels. Deck heights are from the base plate.</p>
  </div>`
  );
}

function partsView(state) {
  const { built } = state;
  const rows = built.parts
    .map(
      (p) =>
        `<tr><td class="n big">${p.qty}</td><td>${esc(p.name)}<div class="sub mono">${esc(p.code)} · ${p.totalWeight} kg</div></td></tr>`,
    )
    .join("");
  const missing = built.missing.length
    ? `<p class="note warn">No catalogue part for: ${esc(built.missing.join(", "))}.</p>`
    : "";
  return `<div class="panel">
    <div class="panel-head"><h2>Parts · ${esc(built.system.name)}</h2>
      <div class="row"><button class="btn small" data-act="csv">CSV</button><button class="btn small primary" data-act="pdf">PDF</button></div>
    </div>
    ${missing}
    <div class="tablewrap"><table class="parts">
      <thead><tr><th class="n">Qty</th><th>Component</th></tr></thead>
      <tbody>${rows}<tr class="total"><td class="n big">${built.totalPieces}</td><td>pieces · ${(built.totalWeight / 1000).toFixed(2)} t</td></tr></tbody>
    </table></div>
    <p class="note">Each side is counted on its own. Corner bays, hop-ups, stair towers and sheeting are not included yet.</p>
  </div>`;
}

function quoteView(state) {
  const { quote, built, job } = state;
  const q = job.quote;
  const qn = (k, label, step) =>
    field(
      label,
      stepper({
        id: `q-${k}`,
        attrs: `data-q="${k}"`,
        value: q[k],
        step,
        label,
      }),
    );
  const line = (l, v, cls = "") =>
    `<tr class="${cls}"><td>${l}</td><td class="n">${money(v)}</td></tr>`;
  return `<div class="panel">
    <div class="panel-head"><h2>Quote</h2><button class="btn small primary" data-act="pdf">PDF</button></div>
    <div class="quote-total"><span>Total inc GST</span><b>${money(quote.total)}</b></div>
    <div class="grid2">
      ${qn("weeks", "Hire weeks", 1)}
      ${qn("cartage", "Cartage $ each way", 10)}
      ${qn("erectRate", "Erect $/m²", 0.5)}
      ${qn("dismantleRate", "Dismantle $/m²", 0.5)}
      ${qn("marginPct", "Margin %", 1)}
      ${qn("gstPct", "GST %", 1)}
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

function loadsView(state) {
  const { job, loads } = state;
  const rows = loads
    .map(
      (l) =>
        `<tr><td>${esc(l.label)}</td><td class="n"><b>${l.legKN}</b></td><td class="n">${l.utilisation === null ? "–" : `${Math.round(l.utilisation * 100)}%`}</td><td class="n">${l.bearingKPa}</td><td class="status-${l.status}">${STATUS_TEXT[l.status]}</td></tr>`,
    )
    .join("");
  const notes = loads.flatMap((l) => l.notes.map((n) => `${l.label}: ${n}`));
  const n = (key, label, step, placeholder = "") =>
    field(
      label,
      `<input type="number" inputmode="decimal" step="${step}" min="0" id="job-${key}" data-k="${key}" value="${esc(job[key])}" placeholder="${placeholder}"/>`,
    );
  return `<div class="panel">
    <div class="panel-head"><h2>Load check</h2></div>
    <div class="grid3">
      ${n("allowableLegKN", "Allowable leg load (kN)", 0.5, "From Scafom data")}
      ${n("groundBearingKPa", "Ground bearing (kPa)", 5, "Site value")}
      ${n("soleArea", "Sole board area (m²)", 0.005)}
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Side</th><th class="n">Leg kN</th><th class="n">Use</th><th class="n">Base kPa</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${notes.map((x) => `<p class="note warn">${esc(x)}</p>`).join("")}
    <p class="note">Worst standard per side: the weight of the column, ledgers, transoms, decks and toe boards it carries, plus ${DUTY_CLASSES[job.duty].label.toLowerCase()} (${DUTY_CLASSES[job.duty].kgPerBay} kg per bay) on ${job.loadedDecks} deck(s). Wind, tie forces, sheeting, hop-ups and loading bays are not included. Indicative only: a competent person must verify the design to AS/NZS 1576 and AS/NZS 4576.</p>
  </div>`;
}

function ratesView(state) {
  const sys = getSystem(
    state.job.system,
    state.settings.overrides?.[state.job.system] ?? {},
  );
  const hasList = sys.components.some((c) => c.listEur !== undefined);
  const rows = sys.components
    .map(
      (
        c,
      ) => `<tr><td>${esc(c.name)}<div class="sub mono">${esc(c.code)}</div></td>
      <td class="n"><input type="number" inputmode="decimal" step="0.1" id="rate-${esc(c.code)}-weight" data-rate="${esc(c.code)}" data-rf="weight" value="${c.weight}" aria-label="${esc(c.code)} weight"/></td>
      ${hasList ? `<td class="n mono">${c.listEur === undefined ? "–" : c.listEur.toFixed(2)}</td>` : ""}
      <td class="n"><input type="number" inputmode="decimal" step="0.05" id="rate-${esc(c.code)}-hire" data-rate="${esc(c.code)}" data-rf="hire" value="${c.hire}" aria-label="${esc(c.code)} hire rate"/></td></tr>`,
    )
    .join("");
  return `<div class="panel">
    <div class="panel-head"><h2>Rates · ${esc(sys.name)}</h2><button class="btn small" data-act="reset-rates">Reset</button></div>
    ${sys.source ? `<p class="note">Part numbers, weights and list prices: ${esc(sys.source)}. Hire rates start at 2% of list price per week. Enter your own rates. Changes apply to every job using this system.</p>` : '<p class="note warn">These start as example figures. Enter your Scafom and supplier weights and hire rates. Changes apply to every job using this system.</p>'}
    <div class="tablewrap"><table>
      <thead><tr><th>Component</th><th class="n">kg</th>${hasList ? '<th class="n">List €</th>' : ""}<th class="n">$/week</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function jobsView(state) {
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
        : `<button class="btn small primary" data-act="open" data-id="${esc(job.id)}">Open</button><button class="btn small" data-act="dup" data-id="${esc(job.id)}">Copy</button><button class="btn small danger" data-act="del" data-id="${esc(job.id)}" aria-label="Delete ${esc(job.name)}">✕</button>`;
      return `<div class="jobitem"><div><div>${esc(job.name)}${job.id === state.job.id ? " · open" : ""}</div><div class="meta">${esc(SYSTEMS[job.system]?.name)} · ${esc(job.client)} · ${esc(String(updatedAt).slice(0, 10))}</div></div><div class="row">${actions}</div></div>`;
    })
    .join("");
  return `<div class="panel">
    <div class="panel-head"><h2>Saved jobs</h2><button class="btn small primary" data-act="new">New job</button></div>
    <p class="note">${where} Jobs save as you edit.</p>
    <div class="joblist">${items || '<p class="note">No saved jobs yet. Start a new job and it appears here.</p>'}</div>
  </div>`;
}

export const VIEWS = {
  plan: planView,
  parts: partsView,
  quote: quoteView,
  loads: loadsView,
  rates: ratesView,
  jobs: jobsView,
};
