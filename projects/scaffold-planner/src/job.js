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

export function exampleJob() {
  return conformToSystem({
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
    runs: [
      newRun({
        label: "Front",
        direction: "E",
        length: 12,
        height: 6,
        ladderBays: 1,
      }),
      newRun({ label: "Right side", direction: "S", length: 9, height: 6 }),
      newRun({ label: "Rear", direction: "W", length: 12, height: 6 }),
      newRun({ label: "Left side", direction: "N", length: 9, height: 6 }),
    ],
  });
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
