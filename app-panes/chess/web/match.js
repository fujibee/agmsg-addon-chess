// One game: joins the team, starts the two players, and keeps asking the side to move until the game ends.
// `app` is the agmsg add-on connection; everything else here is plain data, so a test can play a whole game.
import { limitText, newGame, outcome, readUci, resultText, tryMove, turnPrompt } from "./game.js";

/**
 * A hint, never a stop: the side to move has not answered for a while. It says only that and for how long, since
 * the cause is not known from here. The game keeps waiting.
 */
export function waitingHint(m, now = Date.now(), afterMs = 45000) {
  if (m.phase !== "playing" || !m.askedAt || now - m.askedAt < afterMs) return "";
  const side = m.chess.turn() === "w" ? "White" : "Black";
  const secs = Math.round((now - m.askedAt) / 1000);
  return `${side} hasn't answered yet (${secs} s since the turn notice).`;
}

/**
 * What to tell the person when a player did not come up as a running agent, or "" when the game can go on.
 * Only running (and opening, which the app finishes by itself) can read the position; the others need a person:
 * orphaned and unknown are never reopened by the app until the person chooses, in Settings > Add-ons.
 */
export function spawnProblem(entry, want) {
  const why = entry.reason ? ` (${entry.reason})` : "";
  switch (entry.state) {
    case "running":
    case "opening":
      return "";
    case "failed":
      return `${want} could not start: ${entry.reason ?? "unknown reason"}`;
    case "orphaned":
      return `${want} (${entry.name}) is still running from before the app restarted${entry.pid ? ` (process ${entry.pid})` : ""}, but this pane is not connected to it. Open Settings > Add-ons and choose "Open new" or "Leave it", then start again.`;
    case "unknown":
      return `${want} (${entry.name}) was starting when the app stopped${why}, and the app does not reopen it by itself. Open Settings > Add-ons and choose "Open new" or "Leave it", then start again.`;
    default:
      return `${want} (${entry.name}) is ${entry.state} but has no running agent${why}. Open Settings > Add-ons and choose "Open", then start again.`;
  }
}

/** What the pane shows while the players start: each side's progress with its own timer, so it never looks frozen. */
export function startingText(m, now = Date.now()) {
  if (m.phase !== "starting") return "";
  return ["w", "b"]
    .map((side) => {
      const p = m.progress[side];
      const name = side === "w" ? "White" : "Black";
      if (!p) return `${name}…`;
      const secs = Math.max(0, Math.round((now - p.since) / 1000));
      return p.state === "ready" ? `${name} ready` : p.state === "failed" ? `${name} could not start` : `starting ${name}… ${secs} s`;
    })
    .join(" · ");
}

/**
 * `delivery` says whether the app reports the moment a turn notice reaches a player (a boolean, or a function asked
 * each time). The bundled adapter does not carry that report yet, so for now this runs on the fallback below; the
 * report comes with the app's event, together with the adapter change. With it, a side's clock starts at that moment (`onNotice`); without it, a side's first move is not
 * timed (its pane may still be starting) and later moves are timed from the send.
 */
export function createMatch({ app, onChange = () => {}, delivery = false }) {
  const delivers = () => (typeof delivery === "function" ? !!delivery() : !!delivery);
  const m = {
    phase: "idle", // idle | starting | playing | over | error
    chess: newGame(),
    me: "",
    players: { w: "", b: "" },
    log: [],
    problems: 0,
    result: "",
    error: "",
    askedAt: 0, // when the side to move's clock started (its notice was delivered), ms since epoch; 0 = not yet
    limit: 0, // seconds a side has for a move; 0 = no limit
    timed: false, // whether the move being played is timed
    askStart: 0, // when the side to move was asked, ms since epoch; a delivery report from before it is stale
    deadline: 0, // when the side to move runs out of time, ms since epoch; 0 = no deadline
    timedOut: "", // the side that lost on time
    labels: { w: "", b: "" }, // "claude-code · haiku", shown at each side of the board
    sides: { w: null, b: null }, // what was chosen for each side: { type, model }
    spawned: 0, // how many agents this pane has started (the page never starts any before Start)
    previous: [], // agents of an earlier pair that are still running after "Change players"
    again: false, // the next prompts open a new game for agents that already played one
    progress: { w: null, b: null }, // while starting: { state: starting|ready|failed, since }
    sending: null, // the send in flight: { to, since }
    run: 1, // which pair this is: the host hands back the same agent for the same requested name
    gameStart: 0, // when this game began, ms since epoch; replies written before it are not moves
  };
  const seen = new Set();
  const introduced = new Set();
  const say = (text) => {
    m.log.push(text);
    onChange(m);
  };
  const fail = (e) => {
    m.phase = "error";
    m.error = e?.message ?? String(e);
    onChange(m);
  };

  // Sends go one after another through this chain, so two never overlap and a slow one (some machines take seconds
  // per message) does not hold up anything else: the board is drawn before the send starts, and `m.sending` says
  // which send is in flight.
  let sends = Promise.resolve();
  let asks = 0;
  const settled = new Set(); // sides asked since their pair started: their panes are past startup
  function startClock(at) {
    m.askedAt = at;
    m.deadline = m.timed ? at + m.limit * 1000 : 0;
  }
  function ask(problem = "") {
    const side = m.chess.turn();
    const first = !introduced.has(side);
    introduced.add(side);
    const mine = ++asks; // only the newest ask owns the clock; a send that finishes late must not start it
    const fresh = !problem; // a retry of the same move keeps the clock the move already has
    if (fresh) {
      const startingUp = !settled.has(side);
      settled.add(side);
      // Without a delivery report a side's first move cannot be timed fairly: its pane may still be starting.
      m.timed = m.limit > 0 && (delivers() || !startingUp);
      if (m.limit > 0 && !m.timed) say(`${side === "w" ? "White" : "Black"}: no time limit on the first move (this app cannot report delivery)`);
      m.askedAt = 0; // the clock starts once the turn notice is delivered, not while the player is still starting
      m.deadline = 0;
      m.askStart = Date.now();
    }
    const to = m.players[side];
    const body = turnPrompt(m.chess, { first, problem, again: m.again, referee: m.me, limit: m.timed ? m.limit : 0 });
    const run = sends.then(async () => {
      m.sending = { to, since: Date.now() };
      if (fresh && mine === asks) {
        m.askedAt = 0;
        m.deadline = 0;
      }
      onChange(m);
      try {
        await app.messages.send(to, body);
        // Without a delivery report the send is the nearest moment there is.
        if (mine === asks && m.askedAt === 0 && !delivers()) startClock(Date.now());
      } finally {
        m.sending = null;
      }
    });
    sends = run.catch(() => {});
    return run;
  }

  /** The app typed a turn notice into `name`'s pane at `at` (ms since epoch): that side's clock starts. */
  m.onNotice = ({ name, at } = {}) => {
    if (!delivers() || m.phase !== "playing" || m.askedAt !== 0) return;
    if (!name || name !== m.players[m.chess.turn()]) return;
    if (Number.isFinite(at) && at < m.askStart) return; // a report from before this ask is about an earlier notice
    startClock(Number.isFinite(at) ? at : Date.now());
    onChange(m);
  };

  /** Looked at every second: the side to move loses when its time for the move has run out. */
  m.tick = (now = Date.now()) => {
    if (m.phase !== "playing" || !m.deadline || now < m.deadline) return false;
    const side = m.chess.turn();
    m.phase = "over";
    m.timedOut = side;
    m.deadline = 0;
    m.result = `${side === "w" ? "White" : "Black"} lost on time (no move within ${limitText(m.limit)}).`;
    say(`${m.players[side]}: out of time`);
    return true;
  };

  /** `setup` is { w: { type, model? }, b: { type, model? } }; a bare (type, model) means both sides the same. */
  m.start = async (setup, model) => {
    if (m.phase !== "idle") return;
    const sides = typeof setup === "string" ? { w: { type: setup, model }, b: { type: setup, model } } : setup;
    m.phase = "starting";
    onChange(m);
    try {
      m.me = (await app.team.join()).name;
      // Both players start at once: on a slow machine one start takes over a minute, and they do not depend on each
      // other. Asking the host again for the same name returns the agent it already made (and only resumes a joined
      // one), so every new pair asks for its own names.
      const starting = ["w", "b"].map(async (side) => {
        const want = (side === "w" ? "white" : "black") + (m.run === 1 ? "" : `-${m.run}`);
        const { type, model: wanted } = sides[side];
        m.progress[side] = { state: "starting", since: Date.now() };
        onChange(m);
        try {
          // `order` is where the app seats the player in the column beside this pane (black above white), whichever
          // of the two starts first.
          const entry = await app.agents.spawn(type, want, { ...(wanted ? { model: wanted } : {}), order: side === "b" ? 0 : 1 });
          m.spawned++;
          if (entry.state !== "failed") m.players[side] = entry.name;
          m.labels[side] = wanted ? `${type} \u00b7 ${wanted}` : type;
          m.sides[side] = { type, model: wanted ?? "" };
          const problem = spawnProblem(entry, want);
          if (problem) throw new Error(problem);
          m.progress[side] = { state: "ready", since: Date.now() };
          say(`${entry.name} (${side === "w" ? "white" : "black"}) is ${entry.state}`);
        } catch (e) {
          m.progress[side] = { state: "failed", since: Date.now() };
          throw e;
        }
      });
      const settled = await Promise.allSettled(starting);
      const failed = settled.find((r) => r.status === "rejected");
      if (failed) throw failed.reason;
      m.phase = "playing";
      m.gameStart = Date.now();
      onChange(m);
      await ask();
    } catch (e) {
      fail(e);
    }
  };

  function reset() {
    m.chess = newGame();
    m.problems = 0;
    m.result = "";
    m.timedOut = "";
    m.askedAt = 0;
    m.deadline = 0;
    m.log = [];
    introduced.clear();
    m.again = true;
  }

  /** Another game with the agents that are already running: nothing is started. `swap` trades the colours. */
  m.rematch = async ({ swap = false } = {}) => {
    if (m.phase !== "over") return;
    reset();
    if (swap) {
      m.players = { w: m.players.b, b: m.players.w };
      m.labels = { w: m.labels.b, b: m.labels.w };
      m.sides = { w: m.sides.b, b: m.sides.w };
    }
    m.phase = "playing";
    m.gameStart = Date.now();
    onChange(m);
    try {
      await ask();
    } catch (e) {
      fail(e);
    }
  };

  /** Back to the setup. The pair that played keeps running; a new Start starts two more. */
  m.changePlayers = () => {
    if (m.phase !== "over" && m.phase !== "error") return;
    m.previous = [...m.previous, m.players.w, m.players.b].filter(Boolean);
    settled.clear();
    m.error = "";
    m.run++;
    m.players = { w: "", b: "" };
    m.labels = { w: "", b: "" };
    m.sides = { w: null, b: null };
    reset();
    m.again = false;
    m.phase = "idle";
    onChange(m);
  };

  m.onMessage = async (msg) => {
    if (m.phase === "over" && m.timedOut && msg.to === m.me && msg.from === m.players[m.timedOut] && !seen.has(msg.id)) {
      seen.add(msg.id);
      say(`${msg.from}: ignored a reply that came after the time ran out`);
      return;
    }
    if (m.phase !== "playing" || seen.has(msg.id)) return;
    if (msg.to !== m.me || msg.from !== m.players[m.chess.turn()]) return;
    seen.add(msg.id);
    // A late reply to an earlier game (written before this one began) is not a move in it. Timestamps are whole
    // seconds, so the start is rounded down to one.
    const wrote = Date.parse(msg.created_at ?? "");
    if (Number.isFinite(wrote) && wrote < Math.floor(m.gameStart / 1000) * 1000) {
      say(`${msg.from}: ignored a reply written before this game began`);
      return;
    }
    // Judged by the time the reply reaches this pane (Date.now() here), not by the sender's timestamp: a reply
    // received at or after the deadline is late, whether or not the display timer has noticed yet.
    if (m.deadline && Date.now() >= m.deadline) {
      m.tick(Math.max(Date.now(), m.deadline));
      say(`${msg.from}: ignored a reply that came after the time ran out`);
      return;
    }
    try {
      const read = readUci(msg.body);
      if (read.error) {
        m.problems++;
        say(`${msg.from}: ${read.error}; asking again`);
        return await ask(read.error);
      }
      const moved = tryMove(m.chess, read.uci);
      if (!moved.ok) {
        m.problems++;
        say(`${msg.from}: ${read.uci} refused (${moved.reason}); asking again`);
        return await ask(moved.reason);
      }
      say(`${msg.from}: ${moved.san}`);
      const end = outcome(m.chess);
      if (end) {
        m.phase = "over";
        m.result = resultText(end);
        return onChange(m);
      }
      onChange(m);
      await ask();
    } catch (e) {
      fail(e);
    }
  };

  return m;
}
