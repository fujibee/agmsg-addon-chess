import { connect, guard, pickLocale } from "./agmsg-addon.js";
import { createMatch, startingText, waitingHint } from "./match.js";
import { clockText, moveRows, replyStats, sanParts } from "./game.js";
import { LOCALES, setLocale, t } from "./strings.js";
import { createBoard3d, webglAvailable } from "./board3d.js";
import { loadModels, optionText } from "./models.js";
import { DEFAULT_LIMIT, LIMITS, acceptsModel, defaultSetup, edgeLabel, load, loadLimit, save, saveLimit, sideLabel, swapSides } from "./setup.js";

const PIECE = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const $ = (id) => document.getElementById(id);
// Every callback the browser calls goes through guard, so an error in it shows its own message and stack (and reaches the app's log).
const on = (el, ev, fn) => el.addEventListener(ev, guard(fn));

let match = null;
let initSeen = false; // the app told us its features (init), so the old-app note is not shown too early
let board3d = null;
let types = [];
let setup = defaultSetup([]);
let limit = DEFAULT_LIMIT; // seconds per move; 0 = no limit
const store = (() => {
  try {
    return window.localStorage;
  } catch (_) {
    return { getItem: () => null, setItem() {} };
  }
})();

const app = connect({
  sample: false,
  onInit() {
    initSeen = true;
    if (match) render(match);
  },
  onMessage(message) {
    if (match) void match.onMessage(message);
  },
  // Fallback-only for now: the bundled adapter does not pass this on or set app.canReportDelivery yet. It comes
  // with the app's delivery event, together with the adapter change.
  onNotice(notice) {
    if (match) match.onNotice(notice);
  },
});

/** Shows the pane in the app's language: the table, the fixed labels, the choices and everything drawn from the match. */
function applyLocale(tag) {
  document.documentElement.lang = setLocale(pickLocale(tag, LOCALES));
  labelStatic();
  if (types.length) {
    fillSetup();
    fillLimit();
  }
  if (match) render(match);
}
app.onLocaleChange(applyLocale);

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

/** One move as styled pieces: the figurine, the capture and check marks, castling. */
function sanCell(san, color, last) {
  const td = document.createElement("td");
  td.className = color + (last ? " last" : "");
  if (!san) return td;
  for (const p of sanParts(san, color)) {
    const el = document.createElement("span");
    el.className = p.kind;
    el.textContent = p.text;
    td.append(el);
  }
  return td;
}

/** The moves as a table: number, White, Black; the last move highlighted; scrolled to the newest. */
function renderMoves(m) {
  const rows = moveRows(m.chess);
  const plies = m.chess.history().length;
  const body = $("moves").querySelector("tbody");
  body.replaceChildren(
    ...rows.map((r, i) => {
      const tr = document.createElement("tr");
      const no = document.createElement("td");
      no.className = "no";
      no.textContent = String(r.no);
      tr.append(no, sanCell(r.w, "w", plies === 2 * i + 1), sanCell(r.b, "b", plies === 2 * i + 2));
      return tr;
    }),
  );
  $("moves").scrollTop = $("moves").scrollHeight;
}

let tab = "moves";
let seenIllegal = 0;

function selectTab(name) {
  tab = name;
  for (const n of ["moves", "illegal", "log"]) {
    $(`tab-${n}`).setAttribute("aria-selected", String(n === name));
    $(n).hidden = n !== name;
  }
  if (name === "illegal") seenIllegal = match ? match.refusals.length : 0;
  $("tab-illegal").classList.remove("bump");
  if (name === "moves") $("moves").scrollTop = $("moves").scrollHeight;
  if (name === "log") $("log").scrollTop = $("log").scrollHeight;
}

/** The strip under the board: the moves, the replies that were not played and why, and the pane's log. */
function renderInfo(m) {
  $("info").hidden = m.phase === "idle";
  const n = m.refusals.length;
  if (n < seenIllegal) seenIllegal = 0; // a new game
  const t_ = $("tab-illegal");
  t_.hidden = n === 0;
  t_.textContent = t("tab.illegal", { n });
  if (n === 0 && tab === "illegal") selectTab("moves");
  t_.classList.toggle("bump", tab !== "illegal" && n > seenIllegal);
  if (tab === "illegal") seenIllegal = n;
  $("tab-moves").textContent = t("tab.moves");
  $("tab-log").textContent = t("tab.log");
  $("illegal").replaceChildren(
    ...m.refusals.map((r) =>
      Object.assign(document.createElement("li"), {
        textContent: t("illegal.item", { ply: r.ply, side: t(r.side === "w" ? "side.white" : "side.black"), text: r.text, reason: r.reason }),
      }),
    ),
  );
  $("log").replaceChildren(...m.log.slice(-30).map((line) => Object.assign(document.createElement("li"), { textContent: line })));
  if (tab === "log") $("log").scrollTop = $("log").scrollHeight;
}

/** What the pane says while the side to move has not been told it is its turn and its player is still starting. */
function startingLine(m) {
  const side = m.chess.turn();
  const who = t(side === "w" ? "side.white" : "side.black");
  return t("status.startingLine", { side: who, label: m.labels[side] || t("player") });
}

/** Fixed labels from the strings table (the HTML holds the English text as its first paint). */
function labelStatic() {
  const set = (id, key) => { $(id).textContent = t(key); };
  set("swap", "btn.swap");
  set("start", "btn.start");
  $("resetview").title = t("btn.reset.title");
  $("board").setAttribute("aria-label", t("board.aria"));
  $("tabs").setAttribute("aria-label", t("tab.label"));
  for (const side of ["w", "b"]) {
    $(`side-${side}`).querySelector("legend").textContent = t(side === "w" ? "side.white" : "side.black");
    $(`model-${side}-wrap`).firstChild.textContent = t("model.label") + " ";
    $(`model-${side}-other`).placeholder = t("model.placeholder");
    $(`model-${side}-other`).setAttribute("aria-label", t("model.aria"));
  }
  const heads = $("moves").querySelectorAll("th");
  heads[0].textContent = t("moves.no");
  heads[1].textContent = t("side.white");
  heads[2].textContent = t("side.black");
  $("swap").title = t("btn.swap.title");
  $("swap").setAttribute("aria-label", t("btn.swap"));
  set("resetview", "btn.reset");
  set("rematch", "btn.again");
  set("swapcolours", "btn.swapAgain");
  set("tryagain", "btn.retry");
  set("change", "btn.change");
  set("camhint", "hint.camera");
  $("rematch").nextElementSibling.textContent = t("btn.again.note");
  $("tryagain").nextElementSibling.textContent = t("btn.retry.note");
  $("change").nextElementSibling.textContent = t("btn.change.note");
  $("limit-wrap").firstChild.textContent = t("limit.label") + " ";
  for (const side of ["w", "b"]) $(`side-${side}`).querySelector("label").firstChild.textContent = t("player.app") + " ";
  ["moves", "total", "avg", "longest", "illegal"].forEach((k, i) => { $("stats").querySelectorAll("th")[i + 1].textContent = t(`stats.${k}`); });
  $("stats-note").textContent = t("stats.note");
}

// The end card shows a second after the game ends and takes clicks a second after that, so a click on the last
// position cannot start a new game.
const CARD_DELAY_MS = 1000;
const CARD_LOCK_MS = 1000;
let endedAt = 0;
let cardTimer = 0;
function cardState(m) {
  const over = m.phase === "over" || m.phase === "error";
  if (!over) { endedAt = 0; clearTimeout(cardTimer); return { shown: false, enabled: false }; }
  if (!endedAt) {
    endedAt = Date.now();
    clearTimeout(cardTimer);
    cardTimer = setTimeout(guard(() => { if (match) render(match); }), CARD_DELAY_MS);
    setTimeout(guard(() => { if (match) render(match); }), CARD_DELAY_MS + CARD_LOCK_MS + 20);
  }
  const age = Date.now() - endedAt;
  return { shown: age >= CARD_DELAY_MS, enabled: age >= CARD_DELAY_MS + CARD_LOCK_MS };
}

/** m:ss for a total, whole seconds for the rest; "—" when no reply was timed. */
const statTotal = (ms) => (ms === null ? "—" : clockText(ms));
const statSecs = (ms) => (ms === null ? "—" : `${Math.round(ms / 1000)} s`);

function renderStats(m) {
  const rows = replyStats(m.replies, m.refusals);
  const body = $("stats").querySelector("tbody");
  body.replaceChildren(
    ...["w", "b"].map((side) => {
      const r = rows[side];
      const tr = document.createElement("tr");
      for (const text of [t(side === "w" ? "side.white" : "side.black"), String(r.moves), statTotal(r.total), statSecs(r.avg), statSecs(r.longest), String(r.illegal)]) {
        tr.append(Object.assign(document.createElement("td"), { textContent: text }));
      }
      return tr;
    }),
  );
}

function renderText(m) {
  const idle = m.phase === "idle";
  const finished = m.phase === "over";
  $("setup").hidden = !idle;
  const failed = m.phase === "error";
  const card = cardState(m);
  $("after").hidden = !card.shown;
  for (const id of ["rematch", "swapcolours", "tryagain", "change"]) $(id).disabled = !card.enabled;
  $("rematch").parentElement.hidden = !finished;
  $("swapcolours").parentElement.hidden = !finished;
  $("tryagain").parentElement.hidden = !failed;
  $("stats").hidden = !finished;
  $("stats-note").hidden = !finished;
  if (finished) renderStats(m);
  renderMoves(m);
  renderInfo(m);
  $("status").textContent =
    m.phase === "starting" ? startingText(m) || t("status.startingPlayers")
    : m.phase === "playing" && !m.askedAt && m.startingUp ? startingLine(m)
    : m.phase === "playing" ? ""
    : m.phase === "over" || m.phase === "error" ? ""
    : t("status.choose");
  const plies = m.chess.history().length;
  $("result").textContent = finished ? t("result.line", { result: m.result, n: Math.ceil(plies / 2) }) : failed ? t("status.stopped", { error: m.error }) : "";
  $("still").textContent = m.previous.length ? t("still") : "";
  for (const side of ["w", "b"]) {
    const who = $(`who-${side}`);
    const label = edgeLabel(m.sides[side] ?? (idle ? setup[side] : null), types);
    who.querySelector(".name").textContent = label ? `${t(side === "w" ? "side.white" : "side.black")} · ${label}` : "";
    who.classList.toggle("on", m.phase === "playing" && m.chess.turn() === side);
  }
  $("limit-note").textContent = idle ? (initSeen && app.canReportDelivery !== true ? t("limit.noteOld") : t("limit.note")) : "";
  showHint();
  const missing = idle ? missingChoice(setup) : "";
  $("start").disabled = !idle || !!missing;
  $("start-why").textContent = missing;
}

// The clock-dependent bits (the thinking time, the waiting hint) look again every second while a game runs.
/** Which choice keeps Start off, in a few words, or "" when the game can start. */
function missingChoice(s) {
  for (const side of ["w", "b"]) {
    const name = t(side === "w" ? "side.white" : "side.black");
    if (!s[side].type) return t("setup.choosePlayer", { name });
    if (acceptsModel(types, s[side].type) && $(`model-${side}`).value === OTHER && !$(`model-${side}-other`).value.trim()) return t("setup.typeModel", { name });
  }
  return "";
}

function showHint() {
  if (!match) return;
  $("hint").textContent = waitingHint(match);
  if (match.phase === "starting") $("status").textContent = startingText(match);
  if (match.tick()) render(match);
  const secs = match.askedAt ? Math.max(0, Math.round((Date.now() - match.askedAt) / 1000)) : 0;
  const left = match.deadline ? Math.max(0, Math.ceil((match.deadline - Date.now()) / 1000)) : null;
  for (const side of ["w", "b"]) {
    const turn = match.phase === "playing" && match.chess.turn() === side;
    const sent = match.sending && match.sending.to === match.players[side] ? Math.round((Date.now() - match.sending.since) / 1000) : null;
    const el = $(`who-${side}`).querySelector(".turn");
    const mm = left !== null ? clockText(left * 1000) : "";
    el.textContent =
      sent !== null ? t("turn.sending", { secs: sent })
      : turn ? (match.askedAt ? (left !== null ? t(left <= 10 ? "turn.low" : "turn.left", { time: mm }) : t("turn.thinking", { secs })) : match.startingUp ? t("turn.starting") : t("turn.waiting"))
      : match.phase === "over" && match.timedOut === side ? t("turn.ranOut")
      : match.phase === "playing" ? t("turn.idle")
      : "";
    el.classList.toggle("low", (turn && sent === null && left !== null && left <= 10) || (match.phase === "over" && match.timedOut === side));
  }
}
setInterval(guard(showHint), 1000);

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
    const choices = list.some((o) => o.value === "") ? list : [{ value: "", label: t("model.cliDefault"), description: "" }, ...list];
    pick.replaceChildren(
      ...choices.map((o) => Object.assign(document.createElement("option"), { value: o.value, textContent: optionText(o) })),
      Object.assign(document.createElement("option"), { value: OTHER, textContent: t("model.other") }),
    );
    const known = choices.some((o) => o.value === setup[side].model);
    pick.value = known ? setup[side].model : OTHER;
    other.hidden = known;
    other.value = known ? "" : setup[side].model;
    note.textContent = got === null ? t("models.loading") : got.reason ? t("models.builtIn", { reason: got.reason }) : !known ? t("model.noteOther") : "";
  }
  $("versus").textContent = t("versus", { a: sideLabel(setup.w), b: sideLabel(setup.b) });
  if (match) render(match);
}

function fillLimit() {
  const sel = $("limit");
  sel.replaceChildren(...LIMITS.map((l) => Object.assign(document.createElement("option"), { value: String(l.value), textContent: l.label })));
  sel.value = String(limit);
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

/** "drag to turn, scroll to zoom" for five seconds, the first time a board is shown. */
function showCameraHint() {
  try { if (store.getItem("chess.camhint.v1")) return; store.setItem("chess.camhint.v1", "1"); } catch { /* shown every time without storage */ }
  const el = $("camhint");
  el.hidden = false;
  setTimeout(guard(() => { el.hidden = true; }), 5000);
}

async function init() {
  document.documentElement.lang = setLocale(pickLocale(app.locale, LOCALES));
  labelStatic();
  try {
    types = (await app.agents.types()).types;
  } catch (e) {
    $("status").textContent = t("status.cannotStart", { message: e.message });
    return;
  }
  setup = load(store, types);
  limit = loadLimit(store);
  if (webglAvailable()) {
    try {
      board3d = createBoard3d($("board"), { guard });
      // The page going away (a reload, the pane closing) gives the board's GL context and frame back at once.
      on(window, "pagehide", () => board3d?.dispose());
      $("board").classList.add("is-3d");
      $("boardtools").hidden = false;
      on($("resetview"), "click", () => board3d.resetView());
      showCameraHint();
    } catch (e) {
      board3d = null; // the flat board takes over
    }
  }
  match = createMatch({ app, onChange: render, delivery: () => app.canReportDelivery === true });
  for (const side of ["w", "b"]) {
    on($(`type-${side}`), "change", () => {
      // A new CLI has its own models: the old model text does not carry over.
      $(`model-${side}`).value = "";
      $(`model-${side}-other`).value = "";
      readSetup();
    });
    on($(`model-${side}`), "change", () => {
      // "Other..." shows the box empty and waits for a name; a typed name is read on input
      if ($(`model-${side}`).value === OTHER) {
        $(`model-${side}-other`).hidden = false;
        $(`model-${side}-other`).focus();
        if (match) render(match);
        return;
      }
      readSetup();
    });
    on($(`model-${side}-other`), "input", readSetup);
  }
  on($("limit"), "change", () => {
    limit = Number($("limit").value);
    saveLimit(store, limit);
  });
  on($("swap"), "click", () => {
    setup = swapSides(setup);
    save(store, setup);
    fillSetup();
  });
  on($("start"), "click", () => {
    match.limit = limit;
    void match.start(setup);
  });
  on($("rematch"), "click", () => void match.rematch());
  on($("swapcolours"), "click", () => void match.rematch({ swap: true }));
  on($("change"), "click", () => match.changePlayers());
  on($("tryagain"), "click", () => void match.tryAgain());
  for (const b of document.querySelectorAll("#tabs [data-tab]")) on(b, "click", () => selectTab(b.dataset.tab));
  fillSetup();
  fillLimit();
}

void guard(init)();
