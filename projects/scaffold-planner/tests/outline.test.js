import { test } from "node:test";
import assert from "node:assert/strict";
import { buildJob } from "../src/engine.js";
import { exampleJob } from "../src/job.js";
import {
  outlineToRuns,
  scaleFromText,
  segmentsFromOperatorList,
  simplifyOutline,
  squareUp,
  titleFromText,
} from "../src/outline.js";

test("small wall steps are pushed out to the outer face", () => {
  const pts = [
    [0, 0],
    [5, 0],
    [5, -0.24],
    [10, -0.24],
    [10, 8],
    [0, 8],
  ];
  const out = simplifyOutline(pts, 0.5);
  assert.equal(out.length, 4);
  assert.ok(out.every((p) => p[1] === -0.24 || p[1] === 8));
});

test("steps longer than the limit stay", () => {
  const pts = [
    [0, 0],
    [5, 0],
    [5, 1.2],
    [10, 1.2],
    [10, 8],
    [0, 8],
  ];
  assert.equal(simplifyOutline(pts, 0.5).length, 6);
});

test("squareUp straightens near-orthogonal taps", () => {
  const out = squareUp([
    [0, 0],
    [10, 0.2],
    [10.1, 8],
    [0, 8],
  ]);
  assert.deepEqual(out[1], [10, 0]);
});

test("traced outline becomes a closed job with corner bays", () => {
  const runs = outlineToRuns(
    [
      [2, 3],
      [14, 3],
      [14, 12],
      [2, 12],
    ],
    { height: 6.5, decks: "top", ladders: 1 },
  );
  assert.deepEqual(runs[0].start, [0, 0]);
  assert.equal(runs[1].angle, 90);
  const built = buildJob({ ...exampleJob(), shape: null, closed: true, runs });
  assert.equal(built.corners, 4);
  assert.equal(built.missing.length, 0);
});

test("scale and sheet titles come from title block text", () => {
  assert.equal(
    scaleFromText(["GROUND FLOOR PLAN", "SCALE", "1:100, 1:1"]),
    100,
  );
  assert.equal(scaleFromText(["SITE PLAN", "SCALE", "1:200"]), 200);
  assert.equal(
    titleFromText(["blah", "GROUND FLOOR PLAN"]),
    "GROUND FLOOR PLAN",
  );
});

test("operator list paths become page segments", () => {
  const OPS = {
    save: 10,
    restore: 11,
    transform: 12,
    constructPath: 91,
    moveTo: 13,
    lineTo: 14,
    rectangle: 19,
    closePath: 18,
    curveTo: 15,
    curveTo2: 16,
    curveTo3: 17,
  };
  const opList = {
    fnArray: [OPS.save, OPS.transform, OPS.constructPath, OPS.restore],
    argsArray: [
      null,
      [2, 0, 0, 2, 10, 0],
      [[OPS.moveTo, OPS.lineTo, OPS.rectangle], [0, 0, 5, 0, 0, 0, 1, 1], null],
      null,
    ],
  };
  const segs = segmentsFromOperatorList(
    opList,
    OPS,
    [1, 0, 0, -1, 0, 100],
    0.5,
  );
  assert.deepEqual(segs[0], [10, 100, 20, 100]);
  assert.equal(segs.length, 5);
});

test("setbacks record where smoothing pushed a side off the house", async () => {
  const { setbacksFor, simplifyOutline } = await import("../src/outline.js");
  const traced = [
    [0, 0],
    [4, 0],
    [4, 0.3],
    [6, 0.3],
    [6, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ];
  const outline = simplifyOutline(traced, 0.5);
  const backs = setbacksFor(traced, outline);
  const all = backs.flat();
  assert.equal(all.length, 1);
  assert.ok(Math.abs(all[0].depth - 0.3) < 0.01);
  assert.ok(Math.abs(all[0].u1 - all[0].u0 - 2) < 0.15);
});
