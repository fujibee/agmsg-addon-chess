import test from "node:test";
import assert from "node:assert/strict";
import { FIXED, fromAnswer, loadModels, optionText } from "../app-panes/chess/web/models.js";

const answer = (over = {}) => ({
  type: "codex",
  source: "app-server",
  models: [
    { id: "gpt-6.1-sol", name: "GPT-6.1-Sol", description: "Fast", isDefault: true, defaultEffort: "low", efforts: [] },
    { id: "gpt-6-luna", name: "GPT-6-Luna", description: "Small", isDefault: false, defaultEffort: null, efforts: [] },
  ],
  ...over,
});

test("the app's list is used, with its names and descriptions", async () => {
  const r = await loadModels({ agents: { models: async () => answer() } }, "codex");
  assert.equal(r.source, "app");
  assert.deepEqual(r.options.map((o) => [o.value, o.label, o.isDefault]), [["gpt-6.1-sol", "GPT-6.1-Sol", true], ["gpt-6-luna", "GPT-6-Luna", false]]);
  assert.equal(optionText(r.options[0]), "GPT-6.1-Sol — Fast");
});

test("Claude Code's default passes no model, and aliases are kept as given", () => {
  const o = fromAnswer({ source: "fixed", models: [{ id: "default", name: "Default (recommended)", description: "x", isDefault: true }, { id: "opus", name: "Opus", description: "y", isDefault: false }] });
  assert.deepEqual(o.map((m) => m.value), ["", "opus"]);
});

test("without the op, or when it fails, the stand-in list is used and the reason is kept", async () => {
  const missing = await loadModels({ agents: {} }, "claude-code");
  assert.equal(missing.source, "fixed");
  assert.deepEqual(missing.options.map((o) => o.value), ["", "opus", "fable", "sonnet", "haiku"]);
  const failed = await loadModels({ agents: { models: async () => { throw new Error("not_available: codex is not installed"); } } }, "codex");
  assert.equal(failed.source, "fixed");
  assert.equal(failed.options.length, FIXED.codex.length);
  assert.match(failed.reason, /codex is not installed/);
});

test("a type with no list, or an empty answer for an unknown type, offers nothing", async () => {
  assert.equal((await loadModels({ agents: { models: async () => ({ type: "x", source: "none", models: [] }) } }, "x")).source, "none");
  assert.equal((await loadModels({ agents: { models: async () => ({ type: "x", source: "app-server", models: [] }) } }, "x")).options.length, 0);
});

test("the app's note about a stand-in Codex list is passed on", async () => {
  const r = await loadModels({ agents: { models: async () => answer({ source: "fallback", reason: "Codex could not be asked" }) } }, "codex");
  assert.equal(r.source, "app");
  assert.equal(r.reason, "Codex could not be asked");
});
