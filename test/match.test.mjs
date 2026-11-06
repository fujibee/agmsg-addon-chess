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
  assert.equal(waitingHint(m, Date.now() + 60_000), "", "so no hint about black while its message is still going out");
  pending[1]();
  await Promise.all([started, replied]);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(m.sending, null);
  assert.equal(m.askedAt, 0, "black's first move is not counted: its pane may still be starting");
  assert.match(waitingHint(m, Date.now() + 60_000), /^Black hasn't answered yet \(\d+ s since it was asked\)\.$/, "but a quiet black is still noticed, once its message went out");
});

test("without delivery reports, a side's first move is not counted at all; the next move is counted from its send", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const sent = [];
  const app = {
    team: { join: async () => ({ name: "chess" }) },
    agents: { spawn: async (type, name) => ({ name, type, state: "running" }) },
    messages: { send: async (to, body) => { sent.push({ to, body }); return sent.length === 1 ? gate : { to }; } },
  };
  const m = createMatch({ app });
  const started = m.start("claude-code");
  while (!m.sending) await new Promise((r) => setTimeout(r, 5));
  assert.equal(m.askedAt, 0, "no count while the notice is still going out");
  release({});
  await started;
  assert.equal(m.askedAt, 0, "nor after it went out: the first move of a side is its startup");
  assert.equal(m.startingUp, true);
  await m.onMessage({ id: "r1", from: "white", to: "chess", body: "e2e4" });
  await m.onMessage({ id: "r2", from: "black", to: "chess", body: "e7e5" });
  assert.ok(m.askedAt > 0, "white's second move is counted from its send");
});

// A referee with players that never answer by themselves: the test plays both sides' replies.
function quietApp() {
  const sent = [];
  const app = {
    team: { join: async () => ({ name: "chess" }) },
    agents: { spawn: async (type, name) => ({ name, type, state: "running" }) },
    messages: { send: async (to, body) => { sent.push({ to, body }); return { to }; } },
  };
  let n = 0;
  const reply = (m, from, body) => m.onMessage({ id: `r${++n}`, from, to: "chess", body });
  // The feed shows the add-on its own ask (this is how it learns the message id), and the app reports it typed.
  const fed = (m, index, id = `a${index}`) => m.onMessage({ id, from: "chess", to: sent[index].to, body: sent[index].body });
  const typed = (m, name, at, ids) => m.onNotice({ name, at, ids });
  return { app, sent, reply, fed, typed };
}

// Runs `fn` with Date.now() fixed, restoring it afterwards.
async function at(ms, fn) {
  const real = Date.now;
  Date.now = () => ms;
  try {
    return await fn();
  } finally {
    Date.now = real;
  }
}

test("with delivery reports, a side's clock starts at the notice for its ask, and running out loses", async () => {
  const q = quietApp();
  const m = createMatch({ app: q.app, delivery: true });
  m.limit = 120;
  await m.start("claude-code");
  assert.equal(m.askedAt, 0, "sending is not delivery");
  assert.equal(m.startingUp, true);
  assert.equal(m.tick(Date.now() + 10 * 60_000), false, "no clock, no loss");
  const t = Date.now() + 5000;
  await q.fed(m, 0);
  assert.equal(m.askId, "a0", "the feed told the ask its message id");
  q.typed(m, "black", t, ["a0"]);
  assert.equal(m.askedAt, 0, "a notice for the side not to move is ignored");
  q.typed(m, "white", t, ["some-other-message"]);
  assert.equal(m.askedAt, 0, "a notice about another message is not this ask's");
  q.typed(m, "white", t, ["a0"]);
  assert.equal(m.askedAt, t);
  assert.equal(m.deadline, t + 120_000);
  q.typed(m, "white", t + 4000, ["a0"]);
  assert.equal(m.askedAt, t, "a second report does not move the clock");
  assert.match(q.sent[0].body, /Time limit: reply within 2 minutes/);
  assert.equal(m.tick(t + 120_000 - 1), false);
  assert.equal(m.tick(t + 120_000), true);
  assert.equal(m.result, "White lost on time (no move within 2 minutes).");
  await q.reply(m, "white", "e2e4");
  assert.equal(m.chess.history().length, 0, "a reply after the time ran out is not played");
  assert.ok(m.log.some((l) => /ignored a reply that came after the time ran out/.test(l)));
});

test("the report may come before the feed shows the ask; the clock starts as soon as both are known", async () => {
  const q = quietApp();
  const m = createMatch({ app: q.app, delivery: true });
  m.limit = 60;
  await m.start("claude-code");
  const t = Date.now() + 1000;
  q.typed(m, "white", t, ["a0"]);
  assert.equal(m.askedAt, 0, "the ask's id is not known yet");
  await q.fed(m, 0);
  assert.equal(m.askedAt, t);
  assert.equal(m.deadline, t + 60_000);
});

test("a report older than the ask does not start the clock", async () => {
  const q = quietApp();
  const m = createMatch({ app: q.app, delivery: true });
  m.limit = 60;
  await m.start("claude-code");
  await q.fed(m, 0);
  q.typed(m, "white", m.askStart - 1, ["a0"]);
  assert.equal(m.askedAt, 0);
  q.typed(m, "white", m.askStart + 1, ["a0"]);
  assert.equal(m.askedAt, m.askStart + 1);
});

test("a first move can be answered before any delivery report, and stays untimed", async () => {
  const q = quietApp();
  const m = createMatch({ app: q.app, delivery: true });
  m.limit = 30;
  await m.start("claude-code");
  await q.fed(m, 0);
  assert.equal(m.startingUp, true);
  await q.reply(m, "white", "e2e4"); // the player read its inbox during its startup turn
  assert.deepEqual(m.chess.history(), ["e4"]);
  assert.equal(m.phase, "playing");
  assert.equal(m.tick(Date.now() + 1e9), false, "no clock was running, so none ran out");
  q.typed(m, "white", Date.now() + 1, ["a0"]); // the report for the answered ask arrives late: nothing to start
  assert.equal(m.askedAt, 0, "black is the side to move now and has its own ask");
});

test("a retry keeps the move's clock; the next move starts a new one", async () => {
  const q = quietApp();
  const m = createMatch({ app: q.app, delivery: true });
  m.limit = 60;
  await m.start("claude-code");
  await q.fed(m, 0);
  const t = Date.now() + 1000;
  q.typed(m, "white", t, ["a0"]);
  await q.reply(m, "white", "nonsense");
  assert.equal(m.problems, 1);
  assert.equal(m.askedAt, t, "asking again does not restart the clock");
  assert.equal(m.deadline, t + 60_000);
  assert.match(q.sent.at(-1).body, /clock for this move keeps running/);
  await q.fed(m, 1);
  q.typed(m, "white", t + 3000, ["a1"]);
  assert.equal(m.askedAt, t, "the retry's notice does not restart it either");
  await q.reply(m, "white", "e2e4");
  assert.equal(m.askedAt, 0, "black's move has no clock until its notice is delivered");
  assert.equal(m.deadline, 0);
  await q.fed(m, 2);
  const u = Date.now() + 8000;
  q.typed(m, "black", u, ["a2"]);
  assert.equal(m.deadline, u + 60_000);
});

test("without delivery reports a side's first move is untimed, shows starting, counts nothing, and says so", async () => {
  const q = quietApp();
  const m = createMatch({ app: q.app, delivery: false });
  m.limit = 120;
  await m.start("claude-code");
  assert.equal(m.deadline, 0);
  assert.equal(m.askedAt, 0, "nothing is counted while the player may still be starting");
  assert.equal(m.startingUp, true);
  assert.doesNotMatch(q.sent[0].body, /Time limit/);
  assert.ok(m.log.includes("White: no time limit on the first move (this app cannot report delivery)"));
  await q.reply(m, "white", "e2e4");
  assert.equal(m.deadline, 0, "black's first move is untimed too");
  assert.equal(m.askedAt, 0);
  assert.ok(m.log.includes("Black: no time limit on the first move (this app cannot report delivery)"));
  await q.reply(m, "black", "e7e5");
  assert.equal(m.startingUp, false);
  assert.ok(m.askedAt > 0, "white's second move is counted from its send");
  assert.equal(m.deadline, m.askedAt + 120_000);
  assert.match(q.sent.at(-1).body, /Time limit: reply within 2 minutes/);
  assert.equal(m.tick(m.deadline), true);
});

test("no limit means no clock, no notice line and no limit in the prompt", async () => {
  const q = quietApp();
  const m = createMatch({ app: q.app, delivery: true });
  m.limit = 0;
  await m.start("claude-code");
  await q.fed(m, 0);
  const t = Date.now() + 1000;
  q.typed(m, "white", t, ["a0"]);
  assert.equal(m.askedAt, t);
  assert.equal(m.deadline, 0);
  assert.doesNotMatch(q.sent[0].body, /Time limit/);
  assert.equal(m.tick(Date.now() + 1e9), false);
  assert.equal(m.log.some((l) => /no time limit/.test(l)), false);
});

test("a reply received after the deadline loses even before the display timer looks", async () => {
  const q = quietApp();
  const m = createMatch({ app: q.app, delivery: true });
  m.limit = 30;
  await at(1_000_000, async () => {
    await m.start("claude-code");
    await q.fed(m, 0);
    q.typed(m, "white", 1_000_000, ["a0"]);
    assert.equal(m.deadline, 1_030_000);
  });
  await at(1_030_001, () => q.reply(m, "white", "e2e4"));
  assert.equal(m.chess.history().length, 0, "the late move was not played");
  assert.equal(m.phase, "over");
  assert.equal(m.result, "White lost on time (no move within 30 seconds).");
  assert.ok(m.log.some((l) => /white: ignored a reply that came after the time ran out/.test(l)));
});

test("the deadline itself is late; one millisecond before is in time", async () => {
  const run = async (receivedAt) => {
    const q = quietApp();
    const m = createMatch({ app: q.app, delivery: true });
    m.limit = 30;
    await at(1_000_000, async () => {
      await m.start("claude-code");
      await q.fed(m, 0);
      q.typed(m, "white", 1_000_000, ["a0"]);
    });
    await at(receivedAt, () => q.reply(m, "white", "e2e4"));
    return m;
  };
  const inTime = await run(1_029_999);
  assert.equal(inTime.phase, "playing");
  assert.deepEqual(inTime.chess.history(), ["e4"]);
  const late = await run(1_030_000);
  assert.equal(late.phase, "over");
  assert.equal(late.chess.history().length, 0);
});

test("waitingHint says it was asked, not delivered, when no notice was reported", async () => {
  const { waitingHint } = await import("../app-panes/chess/web/match.js");
  const m = { phase: "playing", chess: newGame(), askedAt: 0, askStart: 1000 };
  assert.equal(waitingHint(m, 1000 + 10_000), "");
  assert.match(waitingHint(m, 1000 + 60_000), /^White hasn't answered yet \(60 s since it was asked\)\.$/);
  assert.match(waitingHint({ ...m, askedAt: 2000 }, 2000 + 60_000), /\(60 s since the turn notice\)/);
});

test("every reply that was not played is kept with the move, who sent it and why", async () => {
  const q = quietApp();
  const m = createMatch({ app: q.app, delivery: false });
  await m.start("claude-code");
  await q.reply(m, "white", "I think Nf3");
  await q.reply(m, "white", "e2e5");
  assert.equal(m.problems, 2);
  assert.deepEqual(m.refusals.map((r) => [r.ply, r.side, r.from, r.text]), [
    [1, "w", "white", "I think Nf3"],
    [1, "w", "white", "e2e5"],
  ]);
  assert.match(m.refusals[0].reason, /holds no move in UCI/);
  assert.match(m.refusals[1].reason, /not a legal move here/);
  await q.reply(m, "white", "e2e4");
  await q.reply(m, "black", "e7e4");
  assert.deepEqual(m.refusals.at(-1).side, "b");
  assert.equal(m.refusals.at(-1).ply, 2);
  assert.equal(m.refusals.length, 3);
});
