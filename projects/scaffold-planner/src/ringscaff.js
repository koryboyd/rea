// Scafom-rux RINGSCAFF, LA 07 dimension (compatible 0.73–3.07 m bays).
// Part numbers, weights and list prices (€, each) from the Scafom-rux
// RINGSCAFF price list, status 06/2019. Hire rates are placeholders set to
// 2% of list price per week until replaced with your own rates.

const row =
  (kind, name) =>
  ([length, weight, code, listEur, height]) => ({
    code,
    name: name(length, height),
    kind,
    length,
    ...(height === undefined ? {} : { height }),
    weight,
    listEur,
    hire: Math.round(listEur * 0.02 * 100) / 100,
  });

const m = (n) => `${n.toFixed(2)} m`;

const standards = [
  [0.5, 3.0, "E04RS0005", 18.1],
  [1.0, 5.4, "E04RS0030", 23.2],
  [1.5, 7.7, "E04RS0055", 33.0],
  [2.0, 10.0, "E04RS0071", 37.9],
  [2.5, 12.4, "E04RS0225", 51.7],
  [3.0, 14.8, "E04RS0096", 56.2],
  [4.0, 19.3, "E04RS0107", 72.0],
].map(row("standard", (l) => `Standard with tube connector ${m(l)}`));

const ledgers = [
  [0.73, 3.5, "E04RS0011", 17.8],
  [1.09, 4.1, "E04RS0033", 21.3],
  [1.4, 5.7, "E04RS0047", 26.1],
  [1.57, 6.4, "E04RS0058", 26.1],
  [2.07, 8.4, "E04RS0074", 30.5],
  [2.57, 10.0, "E04RS0086", 34.7],
  [3.07, 11.7, "E04RS0099", 39.2],
].map(row("ledger", (l) => `Tubular ledger ${m(l)}`));

const transoms = [
  [0.73, 3.4, "E04RS0378", 21.1],
  [1.09, 6.2, "E04RS0379", 35.9],
  [1.4, 7.9, "E04RS0380", 43.4],
].map(row("transom", (l) => `U-ledger ${l > 1 ? "reinforced " : ""}${m(l)}`));

const decks = [
  [0.73, 5.9, "E04RS0941", 45.8],
  [1.09, 9.7, "E04RS0887", 46.7],
  [1.57, 11.3, "E04RS0942", 48.0],
  [2.07, 15.6, "E04RS0888", 53.8],
  [2.57, 18.7, "E04RS0943", 62.2],
  [3.07, 21.5, "E04RS0944", 70.5],
].map(row("plank", (l) => `Steel deck 0.32 m U-hook ${m(l)}`));

const hatches = [
  [2.57, 21.0, "E04RS0467", 259.0],
  [3.07, 24.5, "E04RS0468", 287.8],
].map(row("hatch", (l) => `Ladder hatch deck with ladder ${m(l)} x 0.61 m`));

const braceName = (l, h) => `Diagonal ${l.toFixed(2)} x ${h.toFixed(2)} m`;
const braces = [
  [0.73, 7.2, "E04RS0017", 34.5, 2.0],
  [1.09, 7.5, "E04RS0038", 36.2, 2.0],
  [1.4, 8.2, "E04RS0051", 36.7, 2.0],
  [1.57, 8.1, "E04RS0065", 37.2, 2.0],
  [2.07, 9.0, "E04RS0077", 38.8, 2.0],
  [2.57, 10.0, "E04RS0092", 41.5, 2.0],
  [3.07, 11.0, "E04RS0102", 44.2, 2.0],
  [1.09, 6.8, "E04RS0334", 32.95, 1.5],
  [1.4, 7.2, "E04RS0320", 34.2, 1.5],
  [1.57, 7.6, "E04RS0335", 34.9, 1.5],
  [2.07, 8.2, "E04RS0336", 37.4, 1.5],
  [2.57, 9.6, "E04RS0337", 39.8, 1.5],
  [3.07, 10.5, "E04RS0338", 44.2, 1.5],
  [1.09, 4.9, "E04RS0328", 30.95, 1.0],
  [1.4, 5.5, "E04RS0329", 35.5, 1.0],
  [1.57, 5.9, "E04RS0330", 37.4, 1.0],
  [2.07, 7.1, "E04RS0331", 39.1, 1.0],
  [2.57, 8.2, "E04RS0332", 39.4, 1.0],
  [3.07, 9.8, "E04RS0333", 44.7, 1.0],
].map(row("brace", braceName));

// Short 0.73 m diagonals confirmed in use but not in the 2019 price list.
// Part numbers are placeholders and weights are estimated from the 1.09 m
// sizes until the Scafom figures are entered.
const shortBraces = [
  [1.5, 6.5, 0.65],
  [1.0, 4.6, 0.6],
].map(([height, weight, hire]) => ({
  code: `RS-DIAG-0.73x${height.toFixed(2)}`,
  name: `${braceName(0.73, height)} (part no. not in 2019 price list)`,
  kind: "brace",
  length: 0.73,
  height,
  weight,
  hire,
}));

const toeboards = [
  [0.73, 2.8, "E04RS0016", 13.0],
  [1.09, 3.9, "E04RS0037", 13.8],
  [1.4, 4.9, "E04RS0054", 14.8],
  [1.57, 5.5, "E04RS0064", 14.8],
  [2.07, 7.2, "E04RS0076", 15.9],
  [2.57, 8.8, "E04RS0091", 17.7],
  [3.07, 10.3, "E04RS0101", 18.6],
].map(row("toeboard", (l) => `Wooden toe board ${m(l)}`));

const brackets = [
  [0.39, 3.8, "E04RS0449", 29.6],
  [0.73, 6.8, "E04RS0417", 34.8],
].map(
  row(
    "bracket",
    (l) => `Steel bracket U-hook ${m(l)} (${l < 0.5 ? 1 : 2} deck)`,
  ),
);

const access = [
  row(
    "stair",
    () => "Aluminium platform stairway 0.64 m U-hook, 2.57 m bay",
  )([2.57, 23.0, "E04RS0589", 365.0]),
  row(
    "accessladder",
    () => "Access ladder for 1 level 2.16 m",
  )([2.16, 9.4, "07100", 45.9]),
];

const base = [
  row("basejack", () => "Base jack 0.60 m")([0.6, 3.9, "08358", 14.3]),
  row(
    "basecollar",
    () => "Standard lead-off adapter (base collar)",
  )([0.26, 1.5, "E04RS0002", 10.3]),
];

const site = [
  {
    code: "SOLE-225x500",
    name: "Sole board 225 x 500 timber",
    kind: "soleboard",
    length: 0.5,
    weight: 3.0,
    hire: 0.05,
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

export const RINGSCAFF = {
  id: "ringscaff",
  name: "Scafom Ringscaff",
  nodePitch: 0.5,
  liftHeights: [2.0],
  deckWidth: 0.32,
  defaultBraceEvery: 2,
  hopUps: [
    { decks: 1, bracket: 0.39 },
    { decks: 2, bracket: 0.73 },
  ],
  stair: { bayLength: 2.57, rise: 2.0, width: 0.64 },
  bayLengths: [0.73, 1.09, 1.57, 2.07, 2.57, 3.07],
  defaultMaxBay: 2.57,
  widths: [
    { width: 0.73, boards: 2 },
    { width: 1.09, boards: 3 },
    { width: 1.4, boards: 4 },
  ],
  bareTransom: "ledger",
  integratedLadder: true,
  source: "Scafom-rux RINGSCAFF price list 06/2019",
  components: [
    ...standards,
    ...ledgers,
    ...transoms,
    ...decks,
    ...braces,
    ...shortBraces,
    ...toeboards,
    ...base,
    ...hatches,
    ...brackets,
    ...access,
    ...site,
  ],
};
