// The referee's rules, with no page and no agmsg in it. chess.js decides what is legal.
import { t } from "./strings.js";
import { Chess } from "./chess.js";

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Reads one move in UCI out of a player's reply, or says why it could not. */
export function readUci(body) {
  const text = String(body ?? "").trim().toLowerCase();
  const plain = text.replace(/^[\s`'"*_]+|[\s`'"*_.!]+$/g, "");
  if (UCI.test(plain)) return { uci: plain };
  const found = [...new Set(text.match(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/g) ?? [])];
  if (found.length === 1) return { uci: found[0] };
  return { error: found.length ? "the reply names more than one move" : "the reply holds no move in UCI (like e2e4)" };
}

export function legalUci(chess) {
  return chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ""));
}

/** Plays the move if it is legal. Otherwise the position is untouched and `reason` says why. */
export function tryMove(chess, uci) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  try {
    const m = chess.move({ from, to, promotion });
    return { ok: true, san: m.san };
  } catch (e) {
    const piece = chess.get(from);
    let why = `${uci} is not a legal move here`;
    if (!piece) why = `there is no piece on ${from}`;
    else if (piece.color !== chess.turn()) why = `the piece on ${from} is not yours`;
    else if (!promotion && piece.type === "p" && (to[1] === "8" || to[1] === "1")) why = `${uci} needs a promotion piece (q, r, b or n)`;
    else if (chess.isCheck()) why = `${uci} does not get you out of check`;
    return { ok: false, reason: why, detail: String(e?.message ?? e) };
  }
}

/** null while the game goes on, otherwise how it ended. */
export function outcome(chess) {
  if (chess.isCheckmate()) return { kind: "checkmate", winner: chess.turn() === "w" ? "black" : "white" };
  if (chess.isStalemate()) return { kind: "stalemate" };
  if (chess.isThreefoldRepetition()) return { kind: "repetition" };
  if (chess.isInsufficientMaterial()) return { kind: "insufficient" };
  if (chess.isDrawByFiftyMoves()) return { kind: "fifty" };
  return null;
}

/** "1. e4 e5 2. Nf3" */
export function moveList(chess) {
  const sans = chess.history();
  const out = [];
  for (let i = 0; i < sans.length; i += 2) out.push(`${i / 2 + 1}. ${sans[i]}${sans[i + 1] ? " " + sans[i + 1] : ""}`);
  return out.join(" ");
}

const FIGURINE = {
  w: { K: "\u2654", Q: "\u2655", R: "\u2656", B: "\u2657", N: "\u2658" },
  b: { K: "\u265A", Q: "\u265B", R: "\u265C", B: "\u265D", N: "\u265E" },
};

/** The moves as table rows: { no, w, b } with the SAN of each side (b is "" until Black has moved). */
export function moveRows(chess) {
  const sans = chess.history();
  const rows = [];
  for (let i = 0; i < sans.length; i += 2) rows.push({ no: i / 2 + 1, w: sans[i], b: sans[i + 1] ?? "" });
  return rows;
}

/**
 * One move in the pieces the pane styles apart: a figurine for the piece (the side's own colour), the capture
 * mark, the check or mate mark, castling, and a promotion's figurine. kind is one of piece, cap, check, castle,
 * promo, plain; color is "w" or "b".
 */
export function sanParts(san, color) {
  const fig = FIGURINE[color];
  const parts = [];
  let rest = san;
  const mark = /[+#]$/.exec(rest);
  if (mark) rest = rest.slice(0, -1);
  if (/^O-O(-O)?$/.test(rest)) {
    parts.push({ text: rest, kind: "castle" });
  } else {
    const piece = /^[KQRBN]/.exec(rest);
    if (piece) {
      parts.push({ text: fig[piece[0]], kind: "piece" });
      rest = rest.slice(1);
    }
    let plain = "";
    const flush = () => {
      if (plain) parts.push({ text: plain, kind: "plain" });
      plain = "";
    };
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i];
      if (c === "x") {
        flush();
        parts.push({ text: "x", kind: "cap" });
      } else if (c === "=" && fig[rest[i + 1]]) {
        flush();
        parts.push({ text: "=" + fig[rest[i + 1]], kind: "promo" });
        i++;
      } else plain += c;
    }
    flush();
  }
  if (mark) parts.push({ text: mark[0], kind: "check" });
  return parts;
}

export function newGame() {
  return new Chess();
}

const SIDE = { w: "white", b: "black" };

/** "30 seconds", "1 minute", "2 minutes". */
export function limitText(seconds) {
  if (seconds >= 60 && seconds % 60 === 0) return seconds === 60 ? t("limit.minute") : t("limit.minutes", { n: seconds / 60 });
  return t("limit.seconds", { n: seconds });
}

/**
 * The line that opens a move request: the limit and, when known, the seconds the clock has left. `left` is null when it is
 * not known (then only the limit is said, never a made-up remainder).
 */
export function timeLine(limit, left = null) {
  return `You have ${limit} s for this move${left === null ? "" : ` (${Math.max(0, Math.ceil(left))} s left)`}. Reply before it runs out or you lose the game.`;
}

/** The text sent to the side to move. */
export function turnPrompt(chess, { first = false, problem = "", again = false, referee = "chess", limit = 0, left = null, ref = "" } = {}) {
  const side = SIDE[chess.turn()];
  const lines = [];
  if (limit > 0) lines.push(timeLine(limit, left)); // first, so the player sees it before anything else
  if (first) lines.push(`You are playing ${side} in ${again ? "a new game" : "a game"} of chess. A referee keeps the board and sends you the position each turn.${again ? " Forget the positions and moves of any earlier game." : ""}`);
  if (problem) lines.push(`Your last reply was not accepted: ${problem}. The position has not changed. Legal moves: ${legalUci(chess).join(" ")}.`);
  lines.push(`It is your move (${side}). Position (FEN): ${chess.fen()}`);
  lines.push(`Moves so far: ${moveList(chess) || "none"}`);
  lines.push(`Send your move back to ${referee} as an agmsg message whose body is one move in UCI (for example e2e4, or e7e8q for a promotion) and nothing else. Writing it in your own pane does not count: ${referee} only reads messages sent to it.`);
  if (ref) lines.push(`Request: ${ref}`); // makes every ask a different message, so an old ask is never taken for this one
  return lines.join("\n");
}

export function resultText(o) {
  switch (o.kind) {
    case "checkmate": return t("end.checkmate", { winner: t(`end.winner.${o.winner}`) });
    case "stalemate": return t("end.stalemate");
    case "repetition": return t("end.repetition");
    case "insufficient": return t("end.insufficient");
    case "fifty": return t("end.fifty");
    default: return t("end.default");
  }
}

/** "1:05" for 65 000 ms; "10 s" style is for the callers that want seconds only. */
export function clockText(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The end-of-game table: per side the move count, the total, average and longest reply time (ms, from the turn
 * notice reaching the player to its move arriving) and the illegal replies. A move whose notice was never reported
 * has no time (null in `replies`): it is counted as a move but left out of the times, and a side with no timed move
 * has null times ("—"), never a guess.
 */
export function replyStats(replies, refusals) {
  const rows = {};
  for (const side of ["w", "b"]) {
    const all = replies[side] || [];
    const timed = all.filter((x) => typeof x === "number");
    const total = timed.reduce((a, b) => a + b, 0);
    rows[side] = {
      moves: all.length,
      total: timed.length ? total : null,
      avg: timed.length ? Math.round(total / timed.length) : null,
      longest: timed.length ? Math.max(...timed) : null,
      illegal: (refusals || []).filter((r) => r.side === side).length,
    };
  }
  return rows;
}
