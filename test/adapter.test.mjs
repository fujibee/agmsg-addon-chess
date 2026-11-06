// The bundled adapter carries the app's delivery report to the pane: the flag from init and the notice events.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { connect } from "../app-panes/chess/web/agmsg-addon.js";

function appWithPort(options = {}) {
  let onWindow = null;
  const parent = {};
  globalThis.window = { parent, addEventListener: (_t, fn) => (onWindow = fn), removeEventListener() {} };
  const app = connect({ sample: false, errorOverlay: false, ...options });
  const port = { postMessage() {}, start() {}, onmessage: null };
  onWindow({ source: parent, data: { agmsg: 1, type: "port" }, ports: [port] });
  const push = (data) => port.onmessage({ data: { agmsg: 1, ...data } });
  return { app, push };
}

test("the pane learns from init whether the app reports delivery, and an older app leaves it off", () => {
  const { app, push } = appWithPort();
  assert.equal(app.canReportDelivery, false);
  push({ type: "init", team: "t", members: [], messages: [] });
  assert.equal(app.canReportDelivery, false);
  push({ type: "init", team: "t", members: [], messages: [], notice: true });
  assert.equal(app.canReportDelivery, true);
});

test("a notice event reaches onNotice with the member, the time and the ids only", () => {
  const seen = [];
  const { push } = appWithPort({ onNotice: (n) => seen.push(n) });
  push({ type: "init", team: "t", members: [], messages: [], notice: true });
  push({ type: "notice", name: "white", at: 1234, ids: ["m1"], body: "no text passes" });
  assert.deepEqual(seen, [{ name: "white", at: 1234, ids: ["m1"] }]);
});

test("the pane and the repository's kit copy are the same file", () => {
  const web = readFileSync(new URL("../app-panes/chess/web/agmsg-addon.js", import.meta.url), "utf8");
  const kit = readFileSync(new URL("../kit/agmsg-addon.js", import.meta.url), "utf8");
  assert.equal(web, kit);
});
