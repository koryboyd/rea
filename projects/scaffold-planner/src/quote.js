const round2 = (n) => Math.round(n * 100) / 100;

export function quoteJob(built, q) {
  const weeks = Math.max(1, Number(q.weeks) || 1);
  const hireLines = built.parts.map((p) => ({
    code: p.code,
    name: p.name,
    qty: p.qty,
    rate: p.hire,
    amount: round2(p.qty * p.hire * weeks),
  }));
  const hire = round2(hireLines.reduce((a, l) => a + l.amount, 0));
  const erect = round2(built.faceArea * (Number(q.erectRate) || 0));
  const dismantle = round2(built.faceArea * (Number(q.dismantleRate) || 0));
  const cartage = round2((Number(q.cartage) || 0) * 2);
  const subtotal = round2(hire + erect + dismantle + cartage);
  const margin = round2(subtotal * ((Number(q.marginPct) || 0) / 100));
  const exGst = round2(subtotal + margin);
  const gst = round2(exGst * ((Number(q.gstPct) || 0) / 100));
  return {
    weeks,
    hireLines,
    hire,
    erect,
    dismantle,
    cartage,
    subtotal,
    margin,
    exGst,
    gst,
    total: round2(exGst + gst),
  };
}
