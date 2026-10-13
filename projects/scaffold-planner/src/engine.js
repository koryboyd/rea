import { findComponent, getSystem, lengthsOf } from "./catalog.js";

const GRID = 0.05;
const EPS = 1e-6;
const toUnits = (m) => Math.round(m / GRID);
const round2 = (n) => Math.round(n * 100) / 100;

export const DIRECTIONS = {
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
  N: [0, -1],
};

export function combine(target, lengths, overshootWeight) {
  const pieces = lengths.map(toUnits).filter((u) => u > 0);
  if (pieces.length === 0) throw new Error("No component lengths available");
  const goal = Math.max(1, toUnits(target));
  const limit = goal + Math.max(...pieces);
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
  const out = [];
  for (let s = best; s > 0; s -= last[s]) out.push(round2(last[s] * GRID));
  return out.sort((a, b) => b - a);
}

export const solveBays = (length, ledgerLengths, maxBay) =>
  combine(
    length,
    ledgerLengths.filter((l) => l <= maxBay + EPS),
    2,
  );

export const composeColumn = (height, standardLengths) =>
  combine(height, standardLengths, 10);

function ladderBayIndexes(bayCount, ladderBays) {
  const n = Math.min(ladderBays, bayCount);
  const set = new Set();
  for (let i = 0; i < n; i++) set.add(Math.floor(((i + 0.5) * bayCount) / n));
  return set;
}

function bracedBayIndexes(bayCount, every) {
  const set = new Set();
  if (every <= 0) return set;
  for (let i = 0; i < bayCount; i += every) set.add(i);
  set.add(bayCount - 1);
  return set;
}

function tiePositions(standardLines, everyBays) {
  if (everyBays <= 0) return [];
  const out = [];
  for (let i = 0; i < standardLines; i += everyBays) out.push(i);
  if (out.at(-1) !== standardLines - 1) out.push(standardLines - 1);
  return out;
}

function levelsFor(run, job, system) {
  const lift = job.liftHeight;
  const lifts = Math.max(1, Math.ceil(run.height / lift - EPS));
  const topDeck = round2(lifts * lift);
  const deckLevels =
    run.decks === "all"
      ? Array.from({ length: lifts }, (_, i) => round2((i + 1) * lift))
      : [topDeck];
  const ledgerLevels = [
    system.nodePitch,
    ...Array.from({ length: lifts }, (_, i) => round2((i + 1) * lift)),
  ];
  const tieLevels = [];
  if (job.tieVertical > 0) {
    for (let z = job.tieVertical; z <= topDeck + EPS; z += job.tieVertical) {
      tieLevels.push(round2(z));
    }
  }
  return { lifts, topDeck, deckLevels, ledgerLevels, tieLevels };
}

function makeTally(system) {
  const items = new Map();
  const missing = new Set();
  const add = (kind, length, qty) => {
    if (qty <= 0) return;
    const c = findComponent(system, kind, length);
    if (!c) {
      missing.add(length === undefined ? kind : `${kind} ${length} m`);
      return;
    }
    items.set(c.code, (items.get(c.code) ?? 0) + qty);
  };
  return { items, missing, add };
}

function tallyRun(geo, run, job, system, widthSpec) {
  const { add, items, missing } = makeTally(system);
  const { bays, levels, standardPieces, ladderBays, bracedBays, ties } = geo;
  const lines = bays.length + 1;
  const decks = levels.deckLevels.length;
  const railFaces = job.innerGuardrail ? 2 : 1;

  for (const piece of standardPieces) add("standard", piece, lines * 2);
  add("basejack", undefined, lines * 2);
  add("soleboard", undefined, lines * 2);
  add("transom", job.width, lines * levels.ledgerLevels.length + decks * 4);
  add("toeboard", job.width, decks * 2);

  bays.forEach((len, i) => {
    add("ledger", len, 2 * levels.ledgerLevels.length + 2 * railFaces * decks);
    const hatch = ladderBays.has(i);
    add("plank", len, decks * (widthSpec.boards - (hatch ? 2 : 0)));
    add("toeboard", len, decks * railFaces);
    if (hatch) {
      add("hatch", undefined, decks);
      add("ladder", undefined, levels.lifts);
    }
    if (bracedBays.has(i)) add("brace", len, levels.lifts);
  });

  const tieCount = ties.length * levels.tieLevels.length;
  add("tietube", undefined, tieCount);
  add("coupler", undefined, tieCount * 2);
  return { items, missing: [...missing], tieCount };
}

function membersFor(geo, job) {
  const { bays, levels, standardPieces, bracedBays, ties } = geo;
  const vIn = job.wallGap;
  const vOut = job.wallGap + job.width;
  const columnTop = standardPieces.reduce((a, b) => a + b, 0);
  const us = [0];
  for (const b of bays) us.push(round2(us.at(-1) + b));
  const members = [];
  const bar = (type, a, b) => members.push({ type, a, b });

  for (const u of us) {
    for (const v of [vIn, vOut]) bar("standard", [u, v, 0], [u, v, columnTop]);
    for (const z of levels.ledgerLevels)
      bar("transom", [u, vIn, z], [u, vOut, z]);
  }
  const railZ = levels.deckLevels.flatMap((d) => [d + 0.5, d + 1.0]);
  bays.forEach((len, i) => {
    const [u0, u1] = [us[i], us[i + 1]];
    for (const z of levels.ledgerLevels) {
      bar("ledger", [u0, vIn, z], [u1, vIn, z]);
      bar("ledger", [u0, vOut, z], [u1, vOut, z]);
    }
    for (const z of railZ) {
      bar("rail", [u0, vOut, z], [u1, vOut, z]);
      if (job.innerGuardrail) bar("rail", [u0, vIn, z], [u1, vIn, z]);
    }
    for (const d of levels.deckLevels) {
      members.push({
        type: "deck",
        u0,
        u1,
        v0: vIn,
        v1: vOut,
        z: d,
        hatch: geo.ladderBays.has(i),
      });
    }
    if (bracedBays.has(i)) {
      for (let k = 0; k < levels.lifts; k++) {
        const z0 = k === 0 ? 0 : levels.ledgerLevels[k];
        const z1 = levels.ledgerLevels[k + 1];
        const flip = k % 2 === 0;
        bar("brace", [flip ? u0 : u1, vOut, z0], [flip ? u1 : u0, vOut, z1]);
      }
    }
  });
  for (const d of levels.deckLevels) {
    for (const u of [0, us.at(-1)]) {
      bar("rail", [u, vIn, d + 0.5], [u, vOut, d + 0.5]);
      bar("rail", [u, vIn, d + 1.0], [u, vOut, d + 1.0]);
    }
  }
  for (const i of ties) {
    for (const z of levels.tieLevels)
      bar("tie", [us[i], 0, z], [us[i], vIn, z]);
  }
  return { members, us };
}

export function buildRun(run, job, system) {
  const widthSpec = system.widths.find(
    (w) => Math.abs(w.width - job.width) < EPS,
  );
  if (!widthSpec)
    throw new Error(`Width ${job.width} m is not available for ${system.name}`);
  const bays = solveBays(run.length, lengthsOf(system, "ledger"), job.maxBay);
  const levels = levelsFor(run, job, system);
  const standardPieces = composeColumn(
    levels.topDeck + 1.0,
    lengthsOf(system, "standard"),
  );
  const geo = {
    bays,
    levels,
    standardPieces,
    ladderBays: ladderBayIndexes(bays.length, run.ladderBays ?? 0),
    bracedBays: bracedBayIndexes(bays.length, job.braceEvery),
    ties: tiePositions(bays.length + 1, job.tieEveryBays),
  };
  const tally = tallyRun(geo, run, job, system, widthSpec);
  const drawing = membersFor(geo, job);
  const scaffoldLength = round2(bays.reduce((a, b) => a + b, 0));
  return {
    run,
    ...geo,
    widthSpec,
    scaffoldLength,
    faceArea: round2(scaffoldLength * (levels.topDeck + 1.0)),
    ...tally,
    ...drawing,
  };
}

export function placeRuns(runs) {
  let at = [0, 0];
  return runs.map((run) => {
    const dir = DIRECTIONS[run.direction] ?? DIRECTIONS.E;
    const start = run.restart ? [run.x ?? 0, run.y ?? 0] : at;
    const outward = run.flip ? [-dir[1], dir[0]] : [dir[1], -dir[0]];
    at = [start[0] + dir[0] * run.length, start[1] + dir[1] * run.length];
    return { start, dir, outward };
  });
}

export const toWorld = (place, [u, v, z]) => [
  place.start[0] + place.dir[0] * u + place.outward[0] * v,
  place.start[1] + place.dir[1] * u + place.outward[1] * v,
  z,
];

export function mergeItems(maps) {
  const out = new Map();
  for (const m of maps)
    for (const [k, q] of m) out.set(k, (out.get(k) ?? 0) + q);
  return out;
}

export function partsList(items, system) {
  const order = [
    "standard",
    "ledger",
    "transom",
    "plank",
    "brace",
    "toeboard",
    "basejack",
    "soleboard",
    "ladder",
    "hatch",
    "tietube",
    "coupler",
  ];
  return system.components
    .filter((c) => items.has(c.code))
    .map((c) => {
      const qty = items.get(c.code);
      return { ...c, qty, totalWeight: round2(qty * c.weight) };
    })
    .sort(
      (a, b) =>
        order.indexOf(a.kind) - order.indexOf(b.kind) || a.length - b.length,
    );
}

export function buildJob(job) {
  const system = getSystem(job.system, job.catalogOverrides ?? {});
  const runs = job.runs.map((r) => buildRun(r, job, system));
  const places = placeRuns(job.runs);
  const items = mergeItems(runs.map((r) => r.items));
  const parts = partsList(items, system);
  return {
    system,
    runs,
    places,
    parts,
    totalWeight: round2(parts.reduce((a, p) => a + p.totalWeight, 0)),
    totalPieces: parts.reduce((a, p) => a + p.qty, 0),
    faceArea: round2(runs.reduce((a, r) => a + r.faceArea, 0)),
    missing: [...new Set(runs.flatMap((r) => r.missing))],
  };
}
