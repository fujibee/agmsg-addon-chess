import { test } from "node:test";
import assert from "node:assert/strict";
import { framing } from "../src/view.js";

test("a wide pane keeps the chosen distance, and the first view is unchanged", () => {
  const f = framing(15.5, 4 / 3);
  assert.equal(f.d, 15.5);
  assert.ok(f.fogNear > f.d + 6.6, "the fog starts past the board's far edge");
});

test("at every pane shape and zoom the board is inside the fog's start and the far plane", () => {
  for (const aspect of [0.2, 0.3, 0.4, 0.6, 0.8, 1, 1.15, 1.33, 2, 4]) {
    for (const dist of [7, 11, 15.5, 22]) {
      const f = framing(dist, aspect);
      assert.ok(f.d >= dist, `${aspect}/${dist}: never closer than chosen`);
      assert.ok(f.fogNear >= f.d + 6.6, `${aspect}/${dist}: the board's far corner is before the fog`);
      assert.ok(f.fogFar > f.fogNear, `${aspect}/${dist}: the fog has a range`);
      assert.ok(f.far > f.fogFar, `${aspect}/${dist}: the far plane is beyond the fog`);
    }
  }
});

test("a tall narrow pane (200 x 500) stands back far enough for the sides, with the fog behind the board", () => {
  const f = framing(15.5, 200 / 500);
  assert.ok(f.d > 40);
  assert.ok(f.fogNear > f.d + 6.6);
  assert.ok(f.far > f.d + 30);
});

test("a zero or tiny aspect does not send the camera to infinity", () => {
  assert.ok(Number.isFinite(framing(15.5, 0).d));
  assert.ok(framing(15.5, 0).d < 400);
});
