#!/bin/bash
# Removes only what try-chess.command made. Close the app window first.
# Notes: this never closes or kills any app. If another kit's chess try-it app is running, it is named (file name, pid) as a
# warning only; it keeps using CPU and GPU until it is quit from its own window.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
KIT="${CHESS_KIT_NAME:-chesstest5}"; APPBIN="${CHESS_KIT_APP:-agmsg-chess-try5}"; KITID="${CHESS_KIT_ID:-cc.agmsg.chess-try5}"  # same knobs as try-chess.command
BASE="$HOME/.agents/skills/$KIT"
REAL="$HOME/.agmsg/$KIT"                # where the install really is; BASE is a link to it
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
if pgrep -f "$HERE/app/$APPBIN" >/dev/null; then echo "! the try-it app is still running; close its window first." >&2; exit 1; fi
if [ -e "$BASE" ] && [ ! -f "$MARK" ]; then echo "! $BASE was not made by try-chess.command; leaving it." >&2; exit 1; fi
if [ -f "$MARK" ]; then
  while IFS= read -r line; do
    f="${line#cmdfile=}"
    case "$line" in cmdfile=*/"$KIT.md") [ -f "$f" ] && rm "$f" && echo "removed $f" ;; esac
  done < "$MARK"
  # The agents' own folders: the names come from this install's journal; only ~/agmsg-agents/<name> is touched.
  if [ -f "$BASE/addons/agents-journal.json" ]; then
    python3 -I - "$BASE/addons/agents-journal.json" <<'PY' | while IFS= read -r name; do
import json, re, sys
for e in json.load(open(sys.argv[1])).get("entries", []):
    if e.get("kind") == "agent" and re.fullmatch(r"[A-Za-z0-9._-]+", e.get("name", "")): print(e["name"])
PY
      d="$HOME/agmsg-agents/$name"
      # Only a folder this run created: one that was there before it started may be somebody else's.
      if [ ! -f "$HERE/.run/agents-before.txt" ]; then [ -d "$d" ] && echo "kept $d (no record of what existed before the run)"
      elif grep -qxF -- "$name" "$HERE/.run/agents-before.txt"; then [ -d "$d" ] && echo "kept $d (it existed before the run)"
      else [ -d "$d" ] && rm -r "$d" && echo "removed $d"; fi
    done
  fi
  if [ -L "$BASE" ]; then rm "$BASE" && echo "removed the link $BASE"; else rm -r "$BASE" && echo "removed $BASE"; fi
fi
[ -f "$REAL/.chess-try" ] && rm -r "$REAL" && echo "removed $REAL"
for d in "$HOME/Library/Application Support/$KITID" "$HOME/Library/Caches/$KITID" "$HOME/Library/WebKit/$KITID" "$HOME/Library/HTTPStorages/$KITID" "$HOME/Library/Preferences/$KITID.plist" "$HOME/Library/WebKit/$APPBIN" "$HOME/Library/Caches/$APPBIN" "$HOME/Library/HTTPStorages/$APPBIN"; do
  [ -e "$d" ] && rm -r "$d" && echo "removed $d"
done
rm -r "$HERE/.run" 2>/dev/null && echo "removed $HERE/.run"
echo "done. (The ~/.agmsg/config and your real agmsg install were never touched. The kit itself, $HERE, stays; delete it if you like.)"
