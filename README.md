# agmsg add-on: chess

A 3D chess board for the [agmsg](https://github.com/fujibee/agmsg) desktop app. The add-on is the **referee**: it joins the team as `chess`, starts two agents (`white` and `black`), and sends the side to move the position. The agents never talk to each other; the board in the pane is the single source of truth.

The board is drawn with [three.js](https://threejs.org) (bundled, nothing is fetched): a lit, shadowed board with turned pieces that slide when a move is played. Drag to orbit, scroll to zoom, double-click to reset the view. Without WebGL the pane shows a flat board instead.

## How a game goes

1. Open **Chess** from the **+** at the top of the panes (**Add-on pane**). Allow the team access and the team powers it asks for.
2. Pick the CLI and model for White and for Black (⇄ swaps them) and press **Start game**. Nothing is started before that. Your choice is remembered. The model menu is the CLI's own list, as the app reports it; if the app cannot give one, a built-in list is shown, and **Other…** takes any model name.
3. To the side to move the referee sends the position as FEN, the moves so far, and asks it to send back an agmsg message whose body is one move in UCI and nothing else (an answer written in its own pane is not read).
4. A reply is checked with [chess.js](https://github.com/jhlywa/chess.js) (bundled in `web/`). A legal move is played and the other side is asked. An illegal or unreadable reply is explained and the same side is asked again, with the legal moves listed.
5. At checkmate, stalemate, threefold repetition, the fifty-move rule or bare kings, the pane shows the result. The agents keep running as normal terminal panes; close them when you are done.

The two players open beside the chess pane in the same tab, black above white. A game is about 80 plies, one agent turn each, so it costs real model calls. Pick a cheap model for a try (the **Model** box is passed to the CLI as its model option and is hidden for a CLI that takes none).

After a game, **Rematch** and **Swap colours** reuse the two running agents; **Change players** goes back to the setup and the next Start starts two new agents (the earlier pair keeps running; close its panes if you don't need it). Reloading the pane forgets the game; the agents stay in the team.

The moves are listed as a table (move number, White, Black) with figurine pieces, captures and checks marked, castling written out, the last move highlighted and the list scrolled to the newest. The page fills the pane, so the board and the player rows follow its size.

The board turns slowly by itself; drag it to take over (and the wheel zooms). **Reset view** brings back the first view and the slow turn. The scene is a mid-tone grey so both the white pieces and the charcoal, glossy black ones stand out from it.

You pick the time per move when you start a game: 30 seconds, 1 minute, 2 minutes (the default), 5 minutes, or no limit. A side's clock restarts every move, and asking again after a refused move does not restart it. A reply that reaches the pane at or after the deadline is late. The pane shows the time left next to the side to move, the turn notice states the limit, and a side that runs out loses ("White lost on time"); Rematch and Change players stay available. A side's clock starts when the app reports that the turn notice was typed into the player's terminal, matched to the message that carried the ask. Until then the pane shows "Starting White (claude-code · haiku)…", counts nothing, and a reply that comes early (a new player may read its inbox during its startup turn) is played as usual. An app that does not report delivery cannot time a side's first move fairly, so that move is untimed and the log says so; later moves are timed from the send.

If a player does not answer for a while, the pane says which side has not answered yet and how long ago the turn notice was delivered. With no limit the game keeps waiting; nothing else times out. (A freshly started Claude Code can also sit at "Do you trust this folder?" in its own pane; the app's grant card can trust `~/agmsg-agents` once, if you tick the box.)

## What it needs

| Permission      | Why                                                  |
| --------------- | ---------------------------------------------------- |
| `messages:read` | receive the moves the players send back              |
| `team:join`     | be the team member `chess`                           |
| `messages:send` | send each player the position                        |
| `agents:spawn`  | start the two players                                |

The agents it starts keep their own permissions: they do not get this add-on's limits. No `files:read`, no `network`.

## Develop

```
pnpm install
pnpm test       # rules and a whole game played by two scripted agents
pnpm run build  # rebuild web/board3d.js from src/board3d.src.js (three.js is a dev dependency)
node kit/agmsg-addon-check.cjs
```

`chess.js` is BSD-2-Clause (see `app-panes/chess/web/chess.js.LICENSE.txt`); three.js is MIT (see `app-panes/chess/web/board3d.js.LICENSE.txt`); the rest is MIT. The pieces are generated in code, so there are no model files or texture licenses.
