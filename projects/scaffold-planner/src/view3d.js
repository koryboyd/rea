const THREE_URL =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

function cssColor(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function orbit(camera, canvas, target, onChange) {
  const s = { theta: -0.9, phi: 1.05, radius: 30 };
  const pointers = new Map();
  let pinch = 0;
  const apply = () => {
    s.phi = Math.min(1.5, Math.max(0.12, s.phi));
    s.radius = Math.min(400, Math.max(1.5, s.radius));
    camera.position.set(
      target.x + s.radius * Math.sin(s.phi) * Math.cos(s.theta),
      target.y + s.radius * Math.cos(s.phi),
      target.z + s.radius * Math.sin(s.phi) * Math.sin(s.theta),
    );
    camera.lookAt(target);
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
      if (pinch) s.radius *= pinch / d;
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
      s.radius *= Math.exp(e.deltaY * 0.001);
      apply();
    },
    { passive: false },
  );
  return { state: s, apply };
}

const V = (THREE, p) => new THREE.Vector3(p[0], p[2], p[1]);

function makeBatcher(THREE) {
  const groups = new Map();
  const push = (geoKey, colorKey, matrix) => {
    const key = `${geoKey}|${colorKey}`;
    if (!groups.has(key)) groups.set(key, { geoKey, colorKey, matrices: [] });
    groups.get(key).matrices.push(matrix);
  };
  const tube = (geoKey, colorKey, a, b, radius) => {
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
      geoKey,
      colorKey,
      new THREE.Matrix4().compose(
        pa.add(pb).multiplyScalar(0.5),
        q,
        new THREE.Vector3(radius, len, radius),
      ),
    );
  };
  const box = (colorKey, a, b, width, height, lift = 0, shift = 0) => {
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
    push("box", colorKey, m);
  };
  const disc = (colorKey, p, radius, thickness) => {
    push(
      "disc",
      colorKey,
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
      "tube",
      "alu",
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
    B.tube("tube", "alu", at(-1), at(1), 0.012);
  }
}

function stairParts(B, c) {
  const w = c.w ?? 0.64;
  const { dx, dy, run, px, py } = across(c, w);
  for (const s of [-1, 1]) {
    const off = (p) => [p[0] + s * px, p[1] + s * py, p[2]];
    B.box("alu", off(c.a), off(c.b), 0.03, 0.18);
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
      "alu",
      [p[0] - ux * 0.12, p[1] - uy * 0.12, p[2]],
      [p[0] + ux * 0.12, p[1] + uy * 0.12, p[2]],
      w - 0.04,
      0.03,
    );
  }
}

function standardRings(B, c) {
  const pitch = c.rings ?? 0.5;
  const z0 = Math.min(c.a[2], c.b[2]);
  const z1 = Math.max(c.a[2], c.b[2]);
  for (
    let z = Math.ceil((z0 + 0.05) / pitch) * pitch;
    z < z1 - 0.05;
    z += pitch
  ) {
    B.disc("ring", [c.a[0], c.a[1], z], 0.062, 0.012);
  }
}

function addComponent(B, c) {
  switch (c.kind) {
    case "standard":
      B.tube("tube", "steel", c.a, c.b, 0.024);
      standardRings(B, c);
      return;
    case "basejack":
      B.tube("tube", "jack", c.a, c.b, 0.018);
      B.box(
        "jack",
        [c.a[0] - 0.075, c.a[1], c.a[2] + 0.005],
        [c.a[0] + 0.075, c.a[1], c.a[2] + 0.005],
        0.15,
        0.01,
      );
      return;
    case "basecollar":
      B.tube("tube", "steel", c.a, c.b, 0.03);
      return;
    case "soleboard":
      B.box(
        "timber",
        [c.a[0] - 0.25, c.a[1], c.a[2] - 0.02],
        [c.a[0] + 0.25, c.a[1], c.a[2] - 0.02],
        0.225,
        0.04,
      );
      return;
    case "ledger":
      B.tube("tube", c.rail ? "rail" : "steel", c.a, c.b, 0.024);
      return;
    case "transom":
      if (c.profile === "u") B.box("steel", c.a, c.b, 0.05, 0.06, -0.03);
      else B.tube("tube", c.rail ? "rail" : "steel", c.a, c.b, 0.024);
      return;
    case "brace":
      B.tube("tube", "brace", c.a, c.b, 0.02);
      return;
    case "plank":
      B.box("deck", c.a, c.b, c.w ?? 0.3, 0.045, 0.022);
      return;
    case "hatch":
      B.box("hatch", c.a, c.b, c.w ?? 0.6, 0.05, 0.025);
      return;
    case "toeboard":
      B.box(
        "timber",
        c.a,
        c.b,
        0.03,
        0.15,
        0.075,
        c.face === "in" ? 0.02 : -0.02,
      );
      return;
    case "bracket":
      B.box("steel", c.a, c.b, 0.05, 0.06, -0.03);
      B.tube(
        "tube",
        "steel",
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
    case "tietube":
      B.tube("tube", "tie", c.a, c.b, 0.024);
      return;
    default:
  }
}

const METALLIC = new Set([
  "steel",
  "rail",
  "ring",
  "brace",
  "tie",
  "jack",
  "alu",
]);

function palette(el) {
  return {
    steel: cssColor(el, "--steel", "#4f6478"),
    rail: cssColor(el, "--rail", "#4f6478"),
    ring: cssColor(el, "--steel", "#4f6478"),
    jack: cssColor(el, "--muted", "#5b6877"),
    brace: cssColor(el, "--brace", "#2f6f9f"),
    tie: cssColor(el, "--tie", "#8a3b8f"),
    deck: cssColor(el, "--deck", "#c9a227"),
    hatch: cssColor(el, "--accent", "#d9822b"),
    timber: cssColor(el, "--timber", "#a0703a"),
    alu: cssColor(el, "--alu", "#b8c2cc"),
  };
}

function buildMeshes(THREE, built, colors) {
  const B = makeBatcher(THREE);
  for (const c of built.components) if (c.a) addComponent(B, c);
  const geos = {
    tube: new THREE.CylinderGeometry(1, 1, 1, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
    disc: new THREE.CylinderGeometry(1, 1, 1, 12),
  };
  const group = new THREE.Group();
  for (const g of B.groups.values()) {
    const mat = new THREE.MeshStandardMaterial({
      color: colors[g.colorKey] ?? "#888888",
      metalness: METALLIC.has(g.colorKey) ? 0.45 : 0.05,
      roughness: 0.55,
    });
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

function addWalls(THREE, group, built, color) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  for (const r of built.runs) {
    const a = r.place.start;
    const b = r.place.end;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const h = r.run.height;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
    mesh.position.set((a[0] + b[0]) / 2, h / 2, (a[1] + b[1]) / 2);
    mesh.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    group.add(mesh);
  }
}

export async function mount3d(container, built) {
  const THREE = await import(THREE_URL);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.replaceChildren(renderer.domElement);
  renderer.domElement.style.touchAction = "none";
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1000);
  const target = new THREE.Vector3();
  const render = () => renderer.render(scene, camera);
  const controls = orbit(camera, renderer.domElement, target, render);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(20, 40, 10);
  scene.add(sun);
  let group = new THREE.Group();
  scene.add(group);
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    render();
  };
  const update = (next) => {
    scene.remove(group);
    scene.background = new THREE.Color(
      cssColor(container, "--canvas", "#e6ebef"),
    );
    group = buildMeshes(THREE, next, palette(container));
    addWalls(THREE, group, next, cssColor(container, "--wall3d", "#b5c0ca"));
    const box = new THREE.Box3().setFromObject(group);
    const grid = new THREE.GridHelper(80, 80, 0x8899aa, 0x8899aa);
    grid.material.opacity = 0.12;
    grid.material.transparent = true;
    group.add(grid);
    scene.add(group);
    if (!box.isEmpty()) {
      box.getCenter(target);
      controls.state.radius = box.getSize(new THREE.Vector3()).length() * 1.1;
    }
    controls.apply();
  };
  new ResizeObserver(resize).observe(container);
  update(built);
  resize();
  return { update };
}
