// A piece that leaves the board gives its geometry back; the materials it shared with the others stay usable.
// (Plain objects stand in for the scene graph, so this runs without installing anything, like the other tests.)
import test from "node:test";
import assert from "node:assert/strict";
import { disposePiece } from "../src/dispose.js";

const geometry = () => ({ disposed: 0, dispose() { this.disposed++; } });
const material = () => ({ disposed: 0, dispose() { this.disposed++; } });
const mesh = (g, m) => ({ isMesh: true, geometry: g, material: m });
const group = (...nodes) => ({ traverse: (fn) => nodes.forEach(fn) });

test("taking a piece disposes the geometry of every mesh in it and none of the shared materials", () => {
  const shared = material();
  const a = geometry(), b = geometry(), c = geometry();
  disposePiece(group(mesh(a, shared), mesh(b, shared), mesh(c, shared), { isMesh: false }));
  assert.deepEqual([a.disposed, b.disposed, c.disposed], [1, 1, 1]);
  assert.equal(shared.disposed, 0, "materials are shared by all pieces and stay");
});

test("a geometry two meshes share (the knight's eyes) may be disposed twice without harm", () => {
  const eye = geometry();
  disposePiece(group(mesh(eye, material()), mesh(eye, material())));
  assert.equal(eye.disposed, 2);
});

test("a node without a geometry is skipped", () => {
  assert.doesNotThrow(() => disposePiece(group({ isMesh: true }, {})));
});
