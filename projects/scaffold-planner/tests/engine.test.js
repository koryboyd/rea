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

test("example job counts standards, jacks and planks", () => {
  const built = buildJob(exampleJob());
  const qty = (code) => built.parts.find((p) => p.code === code)?.qty ?? 0;
  const lines = built.runs.reduce((a, r) => a + r.bays.length + 1, 0);
  assert.equal(qty("C-BJ600"), lines * 2);
  assert.equal(built.runs[0].levels.topDeck, 6);
  assert.equal(built.runs[0].levels.lifts, 3);
  const front = built.runs[0];
  assert.deepEqual(front.bays, [2.5, 2.5, 2.5, 2.5, 2.5]);
  assert.equal(front.items.get("C-HATCH"), 1);
  assert.equal(front.items.get("CP-2.5"), 5 * 5 - 2);
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
