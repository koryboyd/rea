import { bayLengthsOf, findComponent, getSystem, hasKind } from "./catalog.js";

const GRID = 0.01;
const EPS = 1e-6;
const toUnits = (m) => Math.round(m / GRID);
const round2 = (n) => Math.round(n * 100) / 100;
const near = (a, b, tol = 1e-3) => Math.abs(a - b) < tol;

export const DIRECTIONS = { E: 0, S: 90, W: 180, N: 270 };

export function dirOf(run) {
  const deg = run.angle ?? DIRECTIONS[run.direction] ?? 0;
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [Math.abs(c) < 1e-9 ? 0 : c, Math.abs(s) < 1e-9 ? 0 : s];
}

function sumTable(pieces, limit) {
  const count = new Array(limit + 1).fill(Infinity);
  const last = new Array(limit + 1).fill(0);
  count[0] = 0;
  for (let s = 1; s <= limit; s++) {
    for (const p of pieces) {
      if (p <= s && count[s - p] + 1 < count[s]) {
        count[s] = count[s - p] + 1;
        last[s] = p;
      }
    }
  }
  return { count, last };
}

function unwind(last, best) {
  const out = [];
  for (let s = best; s > 0; s -= last[s]) out.push(round2(last[s] * GRID));
  return out.sort((a, b) => b - a);
}

export function combine(target, lengths, overshootWeight) {
  const pieces = lengths.map(toUnits).filter((u) => u > 0);
  if (pieces.length === 0) throw new Error("No component lengths available");
  const goal = Math.max(1, toUnits(target));
  const limit = goal + Math.max(...pieces);
  const { count, last } = sumTable(pieces, limit);
  let best = -1;
  let bestScore = Infinity;
  for (let s = goal; s <= limit; s++) {
    if (count[s] === Infinity) continue;
    const score = count[s] + (s - goal) * GRID * overshootWeight;
    if (score < bestScore - EPS) {
      bestScore = score;
      best = s;
    }
  }
  return unwind(last, best);
}

export function fitWithin(target, lengths) {
  const pieces = lengths.map(toUnits).filter((u) => u > 0);
  const goal = toUnits(target);
  if (pieces.length === 0 || goal < Math.min(...pieces)) return [];
  const { count, last } = sumTable(pieces, goal);
  for (let s = goal; s > 0; s--) {
    if (count[s] !== Infinity) return unwind(last, s);
  }
  return [];
}

const usable = (lengths, maxBay) => lengths.filter((l) => l <= maxBay + EPS);

export const solveBays = (length, lengths, maxBay) =>
  combine(length, usable(lengths, maxBay), 2);

export const composeColumn = (height, standardLengths) =>
  combine(height, standardLengths, 10);

export function lengthsOf(system, kind) {
  return system.components
    .filter((c) => c.kind === kind)
    .map((c) => c.length)
    .sort((a, b) => a - b);
}

export function levelsFor(run, job, system) {
  const lift = job.liftHeight;
  const pitch = system.nodePitch;
  const topDeck = round2(
    Math.max(2 * pitch, Math.ceil(run.height / pitch - EPS) * pitch),
  );
  const liftLevels = [];
  for (let z = topDeck; z > pitch + EPS; z -= lift)
    liftLevels.unshift(round2(z));
  const lifts = liftLevels.length;
  const deckLevels = run.decks === "all" ? liftLevels : [topDeck];
  const ledgerLevels = [pitch, ...liftLevels];
  const tieLevels = [];
  if (job.tieVertical > 0) {
    for (let z = job.tieVertical; z <= topDeck + EPS; z += job.tieVertical) {
      tieLevels.push(round2(z));
    }
  }
  const intervals = ledgerLevels.slice(1).map((z, i) => ({
    z0: i === 0 ? 0 : ledgerLevels[i],
    z1: z,
    h: round2(z - ledgerLevels[i]),
  }));
  return {
    lifts,
    topDeck,
    liftLevels,
    deckLevels,
    ledgerLevels,
    intervals,
    tieLevels,
  };
}

function signedArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function placeRuns(job) {
  let at = [0, 0];
  const raw = job.runs.map((run) => {
    const dir = dirOf(run);
    const start = run.start ?? at;
    at = [start[0] + dir[0] * run.length, start[1] + dir[1] * run.length];
    return { start, dir, end: at };
  });
  const pts = raw.map((p) => p.start);
  if (!job.closed && raw.length > 0) pts.push(raw.at(-1).end);
  const sign = signedArea(pts) < -EPS ? -1 : 1;
  return raw.map((p, i) => {
    const flip = sign < 0 !== Boolean(job.runs[i].flip);
    const outward = flip ? [-p.dir[1], p.dir[0]] : [p.dir[1], -p.dir[0]];
    return { ...p, outward };
  });
}

export const toWorld = (place, [u, v, z]) => [
  place.start[0] + place.dir[0] * u + place.outward[0] * v,
  place.start[1] + place.dir[1] * u + place.outward[1] * v,
  z,
];

function cornerBetween(a, b) {
  if (!a || !b) return "free";
  if (Math.hypot(a.end[0] - b.start[0], a.end[1] - b.start[1]) > 0.05) {
    return "free";
  }
  const cross = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0];
  const dot = a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1];
  if (Math.abs(cross) < 0.05 && dot > 0) return "straight";
  if (Math.abs(dot) > 0.1) return "angled";
  const turn = a.outward[0] * b.dir[0] + a.outward[1] * b.dir[1];
  return turn < 0 ? "convex" : "concave";
}

export const HOP_LIMIT = 0.3;

export const wallGapOf = (run, job) => Number(run.wallGap ?? job.wallGap) || 0;
export const autoHops = (run) =>
  run.hopUps === undefined || run.hopUps === null || run.hopUps === "auto";

// Hop-up for a gap to the wall over 300 mm: the narrowest bracket that leaves
// 300 mm or less. With `fit` the bracket must also clear the wall as placed.
function hopFor(system, gap, fit) {
  if (gap <= HOP_LIMIT + EPS) return null;
  const hops = [...(system.hopUps ?? [])].sort((a, b) => a.bracket - b.bracket);
  const ok = fit ? hops.filter((h) => h.bracket + 0.05 <= gap + EPS) : hops;
  return (
    ok.find((h) => gap - h.bracket <= HOP_LIMIT + EPS) ?? ok.at(-1) ?? null
  );
}

function setbackOver(run, a, b) {
  let depth = 0;
  for (const s of run.setbacks ?? []) {
    if (Math.min(b, s.u1) - Math.max(a, s.u0) > 0.05)
      depth = Math.max(depth, s.depth);
  }
  return depth;
}

function solveRun(run, lay, ctx) {
  const { lengths, job, gOf, W, gap, extent, prev, next, i } = ctx;
  let uStart = 0;
  if (lay.startCorner === "convex") uStart = -gap[prev];
  if (lay.startCorner === "concave") uStart = gap[prev] + W;
  let bays;
  if (lay.endCorner === "convex") {
    bays = combine(
      run.length + gOf(next) - uStart,
      usable(lengths, job.maxBay),
      6,
    );
  } else if (lay.endCorner === "concave") {
    bays = fitWithin(
      run.length - gap[next] - uStart,
      usable(lengths, job.maxBay),
    );
  } else {
    bays = solveBays(Math.max(0.1, run.length - uStart), lengths, job.maxBay);
  }
  const coverage = bays.reduce((a, b) => a + b, 0);
  return {
    ...lay,
    uStart: round2(uStart),
    bays,
    gap: round2(lay.startCorner === "convex" ? extent[prev] : gOf(i)),
    skipFirst: lay.startCorner === "convex",
    cornerBay: lay.endCorner === "convex" && bays.length > 0,
    extent: round2(uStart + coverage - run.length),
  };
}

export function layoutRuns(job, system, places) {
  const n = job.runs.length;
  const prevOf = (i) => (i > 0 ? i - 1 : job.closed ? n - 1 : -1);
  const nextOf = (i) => (i < n - 1 ? i + 1 : job.closed ? 0 : -1);
  const corners = places.map((p, i) => {
    const next = nextOf(i);
    return next < 0 ? "free" : cornerBetween(p, places[next]);
  });
  const gOf = (i) => {
    const run = job.runs[i];
    const base = run ? wallGapOf(run, job) : job.wallGap;
    const runHop =
      run && autoHops(run)
        ? (hopFor(system, base, false)?.decks ?? 0)
        : Number(run?.hopUps) || 0;
    const wanted = [
      runHop,
      ...Object.values(job.overrides?.[run?.id]?.bays ?? {}).map(
        (b) => Number(b.hopUps) || 0,
      ),
    ];
    const widths = (system.hopUps ?? [])
      .filter((h) => wanted.includes(h.decks))
      .map((h) => h.bracket);
    return widths.length
      ? Math.max(base, round2(Math.max(...widths) + 0.05))
      : base;
  };
  const gap = job.runs.map((_, i) => gOf(i));
  const extent = [...gap];
  const out = [];
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    job.runs.forEach((run, i) => {
      const prev = prevOf(i);
      const lay = {
        startCorner: prev < 0 ? "free" : corners[prev],
        endCorner: corners[i],
      };
      const solved = solveRun(run, lay, {
        lengths: bayLengthsOf(system),
        job,
        gOf,
        i,
        W: job.width,
        gap,
        extent,
        prev,
        next: nextOf(i),
      });
      if (!near(gap[i], solved.gap) || !near(extent[i], solved.extent))
        changed = true;
      gap[i] = solved.gap;
      extent[i] = solved.extent;
      out[i] = solved;
    });
    if (!changed && pass > 0) break;
  }
  return out;
}

function pickBays(bays, count, okLength, exclude = new Set()) {
  const pool = bays
    .map((len, i) => (okLength(len) && !exclude.has(i) ? i : -1))
    .filter((i) => i >= 0);
  const n = Math.min(count, pool.length);
  const set = new Set();
  for (let k = 0; k < n; k++)
    set.add(pool[Math.floor(((k + 0.5) * pool.length) / n)]);
  return { set, short: count - n };
}

// A corner bay counts as the first braced bay, so the side carries on with
// "skip every-1, brace". A free end braces its end bay.
function bracedBayIndexes(bays, every, canBrace, lay) {
  const set = new Set();
  if (every <= 0 || bays.length === 0) return set;
  const wanted = [];
  const first = lay.startCorner === "convex" ? every - 1 : 0;
  for (let i = first; i < bays.length; i += every) wanted.push(i);
  if (!lay.cornerBay) wanted.push(bays.length - 1);
  for (const i of wanted) {
    const order = bays
      .map((_, k) => k)
      .sort((a, b) => Math.abs(a - i) - Math.abs(b - i));
    const pick = order.find((k) => canBrace(bays[k]));
    if (pick !== undefined) set.add(pick);
  }
  return set;
}

function makeSink(system) {
  const comps = [];
  const missing = new Set();
  const add = (kind, size, geom = {}, height) => {
    const c = findComponent(system, kind, size, height);
    if (!c) {
      const dims =
        height === undefined
          ? `${round2(size)} m`
          : `${round2(size)} x ${height} m`;
      missing.add(size === undefined ? kind : `${kind} ${dims}`);
      return null;
    }
    comps.push({ code: c.code, kind, ...geom });
    return c;
  };
  const visual = (kind, geom) => comps.push({ code: null, kind, ...geom });
  return { comps, missing, add, visual };
}

function frameFor(sink, place, runIndex) {
  const T = (p) => toWorld(place, p);
  const geom = (la, lb, extra) => ({
    a: T(la),
    b: T(lb),
    run: runIndex,
    local: { a: la, b: lb },
    ...extra,
  });
  return {
    bar: (kind, size, la, lb, extra = {}, height) =>
      sink.add(kind, size, geom(la, lb, extra), height),
    point: (kind, size, lp) => sink.add(kind, size, geom(lp, lp, {})),
    visual: (kind, la, lb, extra = {}) =>
      sink.visual(kind, geom(la, lb, extra)),
    count: (kind) => sink.add(kind, undefined, {}),
  };
}

const JACK_TOP = 0.25;
const STD_BASE = 0.1;

function standardColumn(f, ctx, u, v, pieces = ctx.standardPieces) {
  const { system } = ctx;
  f.point("soleboard", undefined, [u, v, 0]);
  f.bar("basejack", undefined, [u, v, 0], [u, v, JACK_TOP]);
  if (hasKind(system, "basecollar")) {
    f.bar("basecollar", undefined, [u, v, STD_BASE], [u, v, STD_BASE + 0.26]);
  }
  let z = STD_BASE;
  for (const piece of pieces) {
    f.bar("standard", piece, [u, v, z], [u, v, z + piece], {
      rings: system.nodePitch,
    });
    z += piece;
  }
}

function crossMember(
  f,
  ctx,
  u,
  z,
  carriesDeck,
  vin = ctx.vin,
  vout = ctx.vout,
) {
  const { system } = ctx;
  const kind =
    carriesDeck || !system.bareTransom ? "transom" : system.bareTransom;
  f.bar(kind, round2(vout - vin), [u, vin, z], [u, vout, z], {
    profile: kind === "transom" ? "u" : "tube",
  });
}

function railsAcross(f, ctx, u, d) {
  const { system, W, vin, vout } = ctx;
  const kind = system.bareTransom ?? "transom";
  for (const dz of [0.5, 1.0]) {
    f.bar(kind, W, [u, vin, d + dz], [u, vout, d + dz], { rail: true });
  }
  f.bar("toeboard", W, [u, vin, d], [u, vout, d], { face: "end" });
}

function planks(f, ctx, b, z, count, vFrom, dirSign = 1) {
  const { plankW } = ctx;
  for (let k = 0; k < count; k++) {
    const v = vFrom + dirSign * (k * plankW + plankW / 2);
    f.bar("plank", b.len, [b.u0, v, z], [b.u1, v, z], { w: plankW - 0.01 });
  }
}

function deckBay(f, ctx, b, z) {
  const { boards, plankW, W, vin } = ctx;
  planks(f, ctx, b, z, boards, vin + (W - boards * plankW) / 2);
}

const LADDER_SLOPE = 0.27;
const LADDER_ABOVE = 0.9;
const LADDER_OPENING = 0.8;
const GATE_OPENING = 0.8;

// Ladder towers stand outside the scaffold like stair towers. Each lift of
// the tower is decked bar the ladder opening, by the job's choice:
// - "sideways": tower-width decks laid across, two left out at one end;
// - "transom": an intermediate transom carries shorter decks laid lengthwise,
//   opening at the other end;
// - "slot": two decks left out along the main-scaffold side.
// Ladders face the scaffold and lean in towards it, so the climber steps
// straight off the top onto the landing. Ladders and end openings swap ends
// every lift, so every ladder stands on deck.
const LADDER_STYLES = ["sideways", "transom", "slot"];

function ladderOpening(ctx, len, style) {
  const { system, widthSpec } = ctx;
  if (len < 1.5 - EPS) return null;
  const plankW = system.deckWidth ?? widthSpec.width / widthSpec.boards;
  if (style === "slot") return widthSpec.boards >= 3 ? { open: 0.7 } : null;
  if (style === "sideways") {
    if (!findComponent(system, "plank", widthSpec.width)) return null;
    const all = Math.floor((len + EPS) / plankW);
    const n = all - (all > 4 ? 3 : 2);
    return n > 0 ? { n, open: round2(len - n * plankW) } : null;
  }
  if (!findComponent(system, "intermediate", widthSpec.width)) return null;
  const deck = lengthsOf(system, "plank")
    .filter((l) => l <= len - LADDER_OPENING + EPS)
    .at(-1);
  return deck ? { deck, open: round2(len - deck) } : null;
}

export function ladderStyleFor(job, system, widthSpec, len) {
  const want = LADDER_STYLES.includes(job.ladderDecks)
    ? job.ladderDecks
    : "sideways";
  const ctx = { job, system, widthSpec };
  return (
    [want, ...LADDER_STYLES].find((style) => ladderOpening(ctx, len, style)) ??
    null
  );
}

function ladderFor(system, rise) {
  const k = Math.hypot(LADDER_SLOPE, 1);
  const lens = lengthsOf(system, "ladder");
  const len = lens.find((l) => l >= (rise + LADDER_ABOVE) * k - 0.05);
  const pick = len ?? lens.at(-1);
  return { len: pick, up: (pick ?? (rise + LADDER_ABOVE) * k) / k };
}

// Ladder leaning in towards the main scaffold (-v), resting on the guardrail
// line at `face` and passing the landing at `u`.
function climb(f, ctx, u, z1, rise, face = ctx.vout) {
  const { len, up } = ladderFor(ctx.system, rise);
  const v = face + 0.06 + LADDER_SLOPE * Math.min(up - rise, 1.0);
  const foot = [u, v + LADDER_SLOPE * rise, z1 - rise];
  const top = [u, foot[1] - LADDER_SLOPE * up, foot[2] + up];
  f.bar("ladder", len, foot, top, { w: 0.4 });
}

// Short ledger off a standard for a ladder to rest on (Ringscaff 0.33 m), or
// a tube where the system has no short ledger.
function stubLedger(system) {
  const len = lengthsOf(system, "ledger").find((l) => l >= 0.25 && l <= 0.5);
  return len
    ? { kind: "ledger", len }
    : { kind: "tube", len: tubeFor(system, 0.3) };
}

const tubeFor = (system, span) => {
  const lens = lengthsOf(system, "tube");
  return lens.find((l) => l >= span - EPS) ?? lens.at(-1);
};

// An access opening in a guardrail line: the longest ledger (with a toe
// board) that still leaves the opening clear closes the rest of the bay.
function exitSplit(system, len) {
  const rest = lengthsOf(system, "ledger")
    .filter(
      (l) =>
        l <= len - GATE_OPENING + EPS && findComponent(system, "toeboard", l),
    )
    .at(-1);
  return { rest, open: rest ? round2(len - rest) : len };
}

// Guardrails and toe board from a standard to `at` along the line `v`.
function closeRails(f, ctx, len, from, at, v, z1) {
  for (const dz of [0.5, 1.0]) {
    f.bar("ledger", len, [from, v, z1 + dz], [at, v, z1 + dz], { rail: true });
  }
  f.bar("toeboard", len, [from, v, z1], [at, v, z1], { face: "out" });
}

// Standard adapter clamped to the ledger at `p`, carrying a 1 m standard
// for guardrails or a dropper to bear on.
function adapterStandard(f, ctx, p) {
  f.point("adapter", undefined, p);
  f.bar("standard", 1.0, p, [p[0], p[1], p[2] + 1.0], {
    rings: ctx.system.nodePitch,
  });
}

// Self-closing safety gate in the guardrail line `v`, hinged on the standard
// and closing onto a guardrail post; the rest of the bay keeps its
// guardrail. The gate runs from its hinge (a) to its latch (b).
function gateIn(f, ctx, b, z1, atStart, v) {
  const { rest, open } = exitSplit(ctx.system, b.len);
  const [g0, g1] = atStart ? [b.u0, b.u0 + open] : [b.u1 - open, b.u1];
  if (rest) {
    const post = atStart ? g1 : g0;
    f.bar("gatepost", undefined, [post, v, z1 - 0.2], [post, v, z1 + 1.5]);
    closeRails(f, ctx, rest, atStart ? b.u1 : b.u0, post, v, z1);
  }
  const [hinge, latch] = atStart ? [g0, g1] : [g1, g0];
  f.bar("gate", undefined, [hinge, v, z1], [latch, v, z1], { h: 1.0 });
  return { g0, g1, post: rest ? (atStart ? g1 : g0) : null };
}

// Half-closed access in the guardrail line `v`: a standard adapter on the
// ledger closes the rest of the bay with guardrails from the standard, and
// the opening stays at the start or end. Returns the opening's standard and
// the adapter position.
function halfClose(f, ctx, b, z1, openAtStart, v) {
  const { rest, open } = exitSplit(ctx.system, b.len);
  const std = openAtStart ? b.u0 : b.u1;
  if (!rest) return { std, adapter: openAtStart ? b.u1 : b.u0 };
  const adapter = openAtStart ? b.u0 + open : b.u1 - open;
  adapterStandard(f, ctx, [adapter, v, z1]);
  closeRails(f, ctx, rest, openAtStart ? b.u1 : b.u0, adapter, v, z1);
  return { std, adapter };
}

// Tube dropper at guardrail height, hung on a swivel coupler at `from` and
// dropping onto a coupler at `to`, so the climber lifts it to step off and it
// drops back behind them. Ends away from a standard bear on standard adapters.
function dropper(f, ctx, from, to, { adapters = [] } = {}) {
  const z = from[2] + 1.0;
  for (const p of adapters) adapterStandard(f, ctx, p);
  const a = [from[0], from[1], z];
  const c = [to[0], to[1], z];
  f.bar(
    "tube",
    tubeFor(ctx.system, Math.hypot(c[0] - a[0], c[1] - a[1])),
    a,
    c,
    {
      dropper: true,
    },
  );
  f.point("swivel", undefined, a);
  f.point("coupler", undefined, c);
}

// Where a ladder tower meets a working deck: a safety gate, or (the usual
// way) half the bay closed on a standard adapter and a dropper across the
// opening from the main standard onto the adapter standard.
function ladderExit(f, ctx, b, z1, openAtStart) {
  const { vout, job } = ctx;
  if (job.ladderExit === "gate") {
    gateIn(f, ctx, b, z1, openAtStart, vout);
    return null;
  }
  const { std, adapter } = halfClose(f, ctx, b, z1, openAtStart, vout);
  dropper(f, ctx, [std, vout, z1], [adapter, vout, z1]);
  return adapter;
}

// Ladder tower (exits onto working decks sit at the end where that lift's
// ladder tops out, so the climber steps straight off onto the deck):
// the first ladder climbs on the end of a 300 ledger sticking straight out
// from the corner standard the gate hangs on, centred on that standard and
// stood off the face by the ledger, so the climber steps off sideways in front
// of the gate and through it onto a fully decked first lift; above that each ladder climbs inside the tower through the opening,
// guarded by a tube dropper on standard adapters. Where the tower meets a working deck the
// access is half closed with a dropper, or a safety gate.
function ladderTower(f, ctx, b, decks) {
  const { levels, W, vout, plankW, boards } = ctx;
  const working = new Set(decks);
  const first = levels.liftLevels[0];
  const vt = accessTower(f, ctx, b, working, first);
  const style = ctx.ladderStyle(b.len);
  const opening = ladderOpening(ctx, b.len, style);
  const from = vout + (W - boards * plankW) / 2;
  const { open } = opening;
  levels.liftLevels.forEach((z1, k) => {
    const atStart = k % 2 === 1;
    const exitAtStart = k === 0 ? false : atStart;
    const exit = working.has(z1)
      ? ladderExit(f, ctx, b, z1, exitAtStart)
      : null;
    if (k === 0) {
      if (style === "sideways") {
        const n = Math.floor((b.len + EPS) / plankW);
        for (let j = 0; j < n; j++) {
          const uc = b.u0 + (j + 0.5) * plankW;
          f.bar("plank", W, [uc, vout, z1], [uc, vt, z1], {
            w: plankW - 0.01,
            across: true,
          });
        }
      } else planks(f, ctx, b, z1, boards, from);
      gateIn(f, ctx, b, z1, false, vt);
      const stub = stubLedger(ctx.system);
      f.bar(
        stub.kind,
        stub.len,
        [b.u1, vt, z1 + 1.0],
        [b.u1, vt + stub.len, z1 + 1.0],
        { rail: true },
      );
      climb(f, ctx, b.u1, z1, z1, vt + stub.len - 0.04);
    } else {
      const rise = z1 - levels.liftLevels[k - 1];
      if (style === "slot") {
        for (let j = 2; j < boards; j++) {
          const v = from + (j + 0.5) * plankW;
          f.bar("plank", b.len, [b.u0, v, z1], [b.u1, v, z1], {
            w: plankW - 0.01,
          });
        }
        const v = from + 2 * plankW;
        const ends = [
          [b.u0, v, z1],
          [b.u1, v, z1],
        ];
        dropper(f, ctx, ...ends, { adapters: ends });
      } else {
        const edge = atStart ? b.u0 + open : b.u1 - open;
        if (style === "sideways") {
          const u = atStart ? edge : b.u0;
          for (let j = 0; j < opening.n; j++) {
            const uc = u + (j + 0.5) * plankW;
            f.bar("plank", W, [uc, vout, z1], [uc, vt, z1], {
              w: plankW - 0.01,
              across: true,
            });
          }
        } else {
          f.bar("intermediate", W, [edge, vout, z1], [edge, vt, z1], {
            profile: "u",
          });
          const [u0, u1] = atStart ? [edge, b.u1] : [b.u0, edge];
          planks(f, ctx, { u0, u1, len: opening.deck }, z1, boards, from);
        }
        const outer = [edge, vt, z1];
        const inner = [exit ?? edge, vout, z1];
        dropper(f, ctx, outer, inner, {
          adapters: exit === null ? [outer, inner] : [outer],
        });
      }
      climb(f, ctx, atStart ? b.u0 + open / 2 : b.u1 - open / 2, z1, rise);
    }
  });
}

// A bay with an access tower leaves its outer face to the tower.
function railsAndToes(f, ctx, b, { towered, decks, hop }) {
  const { job, vin, vout } = ctx;
  const innerRails = job.innerGuardrail && !hop;
  for (const d of decks) {
    const outer = !towered;
    for (const dz of [0.5, 1.0]) {
      if (outer) {
        f.bar("ledger", b.len, [b.u0, vout, d + dz], [b.u1, vout, d + dz], {
          rail: true,
        });
      }
      if (innerRails) {
        f.bar("ledger", b.len, [b.u0, vin, d + dz], [b.u1, vin, d + dz], {
          rail: true,
        });
      }
    }
    if (outer)
      f.bar("toeboard", b.len, [b.u0, vout, d], [b.u1, vout, d], {
        face: "out",
      });
    if (innerRails)
      f.bar("toeboard", b.len, [b.u0, vin, d], [b.u1, vin, d], { face: "in" });
  }
}

// Every diagonal rises the same way: from its bay's far end (u1) at the
// lower ledger to its near end (u0) at the upper ledger, which reads
// bottom-left to top-right from outside the scaffold.
function faceBraces(f, levels, b, v) {
  for (const { z0, z1, h } of levels.intervals) {
    if (h < 0.75) continue;
    f.bar("brace", b.len, [b.u1, v, z0], [b.u0, v, z1], {}, h);
  }
}

function bayComponents(f, ctx, b, i) {
  const { levels, vin, vout, lay } = ctx;
  const hop = ctx.bayHop(i);
  const decks = ctx.bayDecks(i);
  const isLadder = ctx.ladderBays.has(i);
  const isStair = ctx.stairBays.has(i);
  for (const z of levels.ledgerLevels) {
    f.bar("ledger", b.len, [b.u0, vin, z], [b.u1, vin, z]);
    f.bar("ledger", b.len, [b.u0, vout, z], [b.u1, vout, z]);
  }
  railsAndToes(f, ctx, b, { towered: isStair || isLadder, decks, hop });
  for (const z of decks) deckBay(f, ctx, b, z);
  if (hop && !(i === 0 && lay.skipFirst)) {
    for (const z of decks) planks(f, ctx, b, z, hop.decks, vin, -1);
  }
  if (ctx.bracedBays.has(i)) faceBraces(f, levels, b, vout);
  if (isStair) stairTower(f, ctx, b, decks);
  if (isLadder) ladderTower(f, ctx, b, decks);
}

// Access tower bay outside the main bay: standards, ledgers and transoms,
// guardrails and toe boards on the outer face and both ends at every lift,
// and on the main-scaffold side wherever the main bay has no working deck.
// At `outerGate` the outer face is left to a safety gate.
// Towers in neighbouring bays share their standards.
function accessTower(f, ctx, b, working, outerGate, W = ctx.W) {
  const { system, levels, vout } = ctx;
  const vt = vout + W;
  for (const u of [b.u0, b.u1]) {
    const key = `${Math.round(u * 100)}|${Math.round(vt * 100)}`;
    if (ctx.towerLines.has(key)) continue;
    ctx.towerLines.add(key);
    standardColumn(f, ctx, u, vt);
  }
  const lifts = new Set(levels.liftLevels);
  for (const z of levels.ledgerLevels) {
    f.bar("ledger", b.len, [b.u0, vt, z], [b.u1, vt, z]);
    for (const u of [b.u0, b.u1]) {
      crossMember(f, ctx, u, z, lifts.has(z), vout, vt);
    }
  }
  const across = system.bareTransom ?? "transom";
  const rail = (kind, len, a, c) => f.bar(kind, len, a, c, { rail: true });
  for (const z1 of levels.liftLevels) {
    const open = working.has(z1);
    const outer = outerGate === undefined || !near(z1, outerGate);
    for (const dz of [0.5, 1.0]) {
      if (outer)
        rail("ledger", b.len, [b.u0, vt, z1 + dz], [b.u1, vt, z1 + dz]);
      if (!open)
        rail("ledger", b.len, [b.u0, vout, z1 + dz], [b.u1, vout, z1 + dz]);
      for (const u of [b.u0, b.u1])
        rail(across, W, [u, vout, z1 + dz], [u, vt, z1 + dz]);
    }
    if (outer)
      f.bar("toeboard", b.len, [b.u0, vt, z1], [b.u1, vt, z1], {
        face: "out",
      });
    if (!open)
      f.bar("toeboard", b.len, [b.u0, vout, z1], [b.u1, vout, z1], {
        face: "in",
      });
    for (const u of [b.u0, b.u1])
      f.bar("toeboard", W, [u, vout, z1], [u, vt, z1], { face: "end" });
  }
  faceBraces(f, levels, b, vt);
  return vt;
}

// Stair towers are two stair lanes wide: the narrowest system width that
// fits two flights side by side.
export function stairTowerWidth(system) {
  const need = 2 * (system.stair?.width ?? 0.64) + 0.05;
  const widths = system.widths.map((w) => w.width).sort((a, b) => a - b);
  return widths.find((w) => w >= need - EPS) ?? widths.at(-1);
}

// Stair tower: platform stairways alternate lanes and directions lift to
// lift, so each flight tops out beside the start of the next one instead of
// under it. The arriving and departing platforms make the landing at that end,
// and at working decks half the bay is closed on a standard adapter with the
// opening at that end. Each flight carries an outer handrail on the tower side
// and an inner handrail on the side facing the other lane.
function stairTower(f, ctx, b, decks) {
  const { system, levels, vout, plankW } = ctx;
  const working = new Set(decks);
  const Wt = stairTowerWidth(system);
  const vt = accessTower(f, ctx, b, working, undefined, Wt);
  const stairW = system.stair?.width ?? 0.64;
  const rise = system.stair?.rise ?? 2.0;
  const lanes = [
    { v: vt - 0.05 - stairW / 2, wall: vt, side: -1 },
    { v: vout + 0.05 + stairW / 2, wall: vout, side: 1 },
  ];
  const accessKind = hasKind(system, "accessladder")
    ? "accessladder"
    : "ladder";
  const last = levels.liftLevels.length - 1;
  levels.liftLevels.forEach((z1, k) => {
    const z0 = round2(z1 - rise);
    const fwd = k % 2 === 0;
    const lane = lanes[k % 2];
    if (working.has(z1)) halfClose(f, ctx, b, z1, !fwd, vout);
    const fits = k === 0 ? z0 >= -EPS : near(z0, levels.liftLevels[k - 1]);
    if (fits) {
      const [ua, ub] = fwd ? [b.u0, b.u1] : [b.u1, b.u0];
      const za = Math.max(0, z0);
      f.bar("stair", b.len, [ua, lane.v, za], [ub, lane.v, z1], { w: stairW });
      const edge = (v) => [
        [ua, v, za + 0.9],
        [ub, v, z1 + 0.9],
      ];
      f.bar("stairrailouter", undefined, ...edge(lane.wall + lane.side * 0.06));
      f.bar(
        "stairrailinner",
        undefined,
        ...edge(lane.wall + lane.side * (0.04 + stairW)),
      );
    } else if (k === 0) {
      const v = vout + plankW / 2 + 0.02;
      f.bar(
        accessKind,
        undefined,
        [b.u0 + 0.3, v, 0],
        [b.u0 + 0.3 + z1 * 0.3, v, z1],
        {
          w: 0.4,
        },
      );
    }
    if (k === last) {
      const other = lanes[(k + 1) % 2];
      for (const dv of [-0.5, 0.5]) {
        const v = other.v + dv * plankW;
        f.bar("plank", b.len, [b.u0, v, z1], [b.u1, v, z1], {
          w: plankW - 0.01,
        });
      }
    }
  });
}

function cornerBay(f, ctx, uE, levels, pieces) {
  const { W, vin, vout, plankW, boards, system } = ctx;
  for (const v of [vin, vout]) standardColumn(f, ctx, uE + W, v, pieces);
  const decks = new Set(levels.deckLevels);
  for (const z of levels.ledgerLevels) {
    crossMember(f, ctx, uE + W, z, decks.has(z));
    const kind =
      decks.has(z) || !system.bareTransom ? "transom" : system.bareTransom;
    f.bar(kind, W, [uE, vin, z], [uE + W, vin, z], {
      profile: kind === "transom" ? "u" : "tube",
    });
    f.bar("ledger", W, [uE, vout, z], [uE + W, vout, z]);
  }
  const offset = (W - boards * plankW) / 2;
  for (const { z0, z1, h } of ctx.cornerBraced ? levels.intervals : []) {
    if (h < 0.75) continue;
    f.bar("brace", W, [uE + W, vout, z0], [uE, vout, z1], { corner: true }, h);
    f.bar(
      "brace",
      W,
      [uE + W, vin, z0],
      [uE + W, vout, z1],
      { corner: true },
      h,
    );
  }
  for (const d of levels.deckLevels) {
    for (const dz of [0.5, 1.0]) {
      f.bar("ledger", W, [uE, vout, d + dz], [uE + W, vout, d + dz], {
        rail: true,
      });
      f.bar("ledger", W, [uE + W, vin, d + dz], [uE + W, vout, d + dz], {
        rail: true,
      });
    }
    f.bar("toeboard", W, [uE, vout, d], [uE + W, vout, d], { face: "out" });
    f.bar("toeboard", W, [uE + W, vin, d], [uE + W, vout, d], { face: "out" });
    for (let k = 0; k < boards; k++) {
      const v = vin + offset + k * plankW + plankW / 2;
      f.bar("plank", W, [uE, v, d], [uE + W, v, d], { w: plankW - 0.01 });
    }
  }
}

const WALL_THICKNESS = 0.25;

// F-tie at each tie point: a tie tube from the inner standard through the
// opening into the house, clamping the wall between two vertical tubes
// coupled to it, one against the outside face and one against the inside
// face. Three 900 mm tubes (longer only where the gap needs it) and three
// right-angle couplers per tie.
function tieComponents(f, ctx, us, skipFirst) {
  const { job, levels, vin, system } = ctx;
  if (job.tieEveryBays <= 0) return 0;
  const lines = us.filter((_, j) => !(j === 0 && skipFirst));
  const picks = [];
  for (let k = 0; k < lines.length; k += job.tieEveryBays) picks.push(lines[k]);
  if (lines.length && picks.at(-1) !== lines.at(-1)) picks.push(lines.at(-1));
  const inside = -(WALL_THICKNESS + 0.05);
  const tieLen = tubeFor(system, vin + 0.1 - inside + 0.1);
  const clampLen = tubeFor(system, 0.9);
  let count = 0;
  for (const u of picks) {
    for (const z of levels.tieLevels) {
      const ut = u + 0.06;
      f.bar("tube", tieLen, [ut, vin + 0.1, z], [ut, vin + 0.1 - tieLen, z], {
        tie: true,
      });
      f.point("coupler", undefined, [ut, vin, z]);
      for (const v of [0.03, inside]) {
        f.bar(
          "tube",
          clampLen,
          [ut - 0.06, v, z - clampLen / 2],
          [ut - 0.06, v, z + clampLen / 2],
          { tie: true },
        );
        f.point("coupler", undefined, [ut, v, z]);
      }
      count++;
    }
  }
  return count;
}

function runComponents(sink, i, run, lay, place, base) {
  const { job, system, widthSpec, access } = base;
  const levels = levelsFor(run, job, system);
  const standardPieces = composeColumn(
    levels.topDeck + 1.0,
    lengthsOf(system, "standard"),
  );
  const W = job.width;
  const ov = job.overrides?.[run.id] ?? {};
  const bayOv = (k) => ov.bays?.[k] ?? {};
  const us = [lay.uStart];
  for (const b of lay.bays) us.push(round2(us.at(-1) + b));
  const ctx = {
    job,
    system,
    lay,
    levels,
    standardPieces,
    W,
    vin: lay.gap,
    vout: lay.gap + W,
    widthSpec,
    boards: widthSpec.boards,
    plankW: system.deckWidth ?? W / widthSpec.boards,
    ladderBays: access.ladder,
    stairBays: access.stair,
    bracedBays: new Set(),
    cornerBraced: ov.corner?.brace !== false,
  };
  const hops = system.hopUps ?? [];
  const baseGap = wallGapOf(run, job);
  ctx.tight = [];
  const resolveHop = (k) => {
    const want = bayOv(k).hopUps;
    if (want !== undefined || !autoHops(run)) {
      const n = Number(want ?? run.hopUps);
      return hops.find((h) => h.decks === n);
    }
    if (baseGap > HOP_LIMIT + EPS) return hopFor(system, lay.gap, false);
    const extra = setbackOver(run, us[k], us[k + 1]);
    if (!extra) return null;
    const local = round2(lay.gap + extra);
    const hop = hopFor(system, local, true);
    if (!hop && local > HOP_LIMIT + EPS) ctx.tight.push({ k, local });
    return hop;
  };
  const bayHops = lay.bays.map((_, k) => resolveHop(k));
  ctx.bayHop = (k) => bayHops[k] ?? null;
  ctx.bayDecks = (k) => {
    const want = bayOv(k).decks;
    if (want === "all") return levels.liftLevels;
    if (want === "top") return [levels.topDeck];
    return levels.deckLevels;
  };
  ctx.towerLines = new Set();
  ctx.ladderStyle = (len) => ladderStyleFor(job, system, widthSpec, len);
  const canBrace = (len) =>
    levels.intervals.every(
      ({ h }) => h < 0.75 || Boolean(findComponent(system, "brace", len, h)),
    );
  ctx.bracedBays = bracedBayIndexes(lay.bays, job.braceEvery, canBrace, lay);
  lay.bays.forEach((len, k) => {
    const want = bayOv(k).brace;
    if (want === true && canBrace(len)) ctx.bracedBays.add(k);
    if (want === false) ctx.bracedBays.delete(k);
  });
  const f = frameFor(sink, place, i);
  const sideBays = (j) =>
    [j - 1, j].filter((k) => k >= 0 && k < lay.bays.length);
  us.forEach((u, j) => {
    const next = sideBays(j);
    const decks = new Set(next.flatMap((k) => ctx.bayDecks(k)));
    if (!(j === 0 && lay.skipFirst)) {
      for (const v of [ctx.vin, ctx.vout]) standardColumn(f, ctx, u, v);
      for (const z of levels.ledgerLevels)
        crossMember(f, ctx, u, z, decks.has(z));
    }
    const hopped = next.filter((k) => ctx.bayHop(k));
    if (hopped.length === 0) return;
    const width = Math.max(...hopped.map((k) => ctx.bayHop(k).bracket));
    for (const z of new Set(hopped.flatMap((k) => ctx.bayDecks(k)))) {
      f.bar("bracket", width, [u, ctx.vin, z], [u, ctx.vin - width, z]);
    }
  });
  lay.bays.forEach((len, k) =>
    bayComponents(f, ctx, { u0: us[k], u1: us[k + 1], len }, k),
  );
  const freeStart = !["convex", "concave"].includes(lay.startCorner);
  const freeEnd = !lay.cornerBay && lay.endCorner !== "concave";
  if (lay.bays.length) {
    if (freeStart) {
      for (const d of ctx.bayDecks(0)) railsAcross(f, ctx, us[0], d);
    }
    if (freeEnd) {
      const last = lay.bays.length - 1;
      for (const d of ctx.bayDecks(last)) railsAcross(f, ctx, us.at(-1), d);
    }
  }
  const tieCount = tieComponents(f, ctx, us, lay.skipFirst);
  return { levels, standardPieces, us, ctx, f, tieCount };
}

export function mergeCounts(comps) {
  const out = new Map();
  for (const c of comps)
    if (c.code) out.set(c.code, (out.get(c.code) ?? 0) + 1);
  return out;
}

const PART_ORDER = [
  "standard",
  "ledger",
  "transom",
  "intermediate",
  "plank",
  "brace",
  "toeboard",
  "bracket",
  "stair",
  "stairrailouter",
  "stairrailinner",
  "accessladder",
  "ladder",
  "gate",
  "gatepost",
  "adapter",
  "basejack",
  "basecollar",
  "soleboard",
  "tube",
  "coupler",
  "swivel",
];

export function partsList(items, system) {
  return system.components
    .filter((c) => items.has(c.code))
    .map((c) => {
      const qty = items.get(c.code);
      return { ...c, qty, totalWeight: round2(qty * c.weight) };
    })
    .sort(
      (a, b) =>
        PART_ORDER.indexOf(a.kind) - PART_ORDER.indexOf(b.kind) ||
        a.length - b.length ||
        (b.height ?? 0) - (a.height ?? 0),
    );
}

function accessBays(run, bays, base, ov = {}) {
  const { job, system, widthSpec } = base;
  const styleOf = (len) => ladderStyleFor(job, system, widthSpec, len);
  const okLadder = (len) => styleOf(len) !== null;
  const want = LADDER_STYLES.includes(job.ladderDecks)
    ? job.ladderDecks
    : "sideways";
  const ladder = pickBays(
    bays,
    Number(run.ladderBays) || 0,
    (len) => styleOf(len) === want,
  );
  if (ladder.short > 0) {
    const more = pickBays(bays, ladder.short, okLadder, ladder.set);
    for (const k of more.set) ladder.set.add(k);
    ladder.short = more.short;
  }
  const stairLen = system.stair?.bayLength;
  const okStair = (len) => stairLen !== undefined && near(len, stairLen);
  const stair = pickBays(bays, Number(run.stairBays) || 0, okStair, ladder.set);
  for (const [key, want] of Object.entries(ov.bays ?? {})) {
    const k = Number(key);
    if (k >= bays.length) continue;
    if (want.ladder === false) ladder.set.delete(k);
    if (want.stair === false) stair.set.delete(k);
    if (want.ladder === true) {
      if (okLadder(bays[k])) {
        ladder.set.add(k);
        stair.set.delete(k);
      } else ladder.short++;
    }
    if (want.stair === true) {
      if (okStair(bays[k])) {
        stair.set.add(k);
        ladder.set.delete(k);
      } else stair.short++;
    }
  }
  return {
    ladder: ladder.set,
    stair: stair.set,
    short: { ladder: ladder.short, stair: stair.short },
  };
}

export const LADDER_BAY_NOTE = "A ladder tower needs a 1.57 m bay or longer.";

function accessNotes(run, access, system) {
  const notes = [];
  if (access.short.ladder > 0) {
    notes.push(
      `${run.label}: ${LADDER_BAY_NOTE} Raise the largest bay or move the ladder.`,
    );
  }
  if (access.short.stair > 0) {
    notes.push(
      `${run.label}: a stair needs a ${system.stair?.bayLength} m bay. Raise the largest bay or move the stair.`,
    );
  }
  return notes;
}

function buildRuns(job, system, widthSpec, sink, notes) {
  const places = placeRuns(job);
  const layouts = layoutRuns(job, system, places);
  const runs = job.runs.map((run, i) => {
    const lay = layouts[i];
    const access = accessBays(
      run,
      lay.bays,
      { job, system, widthSpec },
      job.overrides?.[run.id],
    );
    notes.push(...accessNotes(run, access, system));
    const built = runComponents(sink, i, run, lay, places[i], {
      job,
      system,
      widthSpec,
      access,
    });
    const scaffoldLength = round2(lay.bays.reduce((a, b) => a + b, 0));
    return {
      run,
      place: places[i],
      layout: lay,
      bays: lay.bays,
      us: built.us,
      levels: built.levels,
      standardPieces: built.standardPieces,
      widthSpec,
      gap: lay.gap,
      ladderBays: access.ladder,
      stairBays: access.stair,
      hopUps: autoHops(run) ? "auto" : Number(run.hopUps) || 0,
      ladderStyles: lay.bays.map((len, k) =>
        access.ladder.has(k) ? built.ctx.ladderStyle(len) : null,
      ),
      tight: built.ctx.tight,
      stairWidth: stairTowerWidth(system),
      groundLadders: sink.comps
        .filter((c) => c.kind === "ladder" && c.run === i && c.local.a[2] === 0)
        .map((c) => c.local.a[0]),
      droppers: sink.comps
        .filter((c) => c.dropper && c.run === i)
        .map((c) => [c.local.a, c.local.b]),
      adapters: sink.comps
        .filter((c) => c.kind === "adapter" && c.run === i)
        .map((c) => c.local.a),
      exits: sink.comps
        .filter((c) => c.kind === "gate" && c.run === i)
        .map((c) => ({
          hinge: c.local.a[0],
          latch: c.local.b[0],
          v: c.local.a[1],
        })),
      bayHops: lay.bays.map((_, k) => built.ctx.bayHop(k)?.bracket ?? 0),
      bayDecks: lay.bays.map((_, k) => built.ctx.bayDecks(k)),
      bracedBays: built.ctx.bracedBays,
      cornerBraced: built.ctx.cornerBraced,
      custom: new Set(
        Object.keys(job.overrides?.[run.id]?.bays ?? {}).map(Number),
      ),
      scaffoldLength,
      faceArea: round2(
        (scaffoldLength + (lay.cornerBay ? job.width : 0)) *
          (built.levels.topDeck + 1.0),
      ),
      tieCount: built.tieCount,
      build: built,
    };
  });
  runs.forEach((r, i) => {
    if (!r.layout.cornerBay) return;
    const other = runs[job.closed ? (i + 1) % runs.length : i + 1];
    const taller = other && other.levels.topDeck > r.levels.topDeck ? other : r;
    cornerBay(
      r.build.f,
      r.build.ctx,
      r.us.at(-1),
      taller.levels,
      taller.standardPieces,
    );
  });
  for (const r of runs) {
    if (r.layout.startCorner === "angled" || r.layout.endCorner === "angled") {
      notes.push(
        `${r.run.label}: angled corner. Close it with corner panels or extra bays on site.`,
      );
    }
    const maxHop = Math.max(0, ...r.bayHops);
    if (r.gap > HOP_LIMIT + EPS && !maxHop && !job.innerGuardrail) {
      notes.push(
        `${r.run.label}: gap to wall is ${r.gap} m, over 300 mm. Add a hop-up or inner guardrails.`,
      );
    }
    if (r.tight.length && !job.innerGuardrail) {
      const bays = r.tight.map((t) => t.k + 1).join(", ");
      const gap = Math.max(...r.tight.map((t) => t.local));
      notes.push(
        `${r.run.label}: ${gap} m to the wall behind bay ${bays}, too tight for a hop-up bracket. Fit inner guardrails or move the scaffold out.`,
      );
    }
    const hopWidth = maxHop;
    if (hopWidth && r.gap - hopWidth > HOP_LIMIT + EPS) {
      notes.push(
        `${r.run.label}: ${round2(r.gap - hopWidth)} m left between hop-up and wall. Use a wider hop-up or inner guardrails.`,
      );
    }
    if (hopWidth && r.gap < hopWidth - 1e-6) {
      notes.push(
        `${r.run.label}: gap to wall is smaller than the hop-up bracket.`,
      );
    }
    delete r.build;
  }
  return { runs, places };
}

export function buildJob(job) {
  const system = getSystem(job.system, job.catalogOverrides ?? {});
  const widthSpec = system.widths.find((w) => near(w.width, job.width));
  if (!widthSpec)
    throw new Error(`Width ${job.width} m is not available for ${system.name}`);
  const sink = makeSink(system);
  const notes = [];
  const { runs, places } = buildRuns(job, system, widthSpec, sink, notes);
  const parts = partsList(mergeCounts(sink.comps), system);
  return {
    system,
    runs,
    places,
    components: sink.comps,
    parts,
    corners: runs.filter((r) => r.layout.cornerBay).length,
    notes: [...new Set(notes)],
    totalWeight: round2(parts.reduce((a, p) => a + p.totalWeight, 0)),
    totalPieces: parts.reduce((a, p) => a + p.qty, 0),
    faceArea: round2(runs.reduce((a, r) => a + r.faceArea, 0)),
    missing: [...sink.missing],
  };
}
