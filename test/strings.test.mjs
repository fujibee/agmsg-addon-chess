import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { STRING_KEYS, t } from "../app-panes/chess/web/strings.js";

test("a string is filled from its values, and an unknown key or value shows as itself", () => {
  assert.equal(t("turn.left", { time: "1:30" }), "1:30 left");
  assert.equal(t("tab.illegal", { n: 3 }), "Illegal (3)");
  assert.equal(t("no.such.key"), "no.such.key");
  assert.equal(t("turn.left"), "{time} left");
});

test("every key the pane's code asks for is in the table, so it can move to a locale file whole", () => {
  const dir = new URL("../app-panes/chess/web/", import.meta.url);
  const asked = new Set();
  for (const f of readdirSync(dir).filter((n) => /^(app|match|game|setup|models)\.js$/.test(n))) {
    for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/\bt\(\s*"([a-zA-Z.]+)"/g)) asked.add(m[1]);
    for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/"((?:tab|illegal|hint|turn|spawn|starting|log|end|lost|limit|side|status|result|setup|models)\.[a-zA-Z]+)"/g)) asked.add(m[1]);
  }
  for (const key of asked) assert.ok(STRING_KEYS.includes(key), `${key} is not in strings.js`);
  assert.ok(asked.size > 25, "the scan found the keys");
});
