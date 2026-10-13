export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export const money = (n) =>
  `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const metres = (n) => `${Number(Number(n).toFixed(2))} m`;

export const STATUS_TEXT = {
  ok: "Loads OK",
  over: "Over capacity",
  unchecked: "Loads not checked",
};

export const opt = (value, label, current) =>
  `<option value="${esc(value)}"${String(value) === String(current) ? " selected" : ""}>${esc(label)}</option>`;

export function field(label, inner, cls = "", hint = "") {
  return `<label class="f ${cls}">${label}${inner}${hint ? `<span class="hint">${hint}</span>` : ""}</label>`;
}

export function seg({ scope, key, id = "", options, current, label }) {
  const buttons = options
    .map(
      (o) =>
        `<button type="button" class="seg-btn" data-set="${scope}" data-key="${key}" data-id="${esc(id)}" data-v="${esc(o.value)}"${typeof o.value === "number" ? " data-num" : ""} aria-pressed="${String(o.value) === String(current)}">${o.label}</button>`,
    )
    .join("");
  return `<div class="seg" role="group" aria-label="${esc(label)}">${buttons}</div>`;
}

export function stepper({ id, attrs, value, step, min = 0, label }) {
  return `<div class="stepper">
    <button type="button" class="step" data-step="${-step}" data-for="${id}" aria-label="Less ${esc(label)}">−</button>
    <input type="number" inputmode="decimal" id="${id}" ${attrs} value="${esc(value)}" step="${step}" min="${min}" aria-label="${esc(label)}"/>
    <button type="button" class="step" data-step="${step}" data-for="${id}" aria-label="More ${esc(label)}">+</button>
  </div>`;
}

export function legend() {
  const item = (v, l) =>
    `<span><i style="background:var(${v})"></i>${l}</span>`;
  return `<div class="legend">${item("--steel", "Standards, ledgers, rails")}${item("--deck", "Working deck")}${item("--accent", "Ladder access bay")}${item("--brace", "Face brace")}${item("--tie", "Tie")}</div>`;
}
