import { connect } from "./agmsg-addon.js";
import { createMatch, startingText, waitingHint } from "./match.js";
import { moveList } from "./game.js";
import { createBoard3d, webglAvailable } from "./board3d.js";
import { loadModels, optionText } from "./models.js";
import { acceptsModel, defaultSetup, edgeLabel, load, save, sideLabel, swapSides } from "./setup.js";

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
    m.phase === "starting" ? startingText(m) || "Starting the players…"
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
  const missing = idle ? missingChoice(setup) : "";
  $("start").disabled = !idle || !!missing;
  $("start-why").textContent = missing;
}

// The clock-dependent bits (the thinking time, the waiting hint) look again every second while a game runs.
/** Which choice keeps Start off, in a few words, or "" when the game can start. */
function missingChoice(s) {
  for (const side of ["w", "b"]) {
    const name = side === "w" ? "White" : "Black";
    if (!s[side].type) return `Choose ${name}'s player.`;
    if (acceptsModel(types, s[side].type) && $(`model-${side}`).value === OTHER && !$(`model-${side}-other`).value.trim()) return `Type ${name}'s model name, or pick one from the list.`;
  }
  return "";
}

function showHint() {
  if (!match) return;
  $("hint").textContent = waitingHint(match);
  if (match.phase === "starting") $("status").textContent = startingText(match);
  const secs = match.askedAt ? Math.max(0, Math.round((Date.now() - match.askedAt) / 1000)) : 0;
  for (const side of ["w", "b"]) {
    const turn = match.phase === "playing" && match.chess.turn() === side;
    const sent = match.sending && match.sending.to === match.players[side] ? Math.round((Date.now() - match.sending.since) / 1000) : null;
    $(`who-${side}`).querySelector(".turn").textContent =
      sent !== null ? `sending… ${sent}s` : turn ? (match.askedAt ? `thinking… ${secs}s` : "waiting for the player…") : "";
  }
}
setInterval(showHint, 1000);

const OTHER = "\u0000other";
const modelChoices = new Map(); // type -> the answer of loadModels, once it came

/** Asks for a type's model choices once; the setup is drawn again when they arrive. */
function wantModels(type) {
  if (modelChoices.has(type)) return;
  modelChoices.set(type, null);
  void loadModels(app, type).then((r) => {
    modelChoices.set(type, r);
    fillSetup();
  });
}

function fillSetup() {
  for (const side of ["w", "b"]) {
    const sel = $(`type-${side}`);
    sel.replaceChildren(...types.map((t) => Object.assign(document.createElement("option"), { value: t.type, textContent: t.type })));
    sel.value = setup[side].type;
    const models = acceptsModel(types, setup[side].type);
    $(`model-${side}-wrap`).hidden = !models;
    const pick = $(`model-${side}`);
    const other = $(`model-${side}-other`);
    const note = $(`model-${side}-note`);
    if (!models) {
      other.hidden = true;
      note.textContent = "";
      continue;
    }
    wantModels(setup[side].type);
    const got = modelChoices.get(setup[side].type);
    const list = got?.options ?? [];
    const choices = list.some((o) => o.value === "") ? list : [{ value: "", label: "CLI default", description: "" }, ...list];
    pick.replaceChildren(
      ...choices.map((o) => Object.assign(document.createElement("option"), { value: o.value, textContent: optionText(o) })),
      Object.assign(document.createElement("option"), { value: OTHER, textContent: "Other\u2026" }),
    );
    const known = choices.some((o) => o.value === setup[side].model);
    pick.value = known ? setup[side].model : OTHER;
    other.hidden = known;
    other.value = known ? "" : setup[side].model;
    note.textContent = got === null ? "Loading the models\u2026" : got.reason ? `Showing a built-in list: ${got.reason}` : "";
  }
  $("versus").textContent = `${sideLabel(setup.w)}  vs  ${sideLabel(setup.b)}`;
  if (match) render(match);
}

function readSetup() {
  for (const side of ["w", "b"]) {
    const type = $(`type-${side}`).value;
    const picked = $(`model-${side}`).value;
    setup[side] = { type, model: acceptsModel(types, type) ? (picked === OTHER ? $(`model-${side}-other`).value.trim() : picked) : "" };
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
      $(`model-${side}-other`).value = "";
      readSetup();
    });
    $(`model-${side}`).addEventListener("change", () => {
      // "Other..." shows the box empty and waits for a name; a typed name is read on input
      if ($(`model-${side}`).value === OTHER) {
        $(`model-${side}-other`).hidden = false;
        $(`model-${side}-other`).focus();
        if (match) render(match);
        return;
      }
      readSetup();
    });
    $(`model-${side}-other`).addEventListener("input", readSetup);
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
