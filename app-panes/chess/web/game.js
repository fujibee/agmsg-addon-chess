// The referee's rules, with no page and no agmsg in it. chess.js decides what is legal.
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

export function newGame() {
  return new Chess();
}

const SIDE = { w: "white", b: "black" };

/** The text sent to the side to move. */
export function turnPrompt(chess, { first = false, problem = "" } = {}) {
  const side = SIDE[chess.turn()];
  const lines = [];
  if (first) lines.push(`You are playing ${side} in a game of chess. A referee keeps the board and sends you the position each turn.`);
  if (problem) lines.push(`Your last reply was not accepted: ${problem}. The position has not changed. Legal moves: ${legalUci(chess).join(" ")}.`);
  lines.push(`It is your move (${side}). Position (FEN): ${chess.fen()}`);
  lines.push(`Moves so far: ${moveList(chess) || "none"}`);
  lines.push("Reply with one move in UCI (for example e2e4, or e7e8q for a promotion), nothing else.");
  return lines.join("\n");
}

export function resultText(o) {
  switch (o.kind) {
    case "checkmate": return `Checkmate. ${o.winner} wins.`;
    case "stalemate": return "Draw by stalemate.";
    case "repetition": return "Draw by threefold repetition.";
    case "insufficient": return "Draw: not enough material to mate.";
    case "fifty": return "Draw by the fifty-move rule.";
    default: return "The game is over.";
  }
}
