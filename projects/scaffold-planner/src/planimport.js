import {
  PT_M,
  outlineToRuns,
  scaleFromText,
  segmentsFromOperatorList,
  simplifyOutline,
  squareUp,
  titleFromText,
} from "./outline.js";

const PDFJS =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const SNAP_PX = 16;

const el = (tag, attrs = {}, html = "") => {
  const node = Object.assign(document.createElement(tag), attrs);
  if (html) node.innerHTML = html;
  return node;
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    document.head.append(
      el("script", { src, onload: resolve, onerror: reject }),
    );
  });
}

async function pdfLib() {
  if (!globalThis.pdfjsLib) await loadScript(PDFJS);
  if (!globalThis.pdfjsWorker) await loadScript(PDFJS_WORKER);
  globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return globalThis.pdfjsLib;
}

function snapIndex(segments) {
  const cell = 12;
  const grid = new Map();
  const put = (x, y) => {
    const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push([x, y]);
  };
  for (const s of segments) {
    put(s[0], s[1]);
    put(s[2], s[3]);
  }
  return (x, y, r) => {
    let best = null;
    let bestD = r;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const span = Math.ceil(r / cell);
    for (let i = cx - span; i <= cx + span; i++) {
      for (let j = cy - span; j <= cy + span; j++) {
        for (const p of grid.get(`${i},${j}`) ?? []) {
          const d = Math.hypot(p[0] - x, p[1] - y);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
      }
    }
    return best;
  };
}

async function readPdf(file) {
  const lib = await pdfLib();
  const doc = await lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const text = (await page.getTextContent()).items.map((i) => i.str);
    pages.push({
      n,
      page,
      title: titleFromText(text),
      scale: scaleFromText(text),
    });
  }
  return { lib, pages };
}

async function thumb(page, width) {
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / vp1.width });
  const canvas = el("canvas", {
    width: Math.round(vp.width),
    height: Math.round(vp.height),
  });
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp })
    .promise;
  return canvas;
}

async function pageSource(lib, entry) {
  const vp1 = entry.page.getViewport({ scale: 1 });
  const s = Math.min(3, 2600 / vp1.width);
  const vp = entry.page.getViewport({ scale: s });
  const canvas = el("canvas", {
    width: Math.round(vp.width),
    height: Math.round(vp.height),
  });
  await entry.page.render({
    canvasContext: canvas.getContext("2d"),
    viewport: vp,
  }).promise;
  const ops = await entry.page.getOperatorList();
  const segments = segmentsFromOperatorList(ops, lib.OPS, vp1.transform, 3);
  return {
    image: canvas,
    pxPerPt: s,
    snap: snapIndex(segments),
    mPerPt: entry.scale ? PT_M * entry.scale : null,
    scaleLabel: entry.scale ? `1:${entry.scale} from the title block` : null,
  };
}

async function imageSource(file) {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  return {
    image: img,
    pxPerPt: 1,
    snap: () => null,
    mPerPt: null,
    scaleLabel: null,
  };
}

function tracer(root, src, onFinish) {
  const st = {
    pts: [],
    closed: false,
    zoom: 1,
    pan: [0, 0],
    hover: null,
    calib: null,
    src,
  };
  root.innerHTML = `
    <div class="imp-tools">
      <span class="imp-scale" id="imp-scale"></span>
      <button class="btn small" data-imp="calibrate">Set scale</button>
      <button class="btn small" data-imp="undo">Undo</button>
      <label class="check"><input type="checkbox" id="imp-smooth" checked/> Smooth steps under 0.5 m</label>
      <button class="btn small primary" data-imp="finish">Use outline</button>
    </div>
    <p class="note" id="imp-hint"></p>
    <div class="imp-stage"><canvas id="imp-canvas"></canvas></div>
    <div class="imp-calib" id="imp-calib" hidden>
      <label class="f">Real length between the two points (m)<input type="number" inputmode="decimal" step="0.01" id="imp-len"/></label>
      <button class="btn small primary" data-imp="calib-apply">Apply</button>
      <button class="btn small" data-imp="calib-cancel">Cancel</button>
    </div>`;
  const canvas = root.querySelector("#imp-canvas");
  const ctx = canvas.getContext("2d");
  const stage = root.querySelector(".imp-stage");
  const img = src.image;
  const imgW = img.width ?? img.naturalWidth;
  const imgH = img.height ?? img.naturalHeight;

  const toPt = (sx, sy) => [
    (sx - st.pan[0]) / st.zoom / src.pxPerPt,
    (sy - st.pan[1]) / st.zoom / src.pxPerPt,
  ];
  const toScreen = (p) => [
    p[0] * src.pxPerPt * st.zoom + st.pan[0],
    p[1] * src.pxPerPt * st.zoom + st.pan[1],
  ];

  const hint = () => {
    const h = root.querySelector("#imp-hint");
    root.querySelector("#imp-scale").textContent = src.mPerPt
      ? `Scale: ${src.scaleLabel}`
      : "Scale not set";
    if (st.calib)
      h.textContent =
        "Tap both ends of a known dimension, such as the overall 18000 line.";
    else if (!src.mPerPt)
      h.textContent =
        "Set the scale first: tap Set scale and pick a dimension you know.";
    else if (st.closed)
      h.textContent = "Outline closed. Tap Use outline, or Undo to change it.";
    else
      h.textContent =
        "Tap each outside corner of the house in order. Taps snap to the drawing's wall lines. Tap the first corner again to close. Drag to move, pinch or scroll to zoom.";
    root.querySelector('[data-imp="finish"]').disabled = !(
      st.closed && src.mPerPt
    );
  };

  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(st.pan[0], st.pan[1]);
    ctx.scale(st.zoom, st.zoom);
    ctx.drawImage(img, 0, 0, imgW, imgH);
    ctx.restore();
    const accent =
      getComputedStyle(root).getPropertyValue("--accent").trim() || "#e3a400";
    const ink =
      getComputedStyle(root).getPropertyValue("--brace").trim() || "#2c6a99";
    const pts = (st.calib ? st.calib : st.pts).map(toScreen);
    ctx.lineWidth = 3;
    ctx.strokeStyle = st.calib ? ink : accent;
    ctx.beginPath();
    pts.forEach((p, i) =>
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
    );
    if (st.closed && !st.calib) ctx.closePath();
    ctx.stroke();
    if (src.mPerPt && !st.calib) {
      ctx.font = "600 13px IBM Plex Mono, ui-monospace, monospace";
      ctx.textAlign = "center";
      const edges = st.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < edges; i++) {
        const a = st.pts[i];
        const b = st.pts[(i + 1) % st.pts.length];
        const m = Math.hypot(b[0] - a[0], b[1] - a[1]) * src.mPerPt;
        const [x, y] = toScreen([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        const label = `${m.toFixed(2)} m`;
        const w = ctx.measureText(label).width + 8;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(x - w / 2, y - 10, w, 18);
        ctx.fillStyle = "#1d2733";
        ctx.fillText(label, x, y + 4);
      }
    }
    pts.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? ink : accent;
      ctx.beginPath();
      ctx.arc(p[0], p[1], i === 0 ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
    });
    if (st.hover) {
      const [x, y] = toScreen(st.hover);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 7, y - 7, 14, 14);
    }
  };

  const fit = () => {
    const r = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    if (!st.fitted) {
      st.zoom = Math.min(r.width / imgW, r.height / imgH);
      st.pan = [
        (r.width - imgW * st.zoom) / 2,
        (r.height - imgH * st.zoom) / 2,
      ];
      st.fitted = true;
    }
    draw();
  };

  const snapAt = (sx, sy) => {
    const raw = toPt(sx, sy);
    const r = SNAP_PX / st.zoom / src.pxPerPt;
    const snapped = src.snap(raw[0], raw[1], r);
    if (snapped) return { p: snapped, snapped: true };
    const list = st.calib ?? st.pts;
    const last = list.at(-1);
    if (last && !st.calib) {
      const ang =
        Math.abs(
          (Math.atan2(raw[1] - last[1], raw[0] - last[0]) * 180) / Math.PI,
        ) % 90;
      if (ang < 5 || ang > 85) {
        const horizontal =
          Math.abs(raw[0] - last[0]) > Math.abs(raw[1] - last[1]);
        return {
          p: horizontal ? [raw[0], last[1]] : [last[0], raw[1]],
          snapped: false,
        };
      }
    }
    return { p: raw, snapped: false };
  };

  const tap = (sx, sy) => {
    const { p } = snapAt(sx, sy);
    if (st.calib) {
      st.calib.push(p);
      if (st.calib.length === 2) {
        root.querySelector("#imp-calib").hidden = false;
        root.querySelector("#imp-len").focus();
      }
    } else if (!st.closed) {
      const first = st.pts[0];
      if (first && st.pts.length >= 3) {
        const [fx, fy] = toScreen(first);
        if (Math.hypot(fx - sx, fy - sy) < SNAP_PX * 1.5) st.closed = true;
      }
      if (!st.closed) st.pts.push(p);
    }
    hint();
    draw();
  };

  const pointers = new Map();
  let moved = false;
  let pinch = 0;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {
      x: e.offsetX,
      y: e.offsetY,
      x0: e.offsetX,
      y0: e.offsetY,
    });
    moved = false;
  });
  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      const s = snapAt(e.offsetX, e.offsetY);
      st.hover = s.snapped ? s.p : null;
      draw();
      return;
    }
    if (Math.hypot(e.offsetX - prev.x0, e.offsetY - prev.y0) > 6) moved = true;
    if (pointers.size === 2) {
      const others = [...pointers.entries()].find(
        ([id]) => id !== e.pointerId,
      )[1];
      const d = Math.hypot(e.offsetX - others.x, e.offsetY - others.y);
      if (pinch)
        zoomAt(
          (e.offsetX + others.x) / 2,
          (e.offsetY + others.y) / 2,
          d / pinch,
        );
      pinch = d;
    } else if (moved) {
      st.pan = [st.pan[0] + e.offsetX - prev.x, st.pan[1] + e.offsetY - prev.y];
    }
    prev.x = e.offsetX;
    prev.y = e.offsetY;
    draw();
  });
  const end = (e) => {
    const was = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size === 0) pinch = 0;
    if (was && !moved && pointers.size === 0 && e.type === "pointerup")
      tap(e.offsetX, e.offsetY);
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  const zoomAt = (x, y, factor) => {
    const z = Math.min(40, Math.max(0.05, st.zoom * factor));
    const k = z / st.zoom;
    st.pan = [x - (x - st.pan[0]) * k, y - (y - st.pan[1]) * k];
    st.zoom = z;
  };
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
      draw();
    },
    { passive: false },
  );

  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-imp]")?.dataset.imp;
    if (act === "undo") {
      if (st.calib) st.calib.pop();
      else if (st.closed) st.closed = false;
      else st.pts.pop();
    } else if (act === "calibrate") {
      st.calib = [];
    } else if (act === "calib-cancel") {
      st.calib = null;
      root.querySelector("#imp-calib").hidden = true;
    } else if (act === "calib-apply") {
      const real = Number(root.querySelector("#imp-len").value);
      const [a, b] = st.calib;
      const pt = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (real > 0 && pt > 0) {
        src.mPerPt = real / pt;
        src.scaleLabel = `set from ${real} m`;
      }
      st.calib = null;
      root.querySelector("#imp-calib").hidden = true;
    } else if (act === "finish") {
      const metres = st.pts.map((p) => [p[0] * src.mPerPt, p[1] * src.mPerPt]);
      const smooth = root.querySelector("#imp-smooth").checked;
      const outline = smooth ? simplifyOutline(squareUp(metres), 0.5) : metres;
      underlayFrom(src, outline)
        .catch(() => null)
        .then((underlay) => onFinish(outline, underlay));
      return;
    } else {
      return;
    }
    hint();
    draw();
  });

  new ResizeObserver(fit).observe(stage);
  hint();
  fit();
}

const UNDERLAY_MARGIN_M = 3;
const UNDERLAY_MAX_PX = 2000;

// Crops the plan around the traced house so it can sit under the scaffold
// plan, and returns where the crop lies in plan metres.
function underlayFrom(src, outline) {
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const x0 = Math.min(...xs) - UNDERLAY_MARGIN_M;
  const y0 = Math.min(...ys) - UNDERLAY_MARGIN_M;
  const x1 = Math.max(...xs) + UNDERLAY_MARGIN_M;
  const y1 = Math.max(...ys) + UNDERLAY_MARGIN_M;
  const pxPerM = src.pxPerPt / src.mPerPt;
  const sx = Math.max(0, x0 * pxPerM);
  const sy = Math.max(0, y0 * pxPerM);
  const imgW = src.image.width ?? src.image.naturalWidth;
  const imgH = src.image.height ?? src.image.naturalHeight;
  const sw = Math.min(imgW - sx, (x1 - x0) * pxPerM);
  const sh = Math.min(imgH - sy, (y1 - y0) * pxPerM);
  const k = Math.min(1, UNDERLAY_MAX_PX / Math.max(sw, sh));
  const canvas = el("canvas", {
    width: Math.round(sw * k),
    height: Math.round(sh * k),
  });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src.image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve({
              blob,
              x: sx / pxPerM,
              y: sy / pxPerM,
              w: sw / pxPerM,
              h: sh / pxPerM,
            })
          : reject(new Error("crop failed")),
      "image/jpeg",
      0.8,
    );
  });
}

function pagePicker(root, doc, onPick) {
  root.innerHTML =
    '<p class="note">Pick the floor plan to trace. The ground floor plan is usually best.</p><div class="imp-pages" id="imp-pages"></div>';
  const grid = root.querySelector("#imp-pages");
  const preferred =
    doc.pages.find((p) => p.title === "GROUND FLOOR PLAN") ??
    doc.pages.find((p) => p.title?.includes("FLOOR PLAN"));
  for (const entry of doc.pages) {
    const btn = el("button", { className: "imp-page", type: "button" });
    btn.setAttribute("aria-pressed", String(entry === preferred));
    btn.innerHTML = `<span>Page ${entry.n}${entry.title ? ` · ${entry.title.toLowerCase()}` : ""}${entry.scale ? ` · 1:${entry.scale}` : ""}</span>`;
    btn.addEventListener("click", () => onPick(entry));
    grid.append(btn);
    thumb(entry.page, 220)
      .then((c) => btn.prepend(c))
      .catch(() => {});
  }
}

export function openPlanImport({ defaults, onDone }) {
  const overlay = el("div", { className: "importer" });
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Import a house plan");
  overlay.innerHTML = `
    <div class="imp-head"><h2>Map from a plan</h2><button class="btn small" data-imp="close">Close</button></div>
    <div class="imp-body" id="imp-body">
      <label class="imp-drop" for="imp-file">
        <b>Choose a plan PDF or photo</b>
        <span class="note">Architect PDFs work best: corners snap to the wall lines and the scale is read from the title block.</span>
        <input type="file" id="imp-file" accept="application/pdf,image/*"/>
      </label>
    </div>`;
  document.body.append(overlay);
  const body = overlay.querySelector("#imp-body");
  const close = () => overlay.remove();
  overlay.querySelector('[data-imp="close"]').addEventListener("click", close);
  const finish = (points, underlay) => {
    close();
    const minX = Math.min(...points.map((p) => p[0]));
    const minY = Math.min(...points.map((p) => p[1]));
    const placed = underlay && {
      ...underlay,
      x: underlay.x - minX,
      y: underlay.y - minY,
    };
    onDone(outlineToRuns(points, defaults), placed);
  };
  const fail = (msg) => {
    body.innerHTML = `<p class="note warn">${msg}</p>`;
  };
  const handle = async (file) => {
    if (!file) return;
    body.innerHTML = '<p class="note">Reading the plan…</p>';
    try {
      if (file.type.startsWith("image/")) {
        tracer(body, await imageSource(file), finish);
        return;
      }
      const doc = await readPdf(file);
      pagePicker(body, doc, async (entry) => {
        body.innerHTML = `<p class="note">Opening page ${entry.n}…</p>`;
        tracer(body, await pageSource(doc.lib, entry), finish);
      });
    } catch {
      fail(
        "That file could not be read. Try a PDF exported from the drawing program, or a clear photo of the plan.",
      );
    }
  };
  overlay
    .querySelector("#imp-file")
    .addEventListener("change", (e) => handle(e.target.files[0]));
  overlay.addEventListener("dragover", (e) => e.preventDefault());
  overlay.addEventListener("drop", (e) => {
    e.preventDefault();
    handle(e.dataTransfer.files[0]);
  });
}
