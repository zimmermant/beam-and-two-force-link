import { derive, linkSense, FORCE_DP, FORCE_SUB } from './physics.js';
import { unitText } from './fields.js';
import { PANELS, concurrencyCase } from './layout.js';
import { fmt } from './format.js';

// There is no worked calculation on this page: it is a sandbox, and the numbers live on the arrows.
// What stays here is the short reading of the picture -- what the link is doing, and why the polygon
// closes -- plus the two notes that only a degenerate state needs.
//
// Every line is built from fixed strings and numbers from fmt(), so nothing a URL can carry reaches the
// HTML. Subscripts are <sub> elements; an ASCII underscore never reaches the screen.

const panelSym = (key) => `F<sub>${FORCE_SUB[key]}</sub>`;

const CONCUR_NOTE = {
  point: 'The three forces add to zero, and their lines of action meet at the circle: the same fact as the polygon closing.',
  far: 'The load is nearly parallel to the link, so the three lines of action meet far off the page.',
  'one-line': 'With the load along the beam there are only two forces, and they share one line of action: the beam itself.',
  'no-load': 'With no load there are no forces, so there are no lines of action to meet.'
};

// A plain space separates the three, so the page's text really has a gap between one unit and the next
// name ("50 N FCD", not "50 NFCD"); the visible spacing is the .amt margin in styles.css.
function amount(key, mag, cls) {
  return `<span class="amt c-${cls}"><b>${panelSym(key)}</b> = ${unitText(fmt(mag, FORCE_DP), 'N')}</span>`;
}

// s -> [{ key, html }]. Pure.
export function calcLines(s) {
  const d = derive(s);
  const sense = linkSense(d.cd);
  const lines = [];

  if (d.magB === 0) {
    lines.push({ key: 'read', html: 'No load on the beam, so the pin and the link carry nothing.' });
  } else {
    lines.push({ key: 'read', html:
      `${amount('load', d.magB, 'load')} ${amount('link', d.magC, 'link')} ${amount('pin', d.magA, 'pin')}` });
  }

  if (sense === 'tension') {
    lines.push({ key: 'sense', html: 'Link CD is in <b>tension</b>: it pulls the beam toward D.' });
  } else if (sense === 'compression') {
    lines.push({ key: 'sense', html: 'Link CD is in <b>compression</b>: it pushes the beam away from D.' });
  } else if (d.magB === 0) {
    lines.push({ key: 'sense', html: 'Move the load handle to put the beam to work.' });
  } else {
    lines.push({ key: 'sense', html: 'The load points along the beam, so it has no moment about A and <b>link CD carries nothing</b>. The pin alone balances it, and the polygon flattens to a line.' });
  }

  // The closing note says which case the construction in the free-body diagram is in. The four
  // readings are the same length on purpose: the reading panel has only so much room before the page
  // stops fitting a Canvas iframe, so the note swaps rather than grows.
  lines.push({ key: 'note', html: CONCUR_NOTE[concurrencyCase(s, PANELS.ext)] });
  return lines;
}

// Writes the lines into el, and only when the text changed (a screen reader hears no repeat).
export function createPanel(el) {
  let last = null;
  return {
    render(s) {
      const html = calcLines(s).map(l => `<div class="cl ${l.key}">${l.html}</div>`).join('');
      if (html === last) return;
      last = html;
      el.innerHTML = html;
    }
  };
}
