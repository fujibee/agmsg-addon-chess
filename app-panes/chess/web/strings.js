// Everything the pane says to a person, in one place, keyed so the table can move to a locale file as it is
// (locales/en.json). {name} marks a value filled in at the call. What is sent to the agents (game.js turnPrompt)
// is not here: it is a message to a program, not text for the person using the pane.
const EN = {
  "side.white": "White",
  "side.black": "Black",
  "player": "player",

  "status.choose": "Choose the two players and start.",
  "status.startingPlayers": "Starting the players…",
  "status.stopped": "Stopped: {error}",
  "status.cannotStart": "Cannot start: {message}",
  "status.toMove": "{who} to move",
  "status.startingLine": "Starting {side} ({label})… waiting for it to finish starting",
  "result.moves": "{result} {n} moves.",
  "still": "The previous players are still running; close their panes if you don't need them.",

  "turn.sending": "sending… {secs}s",
  "turn.thinking": "thinking… {secs}s",
  "turn.left": "{time} left",
  "turn.starting": "starting…",
  "turn.waiting": "waiting for the player…",

  "hint.noAnswer": "{side} hasn't answered yet ({secs} s since the turn notice).",
  "hint.noAnswerAsked": "{side} hasn't answered yet ({secs} s since it was asked).",

  "illegal.one": "1 illegal move",
  "illegal.other": "{n} illegal moves",
  "illegal.item": "Move {ply} ({side}): {text} — {reason}",
  "illegal.unreadable": "a reply that is not a move",

  "setup.choosePlayer": "Choose {name}'s player.",
  "setup.typeModel": "Type {name}'s model name, or pick one from the list.",
  "models.loading": "Loading the models…",
  "models.builtIn": "Showing a built-in list: {reason}",
  "limit.seconds": "{n} seconds",
  "limit.minute": "1 minute",
  "limit.minutes": "{n} minutes",
  "limit.none": "No limit",

  "starting.none": "{name}…",
  "starting.ready": "{name} ready",
  "starting.failed": "{name} could not start",
  "starting.wait": "starting {name}… {secs} s",

  "log.noLimitFirst": "{side}: no time limit on the first move (this app cannot report delivery)",
  "log.outOfTime": "{who}: out of time",
  "log.lateReply": "{who}: ignored a reply that came after the time ran out",
  "log.oldReply": "{who}: ignored a reply written before this game began",
  "log.unreadable": "{who}: {error}; asking again",
  "log.refused": "{who}: {uci} refused ({reason}); asking again",
  "log.move": "{who}: {san}",
  "log.entry": "{name} ({side}) is {state}",

  "lost.time": "{side} lost on time (no move within {limit}).",
  "end.checkmate": "Checkmate. {winner} wins.",
  "end.stalemate": "Draw by stalemate.",
  "end.repetition": "Draw by threefold repetition.",
  "end.insufficient": "Draw: not enough material to mate.",
  "end.fifty": "Draw by the fifty-move rule.",
  "end.default": "The game is over.",

  "spawn.failed": "{want} could not start: {reason}",
  "spawn.unknownReason": "unknown reason",
  "spawn.orphaned": "{want} ({name}) is still running from before the app restarted{pid}, but this pane is not connected to it. Open Settings > Add-ons and choose \"Open new\" or \"Leave it\", then start again.",
  "spawn.pid": " (process {pid})",
  "spawn.unknown": "{want} ({name}) was starting when the app stopped{why}, and the app does not reopen it by itself. Open Settings > Add-ons and choose \"Open new\" or \"Leave it\", then start again.",
  "spawn.other": "{want} ({name}) is {state} but has no running agent{why}. Open Settings > Add-ons and choose \"Open\", then start again.",
};

/** The text for `key` with {name} placeholders filled from `vars`; an unknown key shows as itself. */
export function t(key, vars = {}) {
  const text = EN[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export const STRING_KEYS = Object.keys(EN);
