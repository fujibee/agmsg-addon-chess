// One game: joins the team, starts the two players, and keeps asking the side to move until the game ends.
// `app` is the agmsg add-on connection; everything else here is plain data, so a test can play a whole game.
import { newGame, outcome, readUci, resultText, tryMove, turnPrompt } from "./game.js";

/**
 * A hint, never a stop: the side to move has not answered for a while. A freshly started Claude Code can sit at
 * "Do you trust this folder?" in its own pane, where only a keypress there helps. The game keeps waiting.
 */
export function waitingHint(m, now = Date.now(), afterMs = 45000) {
  if (m.phase !== "playing" || !m.askedAt || now - m.askedAt < afterMs) return "";
  const side = m.chess.turn() === "w" ? "White" : "Black";
  return `${side} hasn't answered yet \u2014 if its pane asks "Do you trust this folder?", press Enter there.`;
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

export function createMatch({ app, onChange = () => {} }) {
  const m = {
    phase: "idle", // idle | starting | playing | over | error
    chess: newGame(),
    me: "",
    players: { w: "", b: "" },
    log: [],
    problems: 0,
    result: "",
    error: "",
    askedAt: 0, // when the side to move was last asked, ms since epoch
    labels: { w: "", b: "" }, // "claude-code · haiku", shown at each side of the board
    sides: { w: null, b: null }, // what was chosen for each side: { type, model }
    spawned: 0, // how many agents this pane has started (the page never starts any before Start)
    previous: [], // agents of an earlier pair that are still running after "Change players"
    again: false, // the next prompts open a new game for agents that already played one
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

  async function ask(problem = "") {
    const side = m.chess.turn();
    const first = !introduced.has(side);
    introduced.add(side);
    m.askedAt = Date.now();
    await app.messages.send(m.players[side], turnPrompt(m.chess, { first, problem, again: m.again }));
  }

  /** `setup` is { w: { type, model? }, b: { type, model? } }; a bare (type, model) means both sides the same. */
  m.start = async (setup, model) => {
    if (m.phase !== "idle") return;
    const sides = typeof setup === "string" ? { w: { type: setup, model }, b: { type: setup, model } } : setup;
    m.phase = "starting";
    onChange(m);
    try {
      m.me = (await app.team.join()).name;
      // Asking the host again for the same name returns the agent it already made (and only resumes a joined one), so
      // every new pair asks for its own names.
      for (const [side, base] of [["w", "white"], ["b", "black"]]) {
        const want = m.run === 1 ? base : `${base}-${m.run}`;
        const { type, model: wanted } = sides[side];
        const entry = await app.agents.spawn(type, want, wanted ? { model: wanted } : {});
        m.spawned++;
        const problem = spawnProblem(entry, want);
        if (problem) throw new Error(problem);
        m.players[side] = entry.name;
        m.labels[side] = wanted ? `${type} \u00b7 ${wanted}` : type;
        m.sides[side] = { type, model: wanted ?? "" };
        say(`${entry.name} (${side === "w" ? "white" : "black"}) is ${entry.state}`);
      }
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
