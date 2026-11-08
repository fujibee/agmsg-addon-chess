#!/bin/bash
# Try the chess add-on in a copy of the agmsg app that has its own identity and its own agmsg install.
# It never touches your real agmsg app data or ~/.agents/skills/agmsg. What it makes is listed below and removed
# by cleanup-chess-try.sh next to this file.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
# This kit has its own names (chesstest5 / agmsg-chess-try5 / cc.agmsg.chess-try5), so it never reuses or removes
# an earlier kit's side install, app data or command file.
KIT="${CHESS_KIT_NAME:-chesstest5}"           # the side install's name and the players' /command
APPBIN="${CHESS_KIT_APP:-agmsg-chess-try5}"   # the app's file name under app/
KITID="${CHESS_KIT_ID:-cc.agmsg.chess-try5}"  # the app's identifier (its own data folders)
BASE="$HOME/.agents/skills/$KIT"             # the side agmsg install the app and the two players use
# The install itself lives in ~/.agmsg/$KIT and BASE is one link to it: Codex watches ~/.agents/skills, and
# agmsg state written inside a real skill dir there makes every Codex session reload its skills (measured 11-04).
REAL="$HOME/.agmsg/$KIT"
# The players start in a fresh login shell, which may pick a different Claude Code config than this window did, so
# the /$KIT command goes into every config dir that exists here: $CLAUDE_CONFIG_DIR (if set) and ~/.claude.
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CFGS="$CFG"; [ "$HOME/.claude" != "$CFG" ] && [ -d "$HOME/.claude" ] && CFGS="$CFGS $HOME/.claude"
PINNED="1.7.1"                               # the core version this app build expects (keeps its "Update" banner away)
MARK="$BASE/.chess-try"

# Other try-it kits' apps that are running right now: a warning only. Nothing is stopped or closed here.
warn_other_kit_apps() {
  local pid name found=0
  for pid in $(pgrep -f "/app/agmsg-chess-try" 2>/dev/null); do
    name="$(ps -o command= -p "$pid" 2>/dev/null | awk '{print $1}')"
    case "$name" in */app/agmsg-chess-try*) ;; *) continue ;; esac
    [ "$name" = "$HERE/app/$APPBIN" ] && continue
    if [ "$found" = 0 ]; then echo "! another chess try-it app is running (this does not stop the launch, and nothing is closed for you):" >&2; found=1; fi
    echo "    $(basename "$name")  pid $pid  ($(ps -o pcpu= -p "$pid" 2>/dev/null | tr -d ' ')% CPU now)" >&2
  done
  [ "$found" = 1 ] && echo "  Each one keeps using CPU and GPU in the background. To close one: quit it from its window (Cmd+Q), then run the cleanup-chess-try.sh of its own kit." >&2
  return 0
}
warn_other_kit_apps

# Never reuse or take over an install that is already there: it may be somebody's game in progress.
if [ -e "$BASE" ]; then
  echo "! $BASE already exists. If you made it with an earlier run, close the app and run cleanup-chess-try.sh first; if not, leave it alone. Stopping." >&2
  exit 1
fi
if pgrep -f "$HERE/app/$APPBIN" >/dev/null; then
  echo "! the try-it app is already running; close its window first. Stopping." >&2
  exit 1
fi
if [ -e "$REAL" ] && [ ! -f "$REAL/.chess-try" ]; then
  echo "! $REAL exists and was not made by this script; leaving it alone. Stop here." >&2
  exit 1
fi

if [ ! -d "$BASE" ]; then
  echo "== making the side install at $REAL, linked from $BASE (copy only; no install.sh, nothing else on your machine changes)"
  mkdir -p "$REAL"
  ln -s "$REAL" "$BASE"
  mkdir -p "$BASE"/scripts "$BASE"/db "$BASE"/agents "$BASE"/plugins "$BASE"/types
  cp -R "$HERE/core/scripts/." "$BASE/scripts/"
  chmod +x "$BASE"/scripts/*.sh
  # Render the skill and the Claude command the way install does (shared base + the type's overlay, named $KIT).
  render() { ( SCRIPT_DIR="$BASE"; . "$BASE/scripts/lib/type-registry.sh"; . "$BASE/scripts/lib/skill-render.sh"; agmsg_render_skill "$1" "$KIT" "$2" ); }
  render codex "$BASE/SKILL.md" || { echo "! could not render the skill; stopping." >&2; exit 1; }
  cp "$HERE/core/plugins/README.md" "$BASE/plugins/README.md"
  cp "$HERE/core/uninstall.sh" "$BASE/uninstall.sh"
  cp "$HERE/core/openai.yaml" "$BASE/agents/openai.yaml"
  echo "$PINNED" > "$BASE/VERSION"
  touch "$BASE/.agmsg"
  bash "$BASE/scripts/config.sh" show >/dev/null
  : > "$MARK"
  for c in $CFGS; do
    f="$c/commands/$KIT.md"
    if [ -d "$c" ] && [ ! -e "$f" ]; then
      mkdir -p "$c/commands"
      render claude-code "$f" || { echo "! could not render the command file; stopping." >&2; exit 1; }
      echo "cmdfile=$f" >> "$MARK"
    fi
  done
fi
CMDFILES=""; for c in $CFGS; do [ -f "$c/commands/$KIT.md" ] && CMDFILES="$CMDFILES $c/commands/$KIT.md"; done
if [ ! -d "$BASE/teams/chess-try" ]; then
  mkdir -p "$BASE/room"
  bash "$BASE/scripts/join.sh" chess-try you agmsg-app "$BASE/room" >/dev/null
fi
[ -n "$CMDFILES" ] || echo "! no /$KIT command file exists in $CFGS: the two players will not find it." >&2

mkdir -p "$HERE/.run"
# The players work in ~/agmsg-agents/<name>, folders every kit and every game shares. Remember which exist now, so
# the cleanup only removes the ones this run created.
ls -1 "$HOME/agmsg-agents" 2>/dev/null > "$HERE/.run/agents-before.txt"
cat > "$HERE/.run/load-chess.js" <<JS
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const internals = window.__TAURI_INTERNALS__;
  const real = internals.invoke.bind(internals);
  const say = (m) => real("plugin:event|emit", { event: "e2e-report", payload: String(m) }).catch(() => {});
  try {
    await say("loading the chess add-on...");
    for (let i = 0; i < 240 && !document.querySelector("button"); i++) await sleep(500);
    await sleep(2500);
    await real("addon_dev_load", { spec: { path: "$HERE/chess" } });
    await real("plugin:event|emit", { event: "addon-updated", payload: null });
    await say("chess add-on loaded: open it from the + menu");
  } catch (e) { await say("could not load the chess add-on by itself (" + (e && e.message ? e.message : JSON.stringify(e)) + "): use Settings > Add-ons > developer folder, pick $HERE/chess"); }
})();
JS

cat <<MSG

== what this points at
   app           $HERE/app/$APPBIN   (own identity $KITID; your real agmsg app's data is not used)
   agmsg install $BASE   (side copy; your real ~/.agents/skills/agmsg is never read or written)
   claude config $CFGS   (your real one(s); players run as you; only file added, if missing: commands/$KIT.md in each)
   chess add-on  $HERE/chess   (loaded as a developer add-on)
   app log       $HERE/.run/app.log   (the app's stderr, including the agent state transitions with wall-clock times)
   note          the app appends a line to ~/Library/Logs/agmsg/path-import.log (shared log, harmless)
== what to click
   1. In the window open the team "chess-try" (left column).
   2. Click the + at the top of the panes > "Add-on pane > Chess" and press Allow on the two cards
      (tick the box on the second one to trust ~/agmsg-agents so the players do not stop at "Do you trust this folder?").
   3. Pick White and Black (CLI and model), press Start game. If a player's pane asks to trust the folder, press Enter there.
   4. Look at the time-limit choices next to Start game (30 s, 1 min, 2 min = default, 5 min, none).
   NOTE: the chess add-on has no Japanese yet (its text is English only, whatever the app language is).
   Do NOT click an "Update" banner if one shows (it would update your real agmsg install).
== when done: close the window, then run
   bash "$HERE/cleanup-chess-try.sh"
MSG

echo "app log: $HERE/.run/app.log"
AGMSG_APP_BASE="$BASE" AGMSG_CONFIG="$BASE/db/config.yaml" AGMSG_STORAGE_PATH="$BASE/db" \
  AGMSG_ADDON_E2E="$HERE/.run/load-chess.js" "$HERE/app/$APPBIN" 2> "$HERE/.run/app.log"
echo
echo "The window closed. To remove everything this made: bash \"$HERE/cleanup-chess-try.sh\""
