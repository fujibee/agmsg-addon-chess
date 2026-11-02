// One game: joins the team, starts the two players, and keeps asking the side to move until the game ends.
// `app` is the agmsg add-on connection; everything else here is plain data, so a test can play a whole game.
import { newGame, outcome, readUci, resultText, tryMove, turnPrompt } from "./game.js";

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
    await app.messages.send(m.players[side], turnPrompt(m.chess, { first, problem }));
  }

  m.start = async (type, model) => {
    if (m.phase !== "idle") return;
    m.phase = "starting";
    onChange(m);
    try {
      m.me = (await app.team.join()).name;
      for (const [side, want] of [["w", "white"], ["b", "black"]]) {
        const entry = await app.agents.spawn(type, want, model ? { model } : {});
        if (entry.state === "failed") throw new Error(`${want} could not start: ${entry.reason ?? "unknown reason"}`);
        m.players[side] = entry.name;
        say(`${entry.name} (${side === "w" ? "white" : "black"}) is ${entry.state}`);
      }
      m.phase = "playing";
      onChange(m);
      await ask();
    } catch (e) {
      fail(e);
    }
  };

  m.onMessage = async (msg) => {
    if (m.phase !== "playing" || seen.has(msg.id)) return;
    if (msg.to !== m.me || msg.from !== m.players[m.chess.turn()]) return;
    seen.add(msg.id);
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
