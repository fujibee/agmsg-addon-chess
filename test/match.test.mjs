import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch, startingText, waitingHint } from "../app-panes/chess/web/match.js";
import { legalUci, newGame } from "../app-panes/chess/web/game.js";
import { Chess } from "../app-panes/chess/web/chess.js";

// Two fake agents that read the FEN in each prompt and answer with a legal move (seeded), sometimes badly first.
function fakeApp({ spoil = () => null } = {}) {
  let seed = 7;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const sent = [];
  const spawned = [];
  const spawn = {};
  let id = 0;
  let match;
  const app = {
    team: { join: async () => ({ name: "chess", type: "app-addon", created: true }) },
    agents: {
      // The host's contract: the same requested name gives back the agent it already made; a new name makes one
      // (a taken name becomes name-2, ...).
      spawn: async (type, name, opts = {}) => {
        spawned.push({ type, name, ...opts });
        const made = (spawn.byName ??= new Map());
        if (!made.has(name)) made.set(name, { name, type, state: "running", pid: 10 });
        return made.get(name);
      },
    },
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
  return { app, sent, spawned, bind: (m) => (match = m) };
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

test("waitingHint stays quiet at first, then asks to look at the pane, and never stops the game", async () => {
  const { waitingHint } = await import("../app-panes/chess/web/match.js");
  const m = { phase: "playing", chess: newGame(), askedAt: 1000 };
  assert.equal(waitingHint(m, 1000 + 10_000), "");
  assert.match(waitingHint(m, 1000 + 60_000), /^White hasn't answered yet/);
  assert.match(waitingHint(m, 1000 + 60_000), /\(60 s since the turn notice\)/);
  assert.doesNotMatch(waitingHint(m, 1000 + 60_000), /trust/);
  assert.equal(waitingHint({ ...m, phase: "over" }, 1000 + 60_000), "");
  assert.equal(m.phase, "playing");
});

const guidance = {
  orphaned: /still running from before the app restarted \(process 4242\).*Settings > Add-ons/,
  unknown: /was starting when the app stopped \(it was opening\).*Settings > Add-ons/,
  joined: /is joined but has no running agent.*Settings > Add-ons/,
  claimed: /is claimed but has no running agent/,
};
for (const state of Object.keys(guidance)) {
  test(`a player that comes back ${state} stops the start with guidance and sends no prompt`, async () => {
    const f = fakeApp();
    f.app.agents.spawn = async (type, name) => ({ name, type, state, pid: 4242, reason: "it was opening" });
    const m = createMatch({ app: f.app });
    await m.start("claude-code");
    assert.equal(m.phase, "error");
    assert.match(m.error, guidance[state]);
    assert.equal(f.sent.length, 0);
    assert.equal(m.chess.history().length, 0);
  });
}

test("an opening player lets the game go on: the app finishes opening it", async () => {
  const f = fakeApp();
  f.app.agents.spawn = async (type, name) => ({ name, type, state: "opening" });
  f.bind({ onMessage() {} }); // no reply: only the first prompt matters here
  const m = createMatch({ app: f.app });
  await m.start("claude-code");
  assert.equal(m.phase, "playing");
  assert.equal(f.sent.length, 1);
});

function playedGame(setup) {
  const f = fakeApp();
  let finish;
  const done = new Promise((r) => (finish = r));
  const m = createMatch({ app: f.app, onChange: (s) => (s.phase === "over" || s.phase === "error") && finish(s) });
  f.bind(m);
  return { f, m, play: () => { void m.start(setup); return done; } };
}
const SETUP = { w: { type: "claude-code", model: "opus" }, b: { type: "codex" } };

test("nothing is started before Start; Start starts exactly two, each with its own type and model", async () => {
  const { f, m, play } = playedGame(SETUP);
  assert.equal(f.spawned.length, 0);
  assert.equal(m.phase, "idle");
  await play();
  assert.equal(f.spawned.length, 2);
  assert.deepEqual(f.spawned[0], { type: "claude-code", name: "white", model: "opus", order: 1 });
  assert.deepEqual(f.spawned[1], { type: "codex", name: "black", order: 0 });
  assert.deepEqual(m.labels, { w: "claude-code \u00b7 opus", b: "codex" });
  assert.deepEqual(m.sides, { w: { type: "claude-code", model: "opus" }, b: { type: "codex", model: "" } });
});

test("a rematch with swapped colours reuses the running agents and says it is a new game", async () => {
  const { f, m, play } = playedGame(SETUP);
  await play();
  const [w, b] = [m.players.w, m.players.b];
  f.sent.length = 0;
  f.bind({ onMessage() {} }); // stop the scripted replies; only the first prompt matters
  await m.rematch({ swap: true });
  assert.equal(f.spawned.length, 2, "no new agent");
  assert.equal(m.phase, "playing");
  assert.deepEqual([m.players.w, m.players.b], [b, w]);
  assert.deepEqual(m.labels, { w: "codex", b: "claude-code \u00b7 opus" });
  assert.equal(m.chess.history().length, 0);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, b);
  assert.match(f.sent[0].body, /You are playing white in a new game/);
});

test("Change players goes back to setup, keeps the old pair running, and the next Start starts two more", async () => {
  const { f, m, play } = playedGame(SETUP);
  await play();
  const old = [m.players.w, m.players.b];
  m.changePlayers();
  assert.equal(m.phase, "idle");
  assert.deepEqual(m.previous, old);
  assert.equal(f.spawned.length, 2, "nothing started by going back");
  f.bind({ onMessage() {} });
  await m.start({ w: { type: "claude-code" }, b: { type: "claude-code" } });
  assert.equal(f.spawned.length, 4);
  assert.equal(m.phase, "playing");
  assert.match(f.sent.at(-1).body, /You are playing white in a game of chess/);
  assert.deepEqual(m.previous, old);
});

test("rematch and change-players do nothing while a game is running", async () => {
  const f = fakeApp();
  f.bind({ onMessage() {} });
  const m = createMatch({ app: f.app });
  await m.start("claude-code");
  const before = f.spawned.length;
  await m.rematch({ swap: true });
  m.changePlayers();
  assert.equal(m.phase, "playing");
  assert.equal(f.spawned.length, before);
});

test("every new pair asks for its own names, so the host makes new agents instead of returning the old ones", async () => {
  const { f, m, play } = playedGame(SETUP);
  await play();
  assert.deepEqual(f.spawned.map((s) => s.name), ["white", "black"]);
  m.changePlayers();
  f.bind({ onMessage() {} });
  await m.start({ w: { type: "claude-code" }, b: { type: "claude-code" } });
  assert.deepEqual(f.spawned.map((s) => s.name), ["white", "black", "white-2", "black-2"]);
  assert.notEqual(m.players.w, m.previous[0]);
  assert.notEqual(m.players.b, m.previous[1]);
});

test("a late reply written before the rematch began is not played as a move", async () => {
  const { f, m, play } = playedGame(SETUP);
  await play();
  f.bind({ onMessage() {} });
  await m.rematch();
  const early = new Date(Math.floor(m.gameStart / 1000) * 1000 - 5000).toISOString();
  await m.onMessage({ id: "late", from: m.players.w, to: "chess", body: "e2e4", created_at: early });
  assert.equal(m.chess.history().length, 0);
  assert.match(m.log.at(-1), /ignored a reply written before this game began/);
  const now = new Date(m.gameStart + 1000).toISOString();
  await m.onMessage({ id: "ok", from: m.players.w, to: "chess", body: "e2e4", created_at: now });
  assert.deepEqual(m.chess.history(), ["e4"]);
});

test("Start(a/b), Change players, Start(c/d) leaves four agents and the new pair really has types c/d", async () => {
  const { f, m, play } = playedGame({ w: { type: "claude-code" }, b: { type: "codex" } });
  await play();
  m.changePlayers();
  f.bind({ onMessage() {} });
  await m.start({ w: { type: "gemini", model: "x" }, b: { type: "claude-code", model: "haiku" } });
  assert.equal(f.spawned.length, 4);
  assert.deepEqual(f.spawned.slice(2).map((s) => [s.type, s.name, s.model]), [["gemini", "white-2", "x"], ["claude-code", "black-2", "haiku"]]);
  assert.deepEqual(m.sides, { w: { type: "gemini", model: "x" }, b: { type: "claude-code", model: "haiku" } });
  assert.deepEqual(m.previous, ["white", "black"]);
});

test("both players start at once, each with its own progress; one failing still records the other", async () => {
  const f = fakeApp();
  const gates = {};
  f.app.agents.spawn = (type, name, opts = {}) => new Promise((resolve) => { gates[name] = () => resolve(name === "black" ? { name, type, state: "failed", reason: "no such CLI" } : { name, type, state: "running", pid: 1 }); f.spawned.push({ type, name, ...opts }); });
  const m = createMatch({ app: f.app });
  const started = m.start({ w: { type: "claude-code" }, b: { type: "codex" } });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(f.spawned.map((s) => s.name), ["white", "black"], "both asked before either answered");
  assert.equal(m.phase, "starting");
  assert.match(startingText(m, Date.now() + 40_000), /starting White… 4\d s · starting Black… 4\d s/);
  gates.white();
  await new Promise((r) => setTimeout(r, 5));
  assert.match(startingText(m), /White ready · starting Black/);
  gates.black();
  await started;
  assert.equal(m.phase, "error");
  assert.match(m.error, /black could not start: no such CLI/);
  assert.equal(m.players.w, "white");
  assert.equal(m.players.b, "");
  m.changePlayers();
  assert.deepEqual(m.previous, ["white"]);
  assert.equal(f.sent.length, 0);
});

test("sends go one after another and say which one is in flight", async () => {
  const f = fakeApp();
  const order = [];
  let release;
  f.app.messages.send = (to, body) => { order.push(`start ${to}`); return new Promise((r) => { release = () => { order.push(`end ${to}`); r({ to }); }; }); };
  const m = createMatch({ app: f.app });
  const started = m.start("claude-code");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(m.phase, "playing", "the board is playable while the first send is in flight");
  assert.equal(m.sending.to, "white");
  assert.deepEqual(order, ["start white"]);
  release();
  await started;
  assert.equal(m.sending, null);
});

test("a second send waits for the first: the reply to a slow send is played at once, the next ask starts after it", async () => {
  const f = fakeApp();
  const events = [];
  const pending = [];
  f.app.messages.send = (to) => { events.push(`start ${to}`); return new Promise((r) => pending.push(() => { events.push(`end ${to}`); r({ to }); })); };
  const m = createMatch({ app: f.app });
  const started = m.start("claude-code");
  await new Promise((r) => setTimeout(r, 5));
  const replied = m.onMessage({ id: "m1", from: "white", to: "chess", body: "e2e4" }); // finishes after black's send
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(m.chess.history(), ["e4"], "the board moved while the first send was still in flight");
  assert.deepEqual(events, ["start white"], "black's prompt has not started");
  pending[0]();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(events, ["start white", "end white", "start black"]);
  assert.equal(m.sending.to, "black");
  assert.equal(m.askedAt, 0, "white's late send finishing does not start black's count");
  assert.equal(waitingHint(m, Date.now() + 60_000), "", "so no hint about black while its notice is still going out");
  pending[1]();
  await Promise.all([started, replied]);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(m.sending, null);
  assert.ok(m.askedAt > 0, "black's count starts when black's own notice is delivered");
});

test("the thinking count starts when the turn notice is delivered, not while it is being sent", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const seen = [];
  const app = {
    team: { join: async () => ({ name: "chess" }) },
    agents: { spawn: async (type, name) => ({ name, type, state: "running" }) },
    messages: { send: async () => gate },
  };
  const m = createMatch({ app, onChange: (x) => seen.push({ askedAt: x.askedAt, sending: !!x.sending }) });
  const started = m.start("claude-code");
  while (!m.sending) await new Promise((r) => setTimeout(r, 5));
  assert.equal(m.askedAt, 0, "no count while the notice is still going out");
  release({});
  await started;
  assert.ok(m.askedAt > 0, "the count starts once the notice was delivered");
});
