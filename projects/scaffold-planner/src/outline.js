const round3 = (n) => Math.round(n * 1000) / 1000;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

export const PT_M = 0.0254 / 72;

export function signedArea(points) {
  let a = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    a += p[0] * q[1] - q[0] * p[1];
  });
  return a / 2;
}

function intersect(p1, d1, p2, d2) {
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return add(p1, [d1[0] * t, d1[1] * t]);
}

function dedupe(points) {
  return points.filter(
    (p, i) => len(sub(p, points[(i + 1) % points.length])) > 1e-4,
  );
}

function dropCollinear(points) {
  return points.filter((p, i) => {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const a = sub(p, prev);
    const b = sub(next, p);
    return Math.abs(cross(a, b)) > 1e-6 * len(a) * len(b) || dot(a, b) < 0;
  });
}

function smoothOnce(points, minStep, sign) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const step = sub(b, a);
    if (len(step) >= minStep) continue;
    const p0 = points[(i - 1 + n) % n];
    const p3 = points[(i + 2) % n];
    const dPrev = sub(a, p0);
    const dNext = sub(p3, b);
    const out = points.slice();
    if (Math.abs(cross(dPrev, dNext)) < 1e-6 * len(dPrev) * len(dNext)) {
      const outward = [sign * dPrev[1], -sign * dPrev[0]];
      if (dot(step, outward) > 0) {
        out[(i - 1 + n) % n] = add(p0, step);
        out[i] = b;
      } else {
        out[(i + 2) % n] = sub(p3, step);
        out[(i + 1) % n] = a;
      }
    } else {
      const x = intersect(p0, dPrev, b, dNext);
      if (!x) continue;
      out[i] = x;
      out[(i + 1) % n] = x;
    }
    return dropCollinear(dedupe(out));
  }
  return null;
}

export function simplifyOutline(points, minStep = 0.5) {
  let pts = dropCollinear(dedupe(points.map((p) => [p[0], p[1]])));
  const sign = signedArea(pts) < 0 ? -1 : 1;
  for (let k = 0; k < 200 && pts.length > 3; k++) {
    const next = smoothOnce(pts, minStep, sign);
    if (!next) break;
    pts = next;
  }
  return pts;
}

export function squareUp(points, toleranceDeg = 3) {
  const out = points.map((p) => [p[0], p[1]]);
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const b = out[(i + 1) % out.length];
    const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    const snapped = Math.round(ang / 90) * 90;
    if (Math.abs(ang - snapped) <= toleranceDeg && i + 1 < out.length) {
      if (snapped % 180 === 0) out[i + 1] = [b[0], a[1]];
      else out[i + 1] = [a[0], b[1]];
    }
  }
  return out;
}

// Where smoothing pushed a wall out to the outer face, the house sits further
// back behind that part of the side. Returns per side the stretches (metres
// from the side's start) and how far back the traced wall is.
export function setbacksFor(traced, outline) {
  const sign = signedArea(outline) < 0 ? -1 : 1;
  const edges = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const L = len(sub(b, a));
    const e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    return { a, L, e, inward: [-sign * e[1], sign * e[0]] };
  });
  const hits = edges.map(() => []);
  traced.forEach((p, i) => {
    const q = traced[(i + 1) % traced.length];
    const n = Math.max(1, Math.ceil(len(sub(q, p)) / 0.05));
    for (let k = 0; k <= n; k++) {
      const x = add(p, [((q[0] - p[0]) * k) / n, ((q[1] - p[1]) * k) / n]);
      let best = -1;
      let bestD = Infinity;
      edges.forEach((ed, j) => {
        const r = sub(x, ed.a);
        const t = dot(r, ed.e);
        const d = dot(r, ed.inward);
        if (t < -0.01 || t > ed.L + 0.01 || d < -0.01 || d >= bestD) return;
        best = j;
        bestD = d;
      });
      if (best >= 0 && bestD > 0.05 && bestD < 1.5)
        hits[best].push([dot(sub(x, edges[best].a), edges[best].e), bestD]);
    }
  });
  return hits.map((list) => {
    const out = [];
    for (const [t, d] of list.sort((a, b) => a[0] - b[0])) {
      const last = out.at(-1);
      if (last && t - last.u1 <= 0.1) {
        last.u1 = t;
        last.depth = Math.max(last.depth, d);
      } else out.push({ u0: t, u1: t, depth: d });
    }
    return out
      .filter((s) => s.u1 - s.u0 > 0.05)
      .map((s) => ({
        u0: round3(s.u0),
        u1: round3(s.u1),
        depth: round3(s.depth),
      }));
  });
}

export function outlineToRuns(points, defaults, traced) {
  const setbacks = traced ? setbacksFor(traced, points) : [];
  const pts = points.map((p) => [round3(p[0]), round3(p[1])]);
  const minX = Math.min(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const norm = pts.map((p) => [round3(p[0] - minX), round3(p[1] - minY)]);
  return norm.map((p, i) => {
    const q = norm[(i + 1) % norm.length];
    const d = sub(q, p);
    return {
      id: `side-${i}`,
      label: `Side ${i + 1}`,
      start: p,
      angle: round3((Math.atan2(d[1], d[0]) * 180) / Math.PI),
      length: round3(len(d)),
      height: defaults.height,
      decks: defaults.decks,
      ladderBays: i === 0 ? defaults.ladders : 0,
      stairBays: 0,
      hopUps: defaults.hopUps ?? "auto",
      ...(setbacks[i]?.length ? { setbacks: setbacks[i] } : {}),
      flip: false,
    };
  });
}

export function scaleFromText(strings) {
  const joined = strings.join(" ");
  const near = joined.match(/SCALE[^0-9]{0,40}1\s*:\s*(\d{2,4})/i);
  if (near) return Number(near[1]);
  const any = joined.match(/\b1\s*:\s*(50|100|200|250|500)\b/);
  return any ? Number(any[1]) : null;
}

const TITLES = [
  "GROUND FLOOR PLAN",
  "FIRST FLOOR PLAN",
  "SECOND FLOOR PLAN",
  "UPPER FLOOR PLAN",
  "LOWER FLOOR PLAN",
  "FLOOR PLAN",
  "SITE PLAN",
  "ROOF PLAN",
  "ELEVATIONS",
  "ELEVATION",
  "SECTIONS",
  "SECTION",
];

export function titleFromText(strings) {
  const squashed = strings.join("").replace(/\s+/g, "").toUpperCase();
  return TITLES.find((t) => squashed.includes(t.replace(/\s+/g, ""))) ?? null;
}

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

function pathSegments(ops, coords, ctm, OPS, out) {
  let k = 0;
  let cur = null;
  let first = null;
  const lineTo = (p) => {
    if (cur) out.push([cur[0], cur[1], p[0], p[1]]);
    cur = p;
  };
  for (const op of ops) {
    if (op === OPS.moveTo) {
      cur = apply(ctm, coords[k], coords[k + 1]);
      first = cur;
      k += 2;
    } else if (op === OPS.lineTo) {
      lineTo(apply(ctm, coords[k], coords[k + 1]));
      k += 2;
    } else if (op === OPS.curveTo) {
      cur = apply(ctm, coords[k + 4], coords[k + 5]);
      k += 6;
    } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
      cur = apply(ctm, coords[k + 2], coords[k + 3]);
      k += 4;
    } else if (op === OPS.closePath) {
      if (cur && first) lineTo(first);
    } else if (op === OPS.rectangle) {
      const [x, y, w, h] = coords.slice(k, k + 4);
      const c = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ].map((p) => apply(ctm, p[0], p[1]));
      c.forEach((p, i) => {
        const q = c[(i + 1) % 4];
        out.push([p[0], p[1], q[0], q[1]]);
      });
      k += 4;
    }
  }
}

export function segmentsFromOperatorList(
  opList,
  OPS,
  viewportTransform,
  minLength = 2,
) {
  const out = [];
  let ctm = viewportTransform.slice();
  const stack = [];
  opList.fnArray.forEach((fn, i) => {
    const args = opList.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.constructPath)
      pathSegments(args[0], args[1], ctm, OPS, out);
  });
  return out.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) >= minLength);
}
