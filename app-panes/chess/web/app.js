import { connect } from "./agmsg-addon.js";
import { createMatch, waitingHint } from "./match.js";
import { moveList } from "./game.js";
import { createBoard3d, webglAvailable } from "./board3d.js";

const PIECE = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const $ = (id) => document.getElementById(id);

let match = null;
let board3d = null;
const app = connect({
  sample: false,
  onInit() {},
  onMessage(message) {
    if (match) void match.onMessage(message);
  },
});

function render(m) {
  const board = $("board");
  const last = m.chess.history({ verbose: true }).at(-1);
  if (board3d) board3d.setPosition(m.chess.board(), last);
  else renderFlat(m, board, last);
  renderText(m);
}

function renderFlat(m, board, last) {
  board.replaceChildren();
  m.chess.board().forEach((row, r) =>
    row.forEach((cell, c) => {
      const sq = document.createElement("div");
      const name = "abcdefgh"[c] + (8 - r);
      sq.className = `sq ${(r + c) % 2 ? "dark" : "light"}${last && (last.from === name || last.to === name) ? " last" : ""}`;
      sq.textContent = cell ? PIECE[cell.color + cell.type] : "";
      board.append(sq);
    }),
  );
}

function renderText(m) {
  $("moves").textContent = moveList(m.chess);
  const turn = m.chess.turn() === "w" ? m.players.w || "white" : m.players.b || "black";
  $("status").textContent =
    m.phase === "starting" ? "Starting the players…"
    : m.phase === "playing" ? `${turn} to move${m.problems ? ` · ${m.problems} refused` : ""}`
    : m.phase === "over" ? m.result
    : m.phase === "error" ? `Stopped: ${m.error}`
    : "Choose a CLI and start.";
  showHint();
  $("log").replaceChildren(...m.log.slice(-30).map((t) => Object.assign(document.createElement("li"), { textContent: t })));
  $("start").disabled = m.phase !== "idle" || !$("type").value;
}

// The hint depends on the clock, not only on a state change: look again every few seconds while a game runs.
function showHint() {
  $("hint").textContent = match ? waitingHint(match) : "";
}
setInterval(showHint, 5000);

async function setup() {
  try {
    const { types } = await app.agents.types();
    $("type").replaceChildren(...types.map((t) => Object.assign(document.createElement("option"), { value: t.type, textContent: t.type })));
  } catch (e) {
    $("status").textContent = `Cannot start: ${e.message}`;
    return;
  }
  if (webglAvailable()) {
    try {
      board3d = createBoard3d($("board"));
      $("board").classList.add("is-3d");
    } catch (e) {
      board3d = null; // the flat board below takes over
    }
  }
  match = createMatch({ app, onChange: render });
  $("start").addEventListener("click", () => void match.start($("type").value, $("model").value.trim() || undefined));
  render(match);
}

void setup();
