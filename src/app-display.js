import { createState } from './state.js';
import { createScene } from './scene.js';
import { attachDrag } from './interact.js';
import { parsePresets, describePresets } from './presets.js';

// The display page: the four diagrams, and dragging the load. No sliders, no reading panel, no reset.
// Everything it draws comes from the same scene module as the main page, so the two can never show
// different physics; what differs is only what is around the figure.
//
// The keyboard still works, because it is the same handle: tab to it, then the arrow keys swing the
// load and change its strength, Home is the hardest straight-down pull and End drops the load. That
// is the drag by another route, not a second way in, and without it the page would be usable only
// with a mouse.
const DISPLAY_TITLE = 'Beam on a pin and a two-force link — diagrams';

function displayStart() {
  document.title = DISPLAY_TITLE;
  const fig = document.getElementById('fig');
  const scene = createScene(fig);
  const state = createState();

  // Presets from the link apply once, before the first render; the note is the only text outside the
  // figure, and it appears only when a link actually said something.
  const presets = parsePresets(location.search);
  state.set(presets.values);
  const note = describePresets(presets);
  const link = document.getElementById('from-link');
  link.textContent = note;             // text only: the link's own text can never become markup
  link.hidden = note === '';

  // The scene rebuilds the whole figure, so the handle is a NEW node after every render. Hand focus
  // back when the old one had it, and never take it otherwise.
  function sync() {
    const active = typeof document.activeElement === 'object' && document.activeElement
      && typeof document.activeElement.getAttribute === 'function'
      && (document.activeElement.getAttribute('class') || '').includes('load-handle');
    scene.render(state.getState());
    if (active && fig.querySelector) {
      const handle = fig.querySelector('.load-handle');
      if (handle && typeof handle.focus === 'function') handle.focus({ preventScroll: true });
    }
  }
  state.subscribe(sync);
  sync();
  attachDrag(document.getElementById('stage'), state);
}

displayStart();
