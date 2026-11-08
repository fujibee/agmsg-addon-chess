import { test } from "node:test";
import assert from "node:assert/strict";
import { legalUci, limitText, moveList, moveRows, newGame, outcome, readUci, resultText, sanParts, tryMove, turnPrompt } from "../app-panes/chess/web/game.js";

test("readUci takes a bare move, a decorated one, and refuses the rest", () => {
  assert.deepEqual(readUci("e2e4"), { uci: "e2e4" });
  assert.deepEqual(readUci("  `E2E4`.\n"), { uci: "e2e4" });
  assert.deepEqual(readUci("I play e7e8q"), { uci: "e7e8q" });
  assert.ok(readUci("e2e4 or d2d4").error.includes("more than one"));
  assert.ok(readUci("Nf3").error.includes("no move in UCI"));
  assert.ok(readUci("").error);
});

test("an illegal move leaves the position alone and says why", () => {
  const g = newGame();
  const before = g.fen();
  assert.match(tryMove(g, "e3e4").reason, /no piece on e3/);
  assert.match(tryMove(g, "e7e5").reason, /not yours/);
  assert.match(tryMove(g, "e2e5").reason, /not a legal move/);
  assert.equal(g.fen(), before);
  assert.equal(tryMove(g, "e2e4").ok, true);
});

test("a pawn reaching the last rank needs a promotion piece", () => {
  const g = newGame();
  g.load("8/P6k/8/8/8/8/8/K7 w - - 0 1");
  assert.match(tryMove(g, "a7a8").reason, /promotion piece/);
  assert.equal(tryMove(g, "a7a8q").ok, true);
});

test("outcomes: mate, stalemate, repetition, fifty moves, bare kings", () => {
  const g = newGame();
  for (const m of ["f2f3", "e7e5", "g2g4", "d8h4"]) assert.equal(tryMove(g, m).ok, true);
  assert.deepEqual(outcome(g), { kind: "checkmate", winner: "black" });
  assert.match(resultText(outcome(g)), /black wins/);
  g.load("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  assert.equal(outcome(g).kind, "stalemate");
  g.load("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
  assert.equal(outcome(g).kind, "insufficient");
  g.load("4k3/8/8/8/8/8/R7/4K3 w - - 100 80");
  assert.equal(outcome(g).kind, "fifty");
  const r = newGame();
  for (const m of ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]) tryMove(r, m);
  assert.equal(outcome(r).kind, "repetition");
});

test("the prompt carries the FEN, the move list and the reply format", () => {
  const g = newGame();
  tryMove(g, "e2e4");
  const p = turnPrompt(g, { first: true, problem: "e7e8 is not legal" });
  assert.match(p, /playing black/);
  assert.ok(p.includes(g.fen()));
  assert.ok(p.includes("1. e4"));
  assert.ok(p.includes("e7e8 is not legal"));
  assert.ok(p.includes(legalUci(g).join(" ")));
  assert.match(p, /agmsg message whose body is one move in UCI .*nothing else/);
  assert.match(p, /Send your move back to chess /);
  assert.match(turnPrompt(g, { referee: "ref-1" }), /back to ref-1 as an agmsg message.*ref-1 only reads/s);
  assert.equal(moveList(newGame()), "");
});

test("the prompt states the time limit only when there is one, and says a retry keeps the clock", () => {
  const g = newGame();
  assert.doesNotMatch(turnPrompt(g), /Time limit/);
  assert.match(turnPrompt(g, { limit: 120 }), /Time limit: reply within 2 minutes of receiving this message\. If it runs out you lose the game\./);
  assert.match(turnPrompt(g, { limit: 30, problem: "e7e8 is not legal" }), /within 30 seconds .*clock for this move keeps running/);
  assert.deepEqual([30, 60, 120, 300].map(limitText), ["30 seconds", "1 minute", "2 minutes", "5 minutes"]);
});

test("moves come as table rows: number, White, Black (Black empty until it has moved)", () => {
  const g = newGame();
  for (const uci of ["e2e4", "e7e5", "g1f3"]) tryMove(g, uci);
  assert.deepEqual(moveRows(g), [{ no: 1, w: "e4", b: "e5" }, { no: 2, w: "Nf3", b: "" }]);
  assert.deepEqual(moveRows(newGame()), []);
});

test("a move is split into the pieces the pane styles: figurine, capture, check, castling, promotion", () => {
  const kinds = (san, c) => sanParts(san, c).map((p) => `${p.kind}:${p.text}`);
  assert.deepEqual(kinds("e4", "w"), ["plain:e4"]);
  assert.deepEqual(kinds("Nf3", "w"), ["piece:\u2658", "plain:f3"], "White's knight is the outline figurine");
  assert.deepEqual(kinds("Nc6", "b"), ["piece:\u265E", "plain:c6"], "Black's knight is the filled one");
  assert.deepEqual(kinds("Bxc6", "w"), ["piece:\u2657", "cap:x", "plain:c6"]);
  assert.deepEqual(kinds("exd5", "b"), ["plain:e", "cap:x", "plain:d5"], "a pawn capture has no figurine");
  assert.deepEqual(kinds("Qh5+", "w"), ["piece:\u2655", "plain:h5", "check:+"]);
  assert.deepEqual(kinds("Qxf7#", "w"), ["piece:\u2655", "cap:x", "plain:f7", "check:#"]);
  assert.deepEqual(kinds("O-O", "w"), ["castle:O-O"]);
  assert.deepEqual(kinds("O-O-O+", "b"), ["castle:O-O-O", "check:+"]);
  assert.deepEqual(kinds("e8=Q#", "w"), ["plain:e8", "promo:=\u2655", "check:#"]);
  assert.deepEqual(kinds("Nbd7", "b"), ["piece:\u265E", "plain:bd7"], "disambiguation stays plain");
});

test("replyStats counts every move, times only the ones with a reported notice, and never guesses", async () => {
  const { replyStats, clockText } = await import("../app-panes/chess/web/game.js");
  const s = replyStats({ w: [10000, null, 34000], b: [null] }, [{ side: "w" }, { side: "w" }, { side: "b" }]);
  assert.deepEqual(s.w, { moves: 3, total: 44000, avg: 22000, longest: 34000, illegal: 2 });
  assert.deepEqual(s.b, { moves: 1, total: null, avg: null, longest: null, illegal: 1 });
  assert.deepEqual(replyStats({ w: [], b: [] }, []).w, { moves: 0, total: null, avg: null, longest: null, illegal: 0 });
  assert.equal(clockText(65000), "1:05");
  assert.equal(clockText(0), "0:00");
  assert.equal(clockText(-5), "0:00");
});
