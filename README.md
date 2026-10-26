# Beam on a pin and a two-force link

**Live:** <https://zimmermant.github.io/beam-and-two-force-link/>
· [diagrams only](https://zimmermant.github.io/beam-and-two-force-link/dist/beam_link_fbd_display.html)

An interactive free-body-diagram sandbox for PHYS 291 Statics. No network, no build step to view —
just open a file. There are two:

| file | what it is |
|---|---|
| `dist/beam_link_fbd.html` | the full page: the figure, two sliders, a reset button and a reading panel |
| `dist/beam_link_fbd_display.html` | the four diagrams and nothing else; the only interaction is dragging the load |

The display page is for projecting and for embedding, where the controls would be noise. It runs the
same physics and the same figure — it leaves out `panel.js`, `controls.js` and the main entry module
and nothing else — so the two can never disagree. Its figure is sized to **fit** the window rather
than to a fixed column, so it is as large as the window allows (about 784 px wide at 800 × 750, about
1103 px at 1280 × 720) and the page never scrolls at any size. Below about 560 px wide the labels
drop under 12 px, which is the price of never scrolling; the two supported sizes are well clear of
that.

A horizontal beam runs from a pin at **A** to a joint at **C**, where a two-force link **CD** rises to
a wall pin on a three-four-five slope. The student drags the load **F⃗_B** at **B** — direction and
magnitude together — and watches four pictures of the same equilibrium stay consistent:

| panel | what it shows |
|---|---|
| The situation | the given figure, with the draggable load |
| Free-body diagram of the beam | the beam alone, each support replaced by the force it applies |
| The beam as a single point | the same three forces, all from one point |
| The forces tip to tail | the same three forces as a closed polygon |

The three forces add to zero and their lines of action meet at one point. The closed polygon and the
concurrency are the same fact, and the sandbox is built so a student can see them move together: the
free-body diagram draws the three lines of action as dashed rays converging on a small open circle,
right beside the polygon that closes for the same reason.

The construction is drawn only when there is a point to draw, and the reading panel always names
which of the four cases the figure is in: the three lines meeting at the circle; the load nearly
parallel to the link, so they meet far off the page; the load along the beam, so only two forces
remain and they share one line; or no load at all. The point running away to infinity as the load
turns parallel to the link is the thing to notice, not a gap in the drawing.

## Notation

A force is never named after a point. The load is **F⃗_B**, the pin reaction **F⃗_A** (components
F_Ax, F_Ay) and the link force **F⃗_CD = F_CD · r̂_CD**, directed from C toward D, matching the
`r̂_AB` convention used in the course. Every subscript is a real subscript — a `<sub>` element in HTML,
a lowered `tspan` in SVG — and an ASCII underscore never reaches the screen. The arrow over a vector
is **drawn**, because the Unicode combining arrow (U+20D7) falls back to a row of bars in system-ui.

## The statics

Axes: x right, y up, moments counterclockwise. x₁ = 3.0 m, x₂ = 2.0 m, r̂_CD = (0.8, 0.6).

    ΣM_A = 0:   x₁ F_By + L (0.6 F_CD) = 0      →  F_CD = − x₁ F_By / (0.6 L)
    ΣF_x = 0:   F_Ax + F_Bx + 0.8 F_CD = 0      →  F_Ax = − F_Bx − 0.8 F_CD
    ΣF_y = 0:   F_Ay + F_By + 0.6 F_CD = 0      →  F_Ay = − F_By − 0.6 F_CD

F_CD is a signed scalar along r̂_CD: positive pulls the beam toward D (tension), negative pushes
(compression). The link is a bar, not a cable, so both are real and the page names which.

Two states are worth finding: **θ = 0° or 180°** (the load lies along the beam, so it has no moment
about A, the link carries nothing and the polygon flattens to a line) and **F_B = 0** (nothing to add
up). Both are drawn honestly rather than hidden.

## Using it

- **Drag the round handle** on the load arrow, or tab to it and use the arrow keys (left/right swing,
  up/down pull harder; Home for the hardest straight-down pull, End for no load). That is the whole
  interaction on the display page — the keyboard is the same handle by another route, not a second
  way in, and without it the page would be usable only with a mouse.
- On the full page the two sliders set the same two numbers and the reset button restores them.
- Either page can be preset by a link: `?f=70&dir=215`. On the display page a one-line note appears
  above the figure when a link has set, adjusted or rejected something, and at no other time.

## Working on it

```
node build.js                  # writes dist/beam_link_fbd.html from src/
node --test test/*.test.js     # the suite
node tools/mutations.mjs --coverage --strict
```

The browser harness is not run by node — it needs a real layout engine. Serve the folder, open the
page at one of the sizes in `SIM.viewport`, reload, then in the page:

```
eval(await (await fetch('/tools/browser-harness.js')).text()); H.install(); H.all()
await H.queries()
```

Pass is `sweep.violationCount` 0, `queries.violationCount` 0, `sensitivity.flagged` true and
`budget.ok` true, at **both** 800 × 750 (a Canvas iframe) and 1280 × 720 (a laptop).

**The display page** declares `data-controls="none"` on its `<svg>`, and the harness then skips
everything that needs sliders: `H.install()` and `H.budget()` work, `H.checkFigure()` works, and
`sweep()` and `sensitivity()` return a note instead, because there is nothing on the page to drive
and nothing to plant an HTML fault in. (A page that lost its controls by accident does NOT get this
treatment — the page has to say so itself.) To check it over a range of states, load each one in an
iframe the size of the window and run `checkFigure` against it:

```js
for (const st of states) {
  const fr = document.createElement('iframe');
  fr.style.cssText = `position:fixed;left:-99999px;width:${innerWidth}px;height:${innerHeight}px`;
  document.body.appendChild(fr);
  await new Promise(r => { fr.onload = r; fr.src = `/dist/beam_link_fbd_display.html?f=${st.f}&dir=${st.dir}`; });
  const doc = fr.contentDocument;
  console.log(H.checkFigure(`${st.f} ${st.dir}`, { win: fr.contentWindow, doc, fig: doc.getElementById('fig'), ui: {}, plain: true }));
  fr.remove();
}
```

The figure's own rules are all expressed in viewBox units and so are the same on both pages; the one
thing that really differs is the rendered text size, which follows the window.

### Two things worth knowing before you change the figure

**Arrows are drawn as separate short pieces, not as groups.** Every collision check works on bounding
rectangles, and one diagonal line claims its whole rectangle, so a label in the clear space beside a
diagonal arrow is measured as sitting on it. The pieces must be top level, because the harness measures
the outermost element carrying class `g`. See `src/svg.js`.

**Labels are placed by a solver, not by hand.** `placeLabels` in `src/layout.js` takes every label, the
boxes of everything already drawn, and the panel it must stay inside, and moves the ones that are
allowed to move until nothing overlaps. Its constants are measured in Chromium, not guessed. Two
labels are held a word apart (`PLACE_TEXT_GAP`), not merely kept from touching: at a hair's gap
`F⃗_B 60 N` and `F⃗_A 60 N` read as one string.

**The exhaustive label tests are in `test/layout.test.js`, not in the harness.** The browser harness
drives 47 states; `panelClash` walks all 357 and checks both free-body panels, which is what caught
two labels merging at 60 N along the beam — a state that fell between two of the harness's grid
steps.

## Embedding it

Neither page has frame-busting code and GitHub Pages sends no frame-blocking headers, so either can be
put in an iframe. Some learning-management systems restrict what an iframe may load; that is their
setting, not this page's.

The full page is built for a window about 800 px wide and 750 px tall, so give it those:

```html
<iframe src="https://zimmermant.github.io/beam-and-two-force-link/dist/beam_link_fbd.html?f=70&amp;dir=215"
        width="100%" height="750" style="border:0; max-width:800px"
        title="Beam on a pin and a two-force link" loading="lazy"></iframe>
```

The diagrams-only page has no fixed size: it scales its figure to fit whatever box you give it, so pick
a height that suits the space. It reads well from about 560 px wide upward, below which its labels fall
under 12 px.

```html
<iframe src="https://zimmermant.github.io/beam-and-two-force-link/dist/beam_link_fbd_display.html"
        width="100%" height="560" style="border:0"
        title="Beam on a pin and a two-force link: the diagrams" loading="lazy"></iframe>
```

## Licence

MIT. See [LICENSE](LICENSE).
