import { DUTY_CLASSES, findComponent } from "./catalog.js";

const G = 9.81 / 1000;
const round2 = (n) => Math.round(n * 100) / 100;

const kgPerMetre = (system, kind, length) => {
  const c = findComponent(system, kind, length);
  return c && c.length > 0 ? c.weight / c.length : 0;
};

function worstTributary(bays) {
  if (bays.length === 1) return { index: 0, trib: bays[0] / 2 };
  let best = { index: 0, trib: bays[0] / 2 };
  for (let i = 1; i < bays.length; i++) {
    const trib = (bays[i - 1] + bays[i]) / 2;
    if (trib > best.trib) best = { index: i, trib };
  }
  return best;
}

function standardSelfWeight(r, job, system) {
  const { levels, standardPieces, bays, widthSpec } = r;
  const { trib } = worstTributary(bays);
  const longest = Math.max(...bays);
  const columnKg = standardPieces.reduce(
    (a, len) => a + (findComponent(system, "standard", len)?.weight ?? 0),
    0,
  );
  const jackKg = findComponent(system, "basejack")?.weight ?? 0;
  const ledgerKg = kgPerMetre(system, "ledger", longest) * trib;
  const transomKg =
    (findComponent(system, "transom", job.width)?.weight ?? 0) / 2;
  const plankKgPerM2 =
    (kgPerMetre(system, "plank", longest) * widthSpec.boards) / job.width;
  const toeKg = kgPerMetre(system, "toeboard", longest) * trib;
  const decks = levels.deckLevels.length;
  return (
    columnKg +
    jackKg +
    levels.ledgerLevels.length * (ledgerKg + transomKg) +
    decks * 2 * ledgerKg +
    decks * toeKg +
    (decks * plankKgPerM2 * trib * job.width) / 2
  );
}

function statusFor(legKN, allowable, bearing, ground) {
  if (!(allowable > 0)) return "unchecked";
  if (legKN > allowable) return "over";
  if (ground > 0 && bearing > ground) return "over";
  return "ok";
}

export function runLoads(r, job, system) {
  const duty = DUTY_CLASSES[job.duty] ?? DUTY_CLASSES.medium;
  const loadedDecks = Math.min(job.loadedDecks, r.levels.lifts);
  const selfKN = standardSelfWeight(r, job, system) * G;
  const liveKN = duty.kgPerBay * loadedDecks * 0.5 * G;
  const legKN = selfKN + liveKN;
  const soleArea = job.soleArea > 0 ? job.soleArea : 0.1125;
  const bearingKPa = legKN / soleArea;
  const allowable = Number(job.allowableLegKN) || 0;
  const ground = Number(job.groundBearingKPa) || 0;
  const notes = [];
  const baseWidth = job.width + job.wallGap;
  const ratio = (r.levels.topDeck + 1) / baseWidth;
  if (r.tieCount === 0 && ratio > 3) {
    notes.push(
      `Freestanding height to base ratio is ${ratio.toFixed(1)}:1. Add ties, buttresses or kentledge.`,
    );
  }
  if (job.liftHeight !== 2.0) {
    notes.push(
      "Face braces are listed for a 2.0 m lift. Check brace sizes for this lift height.",
    );
  }
  return {
    runId: r.run.id,
    label: r.run.label,
    selfKN: round2(selfKN),
    liveKN: round2(liveKN),
    legKN: round2(legKN),
    allowableKN: allowable || null,
    utilisation: allowable ? round2(legKN / allowable) : null,
    bearingKPa: round2(bearingKPa),
    groundKPa: ground || null,
    ties: r.tieCount,
    tieLevels: r.levels.tieLevels.length,
    status: statusFor(legKN, allowable, bearingKPa, ground),
    notes,
  };
}

export const jobLoads = (built, job) =>
  built.runs.map((r) => runLoads(r, job, built.system));
