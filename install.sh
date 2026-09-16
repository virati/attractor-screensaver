#!/usr/bin/env bash
# Install the screensaver as a user service triggered by desktop idle.
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
IDLE_SECONDS="${1:-300}"

if [[ -f /run/.containerenv || -f /.dockerenv ]]; then
  echo "Run this on the host, not inside a container." >&2
  exit 1
fi

command -v swayidle >/dev/null || {
  echo "swayidle not found. Install it (it speaks ext-idle-notify-v1, which KWin 6 supports)." >&2
  exit 1
}

mkdir -p "$UNIT_DIR"
sed "s|%h/Projects/attractor-screensaver|$ROOT|" \
  "$ROOT/systemd/attractor-screensaver.service" > "$UNIT_DIR/attractor-screensaver.service"
sed "s|ATTRACTOR_IDLE_SECONDS=300|ATTRACTOR_IDLE_SECONDS=$IDLE_SECONDS|" \
  "$ROOT/systemd/attractor-idle.service" > "$UNIT_DIR/attractor-idle.service"

systemctl --user daemon-reload
systemctl --user enable --now attractor-idle.service

cat <<EOF

Installed.
  units      $UNIT_DIR/attractor-{idle,screensaver}.service
  idle after ${IDLE_SECONDS}s
  try it now systemctl --user start attractor-screensaver.service
  logs       journalctl --user -u attractor-idle -u attractor-screensaver -f
  change the timeout by re-running: ./install.sh <seconds>
  uninstall  systemctl --user disable --now attractor-idle.service && rm $UNIT_DIR/attractor-{idle,screensaver}.service
EOF
