import { bayLengthsOf } from "./catalog.js";
import { toWorld } from "./engine.js";

const BAY_SLOTS = 8;

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
  bays: Array.from({ length: BAY_SLOTS }, (_, i) => `var(--bay-${i + 1})`),
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
  bays: [
    "#2a78d6",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#6250d6",
    "#e34948",
  ],
};

const f = (n) => Math.round(n * 1000) / 1000;
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const fmt = (m) => `${Number(m.toFixed(2))}`;
const dim = (m) => m.toFixed(2);

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
  `<text x="${f(p[0])}" y="${f(p[1])}" font-size="${f(size)}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="middle" font-family="IBM Plex Mono, ui-monospace, monospace"${extra}>${esc(s)}</text>`;

const polygon = (pts, fill, opacity, stroke) =>
  `<polygon points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="0.03"/>`;

function readableAngle(dir) {
  let angle = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return angle;
}

const rotated = (p, angle, extra = "") =>
  ` transform="rotate(${f(angle)} ${f(p[0])} ${f(p[1])})"${extra}`;

export function bayColorIndex(system) {
  const lengths = [...new Set(bayLengthsOf(system))].sort((a, b) => a - b);
  return (len) => {
    const i = lengths.findIndex((l) => Math.abs(l - len) < 1e-6);
    return (i < 0 ? 0 : i) % BAY_SLOTS;
  };
}

function ladderGlyph(w, u0, u1, vIn, vOut, ink) {
  const half = Math.min(0.2, (u1 - u0) / 8);
  const um = u1 - half - 0.1;
  const vMid = (vIn + vOut) / 2;
  const vA = vMid - 0.13;
  const vB = vMid + 0.13;
  const out = [
    line(w(um - half, vA), w(um + half, vA), ink.text, 0.035),
    line(w(um - half, vB), w(um + half, vB), ink.text, 0.035),
  ];
  for (let k = -1; k <= 1; k++) {
    const u = um + (half * k) / 1.5;
    out.push(line(w(u, vA), w(u, vB), ink.text, 0.03));
  }
  return out.join("");
}

function bayLabels(w, angle, r, i, vIn, vOut, ink) {
  const [u0, u1] = [r.us[i], r.us[i + 1]];
  const len = r.bays[i];
  const width = vOut - vIn;
  const size = Math.min(0.26, (len - 0.12) / (9 * 0.62), (width - 0.12) / 2.6);
  const centre = (u0 + u1) / 2;
  const vMid = (vIn + vOut) / 2;
  const a = w(centre, vMid + size * 0.6);
  const b = w(centre, vMid - size * 0.6);
  return (
    text(
      a,
      `${dim(width)}×${dim(len)}`,
      size,
      ink.text,
      "middle",
      rotated(a, angle, ' font-weight="600"'),
    ) +
    text(
      b,
      `${fmt(r.levels.topDeck)} m`,
      size * 0.9,
      ink.text,
      "middle",
      rotated(b, angle),
    )
  );
}

function planRun(r, place, ink, colorOf, out) {
  const deck = r.members.find((m) => m.type === "deck");
  const vIn = deck?.v0 ?? 0.3;
  const vOut = deck?.v1 ?? vIn + 1;
  const w = (u, v) => toWorld(place, [u, v, 0]);
  const angle = readableAngle(place.dir);
  out.push(line(w(0, 0), w(r.run.length, 0), ink.wall, 0.12));
  r.bays.forEach((len, i) => {
    const [u0, u1] = [r.us[i], r.us[i + 1]];
    const poly = [w(u0, vIn), w(u1, vIn), w(u1, vOut), w(u0, vOut)];
    out.push(polygon(poly, ink.bays[colorOf(len)], 0.32, ink.steel));
    if (r.ladderBays.has(i)) out.push(ladderGlyph(w, u0, u1, vIn, vOut, ink));
    out.push(bayLabels(w, angle, r, i, vIn, vOut, ink));
  });
  for (const u of r.us) {
    for (const v of [vIn, vOut]) {
      const p = w(u, v);
      out.push(
        `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.06" fill="${ink.steel}"/>`,
      );
    }
  }
  for (const m of r.members.filter(
    (x) => x.type === "tie" && x.a[2] === r.levels.tieLevels[0],
  )) {
    out.push(line(w(m.a[0], 0), w(m.a[0], vIn), ink.tie, 0.06));
  }
  const labelAt = w(r.us.at(-1) / 2, vOut + 0.55);
  out.push(
    text(
      labelAt,
      `${r.run.label} · ${fmt(r.scaffoldLength)} m · deck ${fmt(r.levels.topDeck)} m`,
      0.34,
      ink.text,
      "middle",
      rotated(labelAt, angle, ' font-weight="600"'),
    ),
  );
}

export function baySizes(built) {
  const counts = new Map();
  for (const r of built.runs) {
    const width = r.widthSpec.width;
    for (const len of r.bays) {
      const key = len.toFixed(2);
      const prev = counts.get(key) ?? { width, len, count: 0 };
      counts.set(key, { ...prev, count: prev.count + 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.len - a.len);
}

function legendRows(built, ink, colorOf, b) {
  const items = baySizes(built).map((s) => ({
    swatch: ink.bays[colorOf(s.len)],
    label: `${dim(s.width)}×${dim(s.len)}  ×${s.count}`,
  }));
  if (built.runs.some((r) => r.ladderBays.size > 0)) {
    items.push({ swatch: null, label: "Ladder hatch bay" });
  }
  const itemW = 3.4;
  const perRow = Math.max(1, Math.floor(b.w / itemW));
  const rowH = 0.6;
  const top = b.minY + b.h + 0.1;
  const out = items.map((it, k) => {
    const x = b.minX + 0.4 + (k % perRow) * itemW;
    const y = top + Math.floor(k / perRow) * rowH;
    const mark = it.swatch
      ? `<rect x="${f(x)}" y="${f(y - 0.17)}" width="0.5" height="0.34" fill="${it.swatch}" fill-opacity="0.6" stroke="${ink.steel}" stroke-width="0.02"/>`
      : line([x, y - 0.1], [x + 0.5, y - 0.1], ink.text, 0.035) +
        line([x, y + 0.1], [x + 0.5, y + 0.1], ink.text, 0.035) +
        [0.1, 0.25, 0.4]
          .map((d) => line([x + d, y - 0.1], [x + d, y + 0.1], ink.text, 0.03))
          .join("");
    return mark + text([x + 0.65, y], it.label, 0.26, ink.text, "start");
  });
  return {
    svg: out.join(""),
    height: Math.ceil(items.length / perRow) * rowH + 0.3,
  };
}

export function planSvg(built, ink = SCREEN_INK) {
  const out = [];
  const pts = [];
  const colorOf = bayColorIndex(built.system);
  built.runs.forEach((r, i) => {
    const place = built.places[i];
    const reach = (r.members.find((m) => m.type === "deck")?.v1 ?? 1.6) + 1.1;
    pts.push(
      toWorld(place, [0, 0, 0]),
      toWorld(place, [r.us.at(-1), reach, 0]),
      toWorld(place, [r.run.length, 0, 0]),
      toWorld(place, [0, reach, 0]),
    );
    out.push(`<g data-run-index="${i}">`);
    planRun(r, place, ink, colorOf, out);
    out.push("</g>");
  });
  if (pts.length === 0) return "";
  const b = bounds(pts, 0.6);
  const legend = legendRows(built, ink, colorOf, b);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(b.minX)} ${f(b.minY)} ${f(b.w)} ${f(b.h + legend.height)}" role="img" aria-label="Scaffold plan view">${out.join("")}${legend.svg}</svg>`;
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
