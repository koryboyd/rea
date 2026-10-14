import { ledgerColor } from "./colors.js";
import { toWorld } from "./engine.js";

export const SCREEN_INK = {
  wall: "var(--ink)",
  steel: "var(--steel)",
  deck: "var(--deck)",
  accent: "var(--accent)",
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
  accent: "#d9822b",
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

const polygon = (pts, fill, opacity, stroke, extra = "") =>
  `<polygon points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="0.03"${extra}/>`;

function readableAngle(dir) {
  let angle = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return angle;
}

const rotated = (p, angle, extra = "") =>
  ` transform="rotate(${f(angle)} ${f(p[0])} ${f(p[1])})"${extra}`;

// Ladder seen from above: it leans in towards the scaffold, so its stiles
// run across the tower.
function ladderGlyph(w, u, vA, vB, ink) {
  const out = [
    line(w(u - 0.2, vA), w(u - 0.2, vB), ink.text, 0.035),
    line(w(u + 0.2, vA), w(u + 0.2, vB), ink.text, 0.035),
  ];
  for (let v = vA + 0.12; v < vB; v += 0.18)
    out.push(line(w(u - 0.2, v), w(u + 0.2, v), ink.text, 0.03));
  return out.join("");
}

function bayLabels(w, angle, label, sub, u0, u1, vIn, vOut, ink) {
  const len = u1 - u0;
  const width = vOut - vIn;
  const size = Math.min(0.26, (len - 0.12) / (9 * 0.62), (width - 0.12) / 2.6);
  const centre = (u0 + u1) / 2;
  const vMid = (vIn + vOut) / 2;
  const a = w(centre, vMid + size * 0.6);
  const b = w(centre, vMid - size * 0.6);
  return (
    text(
      a,
      label,
      size,
      ink.text,
      "middle",
      rotated(a, angle, ' font-weight="600"'),
    ) + text(b, sub, size * 0.9, ink.text, "middle", rotated(b, angle))
  );
}

const quad = (w, u0, u1, v0, v1) => [
  w(u0, v0),
  w(u1, v0),
  w(u1, v1),
  w(u0, v1),
];

function planRun(r, place, ink, colorOf, out) {
  const W = r.widthSpec.width;
  const vIn = r.gap;
  const vOut = r.gap + W;
  const w = (u, v) => toWorld(place, [u, v, 0]);
  const angle = readableAngle(place.dir);
  const deck = `${fmt(r.levels.topDeck)} m`;
  const braceMark = (a, b) => line(a, b, ink.brace, 0.09);
  out.push(line(w(0, 0), w(r.run.length, 0), ink.wall, 0.12));
  r.bays.forEach((len, i) => {
    const [u0, u1] = [r.us[i], r.us[i + 1]];
    const hop = r.bayHops?.[i] ?? 0;
    const custom = r.custom?.has(i)
      ? ' stroke-dasharray="0.12 0.08" stroke-width="0.05"'
      : "";
    out.push(`<g data-bay="${i}">`);
    out.push(
      polygon(
        quad(w, u0, u1, vIn, vOut),
        colorOf(len),
        0.32,
        ink.steel,
        custom,
      ),
    );
    if (hop && !(i === 0 && r.layout.skipFirst)) {
      out.push(
        polygon(quad(w, u0, u1, vIn - hop, vIn), ink.muted, 0.22, ink.steel),
      );
    }
    if (r.bracedBays?.has(i))
      out.push(braceMark(w(u0 + 0.08, vOut), w(u1 - 0.08, vOut)));
    if (r.ladderBays.has(i)) {
      out.push(
        polygon(quad(w, u0, u1, vOut, vOut + W), ink.muted, 0.3, ink.steel),
      );
      for (const u of r.groundLadders ?? []) {
        if (u > u0 && u < u1)
          out.push(ladderGlyph(w, u, vOut + 0.1, vOut + W - 0.1, ink));
      }
      const mid = (u0 + u1) / 2;
      const side = (r.groundLadders ?? []).some((u) => u > u0 && u < mid);
      const [l0, l1] = side ? [mid - 0.2, u1] : [u0, mid + 0.2];
      out.push(
        bayLabels(w, angle, "LADDER", deck, l0, l1, vOut, vOut + W, ink),
      );
    }
    if (r.stairBays.has(i)) {
      out.push(
        polygon(quad(w, u0, u1, vOut, vOut + W), ink.accent, 0.45, ink.steel),
      );
      out.push(bayLabels(w, angle, "STAIR", deck, u0, u1, vOut, vOut + W, ink));
    }
    const sub = (r.bayDecks?.[i]?.length ?? 1) > 1 ? "every lift" : deck;
    out.push(
      bayLabels(w, angle, `${dim(W)}×${dim(len)}`, sub, u0, u1, vIn, vOut, ink),
    );
    out.push("</g>");
  });
  for (const [g0, g1] of r.exits ?? [])
    out.push(line(w(g0, vOut), w(g1, vOut), ink.accent, 0.12));
  if (r.layout.cornerBay) {
    const uE = r.us.at(-1);
    out.push('<g data-bay="corner">');
    out.push(
      polygon(quad(w, uE, uE + W, vIn, vOut), colorOf(W), 0.32, ink.steel),
    );
    if (r.cornerBraced) {
      out.push(braceMark(w(uE + 0.08, vOut), w(uE + W - 0.08, vOut)));
      out.push(braceMark(w(uE + W, vIn + 0.08), w(uE + W, vOut - 0.08)));
    }
    out.push(
      bayLabels(
        w,
        angle,
        `${dim(W)}×${dim(W)}`,
        "corner",
        uE,
        uE + W,
        vIn,
        vOut,
        ink,
      ),
    );
    out.push("</g>");
  }
  const lines = r.layout.cornerBay ? [...r.us, r.us.at(-1) + W] : r.us;
  lines.forEach((u, j) => {
    if (j === 0 && r.layout.skipFirst) return;
    for (const v of [vIn, vOut]) {
      const p = w(u, v);
      out.push(
        `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.06" fill="${ink.steel}"/>`,
      );
    }
  });
  const reach = vOut + (r.stairBays.size || r.ladderBays.size ? W : 0);
  const labelAt = w((r.us[0] + r.us.at(-1)) / 2, reach + 0.55);
  out.push(
    text(
      labelAt,
      `${r.run.label} · ${fmt(r.scaffoldLength)} m · deck ${deck}`,
      0.34,
      ink.text,
      "middle",
      rotated(labelAt, angle, ' font-weight="600"'),
    ),
  );
}

export function baySizes(built) {
  const counts = new Map();
  const bump = (width, len) => {
    const key = `${width.toFixed(2)}x${len.toFixed(2)}`;
    const prev = counts.get(key) ?? { width, len, count: 0 };
    counts.set(key, { ...prev, count: prev.count + 1 });
  };
  for (const r of built.runs) {
    const width = r.widthSpec.width;
    for (const len of r.bays) bump(width, len);
    if (r.layout.cornerBay) bump(width, width);
  }
  return [...counts.values()].sort((a, b) => b.len - a.len);
}

function legendRows(built, ink, colorOf, b) {
  const items = baySizes(built).map((s) => ({
    swatch: colorOf(s.len),
    label: `${dim(s.width)}×${dim(s.len)}  ×${s.count}`,
  }));
  if (built.runs.some((r) => r.bracedBays?.size > 0 || r.cornerBraced)) {
    items.push({ bar: ink.brace, label: "Braced face" });
  }
  if (built.runs.some((r) => r.ladderBays.size > 0))
    items.push({ glyph: "ladder", label: "Ladder tower" });
  if (built.runs.some((r) => r.exits?.length))
    items.push({ bar: ink.accent, label: "Safety gate" });
  if (built.runs.some((r) => r.stairBays.size > 0))
    items.push({ swatch: ink.accent, label: "Stair tower" });
  if (built.runs.some((r) => r.bayHops?.some((h) => h > 0)))
    items.push({ swatch: ink.muted, label: "Hop-up" });
  const itemW = 3.4;
  const perRow = Math.max(1, Math.floor(b.w / itemW));
  const rowH = 0.6;
  const top = b.minY + b.h + 0.1;
  const out = items.map((it, k) => {
    const x = b.minX + 0.4 + (k % perRow) * itemW;
    const y = top + Math.floor(k / perRow) * rowH;
    const mark = it.bar
      ? line([x, y], [x + 0.5, y], it.bar, 0.09)
      : it.glyph
        ? line([x, y - 0.1], [x + 0.5, y - 0.1], ink.text, 0.035) +
          line([x, y + 0.1], [x + 0.5, y + 0.1], ink.text, 0.035) +
          [0.1, 0.25, 0.4]
            .map((d) =>
              line([x + d, y - 0.1], [x + d, y + 0.1], ink.text, 0.03),
            )
            .join("")
        : `<rect x="${f(x)}" y="${f(y - 0.17)}" width="0.5" height="0.34" fill="${it.swatch}" fill-opacity="0.6" stroke="${ink.steel}" stroke-width="0.02"/>`;
    return mark + text([x + 0.65, y], it.label, 0.26, ink.text, "start");
  });
  return {
    svg: out.join(""),
    height: Math.ceil(items.length / perRow) * rowH + 0.3,
  };
}

export function planSvg(built, ink = SCREEN_INK, opts = {}) {
  const out = [];
  const u = opts.underlay;
  if (u?.url) {
    out.push(
      `<image href="${esc(u.url)}" x="${f(u.x)}" y="${f(u.y)}" width="${f(u.w)}" height="${f(u.h)}" preserveAspectRatio="none" opacity="0.55"/>`,
    );
  }
  const pts = [];
  const colorOf = ledgerColor;
  built.runs.forEach((r, i) => {
    const place = built.places[i];
    const W = r.widthSpec.width;
    const reach =
      r.gap + W + (r.stairBays.size || r.ladderBays.size ? W : 0) + 1.1;
    const uA = Math.min(0, r.us[0]);
    const uB = Math.max(
      r.run.length,
      r.us.at(-1) + (r.layout.cornerBay ? W : 0),
    );
    for (const [u, v] of [
      [uA, -0.4],
      [uB, -0.4],
      [uA, reach],
      [uB, reach],
    ]) {
      pts.push(toWorld(place, [u, v, 0]));
    }
    out.push(`<g data-run-index="${i}">`);
    planRun(r, place, ink, colorOf, out);
    out.push("</g>");
  });
  if (pts.length === 0) return "";
  const b = bounds(pts, 0.4);
  const legend = legendRows(built, ink, colorOf, b);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(b.minX)} ${f(b.minY)} ${f(b.w)} ${f(b.h + legend.height)}" role="img" aria-label="Scaffold plan view">${out.join("")}${legend.svg}</svg>`;
}

const STYLE = {
  standard: ["steel", 0.05],
  ledger: ["steel", 0.035],
  transom: ["steel", 0.035],
  brace: ["brace", 0.035],
  toeboard: ["deck", 0.06],
  stair: ["accent", 0.08],
  ladder: ["text", 0.04],
  accessladder: ["text", 0.04],
  gate: ["accent", 0.07],
  gatepost: ["steel", 0.05],
};

// Dimension chain through `stations`: tick marks, extension lines back to
// the scaffold and each span's length on the dimension line.
function dimChain(stations, at, from, axis, ink) {
  const pts = [...new Set(stations.map((s) => Math.round(s * 1000) / 1000))]
    .sort((a, b) => a - b)
    .map((s) => [s, at(s)]);
  if (pts.length < 2) return "";
  const out = [line(pts[0][1], pts.at(-1)[1], ink.text, 0.02)];
  for (const [, p] of pts) {
    const ext =
      axis === "h"
        ? line([p[0], from + 0.08], [p[0], p[1] + 0.1], ink.muted, 0.012)
        : line([from, p[1]], [p[0] - 0.1, p[1]], ink.muted, 0.012);
    out.push(
      ext,
      line(
        [p[0] - 0.07, p[1] + 0.07],
        [p[0] + 0.07, p[1] - 0.07],
        ink.text,
        0.03,
      ),
    );
  }
  pts.slice(1).forEach(([s, p], i) => {
    const [s0, q] = pts[i];
    const span = s - s0;
    const size = Math.min(0.24, Math.max(0.14, Math.abs(span) / 4));
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    out.push(
      axis === "h"
        ? text([mid[0], mid[1] - 0.16], dim(span), size, ink.text)
        : text(
            [mid[0] - 0.16, mid[1]],
            dim(span),
            size,
            ink.text,
            "middle",
            rotated([mid[0] - 0.16, mid[1]], -90),
          ),
    );
  });
  return out.join("");
}

export function elevationSvg(built, index, ink = SCREEN_INK) {
  const r = built.runs[index];
  const W = r.widthSpec.width;
  const vOut = r.gap + W;
  const comps = built.components.filter((c) => c.run === index && c.local);
  const top = Math.max(
    ...comps.map((c) => Math.max(c.local.a[2], c.local.b[2])),
    1,
  );
  const u0 = Math.min(
    ...comps.map((c) => Math.min(c.local.a[0], c.local.b[0])),
  );
  const u1 = Math.max(
    ...comps.map((c) => Math.max(c.local.a[0], c.local.b[0])),
  );
  const P = (u, z) => [u, top - z];
  const out = [line(P(u0 - 0.6, 0), P(u1 + 0.6, 0), ink.ground, 0.04)];
  const seen = new Set();
  for (const c of comps) {
    const { a, b } = c.local;
    if (c.kind === "plank") {
      const h = c.across ? (c.w ?? 0.3) / 2 : 0;
      const [ua, ub] = [Math.min(a[0], b[0]) - h, Math.max(a[0], b[0]) + h];
      const key = `${f(ua)}|${f(ub)}|${f(a[2])}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line(P(ua, a[2]), P(ub, b[2]), ink.deck, 0.1));
      continue;
    }
    if (c.kind === "gate") {
      out.push(
        `<rect x="${f(Math.min(a[0], b[0]))}" y="${f(top - a[2] - 0.9)}" width="${f(Math.abs(b[0] - a[0]))}" height="0.9" fill="none" stroke="${ink.accent}" stroke-width="0.05"/>`,
      );
      continue;
    }
    const style = STYLE[c.kind];
    if (!style) continue;
    const onFace = Math.abs(a[1] - vOut) < 1e-3 && Math.abs(b[1] - vOut) < 1e-3;
    if (!onFace && !["stair", "ladder", "accessladder"].includes(c.kind))
      continue;
    out.push(line(P(a[0], a[2]), P(b[0], b[2]), ink[style[0]], style[1]));
  }
  for (const z of r.levels.tieLevels) {
    out.push(
      text(P(u0 - 0.35, z), "T", 0.3, ink.tie, "middle", ' font-weight="700"'),
    );
  }
  const ends = r.layout.cornerBay ? [r.us.at(-1) + W] : [];
  const bayLines = [...r.us, ...ends];
  const guard = r.levels.topDeck + 1.0;
  const heights = [0, ...r.levels.liftLevels, guard];
  out.push(
    dimChain(bayLines, (s) => P(s, -0.55), P(u0, 0)[1], "h", ink),
    dimChain(
      [bayLines[0], bayLines.at(-1)],
      (s) => P(s, -1.1),
      P(u0, 0)[1],
      "h",
      ink,
    ),
    dimChain(heights, (z) => P(u0 - 0.8, z), u0 - 0.1, "v", ink),
    dimChain([0, guard], (z) => P(u0 - 1.4, z), u0 - 0.1, "v", ink),
  );
  const working = new Set(r.levels.deckLevels);
  for (const z of r.levels.liftLevels) {
    const deck = working.has(z);
    out.push(
      text(
        P(u1 + 0.25, z),
        deck ? `+${fmt(z)} deck` : `+${fmt(z)}`,
        0.26,
        deck ? ink.text : ink.muted,
        "start",
        deck ? ' font-weight="600"' : "",
      ),
    );
  }
  out.push(
    text(
      P(u1 + 0.25, guard),
      `+${fmt(guard)} guardrail`,
      0.26,
      ink.muted,
      "start",
    ),
    text(
      [(u0 + u1) / 2, -0.45],
      `${r.run.label} · outer face · ${r.levels.lifts} lifts`,
      0.32,
      ink.text,
      "middle",
      ' font-weight="600"',
    ),
  );
  const b = {
    minX: u0 - 1.9,
    minY: -0.8,
    w: u1 - u0 + 4.7,
    h: top + 2.3,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(b.minX)} ${f(b.minY)} ${f(b.w)} ${f(b.h)}" role="img" aria-label="Elevation of ${esc(r.run.label)}">${out.join("")}</svg>`;
}
