import { test } from "node:test";
import assert from "node:assert/strict";
import { getSystem } from "../src/catalog.js";
import { buildJob, combine, composeColumn, solveBays } from "../src/engine.js";
import { conformToSystem, exampleJob } from "../src/job.js";
import { jobLoads } from "../src/loads.js";
import { quoteJob } from "../src/quote.js";

const sum = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

test("bays cover the run with system ledger lengths only", () => {
  const ledgers = [0.8, 1.3, 1.8, 2.5];
  assert.deepEqual(solveBays(10, ledgers, 2.5), [2.5, 2.5, 2.5, 2.5]);
  const bays = solveBays(10.2, ledgers, 2.5);
  assert.ok(sum(bays) >= 10.2);
  assert.ok(bays.every((b) => ledgers.includes(b)));
  assert.ok(solveBays(9, ledgers, 1.8).every((b) => b <= 1.8));
});

test("kwikstage bays never use cuplok lengths", () => {
  const kwik = getSystem("kwikstage");
  const job = conformToSystem({ ...exampleJob(), system: "kwikstage" });
  const built = buildJob(job);
  const codes = built.parts.map((p) => p.code);
  assert.ok(codes.every((c) => kwik.components.some((k) => k.code === c)));
  assert.equal(built.missing.length, 0);
  assert.equal(job.width, 1.2);
  assert.equal(job.maxBay, 2.4);
});

test("standard columns reach top deck plus 1 m handrail", () => {
  const pieces = composeColumn(7, [1, 1.5, 2, 2.5, 3]);
  assert.equal(sum(pieces), 7);
  assert.deepEqual(pieces, [3, 3, 1]);
  assert.deepEqual(combine(0.3, [0.5], 1), [0.5]);
});

const count = (built, code) =>
  built.components.filter((c) => c.code === code).length;

test("closed rectangle shares corner standards and never doubles them", () => {
  const built = buildJob(exampleJob());
  const lines = built.runs.reduce((a, r) => a + r.bays.length + 1, 0);
  assert.equal(count(built, "08358"), lines * 2);
  const feet = built.components
    .filter((c) => c.kind === "basejack")
    .map((c) =>
      c.a
        .slice(0, 2)
        .map((v) => v.toFixed(2))
        .join(),
    );
  assert.equal(new Set(feet).size, feet.length);
  assert.equal(built.corners, 4);
  assert.ok(built.runs.every((r) => r.layout.cornerBay && r.layout.skipFirst));
});

test("ringscaff 6.5 m deck uses 0.5 m rings and Scafom parts", () => {
  const job = exampleJob();
  const built = buildJob(job);
  const front = built.runs[0];
  assert.equal(job.system, "ringscaff");
  assert.equal(front.levels.topDeck, 6.5);
  assert.deepEqual(front.levels.ledgerLevels, [0.5, 2.5, 4.5, 6.5]);
  assert.equal(built.missing.length, 0);
  assert.equal(count(built, "E04RS0533"), 1);
  assert.equal(count(built, "E04RS0501"), 1);
  assert.equal(count(built, "E04RS0456"), 1);
  assert.equal(count(built, "E04RS0455"), 2);
  assert.equal(count(built, "07100"), 0);
  assert.equal(count(built, "08358"), count(built, "E04RS0002"));
  const ring = getSystem("ringscaff").components.map((c) => c.code);
  assert.ok(built.parts.every((p) => ring.includes(p.code)));
});

test("hop-ups add a bracket per standard line and deck level", async () => {
  const { withShape } = await import("../src/job.js");
  const job = withShape(exampleJob(), {
    type: "wall",
    length: 10,
    height: 4.5,
    decks: "all",
    ladders: 0,
    hopUps: 1,
  });
  const built = buildJob({ ...job, wallGap: 0.45 });
  const r = built.runs[0];
  assert.equal(
    count(built, "E04RS0449"),
    (r.bays.length + 1) * r.levels.deckLevels.length,
  );
  const hopPlanks = built.components.filter(
    (c) => c.kind === "plank" && c.local.a[1] < r.gap,
  );
  assert.equal(hopPlanks.length, r.bays.length * r.levels.deckLevels.length);
  assert.equal(built.notes.length, 0);
});

test("stair tower climbs every lift in a 2.57 m bay", async () => {
  const { withShape } = await import("../src/job.js");
  const job = withShape(exampleJob(), {
    type: "wall",
    length: 10,
    height: 6.5,
    decks: "top",
    ladders: 0,
    stairs: 1,
  });
  const built = buildJob(job);
  const r = built.runs[0];
  assert.equal(r.stairBays.size, 1);
  assert.equal(r.bays[[...r.stairBays][0]], 2.57);
  assert.equal(count(built, "E04RS0589"), 3);
  assert.equal(built.missing.length, 0);
});

test("inside corners stop the first side short of the second", () => {
  const pts = [
    [0, 0],
    [10, 0],
    [10, 5],
    [5, 5],
    [5, 10],
    [0, 10],
  ];
  const runs = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const angle = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
    return {
      id: `e${i}`,
      label: `Edge ${i}`,
      start: p,
      angle,
      length: Math.hypot(q[0] - p[0], q[1] - p[1]),
      height: 4,
      decks: "top",
    };
  });
  const job = { ...exampleJob(), shape: null, closed: true, runs };
  const built = buildJob(job);
  const types = built.runs.map((r) => r.layout.endCorner);
  assert.deepEqual(types, [
    "convex",
    "convex",
    "concave",
    "convex",
    "convex",
    "convex",
  ]);
  const a = built.runs[2];
  const next = built.runs[3];
  assert.ok(a.us.at(-1) <= a.run.length - next.gap + 1e-6);
  assert.equal(built.missing.length, 0);
});

test("loads flag over-capacity legs only when an allowable is given", () => {
  const job = exampleJob();
  const built = buildJob(job);
  const unchecked = jobLoads(built, job);
  assert.ok(unchecked.every((l) => l.status === "unchecked" && l.legKN > 0));
  const tight = jobLoads(built, { ...job, allowableLegKN: 1 });
  assert.ok(tight.every((l) => l.status === "over"));
  const roomy = jobLoads(built, { ...job, allowableLegKN: 30 });
  assert.ok(roomy.every((l) => l.status === "ok"));
});

test("quote adds hire, labour, cartage, margin and GST", () => {
  const job = exampleJob();
  const built = buildJob(job);
  const q = quoteJob(built, job.quote);
  assert.equal(q.weeks, 6);
  assert.ok(q.hire > 0);
  assert.equal(q.cartage, 700);
  assert.equal(q.total, Math.round((q.exGst + q.gst) * 100) / 100);
  assert.equal(q.gst, Math.round(q.exGst * 0.1 * 100) / 100);
});

test("shape presets build chained sides with ladder access on the front", async () => {
  const { shapeRuns, withShape } = await import("../src/job.js");
  const rect = shapeRuns({
    type: "rect",
    length: 10,
    depth: 6,
    height: 4,
    decks: "top",
    ladders: 1,
  });
  assert.deepEqual(
    rect.map((r) => [r.label, r.direction, r.length]),
    [
      ["Front", "E", 10],
      ["Right side", "S", 6],
      ["Rear", "W", 10],
      ["Left side", "N", 6],
    ],
  );
  assert.equal(rect[0].ladderBays, 1);
  const u = shapeRuns({
    type: "U",
    length: 10,
    depth: 6,
    height: 4,
    decks: "all",
    ladders: 2,
  });
  assert.equal(u.find((r) => r.label === "Front").ladderBays, 2);
  assert.ok(u.every((r) => r.decks === "all"));
  const job = withShape(exampleJob(), {
    type: "wall",
    length: 7,
    depth: 0,
    height: 3,
    decks: "top",
    ladders: 0,
  });
  const built = buildJob(job);
  assert.equal(built.runs.length, 1);
  assert.equal(built.missing.length, 0);
});

test("free sides brace the end bay, then skip 2, brace, and the last bay", async () => {
  const { withShape } = await import("../src/job.js");
  const job = withShape(exampleJob(), {
    type: "wall",
    length: 18,
    height: 4.5,
    decks: "top",
    ladders: 0,
  });
  const built = buildJob(job);
  const r = built.runs[0];
  assert.equal(job.braceEvery, 3);
  const expected = new Set();
  for (let i = 0; i < r.bays.length; i += 3) expected.add(i);
  expected.add(r.bays.length - 1);
  assert.deepEqual([...r.bracedBays].sort(), [...expected].sort());
});

test("from a corner bay: skip 2, brace, skip 2, brace", () => {
  const built = buildJob(exampleJob());
  for (const r of built.runs) {
    const expected = [];
    for (let i = 2; i < r.bays.length; i += 3) expected.push(i);
    assert.deepEqual([...r.bracedBays].sort(), expected);
  }
});

test("hand edits add or remove parts on one bay", () => {
  const base = exampleJob();
  const front = base.runs[0].id;
  const job = {
    ...base,
    overrides: {
      [front]: {
        bays: {
          0: { brace: true, hopUps: 1, decks: "all" },
          2: { brace: false },
          3: { stair: true },
        },
        corner: { brace: false },
      },
    },
  };
  const built = buildJob(job);
  const r = built.runs[0];
  assert.ok(r.bracedBays.has(0));
  assert.ok(!r.bracedBays.has(2));
  assert.ok(r.stairBays.has(3));
  assert.equal(r.bayHops[0], 0.39);
  assert.deepEqual(r.bayDecks[0], r.levels.liftLevels);
  assert.equal(r.cornerBraced, false);
  const cornerBraces = built.components.filter(
    (c) => c.kind === "brace" && c.corner && c.run === 0,
  );
  assert.equal(cornerBraces.length, 0);
  assert.equal(built.missing.length, 0);
});

test("every corner bay is braced on both outside faces each lift", () => {
  const built = buildJob(exampleJob());
  const lifts = built.runs[0].levels.intervals.filter(
    (x) => x.h >= 0.75,
  ).length;
  const cornerBraces = built.components.filter(
    (c) => c.kind === "brace" && c.corner,
  );
  assert.equal(cornerBraces.length, built.corners * 2 * lifts);
  assert.ok(cornerBraces.every((c) => c.code === "E04RS0038"));
});

test("0.73 m bays take the short 0.73 diagonals", () => {
  const ring = getSystem("ringscaff");
  for (const h of [1.0, 1.5, 2.0]) {
    assert.ok(
      ring.components.some(
        (c) => c.kind === "brace" && c.length === 0.73 && c.height === h,
      ),
    );
  }
});

test("every diagonal rises the same way when viewed from outside", async () => {
  const { withShape } = await import("../src/job.js");
  const job = withShape(exampleJob(), {
    type: "rect",
    length: 12,
    depth: 9,
    height: 6.5,
    decks: "top",
    ladders: 1,
    stairs: 1,
  });
  const built = buildJob(job);
  const sense = (c) => {
    const r = built.runs[c.run];
    const lo = c.a[2] < c.b[2] ? c.a : c.b;
    const hi = c.a[2] < c.b[2] ? c.b : c.a;
    const along =
      (hi[0] - lo[0]) * r.place.dir[0] + (hi[1] - lo[1]) * r.place.dir[1];
    const out =
      (hi[0] - lo[0]) * r.place.outward[0] +
      (hi[1] - lo[1]) * r.place.outward[1];
    return Math.abs(along) > 1e-6 ? Math.sign(along) : Math.sign(out);
  };
  const braces = built.components.filter((c) => c.kind === "brace");
  const faceBraces = braces.filter(
    (c) => !c.corner || Math.abs(c.local.a[0] - c.local.b[0]) > 1e-6,
  );
  assert.ok(faceBraces.length > 0);
  assert.ok(faceBraces.every((c) => sense(c) === -1));
  const sideFaces = braces.filter(
    (c) => c.corner && Math.abs(c.local.a[0] - c.local.b[0]) < 1e-6,
  );
  assert.ok(sideFaces.every((c) => c.local.b[1] > c.local.a[1]));
});

test("stair towers guard the main scaffold side at non-working lifts and rail every flight", async () => {
  const { withShape } = await import("../src/job.js");
  const job = withShape(exampleJob(), {
    type: "wall",
    length: 10,
    height: 6.5,
    decks: "top",
    ladders: 0,
    stairs: 1,
  });
  const built = buildJob(job);
  const r = built.runs[0];
  const i = [...r.stairBays][0];
  const [u0, u1] = [r.us[i], r.us[i + 1]];
  const vout = r.gap + r.widthSpec.width;
  const innerRails = built.components.filter(
    (c) =>
      c.rail &&
      c.kind === "ledger" &&
      Math.abs(c.local.a[1] - vout) < 1e-6 &&
      Math.abs(c.local.a[0] - u0) < 1e-6 &&
      Math.abs(c.local.b[0] - u1) < 1e-6,
  );
  const nonWorking = r.levels.liftLevels.filter(
    (z) => !r.levels.deckLevels.includes(z),
  ).length;
  assert.equal(innerRails.length, nonWorking * 2);
  assert.equal(count(built, "01040_19"), 3);
  assert.equal(count(built, "01041_19"), 3);
  assert.equal(built.missing.length, 0);
});

const plankRect = (c) => {
  const [a, b] = [c.local.a, c.local.b];
  const h = (c.w ?? 0.3) / 2;
  return Math.abs(a[0] - b[0]) < 1e-6
    ? [a[0] - h, a[0] + h, Math.min(a[1], b[1]), Math.max(a[1], b[1])]
    : [Math.min(a[0], b[0]), Math.max(a[0], b[0]), a[1] - h, a[1] + h];
};

function onDeck(built, [u, v, z], margin = 0) {
  return built.components.some((c) => {
    if (c.kind !== "plank" || Math.abs(c.local.a[2] - z) > 1e-6) return false;
    const [u0, u1, v0, v1] = plankRect(c);
    return (
      u >= u0 - margin &&
      u <= u1 + margin &&
      v >= v0 - margin &&
      v <= v1 + margin
    );
  });
}

function ladderJob(ladderDecks) {
  return import("../src/job.js").then(({ withShape }) => {
    const job = withShape(exampleJob(), {
      type: "wall",
      length: 8,
      height: 8.5,
      decks: "top",
      ladders: 1,
    });
    return buildJob({ ...job, ladderDecks });
  });
}

for (const style of ["sideways", "transom", "slot"]) {
  test(`${style} ladder bays: ladders stand on deck and never climb through steel`, async () => {
    const built = await ladderJob(style);
    const r = built.runs[0];
    const k = [...r.ladderBays][0];
    assert.equal(r.ladderStyles[k], style);
    const transoms = built.components.filter((c) => c.kind === "intermediate");
    assert.equal(
      transoms.length,
      style === "transom" ? r.levels.liftLevels.length - 1 : 0,
    );
    assert.equal(built.missing.length, 0);
    assert.equal(built.components.filter((c) => c.kind === "hatch").length, 0);
    const ladders = built.components.filter((c) => c.kind === "ladder");
    assert.equal(ladders.length, r.levels.liftLevels.length);
    for (const l of ladders) {
      const [foot, top] = [l.local.a, l.local.b];
      assert.ok(top[2] > foot[2]);
      const lifts = r.levels.liftLevels;
      const landing = lifts.find((z) => z > foot[2] + 0.5);
      const t = (landing - foot[2]) / (top[2] - foot[2]);
      const at = [
        foot[0] + (top[0] - foot[0]) * t,
        foot[1] + (top[1] - foot[1]) * t,
        landing,
      ];
      assert.ok(top[2] >= landing + 0.8, "ladder runs on past the landing");
      if (foot[2] === 0) continue;
      assert.ok(!onDeck(built, at, 0.2), `clear opening at +${landing}`);
      assert.ok(onDeck(built, foot), `foot on deck at +${foot[2]}`);
    }
    for (const z of r.levels.liftLevels) {
      const u0 = r.us[k];
      const u1 = r.us[k + 1];
      const decked = built.components.filter(
        (c) =>
          c.kind === "plank" &&
          Math.abs(c.local.a[2] - z) < 1e-6 &&
          plankRect(c)[0] >= u0 - 1e-6 &&
          plankRect(c)[1] <= u1 + 1e-6 &&
          plankRect(c)[2] >= r.gap - 1e-6,
      );
      assert.ok(decked.length > 0, `ladder bay decked at +${z}`);
    }
  });
}

test("ground ladder lands outside through a safety gate at the first lift", async () => {
  const built = await ladderJob("sideways");
  const r = built.runs[0];
  const k = [...r.ladderBays][0];
  const z1 = r.levels.liftLevels[0];
  const vOut = r.gap + r.widthSpec.width;
  const ground = built.components.find(
    (c) => c.kind === "ladder" && c.local.a[2] === 0,
  );
  assert.ok(ground.local.a[1] > vOut, "foot outside the outer face");
  const gate = built.components.find((c) => c.kind === "gate");
  assert.ok(Math.abs(gate.local.a[2] - z1) < 1e-6);
  assert.ok(Math.abs(gate.local.a[1] - vOut) < 1e-6);
  const uLand = ground.local.a[0];
  assert.ok(uLand > gate.local.a[0] && uLand < gate.local.b[0]);
  const rails = built.components.filter(
    (c) =>
      c.rail &&
      c.kind === "ledger" &&
      Math.abs(c.local.a[1] - vOut) < 1e-6 &&
      Math.abs(c.local.a[2] - z1 - 0.5) < 1e-6 &&
      Math.min(c.local.a[0], c.local.b[0]) < uLand &&
      Math.max(c.local.a[0], c.local.b[0]) > uLand,
  );
  assert.equal(rails.length, 0, "no guardrail across the ladder exit");
  assert.ok(r.us[k] <= uLand && uLand <= r.us[k + 1]);
});

test("hop-ups go in where the gap to the house is over 300 mm", async () => {
  const { withShape } = await import("../src/job.js");
  const base = withShape(exampleJob(), {
    type: "wall",
    length: 10,
    height: 4.5,
    decks: "top",
    ladders: 0,
  });
  assert.equal(count(buildJob(base), "E04RS0449"), 0);
  const wide = buildJob({
    ...base,
    runs: base.runs.map((r) => ({ ...r, wallGap: 0.5 })),
  });
  const r = wide.runs[0];
  assert.ok(r.bayHops.every((h) => h === 0.39));
  assert.equal(wide.notes.length, 0);
  const stepped = buildJob({
    ...base,
    runs: base.runs.map((x) => ({
      ...x,
      setbacks: [{ u0: 0, u1: 2.4, depth: 0.4 }],
    })),
  });
  const s = stepped.runs[0];
  assert.equal(s.gap, 0.3);
  assert.equal(s.bayHops[0], 0.39);
  assert.ok(s.bayHops.slice(1).every((h) => h === 0));
  const off = buildJob({
    ...base,
    runs: base.runs.map((x) => ({ ...x, wallGap: 0.5, hopUps: 0 })),
  });
  assert.ok(off.runs[0].bayHops.every((h) => h === 0));
  assert.ok(off.notes.some((n) => n.includes("over 300 mm")));
});
