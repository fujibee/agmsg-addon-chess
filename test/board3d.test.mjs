// A piece that leaves the board gives its geometry back; the materials it shared with the others stay usable.
import test from "node:test";
import assert from "node:assert/strict";
import { MeshStandardMaterial } from "three";
import { disposePiece, makePiece } from "../src/board3d.src.js";

const mats = () => ({ w: new MeshStandardMaterial(), b: new MeshStandardMaterial(), slit: new MeshStandardMaterial() });

for (const kind of ["p", "n", "b", "r", "q", "k"]) {
  test(`taking a ${kind} disposes every geometry of the piece and none of the shared materials`, () => {
    const m = mats();
    const group = makePiece("w", kind, m);
    const geometries = new Set();
    group.traverse((o) => { if (o.isMesh) geometries.add(o.geometry); });
    assert.ok(geometries.size > 0);
    const disposed = new Set();
    for (const g of geometries) g.addEventListener("dispose", () => disposed.add(g));
    const materialsDisposed = [];
    for (const mat of Object.values(m)) mat.addEventListener("dispose", () => materialsDisposed.push(mat));
    disposePiece(group);
    assert.equal(disposed.size, geometries.size, "every geometry the piece built is released");
    assert.deepEqual(materialsDisposed, [], "materials are shared by all pieces and stay");
  });
}
