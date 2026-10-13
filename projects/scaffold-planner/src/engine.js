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
    const hop = (system.hopUps ?? []).find(
      (h) => h.decks === Number(job.runs[i]?.hopUps),
    );
    return hop
      ? Math.max(job.wallGap, round2(hop.bracket + 0.05))
      : job.wallGap;
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

function bracedBayIndexes(bays, every, canBrace) {
  const set = new Set();
  if (every <= 0 || bays.length === 0) return set;
  const wanted = [];
  for (let i = 0; i < bays.length; i += every) wanted.push(i);
  wanted.push(bays.length - 1);
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
  const { system, W } = ctx;
  const kind =
    carriesDeck || !system.bareTransom ? "transom" : system.bareTransom;
  f.bar(kind, W, [u, vin, z], [u, vout, z], {
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

function deckBay(f, ctx, b, z, hatch) {
  const { system, boards, plankW, W, vin } = ctx;
  const from = vin + (W - boards * plankW) / 2;
  if (!hatch) {
    planks(f, ctx, b, z, boards, from);
    return;
  }
  const sized = system.components.some(
    (c) => c.kind === "hatch" && c.length > 0,
  );
  const hw = 2 * plankW;
  f.bar(
    "hatch",
    sized ? b.len : undefined,
    [b.u0, from + hw / 2, z],
    [b.u1, from + hw / 2, z],
    { w: hw - 0.01 },
  );
  planks(f, ctx, b, z, Math.max(0, boards - 2), from + hw);
}

function ladderInBay(f, ctx, b) {
  const { system, vin, plankW, levels } = ctx;
  const v = vin + plankW;
  const accessKind = hasKind(system, "accessladder")
    ? "accessladder"
    : "ladder";
  levels.liftLevels.forEach((z1, k) => {
    const z0 = k === 0 ? 0 : levels.liftLevels[k - 1];
    const a = [b.u0 + 0.35, v, z0];
    const c = [b.u0 + 0.35 + (z1 - z0) * 0.3, v, z1];
    if (!system.integratedLadder) f.bar("ladder", undefined, a, c, { w: 0.4 });
    else if (k === 0) f.bar(accessKind, undefined, a, c, { w: 0.4 });
    else f.visual("ladder", a, c, { w: 0.4 });
  });
}

function railsAndToes(f, ctx, b, isStair) {
  const { job, levels, vin, vout, hop } = ctx;
  const innerRails = job.innerGuardrail && !hop;
  for (const d of levels.deckLevels) {
    for (const dz of [0.5, 1.0]) {
      if (!isStair) {
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
    if (!isStair)
      f.bar("toeboard", b.len, [b.u0, vout, d], [b.u1, vout, d], {
        face: "out",
      });
    if (innerRails)
      f.bar("toeboard", b.len, [b.u0, vin, d], [b.u1, vin, d], { face: "in" });
  }
}

function faceBraces(f, levels, b, v) {
  levels.intervals.forEach(({ z0, z1, h }, k) => {
    if (h < 0.75) return;
    const flip = k % 2 === 0;
    f.bar(
      "brace",
      b.len,
      [flip ? b.u0 : b.u1, v, z0],
      [flip ? b.u1 : b.u0, v, z1],
      {},
      h,
    );
  });
}

function bayComponents(f, ctx, b, i) {
  const { levels, vin, vout, lay, hop } = ctx;
  const isLadder = ctx.ladderBays.has(i);
  const isStair = ctx.stairBays.has(i);
  for (const z of levels.ledgerLevels) {
    f.bar("ledger", b.len, [b.u0, vin, z], [b.u1, vin, z]);
    f.bar("ledger", b.len, [b.u0, vout, z], [b.u1, vout, z]);
  }
  railsAndToes(f, ctx, b, isStair);
  for (const z of isLadder ? levels.liftLevels : levels.deckLevels) {
    deckBay(f, ctx, b, z, isLadder);
  }
  if (isLadder) ladderInBay(f, ctx, b);
  if (hop && !(i === 0 && lay.skipFirst)) {
    for (const z of levels.deckLevels) planks(f, ctx, b, z, hop.decks, vin, -1);
  }
  if (ctx.bracedBays.has(i)) faceBraces(f, levels, b, vout);
  if (isStair) stairTower(f, ctx, b);
}

function stairTower(f, ctx, b) {
  const { system, levels, W, vout, plankW } = ctx;
  const vt = vout + W;
  for (const u of [b.u0, b.u1]) standardColumn(f, ctx, u, vt);
  const lifts = new Set(levels.liftLevels);
  for (const z of levels.ledgerLevels) {
    f.bar("ledger", b.len, [b.u0, vt, z], [b.u1, vt, z]);
    for (const u of [b.u0, b.u1])
      crossMember(f, ctx, u, z, lifts.has(z), vout, vt);
  }
  const stairW = system.stair?.width ?? 0.64;
  const rise = system.stair?.rise ?? 2.0;
  const vc = vout + 0.05 + stairW / 2;
  const accessKind = hasKind(system, "accessladder")
    ? "accessladder"
    : "ladder";
  levels.liftLevels.forEach((z1, k) => {
    for (const dz of [0.5, 1.0]) {
      f.bar("ledger", b.len, [b.u0, vt, z1 + dz], [b.u1, vt, z1 + dz], {
        rail: true,
      });
      for (const u of [b.u0, b.u1]) {
        f.bar(
          system.bareTransom ?? "transom",
          W,
          [u, vout, z1 + dz],
          [u, vt, z1 + dz],
          { rail: true },
        );
      }
    }
    const vd = vt - plankW / 2 - 0.02;
    f.bar("plank", b.len, [b.u0, vd, z1], [b.u1, vd, z1], { w: plankW - 0.01 });
    const z0 = round2(z1 - rise);
    const fwd = k % 2 === 0;
    const fits = k === 0 ? z0 >= -EPS : near(z0, levels.liftLevels[k - 1]);
    if (fits) {
      f.bar(
        "stair",
        b.len,
        [fwd ? b.u0 : b.u1, vc, Math.max(0, z0)],
        [fwd ? b.u1 : b.u0, vc, z1],
        { w: stairW },
      );
    } else if (k === 0) {
      f.bar(
        accessKind,
        undefined,
        [b.u0 + 0.3, vd, 0],
        [b.u0 + 0.3 + z1 * 0.3, vd, z1],
        { w: 0.4 },
      );
    }
  });
  faceBraces(f, levels, b, vt);
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

function tieComponents(f, ctx, us, skipFirst) {
  const { job, levels, vin } = ctx;
  if (job.tieEveryBays <= 0) return 0;
  const lines = us.filter((_, j) => !(j === 0 && skipFirst));
  const picks = [];
  for (let k = 0; k < lines.length; k += job.tieEveryBays) picks.push(lines[k]);
  if (lines.length && picks.at(-1) !== lines.at(-1)) picks.push(lines.at(-1));
  let count = 0;
  for (const u of picks) {
    for (const z of levels.tieLevels) {
      f.bar("tietube", undefined, [u, 0, z], [u, vin, z]);
      f.count("coupler");
      f.count("coupler");
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
    hop: (system.hopUps ?? []).find((h) => h.decks === Number(run.hopUps)),
    boards: widthSpec.boards,
    plankW: system.deckWidth ?? W / widthSpec.boards,
    ladderBays: access.ladder,
    stairBays: access.stair,
    bracedBays: bracedBayIndexes(lay.bays, job.braceEvery, (len) =>
      levels.intervals.every(
        ({ h }) => h < 0.75 || Boolean(findComponent(system, "brace", len, h)),
      ),
    ),
  };
  const f = frameFor(sink, place, i);
  const decks = new Set(levels.deckLevels);
  const lifts = new Set(levels.liftLevels);
  us.forEach((u, j) => {
    if (j === 0 && lay.skipFirst) return;
    for (const v of [ctx.vin, ctx.vout]) standardColumn(f, ctx, u, v);
    const ladderSide = access.ladder.has(j - 1) || access.ladder.has(j);
    for (const z of levels.ledgerLevels) {
      crossMember(f, ctx, u, z, decks.has(z) || (ladderSide && lifts.has(z)));
    }
  });
  if (ctx.hop) {
    for (const u of us) {
      for (const z of levels.deckLevels) {
        f.bar(
          "bracket",
          ctx.hop.bracket,
          [u, ctx.vin, z],
          [u, ctx.vin - ctx.hop.bracket, z],
        );
      }
    }
  }
  lay.bays.forEach((len, k) =>
    bayComponents(f, ctx, { u0: us[k], u1: us[k + 1], len }, k),
  );
  const freeStart = !["convex", "concave"].includes(lay.startCorner);
  const freeEnd = !lay.cornerBay && lay.endCorner !== "concave";
  if (lay.bays.length) {
    for (const d of levels.deckLevels) {
      if (freeStart) railsAcross(f, ctx, us[0], d);
      if (freeEnd) railsAcross(f, ctx, us.at(-1), d);
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
  "plank",
  "hatch",
  "brace",
  "toeboard",
  "bracket",
  "stair",
  "accessladder",
  "ladder",
  "basejack",
  "basecollar",
  "soleboard",
  "tietube",
  "coupler",
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

function accessBays(run, bays, system) {
  const hatchLens = lengthsOf(system, "hatch").filter((l) => l > 0);
  const okHatch = (len) =>
    hatchLens.length === 0 || hatchLens.some((h) => near(h, len));
  const ladder = pickBays(bays, Number(run.ladderBays) || 0, okHatch);
  const stairLen = system.stair?.bayLength;
  const okStair = (len) => stairLen !== undefined && near(len, stairLen);
  const stair = pickBays(bays, Number(run.stairBays) || 0, okStair, ladder.set);
  return {
    ladder: ladder.set,
    stair: stair.set,
    hatchLens,
    short: { ladder: ladder.short, stair: stair.short },
  };
}

function accessNotes(run, access, system) {
  const notes = [];
  if (access.short.ladder > 0) {
    notes.push(
      `${run.label}: a ladder hatch needs a ${access.hatchLens.join(" or ")} m bay. Raise the largest bay or move the ladder.`,
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
    const access = accessBays(run, lay.bays, system);
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
      hopUps: Number(run.hopUps) || 0,
      hopWidth: built.ctx.hop?.bracket ?? 0,
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
    if (r.gap > 0.226 && !r.hopUps && !job.innerGuardrail) {
      notes.push(
        `${r.run.label}: gap to wall is ${r.gap} m, over 225 mm. Add a hop-up or inner guardrails.`,
      );
    }
    const hopWidth =
      system.hopUps?.find((h) => h.decks === r.hopUps)?.bracket ?? 0;
    if (r.hopUps && r.gap - hopWidth > 0.226) {
      notes.push(
        `${r.run.label}: ${round2(r.gap - hopWidth)} m left between hop-up and wall. Use a wider hop-up or inner guardrails.`,
      );
    }
    if (r.hopUps && r.gap < hopWidth) {
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
