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

# --- leftover window rules ---------------------------------------------------
# An earlier version placed the windows with KWin rules. They never took -- the
# window class is derived from the URL and changes every run, and a title rule
# is evaluated before the page has set the title -- so they are removed rather
# than left lying in the config.
if command -v kwriteconfig6 >/dev/null; then
  EXISTING="$(kreadconfig6 --file kwinrulesrc --group General --key rules 2>/dev/null || true)"
  KEPT=""
  IFS=',' read -ra OLD_IDS <<< "$EXISTING"
  for id in ${OLD_IDS[@]+"${OLD_IDS[@]}"}; do
    [[ -z "$id" || "$id" == attractors-* ]] && continue
    KEPT="${KEPT:+$KEPT,}$id"
  done
  if [[ "$KEPT" != "$EXISTING" ]]; then
    kwriteconfig6 --file kwinrulesrc --group General --key rules "$KEPT"
    kwriteconfig6 --file kwinrulesrc --group General --key count \
      "$(awk -F, '{n=0; for(i=1;i<=NF;i++) if($i!="") n++; print n}' <<< "$KEPT")"
    for g in $(seq 0 7); do
      kwriteconfig6 --file kwinrulesrc --group "attractors-$g" --key Description --delete 2>/dev/null || true
    done
  fi
fi

# --- tiling scripts ----------------------------------------------------------
# A tiling script re-tiles windows as they appear and will drag the screensaver
# back out of position whatever a window rule forces. krohnkite takes a list of
# titles to leave alone; the entry is added without disturbing any already
# there. Other tilers will need the same thing done by hand.
if command -v kwriteconfig6 >/dev/null && \
   grep -q 'krohnkiteEnabled=true' "${XDG_CONFIG_HOME:-$HOME/.config}/kwinrc" 2>/dev/null; then
  KROHN="$(kreadconfig6 --file kwinrc --group Script-krohnkite --key ignoreTitle 2>/dev/null || true)"
  case ",$KROHN," in
    *,Attractors,*) ;;
    *) kwriteconfig6 --file kwinrc --group Script-krohnkite --key ignoreTitle \
         "${KROHN:+$KROHN,}Attractors"
       echo "krohnkite: added Attractors to ignoreTitle" ;;
  esac
  TILER_NOTE="krohnkite told to leave windows titled Attractors alone"
else
  TILER_NOTE="no krohnkite found; a tiling script would need telling to ignore these windows"
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
  placement      a KWin script written each time the screensaver starts, from
                 the display layout at that moment
  tiling         ${TILER_NOTE}
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
