import { toWorld } from "./engine.js";

export const SCREEN_INK = {
  wall: "var(--ink)",
  steel: "var(--steel)",
  deck: "var(--deck)",
  hatch: "var(--accent)",
  brace: "var(--brace)",
  tie: "var(--tie)",
  text: "var(--ink)",
  muted: "var(--muted)",
  ground: "var(--muted)",
};

export const PRINT_INK = {
  wall: "#1d2733",
  steel: "#4f6478",
  deck: "#c9a227",
  hatch: "#d9822b",
  brace: "#2f6f9f",
  tie: "#8a3b8f",
  text: "#1d2733",
  muted: "#6b7785",
  ground: "#6b7785",
};

const f = (n) => Math.round(n * 1000) / 1000;
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const fmt = (m) => `${Number(m.toFixed(2))}`;

function bounds(points, pad) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return {
    minX,
    minY,
    w: Math.max(...xs) + pad - minX,
    h: Math.max(...ys) + pad - minY,
  };
}

const line = (a, b, stroke, width, extra = "") =>
  `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"${extra}/>`;

const text = (p, s, size, fill, anchor = "middle", extra = "") =>
  `<text x="${f(p[0])}" y="${f(p[1])}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="middle" font-family="IBM Plex Mono, ui-monospace, monospace"${extra}>${esc(s)}</text>`;

function planRun(r, place, ink, out) {
  const vIn = r.members.find((m) => m.type === "deck")?.v0 ?? 0.3;
  const vOut = r.members.find((m) => m.type === "deck")?.v1 ?? vIn + 1;
  const w = (u, v) => toWorld(place, [u, v, 0]);
  const end = r.us.at(-1);
  out.push(line(w(0, 0), w(r.run.length, 0), ink.wall, 0.12));
  r.bays.forEach((len, i) => {
    const [u0, u1] = [r.us[i], r.us[i + 1]];
    const poly = [w(u0, vIn), w(u1, vIn), w(u1, vOut), w(u0, vOut)];
    const hatch = r.ladderBays.has(i);
    out.push(
      `<polygon points="${poly.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" fill="${hatch ? ink.hatch : ink.deck}" fill-opacity="${hatch ? 0.75 : 0.25}" stroke="${ink.steel}" stroke-width="0.03"/>`,
    );
    out.push(text(w((u0 + u1) / 2, vOut + 0.45), fmt(len), 0.32, ink.text));
  });
  for (const u of r.us) {
    for (const v of [vIn, vOut]) {
      const p = w(u, v);
      out.push(
        `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.07" fill="${ink.steel}"/>`,
      );
    }
  }
  for (const m of r.members.filter(
    (x) => x.type === "tie" && x.a[2] === r.levels.tieLevels[0],
  )) {
    out.push(line(w(m.a[0], 0), w(m.a[0], vIn), ink.tie, 0.06));
  }
  const labelAt = w(end / 2, vOut + 1.05);
  let angle = (Math.atan2(place.dir[1], place.dir[0]) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  const rotate = ` font-weight="600" transform="rotate(${f(angle)} ${f(labelAt[0])} ${f(labelAt[1])})"`;
  out.push(
    text(
      labelAt,
      `${r.run.label} · ${fmt(r.scaffoldLength)} m`,
      0.38,
      ink.text,
      "middle",
      rotate,
    ),
  );
}

export function planSvg(built, ink = SCREEN_INK) {
  const out = [];
  const pts = [];
  built.runs.forEach((r, i) => {
    const place = built.places[i];
    const reach = (r.members.find((m) => m.type === "deck")?.v1 ?? 1.6) + 1.6;
    pts.push(
      toWorld(place, [0, 0, 0]),
      toWorld(place, [r.us.at(-1), reach, 0]),
    );
    pts.push(
      toWorld(place, [r.run.length, 0, 0]),
      toWorld(place, [0, reach, 0]),
    );
    planRun(r, place, ink, out);
  });
  if (pts.length === 0) return "";
  const b = bounds(pts, 0.6);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(b.minX)} ${f(b.minY)} ${f(b.w)} ${f(b.h)}" role="img" aria-label="Scaffold plan view">${out.join("")}</svg>`;
}

const STYLE = {
  standard: ["steel", 0.05],
  ledger: ["steel", 0.035],
  transom: ["steel", 0.035],
  rail: ["steel", 0.035],
  brace: ["brace", 0.035],
  tie: ["tie", 0.05],
};

export function elevationSvg(r, ink = SCREEN_INK) {
  const out = [];
  const width = r.us.at(-1);
  const top = r.standardPieces.reduce((a, b) => a + b, 0);
  const P = (u, z) => [u, top - z];
  const outer = r.members.find((m) => m.type === "deck")?.v1;
  out.push(line(P(-0.6, 0), P(width + 0.6, 0), ink.ground, 0.04));
  for (const m of r.members) {
    if (m.type === "deck") {
      out.push(
        line(P(m.u0, m.z), P(m.u1, m.z), m.hatch ? ink.hatch : ink.deck, 0.12),
      );
      continue;
    }
    if (m.type === "transom" || m.type === "tie") continue;
    if (Math.abs(m.a[1] - outer) > 1e-6) continue;
    const [key, w] = STYLE[m.type];
    out.push(line(P(m.a[0], m.a[2]), P(m.b[0], m.b[2]), ink[key], w));
  }
  for (const z of r.levels.tieLevels) {
    out.push(
      text(P(-0.35, z), "T", 0.3, ink.tie, "middle", ' font-weight="700"'),
    );
  }
  r.bays.forEach((len, i) => {
    out.push(
      text(P((r.us[i] + r.us[i + 1]) / 2, -0.45), fmt(len), 0.3, ink.text),
    );
  });
  for (const d of r.levels.deckLevels) {
    out.push(text(P(width + 0.25, d), `+${fmt(d)}`, 0.3, ink.muted, "start"));
  }
  const b = { minX: -1.0, minY: -0.5, w: width + 2.4, h: top + 1.5 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(b.minX)} ${f(b.minY)} ${f(b.w)} ${f(b.h)}" role="img" aria-label="Elevation of ${esc(r.run.label)}">${out.join("")}</svg>`;
}
