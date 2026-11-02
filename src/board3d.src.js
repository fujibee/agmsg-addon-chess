// The 3D board. Built into app-panes/chess/web/board3d.js (see package.json "build"); three.js is bundled, nothing is fetched.
import {
  ACESFilmicToneMapping, AmbientLight, BoxGeometry, CircleGeometry, CylinderGeometry, DirectionalLight, ExtrudeGeometry, Group,
  HemisphereLight, LatheGeometry, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster,
  Scene, Shape, SphereGeometry, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, Color, Fog,
} from "three";

const SQ = 1; // one square

// Silhouettes as [radius, height] pairs, turned around the vertical axis.
const PROFILE = {
  p: [[0.36, 0], [0.36, 0.08], [0.2, 0.16], [0.14, 0.4], [0.2, 0.46], [0.12, 0.5], [0.16, 0.58], [0.19, 0.7], [0.14, 0.82], [0.0, 0.86]],
  r: [[0.38, 0], [0.38, 0.1], [0.28, 0.18], [0.24, 0.62], [0.32, 0.68], [0.32, 0.9], [0.24, 0.9], [0.24, 0.84], [0.0, 0.84]],
  b: [[0.38, 0], [0.38, 0.1], [0.24, 0.2], [0.14, 0.5], [0.24, 0.58], [0.16, 0.66], [0.2, 0.86], [0.12, 1.06], [0.06, 1.1], [0.1, 1.16], [0.0, 1.2]],
  q: [[0.4, 0], [0.4, 0.1], [0.26, 0.2], [0.16, 0.6], [0.28, 0.72], [0.18, 0.76], [0.3, 1.02], [0.24, 1.04], [0.2, 1.0], [0.1, 1.08], [0.12, 1.2], [0.0, 1.22]],
  k: [[0.4, 0], [0.4, 0.1], [0.26, 0.2], [0.16, 0.6], [0.28, 0.72], [0.18, 0.76], [0.28, 1.0], [0.16, 1.08], [0.0, 1.1]],
};

function lathe(kind) {
  const pts = PROFILE[kind].map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(pts, 40);
}

function knightGeometry() {
  // A side profile pulled out into a body, on a round base.
  const s = new Shape();
  s.moveTo(-0.22, 0.1); s.lineTo(-0.2, 0.42); s.quadraticCurveTo(-0.26, 0.62, -0.08, 0.86);
  s.lineTo(-0.1, 1.0); s.lineTo(0.0, 0.94); s.lineTo(0.06, 1.02); s.lineTo(0.14, 0.9);
  s.quadraticCurveTo(0.34, 0.76, 0.36, 0.6); s.lineTo(0.2, 0.52); s.quadraticCurveTo(0.08, 0.6, 0.0, 0.5);
  s.quadraticCurveTo(0.12, 0.3, 0.22, 0.1); s.lineTo(-0.22, 0.1);
  const g = new ExtrudeGeometry(s, { depth: 0.34, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -0.17);
  return g;
}

function crossOn(group, y, mat) {
  const a = new Mesh(new BoxGeometry(0.06, 0.22, 0.06), mat); a.position.y = y + 0.1;
  const b = new Mesh(new BoxGeometry(0.2, 0.06, 0.06), mat); b.position.y = y + 0.12;
  for (const m of [a, b]) { m.castShadow = true; group.add(m); }
}

function crownOn(group, y, mat) {
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2;
    const m = new Mesh(new SphereGeometry(0.045, 12, 8), mat);
    m.position.set(Math.cos(t) * 0.17, y, Math.sin(t) * 0.17); m.castShadow = true; group.add(m);
  }
}

function makePiece(color, kind, mats) {
  const mat = mats[color];
  const g = new Group();
  let body;
  if (kind === "n") {
    body = new Group();
    const base = new Mesh(new CylinderGeometry(0.38, 0.4, 0.12, 40), mat);
    base.position.y = 0.06;
    const horse = new Mesh(knightGeometry(), mat);
    if (color === "b") horse.rotation.y = Math.PI; // seen from the side; black faces the other way
    body.add(base, horse);
    body.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  } else {
    body = new Mesh(lathe(kind), mat);
    body.castShadow = true; body.receiveShadow = true;
  }
  g.add(body);
  if (kind === "k") crossOn(g, 1.1, mat);
  if (kind === "q") crownOn(g, 1.22, mat);
  if (kind === "r") {
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const m = new Mesh(new BoxGeometry(0.12, 0.14, 0.12), mat);
      m.position.set(Math.cos(t) * 0.2, 0.96, Math.sin(t) * 0.2); m.castShadow = true; g.add(m);
    }
  }
  return g;
}

const files = "abcdefgh";
// z grows toward white's side: rank 1 at z = +3.5, rank 8 at z = -3.5
const place = (name) => new Vector3((files.indexOf(name[0]) - 3.5) * SQ, 0, (4.5 - Number(name[1])) * SQ);

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (_) { return false; }
}

export function createBoard3d(host) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "default" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  host.append(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const scene = new Scene();
  scene.background = new Color(0x14161b);
  scene.fog = new Fog(0x14161b, 16, 34);
  const camera = new PerspectiveCamera(36, 1, 0.1, 80);

  scene.add(new HemisphereLight(0xdfe8ff, 0x2a2420, 0.7));
  scene.add(new AmbientLight(0xffffff, 0.15));
  const sun = new DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(-5, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0004; sun.shadow.radius = 4;
  scene.add(sun);
  const rim = new DirectionalLight(0x9fb8ff, 0.7);
  rim.position.set(6, 5, -8);
  scene.add(rim);

  // Table, frame, squares.
  const table = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.95 }));
  table.rotation.x = -Math.PI / 2; table.position.y = -0.32; table.receiveShadow = true;
  scene.add(table);
  const frame = new Mesh(new BoxGeometry(9.2, 0.3, 9.2), new MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.55, metalness: 0.05 }));
  frame.position.y = -0.17; frame.receiveShadow = true; frame.castShadow = true;
  scene.add(frame);
  const lightSq = new MeshStandardMaterial({ color: 0xe8d3a8, roughness: 0.5 });
  const darkSq = new MeshStandardMaterial({ color: 0x6d4528, roughness: 0.5 });
  const squares = [];
  for (let f = 0; f < 8; f++) for (let r = 1; r <= 8; r++) {
    const name = files[f] + r;
    const m = new Mesh(new BoxGeometry(SQ, 0.06, SQ), (f + r) % 2 ? lightSq : darkSq);
    m.material = (f + r) % 2 ? lightSq.clone() : darkSq.clone();
    m.userData.base = m.material.color.clone();
    const p = place(name); m.position.set(p.x, -0.03, p.z);
    m.receiveShadow = true; m.userData.sq = name;
    scene.add(m); squares.push(m);
  }

  const mats = {
    w: new MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.32, metalness: 0.05 }),
    b: new MeshStandardMaterial({ color: 0x25272e, roughness: 0.3, metalness: 0.2 }),
  };
  const pieces = new Group();
  scene.add(pieces);
  let highlight = [];
  let shown = new Map(); // square -> { group, color, type }
  const tweens = []; // { group, from, to, t0, dur, kind }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function setPosition(board, last) {
    const next = new Map();
    board.forEach((row, rIdx) => row.forEach((cell, cIdx) => {
      if (cell) next.set(files[cIdx] + (8 - rIdx), { color: cell.color, type: cell.type });
    }));
    const now = performance.now();
    const keep = new Map();
    const gone = [];
    for (const [sq, p] of shown) {
      const n = next.get(sq);
      if (n && n.color === p.color && n.type === p.type) keep.set(sq, p); else gone.push([sq, p]);
    }
    const fresh = [];
    for (const [sq, n] of next) if (!keep.has(sq)) fresh.push([sq, n]);
    // A piece that vanished from one square and appeared on another is the same piece: slide it. Pieces that
    // vanish with no partner were taken (or promoted); pieces that appear with no partner are new (or promoted).
    const result = new Map(keep);
    for (const [sq, n] of fresh) {
      const i = gone.findIndex(([, p]) => p.color === n.color && p.type === n.type);
      if (i >= 0) {
        const [from, p] = gone.splice(i, 1)[0];
        const a = place(from), b = place(sq);
        tweens.push({ group: p.group, from: a, to: b, t0: now, dur: p.type === "n" ? 620 : 480, kind: "move" });
        result.set(sq, p);
      } else {
        const g = makePiece(n.color, n.type, mats);
        g.scale.setScalar(0.95);
        const b = place(sq); g.position.set(b.x, 0, b.z);
        pieces.add(g);
        if (shown.size) { g.scale.setScalar(0.01); tweens.push({ group: g, from: b, to: b, t0: now + 300, dur: 300, kind: "in" }); }
        result.set(sq, { group: g, color: n.color, type: n.type });
      }
    }
    for (const [, p] of gone) tweens.push({ group: p.group, from: p.group.position.clone(), to: p.group.position.clone(), t0: now + 250, dur: 320, kind: "out" });
    shown = result;
    for (const s of squares) s.material.color.copy(s.userData.base);
    highlight = last ? [last.from, last.to] : [];
    for (const s of squares) if (highlight.includes(s.userData.sq)) s.material.color.lerp(new Color(0xe3b23c), 0.55);
  }

  function step(now) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i];
      const raw = (now - w.t0) / w.dur;
      if (raw < 0) continue;
      const t = Math.min(1, raw), e = ease(t);
      if (w.kind === "move") {
        w.group.position.set(w.from.x + (w.to.x - w.from.x) * e, Math.sin(Math.PI * e) * 0.9, w.from.z + (w.to.z - w.from.z) * e);
      } else if (w.kind === "in") {
        w.group.scale.setScalar(0.01 + 0.94 * e);
      } else {
        w.group.scale.setScalar(Math.max(0.01, 0.95 * (1 - e)));
        w.group.position.y = -0.4 * e;
        if (t >= 1) pieces.remove(w.group);
      }
      if (t >= 1) {
        if (w.kind === "move") w.group.position.set(w.to.x, 0, w.to.z);
        tweens.splice(i, 1);
      }
    }
  }

  // The view: a slow orbit that the user can take over by dragging; wheel zooms.
  let yaw = 0.0, pitch = 0.9, dist = 15.5, idle = true, drag = null;
  const target = new Vector3(0, 0.3, 0);
  function aim() {
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist).add(target);
    camera.lookAt(target);
  }
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; idle = false; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw -= (e.clientX - drag.x) * 0.006;
    pitch = Math.min(1.45, Math.max(0.35, pitch + (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => { drag = null; };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("wheel", (e) => { e.preventDefault(); dist = Math.min(22, Math.max(7, dist * (1 + Math.sign(e.deltaY) * 0.06))); }, { passive: false });
  el.addEventListener("dblclick", () => { yaw = 0; pitch = 0.9; dist = 15.5; idle = true; });

  function resize() {
    const w = Math.max(host.clientWidth, 200), h = Math.max(host.clientHeight, 200);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  let running = true, raf = 0, t0 = performance.now();
  function frame_() {
    if (!running) return;
    raf = requestAnimationFrame(frame_);
    if (idle) yaw = Math.sin((performance.now() - t0) / 6000) * 0.28;
    step(performance.now());
    aim();
    renderer.render(scene, camera);
  }
  frame_();
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { cancelAnimationFrame(raf); frame_(); }
  });

  return {
    setPosition,
    renderOnce() { step(performance.now()); aim(); renderer.render(scene, camera); },
    setView(v) { yaw = v.yaw ?? yaw; pitch = v.pitch ?? pitch; dist = v.dist ?? dist; idle = false; },
    dispose() { running = false; cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
