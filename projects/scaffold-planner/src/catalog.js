import { RINGSCAFF } from "./ringscaff.js";

// Nominal component data. Lengths, weights and rates are placeholders until
// they are replaced with the Scafom / supplier catalogue figures.

const generic = (prefix, stairBay) => [
  {
    code: `${prefix}-HOP1`,
    name: "Hop-up bracket 1 board",
    kind: "bracket",
    length: 0.3,
    weight: 4.0,
    hire: 0.3,
  },
  {
    code: `${prefix}-HOP2`,
    name: "Hop-up bracket 2 board",
    kind: "bracket",
    length: 0.5,
    weight: 6.5,
    hire: 0.4,
  },
  {
    code: `${prefix}-STAIR`,
    name: `Stair unit for ${stairBay} m bay`,
    kind: "stair",
    length: stairBay,
    weight: 25.0,
    hire: 3.0,
  },
  {
    code: `${prefix}-BJ600`,
    name: "Adjustable base jack 600",
    kind: "basejack",
    length: 0.6,
    weight: 5.5,
    hire: 0.35,
  },
  {
    code: "SOLE-225x500",
    name: "Sole board 225 x 500 timber",
    kind: "soleboard",
    length: 0.5,
    weight: 3.0,
    hire: 0.05,
  },
  {
    code: "LAD-3.0",
    name: "Aluminium ladder 3.0 m",
    kind: "ladder",
    length: 3.0,
    weight: 10.0,
    hire: 1.5,
  },
  {
    code: `${prefix}-HATCH`,
    name: "Ladder access hatch deck",
    kind: "hatch",
    length: 0,
    weight: 20.0,
    hire: 2.5,
  },
  {
    code: "TUBE-1.5",
    name: "Tie tube 1.5 m",
    kind: "tietube",
    length: 1.5,
    weight: 6.5,
    hire: 0.2,
  },
  {
    code: "CPL-DBL",
    name: "Double coupler",
    kind: "coupler",
    length: 0,
    weight: 1.0,
    hire: 0.1,
  },
];

export const SYSTEMS = {
  ringscaff: RINGSCAFF,
  cuplok: {
    id: "cuplok",
    name: "Scafom Cuplok",
    nodePitch: 0.5,
    deckWidth: 0.225,
    defaultBraceEvery: 3,
    hopUps: [
      { decks: 1, bracket: 0.3 },
      { decks: 2, bracket: 0.5 },
    ],
    stair: { bayLength: 2.5, rise: 2.0, width: 0.65 },
    liftHeights: [1.5, 2.0],
    widths: [
      { width: 0.8, boards: 3 },
      { width: 1.3, boards: 5 },
    ],
    components: [
      {
        code: "CS-1.0",
        name: "Cuplok standard 1.0 m",
        kind: "standard",
        length: 1.0,
        weight: 6.0,
        hire: 0.5,
      },
      {
        code: "CS-1.5",
        name: "Cuplok standard 1.5 m",
        kind: "standard",
        length: 1.5,
        weight: 8.6,
        hire: 0.65,
      },
      {
        code: "CS-2.0",
        name: "Cuplok standard 2.0 m",
        kind: "standard",
        length: 2.0,
        weight: 11.4,
        hire: 0.8,
      },
      {
        code: "CS-2.5",
        name: "Cuplok standard 2.5 m",
        kind: "standard",
        length: 2.5,
        weight: 14.0,
        hire: 0.95,
      },
      {
        code: "CS-3.0",
        name: "Cuplok standard 3.0 m",
        kind: "standard",
        length: 3.0,
        weight: 16.9,
        hire: 1.1,
      },
      {
        code: "CL-0.8",
        name: "Cuplok ledger 0.8 m",
        kind: "ledger",
        length: 0.8,
        weight: 3.6,
        hire: 0.35,
      },
      {
        code: "CL-1.3",
        name: "Cuplok ledger 1.3 m",
        kind: "ledger",
        length: 1.3,
        weight: 5.4,
        hire: 0.45,
      },
      {
        code: "CL-1.8",
        name: "Cuplok ledger 1.8 m",
        kind: "ledger",
        length: 1.8,
        weight: 7.2,
        hire: 0.55,
      },
      {
        code: "CL-2.5",
        name: "Cuplok ledger 2.5 m",
        kind: "ledger",
        length: 2.5,
        weight: 9.6,
        hire: 0.7,
      },
      {
        code: "CT-0.8",
        name: "Cuplok board transom 0.8 m",
        kind: "transom",
        length: 0.8,
        weight: 4.5,
        hire: 0.4,
      },
      {
        code: "CT-1.3",
        name: "Cuplok board transom 1.3 m",
        kind: "transom",
        length: 1.3,
        weight: 7.0,
        hire: 0.55,
      },
      {
        code: "CP-0.8",
        name: "Steel plank 0.8 m",
        kind: "plank",
        length: 0.8,
        weight: 6.0,
        hire: 0.5,
      },
      {
        code: "CP-1.3",
        name: "Steel plank 1.3 m",
        kind: "plank",
        length: 1.3,
        weight: 9.5,
        hire: 0.65,
      },
      {
        code: "CP-1.8",
        name: "Steel plank 1.8 m",
        kind: "plank",
        length: 1.8,
        weight: 12.5,
        hire: 0.8,
      },
      {
        code: "CP-2.5",
        name: "Steel plank 2.5 m",
        kind: "plank",
        length: 2.5,
        weight: 17.0,
        hire: 1.0,
      },
      {
        code: "CB-0.8",
        name: "Face brace for 0.8 m bay",
        kind: "brace",
        length: 0.8,
        weight: 7.0,
        hire: 0.5,
      },
      {
        code: "CB-1.3",
        name: "Face brace for 1.3 m bay",
        kind: "brace",
        length: 1.3,
        weight: 8.0,
        hire: 0.55,
      },
      {
        code: "CB-1.8",
        name: "Face brace for 1.8 m bay",
        kind: "brace",
        length: 1.8,
        weight: 9.5,
        hire: 0.6,
      },
      {
        code: "CB-2.5",
        name: "Face brace for 2.5 m bay",
        kind: "brace",
        length: 2.5,
        weight: 11.5,
        hire: 0.7,
      },
      {
        code: "CTB-0.8",
        name: "Toe board 0.8 m",
        kind: "toeboard",
        length: 0.8,
        weight: 2.0,
        hire: 0.2,
      },
      {
        code: "CTB-1.3",
        name: "Toe board 1.3 m",
        kind: "toeboard",
        length: 1.3,
        weight: 3.0,
        hire: 0.25,
      },
      {
        code: "CTB-1.8",
        name: "Toe board 1.8 m",
        kind: "toeboard",
        length: 1.8,
        weight: 4.0,
        hire: 0.3,
      },
      {
        code: "CTB-2.5",
        name: "Toe board 2.5 m",
        kind: "toeboard",
        length: 2.5,
        weight: 5.5,
        hire: 0.35,
      },
      ...generic("C", 2.5),
    ],
  },
  kwikstage: {
    id: "kwikstage",
    name: "Kwikstage",
    nodePitch: 0.5,
    deckWidth: 0.23,
    defaultBraceEvery: 3,
    hopUps: [
      { decks: 1, bracket: 0.3 },
      { decks: 2, bracket: 0.5 },
    ],
    stair: { bayLength: 2.4, rise: 2.0, width: 0.65 },
    liftHeights: [1.5, 2.0],
    widths: [
      { width: 0.7, boards: 3 },
      { width: 1.2, boards: 5 },
    ],
    components: [
      {
        code: "KS-0.5",
        name: "Kwikstage standard 0.5 m",
        kind: "standard",
        length: 0.5,
        weight: 3.2,
        hire: 0.35,
      },
      {
        code: "KS-1.0",
        name: "Kwikstage standard 1.0 m",
        kind: "standard",
        length: 1.0,
        weight: 5.8,
        hire: 0.5,
      },
      {
        code: "KS-1.5",
        name: "Kwikstage standard 1.5 m",
        kind: "standard",
        length: 1.5,
        weight: 8.4,
        hire: 0.65,
      },
      {
        code: "KS-2.0",
        name: "Kwikstage standard 2.0 m",
        kind: "standard",
        length: 2.0,
        weight: 11.0,
        hire: 0.8,
      },
      {
        code: "KS-2.5",
        name: "Kwikstage standard 2.5 m",
        kind: "standard",
        length: 2.5,
        weight: 13.6,
        hire: 0.95,
      },
      {
        code: "KS-3.0",
        name: "Kwikstage standard 3.0 m",
        kind: "standard",
        length: 3.0,
        weight: 16.2,
        hire: 1.1,
      },
      {
        code: "KL-0.7",
        name: "Kwikstage ledger 0.7 m",
        kind: "ledger",
        length: 0.7,
        weight: 3.0,
        hire: 0.3,
      },
      {
        code: "KL-1.2",
        name: "Kwikstage ledger 1.2 m",
        kind: "ledger",
        length: 1.2,
        weight: 4.6,
        hire: 0.4,
      },
      {
        code: "KL-1.8",
        name: "Kwikstage ledger 1.8 m",
        kind: "ledger",
        length: 1.8,
        weight: 6.6,
        hire: 0.55,
      },
      {
        code: "KL-2.4",
        name: "Kwikstage ledger 2.4 m",
        kind: "ledger",
        length: 2.4,
        weight: 8.6,
        hire: 0.7,
      },
      {
        code: "KT-0.7",
        name: "Kwikstage transom 0.7 m",
        kind: "transom",
        length: 0.7,
        weight: 4.2,
        hire: 0.4,
      },
      {
        code: "KT-1.2",
        name: "Kwikstage transom 1.2 m",
        kind: "transom",
        length: 1.2,
        weight: 6.6,
        hire: 0.55,
      },
      {
        code: "KP-0.7",
        name: "Steel plank 0.7 m",
        kind: "plank",
        length: 0.7,
        weight: 5.5,
        hire: 0.45,
      },
      {
        code: "KP-1.2",
        name: "Steel plank 1.2 m",
        kind: "plank",
        length: 1.2,
        weight: 8.5,
        hire: 0.6,
      },
      {
        code: "KP-1.8",
        name: "Steel plank 1.8 m",
        kind: "plank",
        length: 1.8,
        weight: 12.4,
        hire: 0.8,
      },
      {
        code: "KP-2.4",
        name: "Steel plank 2.4 m",
        kind: "plank",
        length: 2.4,
        weight: 16.3,
        hire: 1.0,
      },
      {
        code: "KB-0.7",
        name: "Face brace for 0.7 m bay",
        kind: "brace",
        length: 0.7,
        weight: 6.8,
        hire: 0.5,
      },
      {
        code: "KB-1.2",
        name: "Face brace for 1.2 m bay",
        kind: "brace",
        length: 1.2,
        weight: 7.8,
        hire: 0.55,
      },
      {
        code: "KB-1.8",
        name: "Face brace for 1.8 m bay",
        kind: "brace",
        length: 1.8,
        weight: 9.4,
        hire: 0.6,
      },
      {
        code: "KB-2.4",
        name: "Face brace for 2.4 m bay",
        kind: "brace",
        length: 2.4,
        weight: 11.2,
        hire: 0.7,
      },
      {
        code: "KTB-0.7",
        name: "Toe board 0.7 m",
        kind: "toeboard",
        length: 0.7,
        weight: 1.8,
        hire: 0.2,
      },
      {
        code: "KTB-1.2",
        name: "Toe board 1.2 m",
        kind: "toeboard",
        length: 1.2,
        weight: 2.8,
        hire: 0.25,
      },
      {
        code: "KTB-1.8",
        name: "Toe board 1.8 m",
        kind: "toeboard",
        length: 1.8,
        weight: 4.0,
        hire: 0.3,
      },
      {
        code: "KTB-2.4",
        name: "Toe board 2.4 m",
        kind: "toeboard",
        length: 2.4,
        weight: 5.3,
        hire: 0.35,
      },
      ...generic("K", 2.4),
    ],
  },
};

export const DUTY_CLASSES = {
  light: { label: "Light duty", kgPerBay: 225 },
  medium: { label: "Medium duty", kgPerBay: 450 },
  heavy: { label: "Heavy duty", kgPerBay: 675 },
};

export function getSystem(id, overrides = {}) {
  const base = SYSTEMS[id];
  if (!base) throw new Error(`Unknown scaffold system: ${id}`);
  const components = base.components.map((c) => ({
    ...c,
    ...overrides[c.code],
  }));
  return { ...base, components };
}

export function lengthsOf(system, kind) {
  return system.components
    .filter((c) => c.kind === kind)
    .map((c) => c.length)
    .sort((a, b) => a - b);
}

export const bayLengthsOf = (system) =>
  system.bayLengths ?? lengthsOf(system, "ledger");

export const hasKind = (system, kind) =>
  system.components.some((c) => c.kind === kind);

export function findComponent(system, kind, length, height) {
  return system.components.find(
    (c) =>
      c.kind === kind &&
      (length === undefined || Math.abs(c.length - length) < 1e-6) &&
      (height === undefined ||
        c.height === undefined ||
        Math.abs(c.height - height) < 1e-6),
  );
}
