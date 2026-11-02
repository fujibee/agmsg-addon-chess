import { connect } from "./agmsg-addon.js";
import { createMatch, waitingHint } from "./match.js";
import { moveList } from "./game.js";
import { createBoard3d, webglAvailable } from "./board3d.js";
import { SUGGESTIONS, acceptsModel, defaultSetup, edgeLabel, load, save, sideLabel, swapSides } from "./setup.js";

const PIECE = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const $ = (id) => document.getElementById(id);

let match = null;
let board3d = null;
let types = [];
let setup = defaultSetup([]);
const store = (() => {
  try {
    return window.localStorage;
  } catch (_) {
    return { getItem: () => null, setItem() {} };
  }
})();

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
  const idle = m.phase === "idle";
  const finished = m.phase === "over";
  $("setup").hidden = !idle;
  $("after").hidden = !(finished || m.phase === "error");
  $("rematch").hidden = !finished;
  $("swapcolours").hidden = !finished;
  $("moves").textContent = moveList(m.chess);
  const turn = m.chess.turn() === "w" ? m.players.w || "white" : m.players.b || "black";
  $("status").textContent =
    m.phase === "starting" ? "Starting the players…"
    : m.phase === "playing" ? `${turn} to move${m.problems ? ` · ${m.problems} refused` : ""}`
    : m.phase === "over" ? m.result
    : m.phase === "error" ? `Stopped: ${m.error}`
    : "Choose the two players and start.";
  const plies = m.chess.history().length;
  $("result").textContent = finished ? `${m.result} ${Math.ceil(plies / 2)} moves.` : "";
  $("still").textContent = m.previous.length ? "The previous players are still running; close their panes if you don't need them." : "";
  for (const side of ["w", "b"]) {
    const who = $(`who-${side}`);
    const label = edgeLabel(m.sides[side] ?? (idle ? setup[side] : null), types);
    who.querySelector(".name").textContent = label ? `${side === "w" ? "White" : "Black"} · ${label}` : "";
    who.classList.toggle("on", m.phase === "playing" && m.chess.turn() === side);
  }
  showHint();
  $("log").replaceChildren(...m.log.slice(-30).map((t) => Object.assign(document.createElement("li"), { textContent: t })));
  $("start").disabled = m.phase !== "idle" || !setup.w.type || !setup.b.type;
}

// The clock-dependent bits (the thinking time, the waiting hint) look again every second while a game runs.
function showHint() {
  if (!match) return;
  $("hint").textContent = waitingHint(match);
  const secs = match.askedAt ? Math.max(0, Math.round((Date.now() - match.askedAt) / 1000)) : 0;
  for (const side of ["w", "b"]) {
    const turn = match.phase === "playing" && match.chess.turn() === side;
    $(`who-${side}`).querySelector(".turn").textContent = turn ? `thinking… ${secs}s` : "";
  }
}
setInterval(showHint, 1000);

function fillSetup() {
  for (const side of ["w", "b"]) {
    const sel = $(`type-${side}`);
    sel.replaceChildren(...types.map((t) => Object.assign(document.createElement("option"), { value: t.type, textContent: t.type })));
    sel.value = setup[side].type;
    const models = acceptsModel(types, setup[side].type);
    $(`model-${side}-wrap`).hidden = !models;
    $(`model-${side}`).value = models ? setup[side].model : "";
    $(`models-${side}`).replaceChildren(...(SUGGESTIONS[setup[side].type] ?? []).map((v) => Object.assign(document.createElement("option"), { value: v })));
  }
  $("versus").textContent = `${sideLabel(setup.w)}  vs  ${sideLabel(setup.b)}`;
  if (match) render(match);
}

function readSetup() {
  for (const side of ["w", "b"]) {
    const type = $(`type-${side}`).value;
    setup[side] = { type, model: acceptsModel(types, type) ? $(`model-${side}`).value.trim() : "" };
  }
  save(store, setup);
  fillSetup();
}

async function init() {
  try {
    types = (await app.agents.types()).types;
  } catch (e) {
    $("status").textContent = `Cannot start: ${e.message}`;
    return;
  }
  setup = load(store, types);
  if (webglAvailable()) {
    try {
      board3d = createBoard3d($("board"));
      $("board").classList.add("is-3d");
    } catch (e) {
      board3d = null; // the flat board takes over
    }
  }
  match = createMatch({ app, onChange: render });
  for (const side of ["w", "b"]) {
    $(`type-${side}`).addEventListener("change", () => {
      // A new CLI has its own models: the old model text does not carry over.
      $(`model-${side}`).value = "";
      readSetup();
    });
    $(`model-${side}`).addEventListener("input", readSetup);
  }
  $("swap").addEventListener("click", () => {
    setup = swapSides(setup);
    save(store, setup);
    fillSetup();
  });
  $("start").addEventListener("click", () => void match.start(setup));
  $("rematch").addEventListener("click", () => void match.rematch());
  $("swapcolours").addEventListener("click", () => void match.rematch({ swap: true }));
  $("change").addEventListener("click", () => match.changePlayers());
  fillSetup();
}

void init();
