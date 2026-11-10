import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { pickLocale } from "../app-panes/chess/web/agmsg-addon.js";
import { LOCALES, STRING_KEYS, TABLE_KEYS, setLocale, t } from "../app-panes/chess/web/strings.js";

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

test("the Japanese table has exactly the keys of the English one, and every placeholder the English text has", () => {
  assert.deepEqual([...TABLE_KEYS("ja")].sort(), [...STRING_KEYS].sort());
  setLocale("en");
  const slots = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  const probe = {};
  for (const key of STRING_KEYS) {
    setLocale("en");
    const en = t(key, probe);
    setLocale("ja");
    const ja = t(key, probe);
    assert.equal(slots(ja), slots(en), `${key} has different {placeholders} in ja`);
    assert.notEqual(ja, "", key);
  }
  setLocale("en");
});

test("the pane picks a table by the app's language tag: ja is Japanese, anything else English", () => {
  for (const [tag, want] of [["ja", "ja"], ["ja-JP", "ja"], ["JA", "ja"], ["en", "en"], ["de", "en"], ["xx-YY", "en"], ["", "en"], [undefined, "en"]]) {
    assert.equal(setLocale(pickLocale(tag, LOCALES)), want, String(tag));
  }
  setLocale("ja");
  assert.equal(t("btn.again"), "もう一局");
  assert.equal(t("turn.left", { time: "1:30" }), "残り 1:30");
  setLocale(pickLocale("de", LOCALES));
  assert.equal(t("btn.again"), "Play again");
});

test("a change of language switches the table the next t() reads, and a limit label follows it", async () => {
  const { LIMITS } = await import("../app-panes/chess/web/setup.js");
  setLocale("en");
  assert.equal(LIMITS[1].label, "1 minute");
  setLocale("ja");
  assert.equal(LIMITS[1].label, "1分");
  assert.equal(LIMITS.at(-1).label, "制限なし");
  setLocale("en");
  assert.equal(LIMITS.at(-1).label, "No limit");
});
