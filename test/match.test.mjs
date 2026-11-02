import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch } from "../app-panes/chess/web/match.js";
import { legalUci } from "../app-panes/chess/web/game.js";
import { Chess } from "../app-panes/chess/web/chess.js";

// Two fake agents that read the FEN in each prompt and answer with a legal move (seeded), sometimes badly first.
function fakeApp({ spoil = () => null } = {}) {
  let seed = 7;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const sent = [];
  let id = 0;
  let match;
  const app = {
    team: { join: async () => ({ name: "chess", type: "app-addon", created: true }) },
    agents: { spawn: async (type, name) => ({ name, type, state: "running", pid: 10 }) },
    messages: {
      send: async (to, body) => {
        sent.push({ to, body });
        const fen = /FEN\): (.+)/.exec(body)[1];
        const moves = legalUci(new Chess(fen));
        const bad = spoil(sent.length);
        const reply = bad ?? moves[rnd(moves.length)];
        queueMicrotask(() => match.onMessage({ id: String(++id), from: to, to: "chess", body: reply }));
        return { to };
      },
    },
  };
  return { app, sent, bind: (m) => (match = m) };
}

test("two agents play a whole game; bad replies are asked again", async () => {
  const f = fakeApp({ spoil: (n) => (n === 3 ? "I think Nf3" : n === 5 ? "a1a8" : null) });
  const done = new Promise((resolve) => {
    const m = createMatch({ app: f.app, onChange: (s) => (s.phase === "over" || s.phase === "error") && resolve(s) });
    f.bind(m);
    m.start("claude-code");
  });
  const m = await done;
  assert.equal(m.phase, "over", m.error);
  assert.ok(m.result.length > 0);
  assert.ok(m.problems >= 2);
  assert.ok(m.chess.history().length > 10);
  // The first prompt to each side explains the game; later ones do not.
  assert.match(f.sent[0].body, /You are playing white/);
  assert.match(f.sent[1].body, /You are playing black/);
  assert.doesNotMatch(f.sent[2].body, /You are playing/);
  // Nothing is sent after the game ends.
  const count = f.sent.length;
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(f.sent.length, count);
});

test("a message from the wrong side, or twice, is ignored", async () => {
  const f = fakeApp();
  const m = createMatch({ app: f.app });
  f.bind(m);
  f.app.messages.send = async () => ({});
  await m.start("claude-code");
  assert.equal(m.phase, "playing");
  await m.onMessage({ id: "x", from: "black", to: "chess", body: "e7e5" });
  assert.equal(m.chess.history().length, 0);
  await m.onMessage({ id: "y", from: "white", to: "chess", body: "e2e4" });
  await m.onMessage({ id: "y", from: "white", to: "chess", body: "d2d4" });
  assert.deepEqual(m.chess.history(), ["e4"]);
});

test("a player that cannot start stops the game with its reason", async () => {
  const f = fakeApp();
  f.app.agents.spawn = async (type, name) => ({ name, type, state: "failed", reason: "no such CLI" });
  const m = createMatch({ app: f.app });
  await m.start("nope");
  assert.equal(m.phase, "error");
  assert.match(m.error, /white could not start: no such CLI/);
});
