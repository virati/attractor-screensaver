# Installing on KDE Plasma 6 (Bazzite / Kinoite)

Plasma 6 has no screensaver of its own — the lock screen is it. This replaces
the idle-to-lock-screen path with the attractors, and leaves the lock screen
itself alone for when you actually lock.

Two pieces: install the units, then push Plasma's own idle timers out past them.

## 1. Install the units

`install.sh` refuses to run inside a container, and on an image-based system
Claude Code and most shells live in a toolbox — so reach the host explicitly:

```sh
flatpak-spawn --host ~/Projects/attractor-screensaver/install.sh 600 3600
```

The first number is when the screensaver starts, the second when the displays
turn off, both in seconds. Re-run with different numbers to change them.

Since the installer now sets Plasma's timers itself, section 2 below is done for
you on AC; it is kept as a description of what was changed and why.

Try it without waiting:

```sh
flatpak-spawn --host systemctl --user start attractor-screensaver.service
```

Prerequisites, both already present on a stock Bazzite install:

| | |
|---|---|
| `swayidle` | `/usr/bin/swayidle` on the host; speaks `ext-idle-notify-v1`, which KWin 6 implements |
| a browser | native Chromium/Chrome/Brave/Edge, or Flatpak — `com.google.Chrome` works, Firefox is the fallback |

## 2. Get Plasma's idle timers out of the way

This is the part that actually matters. Out of the box Plasma dims, blanks and
locks on timers that will land on top of the screensaver and kill it a few
minutes in. Stock values on this machine were:

| | was | what it did |
|---|---|---|
| Dim display | 300 s | dimmed the attractors at the exact moment they started |
| Turn off display | 600 s | blanked them five minutes in |
| Autolock | 600 s | lock screen took over five minutes in |

The rule is just: **the screensaver's idle threshold must be the shortest one.**
For a 300 s screensaver, dim off and everything else at 30 minutes:

```sh
flatpak-spawn --host kwriteconfig6 --file powerdevilrc \
  --group AC --group Display --key DimDisplayIdleTimeoutSec -- -1
flatpak-spawn --host kwriteconfig6 --file powerdevilrc \
  --group AC --group Display --key TurnOffDisplayIdleTimeoutSec 1800
flatpak-spawn --host kwriteconfig6 --file kscreenlockerrc \
  --group Daemon --key Timeout 30
```

Note the doubled `--group`: `powerdevilrc` nests its sections per power profile,
so the key lives under `[AC][Display]`, not `[Display]`. `-- -1` disables
dimming; the bare `--` keeps `kwriteconfig6` from reading `-1` as a flag. The
lock timeout in `kscreenlockerrc` is in **minutes**, unlike everything in
`powerdevilrc`.

Make both daemons pick it up without logging out:

```sh
flatpak-spawn --host qdbus-qt6 org.kde.Solid.PowerManagement \
  /org/kde/Solid/PowerManagement refreshStatus
flatpak-spawn --host qdbus-qt6 org.kde.screensaver /ScreenSaver configure
```

All of this is equally reachable through System Settings → Power Management and
→ Screen Locking, if you'd rather click.

### Leave the battery profile alone

`[Battery]` is a separate set of keys, and a GPU-saturating WebGL page is not
what you want draining a laptop on idle. Keep its timers short, or don't install
the idle watcher at all and just run `bin/attractors` by hand when plugged in.

## Living with it

```sh
flatpak-spawn --host journalctl --user -u attractor-idle -u attractor-screensaver -f
```

Options go on the `ExecStart` line in
`~/.config/systemd/user/attractor-screensaver.service` — e.g.
`bin/attractors --idle duration=30 theme=dark hud=0`. Run
`systemctl --user daemon-reload` after editing. Note that `install.sh` rewrites
that file, so re-running it drops your edits.

Uninstall:

```sh
flatpak-spawn --host systemctl --user disable --now attractor-idle.service
rm ~/.config/systemd/user/attractor-{idle,screensaver}.service
```

Then put the Plasma timers back where you like them.
