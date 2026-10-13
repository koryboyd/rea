import { ledgerColor, standardColor } from "./colors.js";

const THREE_URL =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// CAD look modelled on the iScaf 3D sheet: white ground, orthographic view,
// standards coloured by length, ledgers by bay length (the plan colours),
// navy guardrails, maroon diagonals, grey decks, yellow safety gates.
const FIXED = {
  rail: "#1f2f45",
  transom: "#1f2f45",
  ring: "#2b3440",
  wedge: "#2b3440",
  spigot: "#8b9298",
  brace: "#5a2630",
  deck: "#a9adb2",
  gate: "#e2b100",
  toe: "#7f878e",
  jack: "#c0392b",
  plate: "#9c2a1f",
  sole: "#4a3b26",
  bracket: "#8a8a2a",
  alu: "#b9bec4",
  tie: "#8a3b8f",
  footprint: "#b9a6c9",
};

function orbit(camera, canvas, target, onChange) {
  const s = { theta: -0.95, phi: 0.95, radius: 60 };
  const pointers = new Map();
  let pinch = 0;
  const apply = () => {
    s.phi = Math.min(1.5, Math.max(0.12, s.phi));
    camera.zoom = Math.min(40, Math.max(0.2, camera.zoom));
    camera.position.set(
      target.x + s.radius * Math.sin(s.phi) * Math.cos(s.theta),
      target.y + s.radius * Math.cos(s.phi),
      target.z + s.radius * Math.sin(s.phi) * Math.sin(s.theta),
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    onChange();
  };
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
  });
  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) camera.zoom *= d / pinch;
      pinch = d;
    } else {
      s.theta += (e.clientX - prev[0]) * 0.008;
      s.phi -= (e.clientY - prev[1]) * 0.008;
    }
    apply();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    pinch = 0;
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camera.zoom *= Math.exp(-e.deltaY * 0.0012);
      apply();
    },
    { passive: false },
  );
  return { state: s, apply };
}

const V = (THREE, p) => new THREE.Vector3(p[0], p[2], p[1]);

function makeBatcher(THREE) {
  const groups = new Map();
  const push = (geoKey, color, matrix) => {
    const key = `${geoKey}|${color}`;
    if (!groups.has(key)) groups.set(key, { geoKey, color, matrices: [] });
    groups.get(key).matrices.push(matrix);
  };
  const tube = (color, a, b, radius) => {
    const pa = V(THREE, a);
    const pb = V(THREE, b);
    const dir = pb.clone().sub(pa);
    const len = dir.length();
    if (len < 1e-4) return;
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    push(
      "tube",
      color,
      new THREE.Matrix4().compose(
        pa.add(pb).multiplyScalar(0.5),
        q,
        new THREE.Vector3(radius, len, radius),
      ),
    );
  };
  const box = (color, a, b, width, height, lift = 0, shift = 0) => {
    const pa = V(THREE, a);
    const pb = V(THREE, b);
    const x = pb.clone().sub(pa);
    const len = x.length();
    if (len < 1e-4) return;
    x.normalize();
    let z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(0, 1, 0));
    if (z.lengthSq() < 1e-6) z = new THREE.Vector3(1, 0, 0);
    z.normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const centre = pa
      .add(pb)
      .multiplyScalar(0.5)
      .addScaledVector(y, lift)
      .addScaledVector(z, shift);
    const m = new THREE.Matrix4().makeBasis(
      x.multiplyScalar(len),
      y.multiplyScalar(height),
      z.multiplyScalar(width),
    );
    m.setPosition(centre);
    push("box", color, m);
  };
  const disc = (color, p, radius, thickness) => {
    push(
      "disc",
      color,
      new THREE.Matrix4().compose(
        V(THREE, p),
        new THREE.Quaternion(),
        new THREE.Vector3(radius, thickness, radius),
      ),
    );
  };
  return { groups, tube, box, disc };
}

function across(c, w) {
  const dx = c.b[0] - c.a[0];
  const dy = c.b[1] - c.a[1];
  const run = Math.hypot(dx, dy) || 1;
  return { dx, dy, run, px: (-dy / run) * (w / 2), py: (dx / run) * (w / 2) };
}

function ladderParts(B, c) {
  const { dx, dy, px, py } = across(c, c.w ?? 0.4);
  for (const s of [-1, 1]) {
    B.tube(
      FIXED.alu,
      [c.a[0] + s * px, c.a[1] + s * py, c.a[2]],
      [c.b[0] + s * px, c.b[1] + s * py, c.b[2]],
      0.018,
    );
  }
  const rise = c.b[2] - c.a[2];
  const rungs = Math.max(2, Math.round(rise / 0.28));
  for (let k = 1; k < rungs; k++) {
    const t = k / rungs;
    const at = (s) => [
      c.a[0] + dx * t + s * px,
      c.a[1] + dy * t + s * py,
      c.a[2] + rise * t,
    ];
    B.tube(FIXED.alu, at(-1), at(1), 0.012);
  }
}

function stairParts(B, c) {
  const w = c.w ?? 0.64;
  const { dx, dy, run, px, py } = across(c, w);
  for (const s of [-1, 1]) {
    const off = (p) => [p[0] + s * px, p[1] + s * py, p[2]];
    B.box(FIXED.alu, off(c.a), off(c.b), 0.03, 0.18);
  }
  const rise = c.b[2] - c.a[2];
  const steps = Math.max(2, Math.round(rise / 0.2));
  const ux = dx / run;
  const uy = dy / run;
  for (let k = 1; k <= steps; k++) {
    const t = (k - 0.5) / steps;
    const p = [
      c.a[0] + dx * t,
      c.a[1] + dy * t,
      c.a[2] + (rise * k) / steps - 0.02,
    ];
    B.box(
      FIXED.alu,
      [p[0] - ux * 0.12, p[1] - uy * 0.12, p[2]],
      [p[0] + ux * 0.12, p[1] + uy * 0.12, p[2]],
      w - 0.04,
      0.03,
    );
  }
}

function gateParts(B, c) {
  const h = c.h ?? 0.9;
  const up = (p, dz) => [p[0], p[1], p[2] + dz];
  for (const dz of [0.15, 0.55, h])
    B.tube(FIXED.gate, up(c.a, dz), up(c.b, dz), 0.016);
  for (const p of [c.a, c.b]) B.tube(FIXED.gate, up(p, 0.02), up(p, h), 0.016);
  B.box(FIXED.gate, up(c.a, 0.07), up(c.b, 0.07), 0.02, 0.14);
}

function standardParts(B, c) {
  const len = Math.round((c.b[2] - c.a[2]) * 100) / 100;
  B.tube(standardColor(len), c.a, c.b, 0.024);
  const pitch = c.rings ?? 0.5;
  const z0 = Math.min(c.a[2], c.b[2]);
  const z1 = Math.max(c.a[2], c.b[2]);
  for (
    let z = Math.ceil((z0 + 0.05) / pitch) * pitch;
    z < z1 - 0.05;
    z += pitch
  ) {
    B.disc(FIXED.ring, [c.a[0], c.a[1], z], 0.062, 0.014);
  }
  B.tube(FIXED.spigot, [c.a[0], c.a[1], z1], [c.a[0], c.a[1], z1 + 0.1], 0.019);
}

function wedgeHeads(B, c) {
  const { dx, dy, run } = across(c, 0);
  const dz = c.b[2] - c.a[2];
  const len = Math.hypot(run, dz) || 1;
  const k = 0.05 / len;
  for (const [p, s] of [
    [c.a, 1],
    [c.b, -1],
  ]) {
    const q = [p[0] + dx * k * s, p[1] + dy * k * s, p[2] + dz * k * s];
    B.box(FIXED.wedge, p, q, 0.05, 0.05);
  }
}

function addComponent(B, c, ledgerColor) {
  switch (c.kind) {
    case "standard":
      standardParts(B, c);
      return;
    case "basejack":
      B.tube(FIXED.jack, c.a, c.b, 0.017);
      B.box(
        FIXED.plate,
        [c.a[0] - 0.075, c.a[1], c.a[2] + 0.005],
        [c.a[0] + 0.075, c.a[1], c.a[2] + 0.005],
        0.15,
        0.012,
      );
      return;
    case "basecollar":
      B.tube(FIXED.spigot, c.a, c.b, 0.029);
      return;
    case "soleboard":
      B.box(
        FIXED.sole,
        [c.a[0] - 0.13, c.a[1], c.a[2] - 0.02],
        [c.a[0] + 0.13, c.a[1], c.a[2] - 0.02],
        0.26,
        0.035,
      );
      return;
    case "ledger": {
      const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
      B.tube(c.rail ? FIXED.rail : ledgerColor(len), c.a, c.b, 0.024);
      wedgeHeads(B, c);
      return;
    }
    case "transom": {
      const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
      const color = c.rail ? FIXED.rail : ledgerColor(len);
      if (c.profile === "u") B.box(color, c.a, c.b, 0.05, 0.06, -0.03);
      else B.tube(color, c.a, c.b, 0.024);
      wedgeHeads(B, c);
      return;
    }
    case "brace":
      B.tube(FIXED.brace, c.a, c.b, 0.02);
      return;
    case "plank":
      B.box(FIXED.deck, c.a, c.b, c.w ?? 0.3, 0.045, 0.022);
      return;
    case "gate":
      gateParts(B, c);
      return;
    case "gatepost":
      B.tube(FIXED.rail, c.a, c.b, 0.024);
      return;
    case "toeboard":
      B.box(
        FIXED.toe,
        c.a,
        c.b,
        0.012,
        0.15,
        0.075,
        c.face === "in" ? 0.03 : -0.03,
      );
      return;
    case "bracket":
      B.box(FIXED.bracket, c.a, c.b, 0.05, 0.06, -0.03);
      B.tube(
        FIXED.bracket,
        [c.a[0], c.a[1], c.a[2] - 0.45],
        [c.b[0], c.b[1], c.b[2] - 0.05],
        0.016,
      );
      return;
    case "stair":
      stairParts(B, c);
      return;
    case "ladder":
    case "accessladder":
      ladderParts(B, c);
      return;
    case "stairrailouter":
    case "stairrailinner":
      B.tube(FIXED.alu, c.a, c.b, 0.021);
      return;
    case "tietube":
      B.tube(FIXED.tie, c.a, c.b, 0.024);
      return;
    default:
  }
}

const ledgerColorFor = () => ledgerColor;

function buildMeshes(THREE, built) {
  const B = makeBatcher(THREE);
  const ledgerColor = ledgerColorFor(built);
  for (const c of built.components) if (c.a) addComponent(B, c, ledgerColor);
  const geos = {
    tube: new THREE.CylinderGeometry(1, 1, 1, 10),
    box: new THREE.BoxGeometry(1, 1, 1),
    disc: new THREE.CylinderGeometry(1, 1, 1, 14),
  };
  const group = new THREE.Group();
  for (const g of B.groups.values()) {
    const mat = new THREE.MeshLambertMaterial({ color: g.color });
    const mesh = new THREE.InstancedMesh(
      geos[g.geoKey],
      mat,
      g.matrices.length,
    );
    g.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    group.add(mesh);
  }
  return group;
}

function addFootprint(THREE, group, built) {
  const pts = [];
  for (const r of built.runs) {
    pts.push(new THREE.Vector3(r.place.start[0], 0.002, r.place.start[1]));
    pts.push(new THREE.Vector3(r.place.end[0], 0.002, r.place.end[1]));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  group.add(
    new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: FIXED.footprint }),
    ),
  );
}

export function legend3d(built) {
  const std = new Set();
  const ledgers = new Set();
  for (const c of built.components) {
    if (c.kind === "standard")
      std.add(Math.round((c.b[2] - c.a[2]) * 100) / 100);
    if ((c.kind === "ledger" || c.kind === "transom") && !c.rail) {
      ledgers.add(
        Math.round(Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) * 100) / 100,
      );
    }
  }
  const ledgerColor = ledgerColorFor(built);
  const chip = (color, label) =>
    `<span><i style="background:${color}"></i>${label}</span>`;
  const stdChips = [...std]
    .sort((a, b) => a - b)
    .map((l) => chip(standardColor(l), `${l.toFixed(1)} m`))
    .join("");
  const ledChips = [...ledgers]
    .sort((a, b) => a - b)
    .map((l) => chip(ledgerColor(l), `${l.toFixed(2)} m`))
    .join("");
  return `<div class="legend3d">
    <div><b>Standards</b>${stdChips}</div>
    <div><b>Ledgers, transoms</b>${ledChips}</div>
    <div><b>Other</b>${chip(FIXED.rail, "Guardrails")}${chip(FIXED.brace, "Diagonals")}${chip(FIXED.deck, "Steel decks")}${chip(FIXED.gate, "Safety gate")}${chip(FIXED.jack, "Base jacks")}</div>
  </div>`;
}

function addUnderlay(THREE, group, underlay, render) {
  if (!underlay?.url) return;
  const texture = new THREE.TextureLoader().load(underlay.url, render);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.6,
  });
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(underlay.w, underlay.h),
    mat,
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(
    underlay.x + underlay.w / 2,
    -0.002,
    underlay.y + underlay.h / 2,
  );
  group.add(plane);
}

export async function mount3d(container, built, underlay) {
  const THREE = await import(THREE_URL);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.replaceChildren(renderer.domElement);
  renderer.domElement.style.touchAction = "none";
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ffffff");
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 1000);
  const target = new THREE.Vector3();
  const render = () => renderer.render(scene, camera);
  const controls = orbit(camera, renderer.domElement, target, render);
  scene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-20, 40, 25);
  scene.add(sun);
  let group = new THREE.Group();
  let span = 20;
  scene.add(group);
  const frame = () => {
    const { width, height } = container.getBoundingClientRect();
    const aspect = width / Math.max(1, height);
    camera.left = (-span * aspect) / 2;
    camera.right = (span * aspect) / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
    return { width, height };
  };
  const resize = () => {
    const { width, height } = frame();
    renderer.setSize(width, height, false);
    render();
  };
  const update = (next, plan) => {
    scene.remove(group);
    group = buildMeshes(THREE, next);
    addFootprint(THREE, group, next);
    const box = new THREE.Box3().setFromObject(group);
    addUnderlay(THREE, group, plan, render);
    scene.add(group);
    if (!box.isEmpty()) {
      box.getCenter(target);
      span = box.getSize(new THREE.Vector3()).length() * 0.75;
    }
    camera.zoom = 1;
    frame();
    controls.apply();
  };
  new ResizeObserver(resize).observe(container);
  update(built, underlay);
  resize();
  return { update };
}
