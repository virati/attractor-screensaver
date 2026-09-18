// The history panel: background notes on the current system, creeping upward at
// reading pace in the top right.
//
// It scrolls itself because the screensaver has no reader to scroll it — in
// --idle mode a touch of the mouse dismisses the whole window. So the panel
// holds at the top long enough to start reading, walks up at a fixed pace, rests
// at the end, then fades and begins again. A wheel over it takes control back.

import { HISTORY } from './history.js';

const host = url => {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
};

export class HistoryPanel {
  constructor(root, {
    pace = 11,        // pixels per second, i.e. about one line every two seconds
    topHold = 4.5,    // seconds parked at the top before setting off
    endHold = 7,      // seconds parked at the end before wrapping
    fade = 0.7        // seconds of cross-fade on the wrap
  } = {}) {
    this.root = root;
    this.pace = pace;
    this.topHold = topHold;
    this.endHold = endHold;
    this.fade = fade;

    // The heading sits outside the scrolling viewport, so the height that
    // matters for overflow is the viewport's, not the whole panel's.
    this.view = root.querySelector('#history-view');
    this.track = root.querySelector('#history-track');
    this.originEl = root.querySelector('#history-origin');
    this.bodyEl = root.querySelector('#history-body');

    this.offset = 0;
    this.overflow = 0;
    this.phase = 'top';
    this.timer = 0;
    this.alpha = 1;
    this.measured = false;
    this.grabbed = 0;   // seconds of manual control left

    this.apply();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => { this.measured = false; }).observe(root);
    }
  }

  show(attractor) {
    const entry = HISTORY[attractor.name];
    this.root.classList.toggle('empty', !entry);
    this.originEl.textContent = entry ? entry.origin : '';

    this.bodyEl.replaceChildren();
    if (entry) {
      for (const para of entry.text) {
        const p = document.createElement('p');
        p.textContent = para;
        this.bodyEl.append(p);
      }
      if (entry.caveat) {
        const note = document.createElement('p');
        note.className = 'caveat';
        note.textContent = entry.caveat;
        this.bodyEl.append(note);
      }
      if (entry.sources && entry.sources.length) {
        const src = document.createElement('p');
        src.className = 'sources';
        src.textContent = 'Sources: ' + [...new Set(entry.sources.map(host))].join(' · ');
        this.bodyEl.append(src);
      }
    }

    this.offset = 0;
    this.phase = 'top';
    this.timer = 0;
    this.alpha = 1;
    this.measured = false;
    this.grabbed = 0;
    this.apply();
  }

  measure() {
    // scrollHeight is only meaningful once the new paragraphs have been laid
    // out, so this waits for the first frame after show() rather than running
    // inside it.
    this.overflow = Math.max(0, this.track.scrollHeight - this.view.clientHeight);
    this.measured = this.view.clientHeight > 0;
  }

  // A wheel over the panel hands control to the reader for a while.
  nudge(delta) {
    if (!this.measured) this.measure();
    this.offset = Math.max(0, Math.min(this.overflow, this.offset + delta));
    this.alpha = 1;
    this.grabbed = 12;
    this.phase = 'scroll';
    this.apply();
  }

  advance(dt) {
    if (!this.measured) this.measure();

    if (this.grabbed > 0) {
      this.grabbed -= dt;
      return;
    }
    // Nothing overflows: the whole entry fits, so there is nothing to scroll.
    if (this.overflow <= 1) {
      this.offset = 0;
      this.alpha = 1;
      this.apply();
      return;
    }

    switch (this.phase) {
      case 'top':
        this.timer += dt;
        if (this.timer >= this.topHold) { this.phase = 'scroll'; this.timer = 0; }
        break;
      case 'scroll':
        this.offset += this.pace * dt;
        if (this.offset >= this.overflow) {
          this.offset = this.overflow;
          this.phase = 'end';
          this.timer = 0;
        }
        break;
      case 'end':
        this.timer += dt;
        if (this.timer >= this.endHold) { this.phase = 'out'; this.timer = 0; }
        break;
      case 'out':
        this.timer += dt;
        this.alpha = Math.max(0, 1 - this.timer / this.fade);
        if (this.timer >= this.fade) {
          this.offset = 0;
          this.phase = 'in';
          this.timer = 0;
        }
        break;
      case 'in':
        this.timer += dt;
        this.alpha = Math.min(1, this.timer / this.fade);
        if (this.timer >= this.fade) { this.alpha = 1; this.phase = 'top'; this.timer = 0; }
        break;
    }
    this.apply();
  }

  apply() {
    this.track.style.transform = `translateY(${-this.offset.toFixed(2)}px)`;
    this.root.style.setProperty('--panel-alpha', this.alpha.toFixed(3));
  }
}
