import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIMIT, LIMITS, acceptsModel, defaultSetup, edgeLabel, load, loadLimit, mergeSaved, save, saveLimit, sideLabel, swapSides } from "../app-panes/chess/web/setup.js";

const TYPES = [
  { type: "claude-code", models: true },
  { type: "codex", models: true },
  { type: "gemini", models: false },
];
const memory = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, data };
};

test("the default is the first CLI on both sides with the CLI's own model", () => {
  assert.deepEqual(defaultSetup(TYPES), { w: { type: "claude-code", model: "" }, b: { type: "claude-code", model: "" } });
  assert.deepEqual(defaultSetup([]), { w: { type: "", model: "" }, b: { type: "", model: "" } });
});

test("a saved choice is kept; a vanished CLI falls back; a CLI without models loses the model", () => {
  const saved = { w: { type: "codex", model: " gpt-x " }, b: { type: "gone", model: "m" } };
  assert.deepEqual(mergeSaved(saved, TYPES), { w: { type: "codex", model: "gpt-x" }, b: { type: "claude-code", model: "" } });
  assert.deepEqual(mergeSaved({ w: { type: "gemini", model: "x" }, b: { type: "gemini" } }, TYPES).w, { type: "gemini", model: "" });
  assert.deepEqual(mergeSaved(null, TYPES), defaultSetup(TYPES));
});

test("the model field is for CLIs that take a model", () => {
  assert.equal(acceptsModel(TYPES, "claude-code"), true);
  assert.equal(acceptsModel(TYPES, "gemini"), false);
  assert.equal(acceptsModel(TYPES, "nope"), false);
});

test("labels and swap", () => {
  assert.equal(sideLabel({ type: "claude-code", model: "haiku" }), "claude-code · haiku");
  assert.equal(sideLabel({ type: "codex", model: "" }), "codex");
  const s = { w: { type: "codex", model: "" }, b: { type: "claude-code", model: "opus" } };
  assert.deepEqual(swapSides(s), { w: { type: "claude-code", model: "opus" }, b: { type: "codex", model: "" } });
});

test("the choice is remembered, and storage that throws or holds junk never breaks the pane", () => {
  const st = memory();
  save(st, { w: { type: "codex", model: "m" }, b: { type: "claude-code", model: "" } });
  assert.deepEqual(load(st, TYPES).w, { type: "codex", model: "m" });
  assert.deepEqual(load(memory({ "chess.setup.v1": "{not json" }), TYPES), defaultSetup(TYPES));
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(load(broken, TYPES), defaultSetup(TYPES));
  assert.doesNotThrow(() => save(broken, defaultSetup(TYPES)));
});

test("the edge label names the model, or says CLI default for a CLI that takes one", () => {
  assert.equal(edgeLabel({ type: "claude-code", model: "opus" }, TYPES), "claude-code \u00b7 opus");
  assert.equal(edgeLabel({ type: "claude-code", model: "" }, TYPES), "claude-code \u00b7 CLI default");
  assert.equal(edgeLabel({ type: "gemini", model: "" }, TYPES), "gemini");
  assert.equal(edgeLabel(null, TYPES), "");
});

test("the time per move defaults to 2 minutes, is remembered, and junk or blocked storage falls back", () => {
  assert.equal(DEFAULT_LIMIT, 120);
  assert.deepEqual(LIMITS.map((l) => l.value), [30, 60, 120, 300, 0]);
  const st = memory();
  assert.equal(loadLimit(st), 120);
  saveLimit(st, 0);
  assert.equal(loadLimit(st), 0, "No limit is a choice, not a missing value");
  saveLimit(st, 60);
  assert.equal(loadLimit(st), 60);
  assert.equal(loadLimit(memory({ "chess.limit.v1": "7" })), 120);
  assert.equal(loadLimit(memory({ "chess.limit.v1": "abc" })), 120);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(loadLimit(broken), 120);
  assert.doesNotThrow(() => saveLimit(broken, 60));
});
