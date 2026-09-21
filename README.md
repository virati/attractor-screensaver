# Strange Attractor Screensaver

Forty-three strange attractors, integrated and drawn entirely on the GPU, cycling
one after another as a screensaver. A direct port of Ricky Reusser's
[*Strange Attractors on the GPU, Part 2*](https://observablehq.com/@rreusser/strange-attractors-on-the-gpu-part-2)
— same systems, same parameters, same Runge–Kutta-on-a-texture trick — rebuilt as
a dependency-free WebGL2 page with a director that keeps it interesting for hours.

Each system holds the screen for five minutes, with a panel in the top right
that says where it came from and what it was built to describe, creeping upward
at reading pace.

![Halvorsen](preview/halvorsen.jpg)
![Lorenz](preview/lorenz.jpg)

## Run it

```sh
bin/attractors              # interactive window
bin/attractors --idle       # screensaver mode: no cursor, any input dismisses it
bin/attractors --continuous # parameters drift while each system plays
bin/attractors --bright     # designed backgrounds instead of OLED true black
bin/attractors --all-displays   # one instance per monitor
```

The launcher starts a throwaway static server on localhost and opens a kiosk
browser window at it. It finds Chromium, Chrome, Brave, Edge or Firefox, native
or Flatpak; set `ATTRACTORS_BROWSER` to override.

You can also build a single self-contained file and open it anywhere:

```sh
node tools/build-single.mjs     # -> dist/attractors.html
```

## Install as the actual screensaver

```sh
./install.sh 600 3600       # screensaver at 10 min, displays off at 1 hour
```

The first number is when the screensaver starts, the second when Plasma turns
the panels off. The installer also stops the screensaver 30 seconds before that,
so a GPU-saturating page is not left rendering into a switched-off OLED all
night, disables dimming on AC (it was landing on top of the screensaver) and
sets the lock screen to match the display-off time. Only the AC profile is
touched.

## More than one display

**This does not work yet on KWin.** `--all-displays` starts one browser per
monitor and they do start, but the compositor-side placement below has no
effect here, so both windows land wherever KWin puts them and one ends up on
top of the other. The installed screensaver runs a single window until this is
fixed. What is known: the placement script loads and `isScriptLoaded` reports
true, but a script that tiles every window with a matching title moves nothing
while both windows are up, through any of `workspace.windowList()`,
`workspace.windows`, `workspace.stackingOrder` or `workspace.clientList()`. The
next thing to try is declarative rules in `kwinrulesrc`, which the compositor
applies when the window is mapped rather than from a script reacting to signals.

## More than one display, as designed

`--all-displays` runs one instance per monitor. Each gets its own share of the
systems — the list is sliced on its canonical order before being shuffled, so
two displays are never showing the same attractor at the same time.

A Wayland client cannot choose which monitor it opens on, so the compositor has
to be told. The launcher loads a KWin script for the life of the session that
matches each window by title and pins it to one output's logical rectangle.
Nothing is written to `kwinrulesrc`, so your own window rules are untouched, and
unloading the script on exit leaves no trace. `ATTRACTORS_PLACE=0` skips that
step, which is the only option on a compositor that is not KWin.

Two things there are worth knowing. The launches are staggered by two seconds:
fired at once, two `flatpak run` invocations race through instance setup and one
of them dies. And placement re-runs for every window on every window event
rather than hooking one window's title change — Chromium sets its real title a
beat after the window is mapped, and hooking a single window races that.

This writes two systemd user units. `attractor-idle.service` runs `swayidle`,
which listens on `ext-idle-notify-v1` (KWin 6 speaks it, as do the wlroots
compositors) and starts `attractor-screensaver.service` when the session goes
quiet. Touching anything makes the page call `/__quit`, which tears the server
and the browser window down together; `swayidle`'s resume hook stops the unit as
a backstop.

```sh
systemctl --user start attractor-screensaver.service   # try it now
journalctl --user -u attractor-idle -u attractor-screensaver -f
```

Run `install.sh` on the host, not inside a toolbox or container.

## Controls

Interactive mode only — in `--idle` mode any input dismisses the screensaver.

| | |
|---|---|
| <kbd>←</kbd> <kbd>→</kbd> | previous / next attractor |
| <kbd>R</kbd> | reroll the palette, camera and line style |
| <kbd>space</kbd> | hold on this one |
| <kbd>H</kbd> | hide the overlay |
| <kbd>I</kbd> | hide the history panel on its own |
| <kbd>F</kbd> | fullscreen |
| drag / scroll | orbit / zoom |
| scroll over the panel | read at your own pace; auto-scroll resumes after 12s |

## Options

Passed as query parameters, or as bare arguments to `bin/attractors`:

```sh
bin/attractors --idle duration=30 theme=dark particles=2048
```

| | default | |
|---|---|---|
| `duration` | `300` | seconds per attractor; `0` holds the first one forever |
| `fade` | `1.4` | seconds of cross-fade between attractors |
| `theme` | `any` | `dark`, `paper`, or `any` |
| `oled` | `1` | `0` restores the designed backgrounds and the light palettes |
| `attractor` | — | pin the opening system, e.g. `attractor=Lorenz` |
| `particles` | `1024` | trajectories simulated in parallel |
| `steps` | `180` | samples per trail, i.e. how long the comet tails are (2–512) |
| `speed` | `1` | integration steps per display frame |
| `dpr` | `2` | device-pixel-ratio ceiling |
| `hud` | `1` | `0` hides the name and equations |
| `history` | `1` | `0` hides the history panel |
| `continuous` | — | drift the parameters instead of holding them fixed |
| `sweep` | `0.12` | drift amplitude, as a fraction of each published value |
| `sweepPeriod` | `55` | seconds for the base drift cycle |
| `seed` | — | repeat a run exactly: same palette, camera and playlist |
| `blend` | — | `1` blends the soft edge instead of alpha-to-coverage; see below |
| `colorBy` | random 0 or 1 | `0` colours by the particle's seed radius, `1` by its index |
| `width` | random 4–11 | stroke thickness, in pixels |
| `taper` | random 0.1–0.6 | how sharply the stroke narrows toward the tail |
| `tailFade` | random 0.08–0.42 | how quickly the tail fades out |

## OLED power

Backgrounds are driven to true black by default, because this is meant to run
unattended on an OLED panel and a pixel at zero draws no current at all. Two
things change from the palettes as designed:

- every dark ground drops from its near-black (`#07090e`, `#0b0605`, …) to
  `#000000`, and the grid room — the largest lit area after the trails — is
  dimmed from 0.32 to 0.18;
- the three light palettes are dropped from the default pool. A light scheme
  cannot be made frugal, only avoided: its ink is dark, so a black ground would
  leave nothing visible.

Measured over a headless 1600×900 render of the same system:

| | mean panel luminance | pixels drawing nothing |
|---|---|---|
| default | **7.8%** | 55% |
| `--bright`, dark palette | 8.3% | 0% |
| `--bright`, light palette | 92.1% | 0% |

The near-blacks were never the main cost — dropping them to zero moves mean
luminance by about half a point, though it does take 55% of the panel to fully
off, which is worth more than that half point suggests since an OLED subpixel
at zero is switched off rather than driven dim. The real saving is the light
palettes: three of the fifteen, so one shot in five used to be a near-white
screen. Averaged over a session that is roughly 25% mean luminance before
against 7.8% after.

`--bright` (or `oled=0`) restores the original behaviour. An explicit
`theme=paper` is still honoured either way — asking for a light ground outright
is taken to mean you want one.

## Edges and colour, against the notebook

The notebook these came from looks smoother, and it is worth writing down what
was tried about that, because most of it did not work.

**The colour scheme is not the difference.** The notebook offers the same two
choices as this does and defaults to the same one — its `colorBy` prop is a
`vec4` but only ever gets `[0,0,1,0]` or `[0,0,0,1]`, colouring by the
particle's seed radius or by its index. `colorBy` here now takes any value
between the two, which the notebook cannot do, but that is a new knob rather
than a repair.

**The edges are the difference, and it cannot be had cheaply.** This resolves
the soft edge of its stroke with alpha-to-coverage, which turns the alpha into a
multisample coverage mask. That keeps the pass opaque, so trails depth-test
against each other with no sorting at all — but coverage has only about as many
levels as the buffer has samples, applied through a fixed dither, so every cap
and joint edge is quantised and stair-steps.

`blend=1` swaps that for real alpha blending, which resolves the edge at full
precision. It looks worse. The joints are separate discs drawn underneath the
segments, and they stay invisible only while the segments are painted over them
opaquely; blended, every disc shows through and the trails read as chains of
beads. Moving the tail fade into alpha, which is what the notebook does, makes
it worse again for the same reason. Both were tried and backed out. Doing this
properly needs a depth pre-pass so only the nearest fragment blends, which is a
second pass over every segment.

**Banding.** The tail fade mixes toward the background, and against a true-black
ground the dark end of that ramp has few 8-bit values left to walk. There is now
a sub-step ordered dither on the output, which is correct and free — it raises
the distinct-colour count of a frame by about 4% — but on a dense attractor
there is no large smooth gradient for it to fix, and at 5x zoom it is not
visible. It will matter on a sparse, long-tailed setting.

## The trail

`steps` is the trail length: how many past positions of each particle are drawn
behind it. Each trail is one trajectory, so cutting `steps` and raising
`particles` trades comet tails for a swarm of separate moving things.

```sh
bin/attractors steps=5 particles=1400 width=3 taper=0.1 tailFade=0.95
```

The last three are normally rerolled every shot, along with the palette and the
camera move. Giving one pins it; the others keep varying, and the random draw is
still made either way so pinning one does not change the values the rest get.

`steps` is now honoured at every rung of the quality ladder. The ladder sheds
work when frames run long by dropping trajectories, not by shortening trails —
its rungs used to carry step counts of their own (90, 120, 150), which meant a
request for short tails was silently overruled the first time a frame ran long,
and stayed overruled, since a rung once lost is never climbed back to.

## The history panel

The panel in the top right carries two or three paragraphs on the system
currently on screen: who derived it, what problem it came out of, and what is
worth knowing about how it behaves. It holds at the top for a few seconds,
walks up at about one line every two seconds, rests at the end and starts
again — roughly three passes in a five-minute stint. It scrolls itself because
in `--idle` mode there is nobody to scroll it: touching the mouse dismisses the
whole window.

The text lives in [`src/history.js`](src/history.js), keyed by attractor name,
alongside the sources it was written from. Nine entries carry a `caveat` line,
shown in italics at the end: these are systems that circulate through
visualisation tools under names the primary literature does not clearly
confirm, and the panel says so rather than inventing a citation. Two of them —
`Lorenz Mod 1` and `Lorenz Mod 2` — have no traceable source paper at all, and
their notes are drawn from reading the equations.

While the notes were being written it turned out that `Four-wing` and
`Wang-Sun` are the same system: identical equations, identical parameters,
entered twice under different names. Both entries say so.

## Continuous mode

`--continuous` stops treating the published parameter values as fixed and lets
them wander. Each parameter rides the sum of two slow sinusoids centred on its
published value, with incommensurate periods chosen so the combination never
repeats, so the shape is always changing and never jumps.

The motion is deliberately confined to about 12% either side of the published
values. Those values are the ones known to put each system on its attractor;
ranging further would mostly find the parameter regions where the attractor
collapses to a fixed point or escapes to infinity. Both sinusoids start at zero
phase, so the drift begins exactly where the spin-up left off.

Because the attractor changes size as well as shape, the camera re-frames every
four seconds from a 128-trajectory sample of the trail buffer, slewed in rather
than snapped. The parameter line under the title becomes a live readout,
rewritten four times a second.
| `idle` | off | screensaver behaviour |

Resolution adapts on its own: the renderer watches frame cost and moves up or
down a five-rung quality ladder, but only ever between attractors, where the
change is hidden by the fade.

## How it works

**State.** One `RGBA32F` texture, `steps` wide by `particles` tall. Texel
`(column, row)` is where trajectory `row` was at trail slot `column`. Columns are
a ring buffer.

**Integration.** Each frame a fragment shader reads the head column, takes a
4th-order Runge–Kutta step through the attractor's derivative — compiled into the
shader from the system's own GLSL source — and writes a one-pixel-wide column,
which is then blitted back into the ring. Trajectories that escape are pulled
back along their ray; ones that go non-finite are re-seeded.

**Drawing.** Every segment and every joint is an instanced quad whose corners the
vertex shader places in *screen* space, so stroke width is in pixels regardless of
depth. Joints are drawn first as discs and the segments over them, which leaves
exactly the wedge a corner needs plus round caps at the ends. Coverage comes from
an SDF resolved by alpha-to-coverage against the multisampled framebuffer, so the
whole pass stays opaque and depth-tests against itself without sorting.

**Framing.** The notebook hand-tuned a view transform per attractor. Those are
kept, but after each system settles its trail buffer is read back and the camera
fits a bounding sphere around the 98.5th percentile of it — so a sprawling system
gets a hall and a compact one gets a room, and one escaping particle cannot drag
the camera into the next county.

## Layout

```
index.html                 page shell, overlay, styling
src/attractors.js          the 43 systems (generated)
src/simulation.js          state texture, RK4 integrator, spin-up
src/lines.js               instanced trail renderer
src/stage.js               the grid room and floor
src/camera.js              orbit camera and sphere fitting
src/director.js            playlist, palettes, transitions
src/palettes.js            15 colour schemes
src/scene.js               frame composition
src/format.js              GLSL derivatives -> readable equations
src/main.js                loop, quality ladder, input
bin/attractors             kiosk launcher
bin/serve.py               static server with a /__quit endpoint
tools/gen-attractors.mjs   regenerate src/attractors.js from the notebook
tools/build-single.mjs     bundle to dist/attractors.html
```

To re-derive the attractor table from the source notebook:

```sh
curl -sL "https://api.observablehq.com/@rreusser/strange-attractors-on-the-gpu-part-2.js?v=4" -o notebook.js
node tools/gen-attractors.mjs
```

## Requirements

WebGL2 with `EXT_color_buffer_float` (float render targets), which every current
desktop browser has. `python3` for the launcher's static server, and `swayidle`
only if you want the idle trigger.

## Credit

All forty-three systems, their parameters, the view transforms, the quasirandom
seeding and the grid room are Ricky Reusser's, from
[*Strange Attractors on the GPU, Part 2*](https://observablehq.com/@rreusser/strange-attractors-on-the-gpu-part-2)
(and [Part 1](https://observablehq.com/d/ab6cd8bb0137889c), which explains the
simulation properly). Each attractor's own paper is cited in the overlay.
