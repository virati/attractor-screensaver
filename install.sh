#!/usr/bin/env bash
# Install the screensaver as a user service triggered by desktop idle, and put
# Plasma's own idle timers out past it.
#
#   ./install.sh [screensaver_seconds] [displays_off_seconds]
#   ./install.sh 600 3600      # screensaver at 10 min, panels off at 1 hour
#
# Plasma 6 has no screensaver slot of its own, so this replaces the
# idle-to-lock-screen path. The one rule that matters: the screensaver's
# threshold must be the shortest of all the idle timers, or Plasma dims or
# blanks on top of it a few minutes in.
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
IDLE_SECONDS="${1:-600}"
OFF_SECONDS="${2:-3600}"
STOP_SECONDS=$(( OFF_SECONDS > 60 ? OFF_SECONDS - 30 : OFF_SECONDS ))
OFF_MINUTES=$(( (OFF_SECONDS + 59) / 60 ))

if [[ -f /run/.containerenv || -f /.dockerenv ]]; then
  echo "Run this on the host, not inside a container." >&2
  exit 1
fi

[[ $IDLE_SECONDS -lt $OFF_SECONDS ]] || {
  echo "the screensaver timeout ($IDLE_SECONDS s) must be shorter than the display-off timeout ($OFF_SECONDS s)" >&2
  exit 1; }

command -v swayidle >/dev/null || {
  echo "swayidle not found. Install it (it speaks ext-idle-notify-v1, which KWin 6 supports)." >&2
  exit 1
}

# --- units -------------------------------------------------------------------
mkdir -p "$UNIT_DIR"
sed "s|%h/Projects/attractor-screensaver|$ROOT|" \
  "$ROOT/systemd/attractor-screensaver.service" > "$UNIT_DIR/attractor-screensaver.service"
sed -e "s|ATTRACTOR_IDLE_SECONDS=600|ATTRACTOR_IDLE_SECONDS=$IDLE_SECONDS|" \
    -e "s|ATTRACTOR_STOP_SECONDS=3570|ATTRACTOR_STOP_SECONDS=$STOP_SECONDS|" \
  "$ROOT/systemd/attractor-idle.service" > "$UNIT_DIR/attractor-idle.service"

systemctl --user daemon-reload
systemctl --user enable --now attractor-idle.service

# --- window rules ------------------------------------------------------------
# A Wayland client cannot choose which monitor it opens on, so KWin is told with
# a rule per display, generated from the current layout. The rules match on
# window class, set by the launcher with --class, because a rule is evaluated
# when the window is mapped and the page's title does not exist until it loads.
#
# Rule value 1 is Force, which is the one that works; 2 (Apply) was tried and
# the window did not land. Existing rules are preserved: only ids starting with
# attractors- are rewritten, and re-running removes stale ones.
if command -v kwriteconfig6 >/dev/null && command -v kscreen-doctor >/dev/null \
   && command -v jq >/dev/null; then
  RULE_IDS=()
  i=0
  while IFS=$'\t' read -r NAME X Y W H; do
    [[ -n "$NAME" ]] || continue
    ID="attractors-$i"
    RULE_IDS+=("$ID")
    kwriteconfig6 --file kwinrulesrc --group "$ID" --key Description \
      "Attractor screensaver - $NAME"
    kwriteconfig6 --file kwinrulesrc --group "$ID" --key wmclass "$ID"
    kwriteconfig6 --file kwinrulesrc --group "$ID" --key wmclassmatch 1
    kwriteconfig6 --file kwinrulesrc --group "$ID" --key wmclasscomplete false
    kwriteconfig6 --file kwinrulesrc --group "$ID" --key position "$X,$Y"
    kwriteconfig6 --file kwinrulesrc --group "$ID" --key positionrule 1
    kwriteconfig6 --file kwinrulesrc --group "$ID" --key size "$W,$H"
    kwriteconfig6 --file kwinrulesrc --group "$ID" --key sizerule 1
    for k in above noborder skiptaskbar skipswitcher skippager; do
      kwriteconfig6 --file kwinrulesrc --group "$ID" --key "$k" true
      kwriteconfig6 --file kwinrulesrc --group "$ID" --key "${k}rule" 1
    done
    i=$((i + 1))
  done < <(kscreen-doctor -j | jq -r '
    .outputs | map(select(.enabled)) | sort_by(.priority) | .[]
    | . as $o | (($o.scale // 1)) as $s
    | (if ($o.rotation == 2 or $o.rotation == 8)
       then [($o.size.height / $s), ($o.size.width / $s)]
       else [($o.size.width / $s), ($o.size.height / $s)] end) as $wh
    | "\($o.name)\t\($o.pos.x)\t\($o.pos.y)\t\($wh[0] | round)\t\($wh[1] | round)"')

  # Keep whatever rules were already there, drop our own stale ones, add ours.
  EXISTING="$(kreadconfig6 --file kwinrulesrc --group General --key rules 2>/dev/null || true)"
  KEPT=""
  IFS=',' read -ra OLD_IDS <<< "$EXISTING"
  for id in ${OLD_IDS[@]+"${OLD_IDS[@]}"}; do
    [[ -z "$id" || "$id" == attractors-* ]] && continue
    KEPT="${KEPT:+$KEPT,}$id"
  done
  ALL="$KEPT"
  for id in "${RULE_IDS[@]}"; do ALL="${ALL:+$ALL,}$id"; done
  kwriteconfig6 --file kwinrulesrc --group General --key rules "$ALL"
  kwriteconfig6 --file kwinrulesrc --group General --key count \
    "$(awk -F, '{print NF}' <<< "$ALL")"
  RULE_COUNT=${#RULE_IDS[@]}
else
  RULE_COUNT=0
fi

# --- Plasma's own timers -----------------------------------------------------
# Only the AC profile is touched. A GPU-saturating WebGL page is not what you
# want draining a laptop on idle, so the battery profile is left alone.
if command -v kwriteconfig6 >/dev/null; then
  kwriteconfig6 --file powerdevilrc --group AC --group Display \
    --key DimDisplayIdleTimeoutSec -- -1
  kwriteconfig6 --file powerdevilrc --group AC --group Display \
    --key TurnOffDisplayIdleTimeoutSec "$OFF_SECONDS"
  # kscreenlockerrc counts in minutes, unlike everything in powerdevilrc.
  kwriteconfig6 --file kscreenlockerrc --group Daemon --key Timeout "$OFF_MINUTES"

  QDBUS="$(command -v qdbus-qt6 || command -v qdbus6 || command -v qdbus || true)"
  if [[ -n "$QDBUS" ]]; then
    "$QDBUS" org.kde.Solid.PowerManagement /org/kde/Solid/PowerManagement \
      refreshStatus >/dev/null 2>&1 || true
    "$QDBUS" org.kde.screensaver /ScreenSaver configure >/dev/null 2>&1 || true
    "$QDBUS" org.kde.KWin /KWin reconfigure >/dev/null 2>&1 || true
  fi
fi

cat <<EOF

Installed.
  units          $UNIT_DIR/attractor-{idle,screensaver}.service
  screensaver    ${IDLE_SECONDS}s idle  (one instance per display)
  window rules   ${RULE_COUNT} written to kwinrulesrc, one per display
                 re-run this after changing monitors or their arrangement
  stops again    ${STOP_SECONDS}s idle  (just before the panels go dark)
  displays off   ${OFF_SECONDS}s idle   (Plasma, AC profile)
  lock screen    ${OFF_MINUTES} min     (so it locks as the panels go dark)
  dimming        disabled on AC, it was landing on top of the screensaver

  try it now     systemctl --user start attractor-screensaver.service
  logs           journalctl --user -u attractor-idle -u attractor-screensaver -f
  change it      ./install.sh <screensaver_seconds> <displays_off_seconds>
  uninstall      systemctl --user disable --now attractor-idle.service &&
                 rm $UNIT_DIR/attractor-{idle,screensaver}.service

  The battery profile is untouched; set it in System Settings if you want the
  screensaver off the battery too.
EOF
