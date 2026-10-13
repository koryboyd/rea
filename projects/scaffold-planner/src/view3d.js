import { toWorld } from "./engine.js";

const THREE_URL =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const RADII = {
  standard: 0.024,
  ledger: 0.024,
  transom: 0.024,
  rail: 0.024,
  brace: 0.02,
  tie: 0.024,
};

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
    s.radius = Math.min(400, Math.max(3, s.radius));
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

function addBars(THREE, group, bars, color) {
  const byType = new Map();
  for (const b of bars) {
    if (!byType.has(b.type)) byType.set(b.type, []);
    byType.get(b.type).push(b);
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const [type, list] of byType) {
    const geo = new THREE.CylinderGeometry(RADII[type], RADII[type], 1, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: color[type],
      metalness: 0.4,
      roughness: 0.5,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((b, i) => {
      const a = new THREE.Vector3(...b.a);
      const c = new THREE.Vector3(...b.b);
      const dir = c.clone().sub(a);
      const len = dir.length() || 0.001;
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
      m.compose(a.add(c).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1));
      mesh.setMatrixAt(i, m);
    });
    group.add(mesh);
  }
}

function addDecks(THREE, group, decks, color) {
  if (decks.length === 0) return;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const hatch of [false, true]) {
    const list = decks.filter((d) => d.hatch === hatch);
    if (list.length === 0) continue;
    const mat = new THREE.MeshStandardMaterial({
      color: hatch ? color.hatch : color.deck,
      roughness: 0.8,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((d, i) => {
      const len = Math.hypot(d.b[0] - d.a[0], d.b[2] - d.a[2]);
      const wid = Math.hypot(d.c[0] - d.a[0], d.c[2] - d.a[2]);
      const center = new THREE.Vector3(
        (d.b[0] + d.c[0]) / 2,
        d.a[1] + 0.03,
        (d.b[2] + d.c[2]) / 2,
      );
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        -Math.atan2(d.b[2] - d.a[2], d.b[0] - d.a[0]),
      );
      m.compose(center, q, new THREE.Vector3(len, 0.05, wid));
      mesh.setMatrixAt(i, m);
    });
    group.add(mesh);
  }
}

function sceneData(built) {
  const bars = [];
  const decks = [];
  const walls = [];
  built.runs.forEach((r, i) => {
    const place = built.places[i];
    const w = (p) => {
      const [x, y, z] = toWorld(place, p);
      return [x, z, y];
    };
    walls.push({
      a: w([0, 0, 0]),
      b: w([r.run.length, 0, 0]),
      h: r.run.height,
    });
    for (const m of r.members) {
      if (m.type === "deck") {
        decks.push({
          a: w([m.u0, m.v0, m.z]),
          b: w([m.u1, m.v0, m.z]),
          c: w([m.u0, m.v1, m.z]),
          hatch: m.hatch,
        });
      } else {
        bars.push({ type: m.type, a: w(m.a), b: w(m.b) });
      }
    }
  });
  return { bars, decks, walls };
}

export async function mount3d(container, built) {
  const THREE = await import(THREE_URL);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.replaceChildren(renderer.domElement);
  renderer.domElement.style.touchAction = "none";
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
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
    group = new THREE.Group();
    const color = {
      standard: cssColor(container, "--steel", "#4f6478"),
      ledger: cssColor(container, "--steel", "#4f6478"),
      transom: cssColor(container, "--steel", "#4f6478"),
      rail: cssColor(container, "--rail", "#d0a020"),
      brace: cssColor(container, "--brace", "#2f6f9f"),
      tie: cssColor(container, "--tie", "#8a3b8f"),
      deck: cssColor(container, "--deck", "#c9a227"),
      hatch: cssColor(container, "--accent", "#d9822b"),
    };
    scene.background = new THREE.Color(
      cssColor(container, "--canvas", "#e8edf1"),
    );
    const { bars, decks, walls } = sceneData(next);
    addBars(THREE, group, bars, color);
    addDecks(THREE, group, decks, color);
    const wallMat = new THREE.MeshStandardMaterial({
      color: cssColor(container, "--wall3d", "#b9c3cc"),
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const box = new THREE.Box3();
    for (const wl of walls) {
      const len = Math.hypot(wl.b[0] - wl.a[0], wl.b[2] - wl.a[2]);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, wl.h), wallMat);
      mesh.position.set(
        (wl.a[0] + wl.b[0]) / 2,
        wl.h / 2,
        (wl.a[2] + wl.b[2]) / 2,
      );
      mesh.rotation.y = -Math.atan2(wl.b[2] - wl.a[2], wl.b[0] - wl.a[0]);
      group.add(mesh);
    }
    box.setFromObject(group);
    const grid = new THREE.GridHelper(80, 80, 0x8899aa, 0x8899aa);
    grid.material.opacity = 0.12;
    grid.material.transparent = true;
    group.add(grid);
    scene.add(group);
    if (!box.isEmpty()) {
      box.getCenter(target);
      const size = box.getSize(new THREE.Vector3()).length();
      controls.state.radius = size * 1.1;
    }
    controls.apply();
  };

  new ResizeObserver(resize).observe(container);
  update(built);
  resize();
  return { update };
}
