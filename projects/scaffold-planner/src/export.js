import { PRINT_INK, elevationSvg, planSvg } from "./drawing.js";

const JSPDF_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const money = (n) =>
  `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function saveFile(filename, blob) {
  const claude = globalThis.window?.claude;
  const downloads = claude?.use
    ? await claude.use("downloads").catch(() => null)
    : null;
  if (downloads) {
    await downloads.save({ filename, data: blob });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function partsCsv(built) {
  const rows = [["Code", "Description", "Qty", "Unit kg", "Total kg"]];
  for (const p of built.parts)
    rows.push([p.code, p.name, p.qty, p.weight, p.totalWeight]);
  rows.push(["", "Total", built.totalPieces, "", built.totalWeight]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export const slug = (s) =>
  String(s || "job")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "job";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement("script"), {
      src,
      onload: resolve,
      onerror: reject,
    });
    document.head.append(s);
  });
}

async function svgToImage(svg, widthPx) {
  const doc = new DOMParser().parseFromString(
    svg,
    "image/svg+xml",
  ).documentElement;
  const [, , w, h] = doc.getAttribute("viewBox").split(" ").map(Number);
  const heightPx = Math.round((widthPx * h) / w);
  doc.setAttribute("width", widthPx);
  doc.setAttribute("height", heightPx);
  const blob = new Blob([new XMLSerializer().serializeToString(doc)], {
    type: "image/svg+xml",
  });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = Object.assign(document.createElement("canvas"), {
      width: widthPx,
      height: heightPx,
    });
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0);
    return { data: canvas.toDataURL("image/jpeg", 0.85), ratio: h / w };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function header(pdf, job, title, page) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(title, 14, 16);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`${job.name} | ${job.client || ""} | ${job.site || ""}`, 14, 22);
  pdf.text(`Page ${page}`, 283, 16, { align: "right" });
}

function table(pdf, rows, startY, cols) {
  let y = startY;
  pdf.setFontSize(9);
  rows.forEach((row, i) => {
    if (y > 196) {
      pdf.addPage();
      y = 20;
    }
    pdf.setFont("helvetica", i === 0 ? "bold" : "normal");
    row.forEach((cell, c) =>
      pdf.text(String(cell), cols[c].x, y, { align: cols[c].align ?? "left" }),
    );
    y += 5.2;
  });
  return y;
}

async function addDrawing(pdf, svg, y, maxH) {
  const img = await svgToImage(svg, 1800);
  let w = 269;
  let h = w * img.ratio;
  if (h > maxH) {
    h = maxH;
    w = h / img.ratio;
  }
  pdf.addImage(img.data, "JPEG", 14, y, w, h, undefined, "FAST");
}

export async function planPdf(job, built, quote, loads) {
  if (!globalThis.jspdf) await loadScript(JSPDF_URL);
  const pdf = new globalThis.jspdf.jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  let page = 1;
  header(pdf, job, `Scaffold plan: ${built.system.name}`, page);
  await addDrawing(pdf, planSvg(built, PRINT_INK), 28, 170);
  for (const r of built.runs) {
    pdf.addPage();
    header(
      pdf,
      job,
      `Elevation: ${r.run.label} (${r.bays.length} bays, top deck +${r.levels.topDeck} m)`,
      ++page,
    );
    await addDrawing(pdf, elevationSvg(r, PRINT_INK), 28, 170);
  }
  pdf.addPage();
  header(pdf, job, "Parts list", ++page);
  const partCols = [
    { x: 14 },
    { x: 40 },
    { x: 200, align: "right" },
    { x: 230, align: "right" },
    { x: 270, align: "right" },
  ];
  const partRows = [
    ["Code", "Description", "Qty", "Unit kg", "Total kg"],
    ...built.parts.map((p) => [p.code, p.name, p.qty, p.weight, p.totalWeight]),
  ];
  partRows.push(["", "Total", built.totalPieces, "", built.totalWeight]);
  table(pdf, partRows, 32, partCols);
  pdf.addPage();
  header(pdf, job, "Quote and load check", ++page);
  const qRows = [
    ["Item", "Amount"],
    [`Hire, ${quote.weeks} weeks`, money(quote.hire)],
    [`Erect, ${built.faceArea} m2`, money(quote.erect)],
    [`Dismantle, ${built.faceArea} m2`, money(quote.dismantle)],
    ["Cartage, delivery and return", money(quote.cartage)],
    ["Margin", money(quote.margin)],
    ["Total ex GST", money(quote.exGst)],
    ["GST", money(quote.gst)],
    ["Total inc GST", money(quote.total)],
  ];
  const y = table(pdf, qRows, 32, [{ x: 14 }, { x: 120, align: "right" }]);
  const lRows = [
    ["Run", "Leg load kN", "Allowable kN", "Base kPa", "Ties", "Status"],
    ...loads.map((l) => [
      l.label,
      l.legKN,
      l.allowableKN ?? "not set",
      l.bearingKPa,
      l.ties,
      l.status,
    ]),
  ];
  const end = table(pdf, lRows, y + 8, [
    { x: 14 },
    { x: 110, align: "right" },
    { x: 150, align: "right" },
    { x: 185, align: "right" },
    { x: 210, align: "right" },
    { x: 225 },
  ]);
  pdf.setFontSize(8);
  pdf.text(
    "Indicative leg loads only. Wind, tie forces, sheeting and loading bays are not included. Design must be verified by a competent person to AS/NZS 1576 and AS/NZS 4576.",
    14,
    Math.min(end + 8, 200),
    { maxWidth: 269 },
  );
  return pdf.output("blob");
}
