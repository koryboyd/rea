// Length colour code modelled on the iScaf 3D sheets: every ledger, transom
// and bay is coloured by its length, and standards by theirs. Systems with
// other nominal lengths take the colour of the nearest length.
export const LEDGER_COLORS = {
  0.73: "#5b9bd5",
  1.09: "#c9b200",
  1.4: "#4f8f3a",
  1.57: "#b8732e",
  2.07: "#8f4a24",
  2.57: "#e8692e",
  3.07: "#c0392b",
};

export const STANDARD_COLORS = {
  0.5: "#3f8f4f",
  1: "#c9a400",
  1.5: "#8a8a20",
  2: "#d04a1f",
  2.5: "#8a5a2b",
  3: "#7a4a8a",
  4: "#4b3a6e",
};

export function colorForLength(table, length) {
  let best = null;
  let bestD = Infinity;
  for (const [key, color] of Object.entries(table)) {
    const d = Math.abs(Number(key) - length);
    if (d < bestD) {
      bestD = d;
      best = color;
    }
  }
  return best;
}

export const ledgerColor = (length) => colorForLength(LEDGER_COLORS, length);
export const standardColor = (length) =>
  colorForLength(STANDARD_COLORS, length);
