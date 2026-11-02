import { test } from "node:test";
import assert from "node:assert/strict";
import { legalUci, moveList, newGame, outcome, readUci, resultText, tryMove, turnPrompt } from "../app-panes/chess/web/game.js";

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
  assert.match(p, /one move in UCI .*nothing else/);
  assert.equal(moveList(newGame()), "");
});
