import { connect } from "./agmsg-addon.js";
import { createMatch } from "./match.js";
import { moveList } from "./game.js";

const PIECE = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const $ = (id) => document.getElementById(id);

let match = null;
const app = connect({
  sample: false,
  onInit() {},
  onMessage(message) {
    if (match) void match.onMessage(message);
  },
});

function render(m) {
  const board = $("board");
  board.replaceChildren();
  const last = m.chess.history({ verbose: true }).at(-1);
  m.chess.board().forEach((row, r) =>
    row.forEach((cell, c) => {
      const sq = document.createElement("div");
      const name = "abcdefgh"[c] + (8 - r);
      sq.className = `sq ${(r + c) % 2 ? "dark" : "light"}${last && (last.from === name || last.to === name) ? " last" : ""}`;
      sq.textContent = cell ? PIECE[cell.color + cell.type] : "";
      board.append(sq);
    }),
  );
  $("moves").textContent = moveList(m.chess);
  const turn = m.chess.turn() === "w" ? m.players.w || "white" : m.players.b || "black";
  $("status").textContent =
    m.phase === "starting" ? "Starting the players…"
    : m.phase === "playing" ? `${turn} to move${m.problems ? ` · ${m.problems} refused` : ""}`
    : m.phase === "over" ? m.result
    : m.phase === "error" ? `Stopped: ${m.error}`
    : "Choose a CLI and start.";
  $("log").replaceChildren(...m.log.slice(-30).map((t) => Object.assign(document.createElement("li"), { textContent: t })));
  $("start").disabled = m.phase !== "idle" || !$("type").value;
}

async function setup() {
  try {
    const { types } = await app.agents.types();
    $("type").replaceChildren(...types.map((t) => Object.assign(document.createElement("option"), { value: t.type, textContent: t.type })));
  } catch (e) {
    $("status").textContent = `Cannot start: ${e.message}`;
    return;
  }
  match = createMatch({ app, onChange: render });
  $("start").addEventListener("click", () => void match.start($("type").value, $("model").value.trim() || undefined));
  render(match);
}

void setup();
