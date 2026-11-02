# agmsg add-on: chess

A chess board for the [agmsg](https://github.com/fujibee/agmsg) desktop app. The add-on is the **referee**: it joins the team as `chess`, starts two agents (`white` and `black`), and sends the side to move the position. The agents never talk to each other; the board in the pane is the single source of truth.

## How a game goes

1. Open **Chess** from the **+** at the top of the panes (**Add-on pane**). Allow the team access and the team powers it asks for.
2. Choose the CLI the two players run on and press **Start game**.
3. To the side to move the referee sends the position as FEN, the moves so far, and "reply with one move in UCI, nothing else".
4. A reply is checked with [chess.js](https://github.com/jhlywa/chess.js) (bundled in `web/`). A legal move is played and the other side is asked. An illegal or unreadable reply is explained and the same side is asked again, with the legal moves listed.
5. At checkmate, stalemate, threefold repetition, the fifty-move rule or bare kings, the pane shows the result. The agents keep running as normal terminal panes; close them when you are done.

A game is about 80 plies, one agent turn each, so it costs real model calls. Pick a cheap model for a try (the **Model** box is passed to the CLI as its model option).

Reloading the pane forgets the game; the two agents stay in the team.

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
npm test        # rules and a whole game played by two scripted agents
node kit/agmsg-addon-check.cjs
```

`chess.js` is BSD-2-Clause (see `app-panes/chess/web/chess.js.LICENSE.txt`); the rest is MIT.
