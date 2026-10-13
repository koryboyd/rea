import { SYSTEMS, lengthsOf } from "./catalog.js";

let seq = 0;
export const newId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const newRun = (overrides = {}) => ({
  id: newId("run"),
  label: "New run",
  direction: "E",
  length: 6,
  height: 4,
  decks: "top",
  ladderBays: 0,
  flip: false,
  ...overrides,
});

export const SHAPES = {
  wall: {
    label: "One wall",
    sides: [["Front", "E", "length"]],
  },
  L: {
    label: "L shape",
    sides: [
      ["Front", "E", "length"],
      ["Side", "S", "depth"],
    ],
  },
  U: {
    label: "Three sides",
    sides: [
      ["Left side", "N", "depth"],
      ["Front", "E", "length"],
      ["Right side", "S", "depth"],
    ],
  },
  rect: {
    label: "All round",
    sides: [
      ["Front", "E", "length"],
      ["Right side", "S", "depth"],
      ["Rear", "W", "length"],
      ["Left side", "N", "depth"],
    ],
  },
};

export const usesDepth = (type) =>
  SHAPES[type].sides.some((s) => s[2] === "depth");

export function shapeRuns(shape) {
  const def = SHAPES[shape.type] ?? SHAPES.rect;
  const front = def.sides.findIndex((s) => s[0] === "Front");
  return def.sides.map(([label, direction, dim], i) => ({
    id: `side-${i}`,
    label,
    direction,
    length: Number(shape[dim]),
    height: Number(shape.height),
    decks: shape.decks,
    ladderBays: i === front ? Number(shape.ladders) || 0 : 0,
    flip: false,
  }));
}

export function withShape(job, shape) {
  return { ...job, shape, runs: shapeRuns(shape) };
}

export function blankJob(base) {
  return withShape(
    {
      ...base,
      id: newId("job"),
      example: false,
      name: "New job",
      client: "",
      site: "",
    },
    { type: "rect", length: 10, depth: 8, height: 4, decks: "top", ladders: 1 },
  );
}

export function exampleJob() {
  const job = {
    id: newId("job"),
    example: true,
    name: "Example: two-storey house 12 x 9 m",
    client: "Example client",
    site: "12 Example St",
    system: "cuplok",
    duty: "medium",
    loadedDecks: 1,
    liftHeight: 2.0,
    width: 1.3,
    maxBay: 2.5,
    wallGap: 0.3,
    braceEvery: 3,
    tieVertical: 4.0,
    tieEveryBays: 2,
    innerGuardrail: false,
    allowableLegKN: "",
    groundBearingKPa: "",
    soleArea: 0.1125,
    quote: {
      weeks: 6,
      erectRate: 14,
      dismantleRate: 7,
      cartage: 350,
      marginPct: 15,
      gstPct: 10,
    },
    catalogOverrides: {},
  };
  return conformToSystem(
    withShape(job, {
      type: "rect",
      length: 12,
      depth: 9,
      height: 6,
      decks: "top",
      ladders: 1,
    }),
  );
}

const nearest = (values, target) =>
  values.reduce((best, v) =>
    Math.abs(v - target) < Math.abs(best - target) ? v : best,
  );

export function conformToSystem(job) {
  const system = SYSTEMS[job.system] ?? SYSTEMS.cuplok;
  const ledgers = lengthsOf(system, "ledger");
  return {
    ...job,
    system: system.id,
    width: nearest(
      system.widths.map((w) => w.width),
      Number(job.width) || 1.2,
    ),
    maxBay: nearest(ledgers, Number(job.maxBay) || ledgers.at(-1)),
    liftHeight: nearest(system.liftHeights, Number(job.liftHeight) || 2),
  };
}
