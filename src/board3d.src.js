// The 3D board. Built into app-panes/chess/web/board3d.js (see package.json "build"); three.js is bundled, nothing is fetched.
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { framing } from "./view.js";
import {
  ACESFilmicToneMapping, AmbientLight, BoxGeometry, ConeGeometry, CylinderGeometry, DirectionalLight, ExtrudeGeometry, Group,
  HemisphereLight, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster,
  Scene, Shape, SphereGeometry, SplineCurve, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, Color, Fog,
} from "three";

const SQ = 1; // one square
const SCALE = 0.95;

// Silhouettes as [radius, height] pairs, turned around the vertical axis. The heights step up on purpose so the
// pieces read from the camera's side view: pawn < knight < bishop < rook < queen < king.
const PROFILE = {
  p: [[0.3, 0], [0.3, 0.07], [0.18, 0.14], [0.11, 0.34], [0.17, 0.38], [0.1, 0.42], [0.15, 0.5], [0.15, 0.6], [0.1, 0.7], [0.0, 0.72]],
  r: [[0.42, 0], [0.42, 0.12], [0.34, 0.2], [0.3, 0.7], [0.4, 0.8], [0.4, 1.08], [0.3, 1.08], [0.3, 1.0], [0.0, 1.0]],
  b: [[0.38, 0], [0.38, 0.1], [0.24, 0.2], [0.13, 0.55], [0.26, 0.64], [0.13, 0.72], [0.2, 0.9], [0.2, 1.0], [0.12, 1.18], [0.05, 1.24], [0.08, 1.28], [0.0, 1.32]],
  q: [[0.44, 0], [0.44, 0.12], [0.3, 0.24], [0.15, 0.7], [0.3, 0.84], [0.17, 0.9], [0.26, 1.1], [0.36, 1.36], [0.28, 1.38], [0.0, 1.34]],
  k: [[0.46, 0], [0.46, 0.12], [0.32, 0.24], [0.17, 0.74], [0.32, 0.9], [0.18, 0.96], [0.3, 1.2], [0.34, 1.5], [0.2, 1.54], [0.0, 1.5]],
};

function lathe(kind) {
  const pts = PROFILE[kind].map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(pts, 48);
}

function knightGeometry() {
  // A horse's head and neck in profile (snout to the right): an arched neck with a mane ridge down the back, a
  // brow, a straight bridge to a rounded muzzle, a jaw notch and two ears. Many points on one smooth closed spline,
  // pulled out with a generous bevel, then tapered so the muzzle is narrower than the neck, and smooth-shaded.
  const pts = [
    [-0.27, 0.0], [-0.34, 0.18], [-0.37, 0.36], [-0.34, 0.54], [-0.29, 0.7], [-0.22, 0.84], [-0.17, 0.95], // back of the neck, mane
    [-0.13, 1.03], [-0.09, 1.24], [-0.04, 1.04], // first ear
    [-0.01, 1.03], [0.03, 1.24], [0.08, 1.0], // second ear
    [0.14, 0.94], [0.24, 0.83], [0.34, 0.7], [0.42, 0.59], // brow and a long bridge of the nose
    [0.465, 0.51], [0.45, 0.44], [0.39, 0.4], // rounded muzzle
    [0.28, 0.4], [0.19, 0.44], [0.12, 0.5], [0.09, 0.45], // lip, chin groove, jaw
    [0.11, 0.33], [0.2, 0.17], [0.26, 0.0], // throat and chest
  ].map(([x, y]) => new Vector2(x, y));
  const spline = new SplineCurve(pts.concat([pts[0]]));
  const outline = spline.getPoints(220);
  const shape = new Shape(outline);
  let g = new ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.09, bevelSegments: 8, curveSegments: 1, steps: 1 });
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position;
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, pos.getZ(i) * (1 - 0.5 * smooth(0.05, 0.42, x)) * (1 - 0.55 * smooth(1.02, 1.22, y)));
  }
  g.computeVertexNormals();
  g.translate(0, 0.3, -0.07);
  return g;
}

function crossOn(group, y, mat) {
  const a = new Mesh(new BoxGeometry(0.1, 0.4, 0.1), mat); a.position.y = y + 0.2;
  const b = new Mesh(new BoxGeometry(0.3, 0.1, 0.1), mat); b.position.y = y + 0.26;
  for (const m of [a, b]) { m.castShadow = true; group.add(m); }
}

function coronetOn(group, y, mat) {
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    const tooth = new Mesh(new ConeGeometry(0.06, 0.2, 10), mat);
    tooth.position.set(Math.cos(t) * 0.29, y + 0.08, Math.sin(t) * 0.29);
    tooth.castShadow = true; group.add(tooth);
  }
  const ball = new Mesh(new SphereGeometry(0.1, 20, 14), mat);
  ball.position.y = y + 0.2; ball.castShadow = true; group.add(ball);
}

function makePiece(color, kind, mats) {
  const mat = mats[color];
  const g = new Group();
  let body;
  if (kind === "n") {
    body = new Group();
    const base = new Mesh(new LatheGeometry([[0.4, 0], [0.4, 0.12], [0.3, 0.2], [0.2, 0.28], [0.27, 0.32], [0.27, 0.38], [0.0, 0.4]].map(([r, y]) => new Vector2(r, y)), 48), mat);
    const horse = new Mesh(knightGeometry(), mat);
    if (color === "b") horse.rotation.y = Math.PI; // seen from the side; black faces the other way
    const eye = new Mesh(new SphereGeometry(0.035, 12, 8), mats.slit);
    for (const z of [-0.13, 0.13]) { const e = eye.clone(); e.position.set(0.19, 1.1, z); horse.add(e); }
    body.add(base, horse);
    body.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  } else {
    body = new Mesh(lathe(kind), mat);
    body.castShadow = true; body.receiveShadow = true;
  }
  g.add(body);
  if (kind === "k") crossOn(g, 1.5, mat);
  if (kind === "q") coronetOn(g, 1.36, mat);
  if (kind === "b") {
    // The mitre's slit: a thin dark notch cut across the head.
    const slit = new Mesh(new BoxGeometry(0.34, 0.035, 0.34), mats.slit);
    slit.position.y = 1.12; slit.rotation.z = -0.5;
    g.add(slit);
  }
  if (kind === "r") {
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const m = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), mat);
      m.position.set(Math.cos(t) * 0.3, 1.12, Math.sin(t) * 0.3); m.rotation.y = -t; m.castShadow = true; g.add(m);
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

/** `guard` wraps the callbacks the browser calls (pointer, wheel, resize, frame), so an error in one shows its own message and stack. */
export function createBoard3d(host, { guard = (fn) => fn } = {}) {
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
  // A mid-tone ground: the white pieces stand out from it as much as the dark ones do, in a light or a dark page.
  scene.background = new Color(0x8b93a4);
  scene.fog = new Fog(0x8b93a4, 16, 34);
  const camera = new PerspectiveCamera(36, 1, 0.1, 80);

  scene.add(new HemisphereLight(0xdfe8ff, 0x6a625a, 0.8));
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
  const table = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: 0x8b93a4, roughness: 0.95 }));
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
    // Charcoal rather than black, with a glossy coat, so the shapes read from their highlights.
    b: new MeshPhysicalMaterial({ color: 0x434a58, roughness: 0.24, metalness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.1 }),
    slit: new MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.6 }),
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
        g.scale.setScalar(SCALE);
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
        w.group.scale.setScalar(0.01 + (SCALE - 0.01) * e);
      } else {
        w.group.scale.setScalar(Math.max(0.01, SCALE * (1 - e)));
        w.group.position.y = -0.4 * e;
        if (t >= 1) pieces.remove(w.group);
      }
      if (t >= 1) {
        if (w.kind === "move") w.group.position.set(w.to.x, 0, w.to.z);
        tweens.splice(i, 1);
      }
    }
  }

  // The view: a slow turn that a drag stops; wheel zooms; resetView() brings back the first view and the turn.
  const START = { yaw: 0.0, pitch: 0.9, dist: 15.5 };
  let yaw = START.yaw, pitch = START.pitch, dist = START.dist, idle = true, drag = null;
  const target = new Vector3(0, 0.3, 0);
  function aim() {
    // A narrow pane stands further back; the fog and the far plane move back with it, or the board would sit in the fog.
    const f = framing(dist, camera.aspect);
    const d = f.d;
    if (scene.fog.near !== f.fogNear) { scene.fog.near = f.fogNear; scene.fog.far = f.fogFar; }
    if (camera.far !== f.far) { camera.far = f.far; camera.updateProjectionMatrix(); }
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d).add(target);
    camera.lookAt(target);
  }
  function resetView() { yaw = START.yaw; pitch = START.pitch; dist = START.dist; idle = true; }
  const el = renderer.domElement;
  el.addEventListener("pointerdown", guard((e) => { drag = { x: e.clientX, y: e.clientY }; idle = false; el.setPointerCapture(e.pointerId); }));
  el.addEventListener("pointermove", guard((e) => {
    if (!drag) return;
    yaw -= (e.clientX - drag.x) * 0.006;
    pitch = Math.min(1.45, Math.max(0.35, pitch + (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY };
  }));
  const end = () => { drag = null; };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("wheel", guard((e) => { e.preventDefault(); dist = Math.min(22, Math.max(7, dist * (1 + Math.sign(e.deltaY) * 0.06))); }), { passive: false });
  el.addEventListener("dblclick", resetView);

  function resize() {
    const w = Math.max(host.clientWidth, 200), h = Math.max(host.clientHeight, 200);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(guard(resize)).observe(host);
  resize();

  let running = true, raf = 0, lastFrame = performance.now();
  function frame_() {
    if (!running) return;
    raf = requestAnimationFrame(next);
    const now = performance.now();
    if (idle) yaw += Math.min(0.1, (now - lastFrame) / 1000) * 0.12; // one full turn in about 52 s
    lastFrame = now;
    step(performance.now());
    aim();
    renderer.render(scene, camera);
  }
  const next = guard(frame_);
  next();
  document.addEventListener("visibilitychange", guard(() => {
    running = !document.hidden;
    if (running) { cancelAnimationFrame(raf); next(); }
  }));

  return {
    setPosition,
    renderOnce() { step(performance.now()); aim(); renderer.render(scene, camera); },
    resetView,
    setView(v) { yaw = v.yaw ?? yaw; pitch = v.pitch ?? pitch; dist = v.dist ?? dist; idle = false; },
    dispose() { running = false; cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
