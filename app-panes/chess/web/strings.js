// Everything the pane says to a person, in one place, keyed so the table can move to a locale file as it is
// (locales/en.json). {name} marks a value filled in at the call. What is sent to the agents (game.js turnPrompt)
// is not here: it is a message to a program, not text for the person using the pane.
const EN = {
  "side.white": "White",
  "side.black": "Black",
  "side.lower.white": "white",
  "side.lower.black": "black",
  "player": "player",

  "status.choose": "Choose the two players and start.",
  "status.startingPlayers": "Starting the two players (Claude takes about 20 s). No clock runs while a player starts.",
  "status.stopped": "Stopped: {error}",
  "status.cannotStart": "Cannot start: {message}",
  "status.startingLine": "Starting {side} ({label})… waiting for it to finish starting",
  "still": "The previous players are still running; close their panes if you don't need them.",

  "turn.sending": "sending… {secs}s",
  "turn.thinking": "thinking… {secs}s",
  "turn.left": "{time} left",
  "turn.low": "{time} Low time",
  "turn.ranOut": "0:00 ran out of time",
  "turn.idle": "—",
  "turn.starting": "starting…",
  "turn.waiting": "waiting for the player…",

  "hint.noAnswer": "{side} hasn't answered yet ({secs} s since the turn notice).",
  "hint.noAnswerAsked": "{side} hasn't answered yet ({secs} s since it was asked).",

  "tab.moves": "Moves",
  "tab.illegal": "Illegal ({n})",
  "tab.log": "Log",
  "tab.label": "Game details",
  "moves.no": "#",
  "btn.swap": "⇄ Swap sides",
  "btn.swap.title": "White and Black trade player app and model.",
  "btn.reset": "Reset view",
  "btn.again": "Play again",
  "btn.again.note": "same colors, same players",
  "btn.swapAgain": "Play again, swap colors",
  "btn.retry": "Try again",
  "btn.retry.note": "start the same two players again",
  "btn.change": "Choose new players",
  "btn.change.note": "the current two keep running until you close their panes",
  "hint.camera": "drag to turn, scroll to zoom",
  "limit.label": "Time limit per move",
  "limit.note": "Each player has this long to send one move. The clock starts when the turn notice reaches the player.",
  "limit.noteOld": "This app does not report when a turn notice reaches a player, so each side's first move is not timed.",
  "model.noteOther": "Not in the list; used as typed.",
  "player.app": "Player app",
  "model.label": "Model",
  "model.cliDefault": "CLI default",
  "model.other": "Other…",
  "model.placeholder": "model name",
  "model.aria": "Model name",
  "btn.start": "Start game",
  "btn.reset.title": "Back to the first view; the board turns slowly again until you drag it",
  "board.aria": "Chess board",
  "versus": "{a}  vs  {b}",
  "stats.moves": "Moves",
  "stats.total": "Total",
  "stats.avg": "Avg",
  "stats.longest": "Longest",
  "stats.illegal": "Illegal",
  "stats.note": "Reply time: from the turn notice reaching the player to its move arriving.",
  "result.line": "{result} · {n} moves",
  "illegal.hint": "Replies that could not be played; the player is asked again.",
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

  "lost.time": "{side} lost on time ({limit} limit).",
  "end.checkmate": "Checkmate. {winner} wins.",
  "end.stalemate": "Draw by stalemate.",
  "end.repetition": "Draw by threefold repetition.",
  "end.insufficient": "Draw: not enough material to mate.",
  "end.fifty": "Draw by the fifty-move rule.",
  "end.default": "The game is over.",
  "end.winner.white": "white",
  "end.winner.black": "black",

  "spawn.failed": "{want} could not start: {reason}",
  "spawn.unknownReason": "unknown reason",
  "spawn.orphaned": "{want} ({name}) is still running from before the app restarted{pid}, but this pane is not connected to it. Open Settings > Add-ons and choose \"Open new\" or \"Leave it\", then start again.",
  "spawn.pid": " (process {pid})",
  "spawn.unknown": "{want} ({name}) was starting when the app stopped{why}, and the app does not reopen it by itself. Open Settings > Add-ons and choose \"Open new\" or \"Leave it\", then start again.",
  "spawn.other": "{want} ({name}) is {state} but has no running agent{why}. Open Settings > Add-ons and choose \"Open\", then start again.",
};

// The Japanese table has exactly the keys of EN (a test holds it to that). Technical terms (CLI, UCI, FEN, SAN, model
// names) and the agent app names stay as they are.
const JA = {
  "side.white": "白",
  "side.black": "黒",
  "side.lower.white": "白",
  "side.lower.black": "黒",
  "player": "プレイヤー",

  "status.choose": "2人のプレイヤーを選んで開始してください。",
  "status.startingPlayers": "2人のプレイヤーを起動しています(Claude は約20秒かかります)。起動中は時計は動きません。",
  "status.stopped": "停止しました: {error}",
  "status.cannotStart": "開始できません: {message}",
  "status.startingLine": "{side}({label})を起動しています… 起動の完了を待っています",
  "still": "前のプレイヤーがまだ動いています。不要なら、そのペインを閉じてください。",

  "turn.sending": "送信中… {secs}秒",
  "turn.thinking": "考え中… {secs}秒",
  "turn.left": "残り {time}",
  "turn.low": "残り {time} 時間わずか",
  "turn.ranOut": "0:00 時間切れ",
  "turn.idle": "—",
  "turn.starting": "起動中…",
  "turn.waiting": "プレイヤーを待っています…",

  "hint.noAnswer": "{side}はまだ返事をしていません(手番の通知から {secs} 秒)。",
  "hint.noAnswerAsked": "{side}はまだ返事をしていません(依頼から {secs} 秒)。",

  "tab.moves": "手順",
  "tab.illegal": "反則({n})",
  "tab.log": "ログ",
  "tab.label": "対局の詳細",
  "moves.no": "#",
  "btn.swap": "⇄ 先後を入れ替える",
  "btn.swap.title": "白と黒で、プレイヤーのアプリとモデルを入れ替えます。",
  "btn.reset": "視点をリセット",
  "btn.reset.title": "最初の視点に戻します。ドラッグするまで、盤はまたゆっくり回ります。",
  "btn.again": "もう一局",
  "btn.again.note": "同じ色、同じプレイヤー",
  "btn.swapAgain": "もう一局(先後を入れ替え)",
  "btn.retry": "やり直す",
  "btn.retry.note": "同じ2人のプレイヤーをもう一度起動します",
  "btn.change": "プレイヤーを選び直す",
  "btn.change.note": "今の2人は、ペインを閉じるまで動き続けます",
  "btn.start": "対局を開始",
  "hint.camera": "ドラッグで回転、スクロールでズーム",
  "board.aria": "チェス盤",
  "limit.label": "1手あたりの持ち時間",
  "limit.note": "各プレイヤーは、この時間内に1手を送ります。時計は、手番の通知がプレイヤーに届いたときに始まります。",
  "limit.noteOld": "このアプリは、手番の通知がプレイヤーに届いたことを報告しないため、各側の最初の1手は計時されません。",
  "model.label": "モデル",
  "model.cliDefault": "CLI のデフォルト",
  "model.other": "その他…",
  "model.placeholder": "モデル名",
  "model.aria": "モデル名",
  "model.noteOther": "一覧にありません。入力どおりに使います。",
  "player.app": "プレイヤーのアプリ",
  "versus": "{a}  vs  {b}",
  "stats.moves": "手数",
  "stats.total": "合計",
  "stats.avg": "平均",
  "stats.longest": "最長",
  "stats.illegal": "反則",
  "stats.note": "返信時間: 手番の通知がプレイヤーに届いてから、その手が届くまで。",
  "result.line": "{result} · {n}手",
  "illegal.hint": "指せなかった返信です。プレイヤーにもう一度依頼します。",
  "illegal.item": "{ply}手目({side}): {text} — {reason}",
  "illegal.unreadable": "手ではない返信",

  "setup.choosePlayer": "{name}のプレイヤーを選んでください。",
  "setup.typeModel": "{name}のモデル名を入力するか、一覧から選んでください。",
  "models.loading": "モデルを読み込んでいます…",
  "models.builtIn": "内蔵の一覧を表示しています: {reason}",
  "limit.seconds": "{n}秒",
  "limit.minute": "1分",
  "limit.minutes": "{n}分",
  "limit.none": "制限なし",

  "starting.none": "{name}…",
  "starting.ready": "{name} 準備完了",
  "starting.failed": "{name}を起動できませんでした",
  "starting.wait": "{name}を起動中… {secs}秒",

  "log.noLimitFirst": "{side}: 最初の1手は持ち時間なし(このアプリは配達の報告ができません)",
  "log.outOfTime": "{who}: 時間切れ",
  "log.lateReply": "{who}: 時間切れの後に届いた返信を無視しました",
  "log.oldReply": "{who}: この対局の開始前に書かれた返信を無視しました",
  "log.unreadable": "{who}: {error}。もう一度依頼します",
  "log.refused": "{who}: {uci} は受け付けられません({reason})。もう一度依頼します",
  "log.move": "{who}: {san}",
  "log.entry": "{name}({side})は {state} です",

  "lost.time": "{side}の時間切れ負けです(持ち時間 {limit})。",
  "end.checkmate": "チェックメイト。{winner}の勝ちです。",
  "end.stalemate": "ステイルメイトで引き分けです。",
  "end.repetition": "同一局面の3回繰り返しで引き分けです。",
  "end.insufficient": "引き分け: チェックメイトに必要な駒が足りません。",
  "end.fifty": "50手ルールで引き分けです。",
  "end.default": "対局は終了しました。",
  "end.winner.white": "白",
  "end.winner.black": "黒",

  "spawn.failed": "{want}を起動できませんでした: {reason}",
  "spawn.unknownReason": "理由は不明です",
  "spawn.orphaned": "{want}({name})は、アプリの再起動前から動き続けていますが{pid}、このペインはつながっていません。Settings > Add-ons を開いて「Open new」か「Leave it」を選んでから、もう一度開始してください。",
  "spawn.pid": "(プロセス {pid})",
  "spawn.unknown": "{want}({name})は、アプリが止まったとき起動中でした{why}。アプリは自動では開き直しません。Settings > Add-ons を開いて「Open new」か「Leave it」を選んでから、もう一度開始してください。",
  "spawn.other": "{want}({name})は {state} ですが、動いているエージェントがありません{why}。Settings > Add-ons を開いて「Open」を選んでから、もう一度開始してください。",
};

const TABLES = { en: EN, ja: JA };
let table = EN;

/** Chooses the table for a language tag: "ja" gets Japanese, anything the pane has no table for gets English. */
export function setLocale(lang) {
  table = TABLES[lang] ?? EN;
  return table === JA ? "ja" : "en";
}

/** The text for `key` with {name} placeholders filled from `vars`; an unknown key shows as itself. */
export function t(key, vars = {}) {
  const text = table[key] ?? EN[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export const LOCALES = Object.keys(TABLES);
export const STRING_KEYS = Object.keys(EN);
export const TABLE_KEYS = (lang) => Object.keys(TABLES[lang] ?? {});
