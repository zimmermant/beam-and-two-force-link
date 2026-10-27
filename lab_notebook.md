# Lab notebook — beam_link_fbd

## 2026-10-26 (later) — published

### Summary
First publish, on Todd's explicit ask. Public repo **`zimmermant/beam-and-two-force-link`** (MIT,
Pages from `main` at `/`), live at <https://zimmermant.github.io/beam-and-two-force-link/>, and a
sixth card on <https://zimmermant.github.io/simulations/>.

| what | where |
|---|---|
| working repo (no remote, as the procedure wants) | `788eb0a` |
| public repo, first commit | `cf09fdd` |
| site | `e6f89c5` on `zimmermant/zimmermant.github.io` |

### Decisions Todd made
- **Repo name `beam-and-two-force-link`**, over `beam-pin-and-link` and `beam-link-fbd`. It follows
  the house pattern of naming the situation rather than the technique, and none of the existing five
  uses an abbreviation. The name fixes the public URL, so it was his call, not mine.
- **One card, with a small second link.** The diagrams-only page is the same simulation with the
  chrome taken off, not a second simulation, so the grid still reads one card per sim. A card is an
  `<a>` and cannot contain another link, so the card sits in a `.sim-cell` with the quiet
  "Diagrams only" line underneath it.

### Decisions I made
- **The card image is the FULL page, not the diagrams-only one.** The diagrams-only capture fills a
  3:2 frame perfectly and looked better, but every existing card shows the page that card opens, and
  `distributed-load-beam.png` is likewise a whole-page shot the CSS crops. I rendered both as real
  cards side by side before choosing. 1200 × 1125, which `object-fit: cover` crops to its top.
- **Screenshots made with headless Microsoft Edge** (Chromium; no Chrome on this machine), with
  `--user-data-dir` pointed at the session scratchpad so it never touches Todd's own profile.
  Rendering straight at 1.5× gives 161 KB; downsampling a 2× capture gave a sharper 280 KB, which is
  two to four times the other card images, so the direct render won.
- **The root `index.html` redirect names both pages**, so the fallback paragraph is useful rather
  than a dead end if the meta refresh does not fire.

### Checks before and after
Before: working tree clean, `node build.js` left it clean (both dist files byte-identical to the
commit), 238 tests green, nothing private tracked, no local paths or secrets anywhere in the tree.
The export was `git archive HEAD` with `docs/` dropped, and the whole tree was re-scanned before the
repo existed.

After the push, from the live site:
- Both dist files fetched and `cmp`'d against local: **byte-identical**.
- `docs/`, `.claude/`, `questions.md`, `CLAUDE.md`: all 404.
- Harness run **from the live origin** on the full page at 800 × 750: 47 combos, sweep 0, queries 0,
  sensitivity flagged, budget ok, smallest text 12.3 px.
- Display page live: `install` ok (`plain: true`), six states checked with `checkFigure` in iframes
  the size of the window, 0 violations, smallest text 13.1 px, budget ok.
- The root redirect lands on the full page; the preset `?f=70&dir=215` renders and its note reads
  "From the link: Load magnitude = 70 N, Load direction = 215°."
- Site: card, image and both links all 200, and the card renders like its five neighbours.

### Not tried
Firefox and Safari (Chromium only, via the pane and via headless Edge). No real LMS frame — the
iframe snippets in the README are written from the budgets, not from a Canvas test. No touch device.

---

## 2026-10-26 — a second page: the four diagrams on their own

### Summary
Todd asked for a version with no sliders card and no "Reading the diagrams" card — just the four
diagrams, with dragging the load as the only interaction. Built as a SECOND PAGE in the same repo
(`dist/beam_link_fbd_display.html`), not a fork: same physics, same figure, same drag.

### Decisions and why

**A second entry in `build.js`'s `PAGES`, not a second project.** The kit already supports several
pages, each with its own template, stylesheets and module list, each its own scope. The display page
leaves out exactly `panel.js`, `controls.js` and `app.js` and adds `app-display.js`; a test asserts
that the difference is exactly those three, so the two pages cannot quietly drift into showing
different physics.

**The figure is sized to FIT the window, not to a 740 px column.** With nothing beside it there is no
reason to keep the main page's fixed column. The svg is absolutely positioned in a box that is
whatever is left of the window, and its own `preserveAspectRatio` (the default, "meet") makes it as
large as fits and centres it. So the page can never scroll at any window size, and the figure is
bigger than on the main page: about 784 px wide at 800 × 750, about 1103 px at 1280 × 720, where the
height becomes the limit and it is letterboxed left and right instead.
`src/interact.js` already read that letterboxing when turning a pointer position into viewBox units,
so the drag needed no change — measured: with 97 px of letterbox on the left, a dropped handle lands
2.3 px from the pointer, against a snap step of 4.7 px.

**No `<h1>`.** The four panels are titled inside the figure, and a page heading would only take room
from them. The page title is still set, for the tab and for anything that reads it.

**The keyboard stays.** Tab to the handle and the arrow keys swing the load and change its strength.
That is the same interaction by another route, not a second way in, and without it the page would be
usable only with a mouse.

**The preset note stays, as the only text outside the figure**, and only appears when a link actually
set, adjusted or rejected something. It takes a line off the figure while it is there, which the
figure simply shrinks to accommodate.

**The harness learned about pages with no controls, and the page declares it.** `data-controls="none"`
on the `<svg>` makes `makeCtx` stop looking for sliders, a reset button and a reading panel;
`budget()` then measures the figure alone, and `sweep()` and `sensitivity()` return a note rather
than failing, because there is nothing to drive and nothing to plant an HTML fault in. The PAGE
declares it rather than the harness guessing, so a page that lost its controls by accident still
fails — which is the point of the check.

### Problems and how they were resolved

| problem | resolution |
|---|---|
| browser screenshots of the display page under viewport emulation came back painted at about a third scale, which looked like a broken layout | it was the capture, not the page: `getBoundingClientRect`, `getScreenCTM` and the painted position of a named label all agreed with the design. Measured numerically from then on |
| a page could drop a module it needs and everything still passed — the build only checked that each file is listed on *some* page, and the bundle still parses | `test/build.test.js` now requires each page's module list to be **closed under imports**, in dependency order, and to carry nothing that nothing in that page imports |
| the display tests booted the page but never changed anything, so removing `state.subscribe` or `attachDrag` entirely went unnoticed | a test now drags the handle through the stub DOM and requires all three forces to follow |
| a generic mutation row stopped being unique once a second module list existed | it now names the main page's list by a module only that page has |

### Verification
- `node --test test/*.test.js`: 238 tests, 230 pass, 8 skipped.
- Display page in Chromium at **800 × 750** and **1280 × 720**: `H.install()` ok (`plain: true`),
  24 states each checked with `H.checkFigure` in an iframe the size of the window — 0 violations;
  smallest rendered text 13.1 px and 17.8 px; `H.budget().ok` true; no scroll either way.
- Main page re-checked at both budgets after the harness change: 47 combos, sweep 0, queries 0,
  sensitivity flagged, budget ok — unchanged.
- `node tools/mutations.mjs --coverage --strict`: 222 mutations, **all caught**. Three were missed on
  the first run and each named a missing test: a page dropping a module it imports, and the display
  page losing either `state.subscribe` or `attachDrag` (both of which look the same from outside —
  the figure stops following the load — so one test covers them).
- Drag tried on the display page by hand: 50 N to 80 N, all four panels following, and the
  precision check above.

### Open questions / next steps
- Below about 560 px wide the display page's labels drop under 12 px. That is the price of never
  scrolling, and both supported sizes are well clear of it, but a phone would not read well.
- Still nothing published to Canvas or GitHub Pages. Two files to place now, not one.

---

## 2026-10-25 (later) — added the concurrency construction

### Summary
Todd asked for the thing that was offered and left out: the three lines of action, drawn meeting at
one point, in the extended free-body diagram. Done, plus two bugs it turned up.

### What is drawn
Three dashed rays, each from a force's point of application to the point the three lines meet at,
and a small open circle on the point. The reading panel always names which of four cases the figure
is in, and the four readings are deliberately the same length, because the panel has only so much
room before the page stops fitting a Canvas iframe:

| case | when | what the figure does |
|---|---|---|
| `point` | the ordinary case | three dashed rays and the circle |
| `far` | the load nearly parallel to the link | nothing; the point is off the page |
| `one-line` | the load along the beam | nothing; two forces sharing the beam's own line |
| `no-load` | F_B = 0 | nothing |

### Decisions and why

**Only drawn when the point is really on the panel.** Over the grid, 54 of 72 load directions put it
inside the extended panel; between about 30° and 65° (and again 210°–245°) the load's line of action
is nearly parallel to the link's and the meeting point runs away — at θ = 215° it is 33 m to the
right and 21 m up. Clipping a ray to the panel edge and drawing no point would look like a bug. The
construction disappearing, with the reading panel saying why, is the honest picture and is the thing
worth noticing: the point runs to infinity exactly as the two lines turn parallel.

**Rays from the point of application to the meeting point, not full lines across the panel.** Shorter,
it is the standard construction, and it keeps the number of dashes (and so the number of obstacle
boxes the label solver has to work around) down to about 25.

**Dashed by drawing separate dashes, not with `stroke-dasharray`.** Same reason the arrows are cut
into pieces: one long diagonal line claims its whole bounding rectangle. Here the dash pattern and
the small rectangles come out as the same thing.

**A wide berth round the circle.** The meeting point is the one mark in that panel with no label of
its own, so a force label that lands beside it reads as naming it. Labels are kept 18 units clear.

### Problems and how they were resolved

| problem | resolution |
|---|---|
| at 60 N straight along the beam, `F⃗_B 60 N` and `F⃗_A 60 N` were placed 1.5 units apart and read as one string | labels now demand `PLACE_TEXT_GAP` (11 units, a word) from each other, while still only needing 1.5 from a drawn shape |
| the placement solver moved a label to exactly the required gap and then its own test said they still touched, so the move never took | `boxesHit` treats exactly-`pad` apart as clear (`BOX_EPS`); the arithmetic that places a label and the test that checks it now agree |
| the browser harness never saw the first bug | its sweep grid stepped 0, 20, 50, 80 N straight over 60 N. Added 60 N and a crowded probe (35 N at 35°, where the link and the pin are almost in line), and — the real fix — `panelClash` in `test/layout.test.js` now walks **all 357 states** for both free-body panels, which the harness's 47 cannot |
| the longer reading note pushed the page 7 px past the iframe on a preset link | the `point` note was trimmed back to the length the page was measured with |

### Verification
- `node --test test/*.test.js`: 223 tests, 215 pass, 8 skipped.
- Browser harness, Chromium, at 800 × 750 **and** 1280 × 720: sweep 0 of 47 combos, queries 0,
  sensitivity flagged, budget ok, smallest rendered text 12.3 px.
- Looked at by hand at θ = 270° (point below the beam), 10° (point above and right of C), 180°
  (no construction, two labels now a clear word apart) and 215° (no construction, note explains).
- `node tools/mutations.mjs --coverage --strict`: 206 mutations, **all caught**. Six of the new rows
  were missed on the first run and each named a test that did not exist yet: two exactly parallel
  lines of action, a meeting point with no room for its circle, a dash overrunning its line, the
  construction drawn over the arrows instead of under them, the circle not drawn at all, and a label
  allowed to crowd the point. All six are now tested.

---

## 2026-10-25 — built the simulation, from the kit, in one session

### Summary
New interactive free-body-diagram sandbox for the beam A–C held by a pin at A and a two-force link CD
on a three-four-five slope. The student drags one load, F⃗_B, and four panels stay consistent: the
situation, the extended free-body diagram, the point free-body diagram and the tip-to-tail polygon.
Copied from the kit in the `building-physics-simulations` skill, which stays local and is never
published, then the physics, figure, panel, drag, tests, harness and mutation rows were all replaced.

State: suite green (207 tests), browser harness clean at both viewport budgets, mutation audit all caught.

### What Todd decided (questions.md has the full record)
1. **Drag F⃗_B only** — the geometry is fixed. Simplest case first.
2. **Arrows carry their magnitudes; no worked ΣM/ΣF panel** — it is a sandbox, not a worked example.
3. **All four panels visible at once.**
4. **Notation: never `A_x`.** Mid-session correction: *A is a point, not a force*. The load is F⃗_B,
   the pin reaction F⃗_A (F_Ax, F_Ay), the link force F⃗_CD along r̂_CD. Saved to memory as
   `statics-force-label-notation`, because `apps/pin_roller_frame` still prints `A_x` and must not be
   copied.

Defaults taken without asking (recorded in `questions.md`): the viewport budgets (800 × 750 and
1280 × 720, as in every earlier app), x₁ = 3.0 m and x₂ = 2.0 m, a rigid link that may be in
compression, and F_B over 0–80 N.

### Decisions and why

**x₁ = 3 m, x₂ = 2 m.** Matches the source figure's proportions and makes F_CD = F_B exactly for a
vertical load, which is a clean thing for a student to notice.

**The figure is a two-by-two grid, not a stack of four panels.** The page must fit a Canvas iframe
(800 × 750) with no vertical scroll. Measured on the real page: the title and the controls row take
about 240 px, leaving the figure about 475 px, which at the 740 px column is 616 viewBox units. Four
stacked panels would get 154 units each, and one free-body diagram alone needs 21 (heading) + 89
(longest arrow) + 25 (label), twice over, plus the beam. The extended diagram is the wide one — it
needs an arrow and a label at each end of the beam — so it takes the whole lower-left and the compact
polygon sits beside it.

**The vector arrow is drawn, not typed.** U+20D7 over `F` renders as a stack of short bars in
system-ui on macOS. Checked in the browser, not assumed. `svg.js` now measures the label with
`getComputedTextLength` and draws a one-glyph arrow over the base letter; in the stub DOM of the tests
there is no measurement, so the label is drawn without its bar and the tests assert the segments
instead.

**Arrows are drawn as separate short pieces at the top level.** This is the big one. Every overlap
check works on bounding rectangles, and a diagonal arrow claims its whole rectangle, so in a figure of
radiating arrows nearly every label was reported as sitting on an arrow (about 60 of the 160
violations at the worst point). The kit's own advice is to split the line into segments — but segments
*inside* a `g.g` group are invisible to the harness, which measures the outermost element carrying
class `g`, so the group's rectangle is measured anyway. The pieces had to become siblings.
Cost: the harness's rule 4 (an arrow must not swallow a `.pc` joint circle) looks for a group whose
first child is a line and now finds none. Replaced by a unit test over all 357 grid states, which is
the stronger check.

**Labels are placed by a solver.** `placeLabels` (layout.js) takes the labels, the boxes of everything
drawn, and the panel, and moves what may move until nothing overlaps. Three things it needed before it
worked, each found by the harness rather than by eye:
- *Hard versus soft blockers.* Landing on something immovable costs 3, on another label 1. Without the
  difference a label with no clear spot stayed on the beam, because every escape looked equally bad.
- *A two-step lookahead.* Escaping one obstacle usually lands on the next; with single steps only, a
  label with a row of obstacles beside it never moved.
- *Leaving the panel costs 1000.* An arrow is many short pieces now, so brushing one arrow already
  counts several times over; at a smaller penalty a label preferred hanging off the edge.

**The space diagram's load label does not follow its arrow.** The arrow swings through a full circle
about B and reaches most of that panel, so a label tied to it collided with the beam, the link, the
dimensions or a point's name depending on where the student dragged. It is pinned under the heading
instead: one force, one red arrow, one red label, always in the same place.

**The reading panel lost its status line.** It repeated what the three magnitudes and the
tension/compression line already said, and the ~34 px it took were exactly what a long "From the link"
note needed in order not to push the page past the iframe.

### Problems and how they were resolved

| problem | resolution |
|---|---|
| `Math.cos(270°)` is −1.8e−16, leaving a hair of link force at a vertical load | `cosDeg`/`sinDeg` are exact at the quadrant points; a test asserts `Math.cos` is not |
| 160 label/arrow overlaps reported by the harness | split arrows into top-level pieces, then the placement solver (above) |
| page 803 px tall against a 750 px budget | two-by-two grid, figure 616 units, status line removed |
| a link note with two rejected values pushed the page to 728 px | the note moved into the reading panel (the shorter column) and the echo cap cut from 40 to 14 characters |
| the harness and `src/physics.js` disagreed by one float ulp | the harness groups `m * (Math.PI / 180)` exactly as physics.js does |
| the kit forbids a `mark` at a slider's end | the load magnitude has no mark; 0 N is named in its left-hand scale label instead |

### Verification
- `node --test test/*.test.js`: 207 tests, 199 pass, 8 skipped (the snap-only ones: neither input is
  symmetric about zero).
- `node tools/mutations.mjs --coverage --strict`: 188 mutations, **all caught**. The first run missed
  12. Ten were real gaps in the tests and were closed (the polygon's y flip, the label lift, the
  placement cap, the off-panel penalty, the arrowhead length, a collapsed polygon's two labels, the
  extended diagram's spread, the handle's resting place, and a click that writes to the store). Two
  were equivalent mutants and the code or the row changed instead: `Math.cos(2π)` is exactly 1, so
  folding the angle matters only in `sinDeg`; and the finite check inside the drag's `apply` was
  unreachable, because `viewPoint` has already refused anything that is not two finite numbers, so
  the dead guard was deleted. One row kept failing until the test it was aimed at became a real dead
  end -- the first version left an escape upwards, so it could not tell the two costs apart.
- Browser harness, Chromium, at 800 × 750 **and** 1280 × 720: `sweep.violationCount` 0,
  `queries.violationCount` 0, `sensitivity.flagged` true, `budget.ok` true, smallest rendered text
  12.3 px.
- Drag tried by hand in the browser: handle dragged from (204, 114) to (150, 80) took the load from
  50 N at 270° to 80 N at 310°, and all four panels, both sliders and the reading panel followed.
  Keyboard: arrows step, End drops the load (the handle parks above B), Home restores, focus survives
  the figure being rebuilt.

### Open questions / next steps
- **Offered but not built:** draw the three lines of action meeting at one point, in the extended
  diagram. It is *why* the polygon closes, and this sandbox is one dashed construction away from
  showing it. Left out because it was not asked for.
- Geometry sliders (x₁ along the beam) were offered and declined; the physics already takes x₁ as a
  parameter, so adding one is a FIELDS entry plus its markup.
- Not published anywhere yet: no Canvas page, no GitHub Pages. `dist/` is tracked so Pages can serve
  it when Todd wants it.
- Worth a look on a real touch screen; the handle has a 24-unit hit radius but that has only been
  checked with a mouse.

Source figure: the problem image Todd supplied in the session that started this app (beam A–C, pin at
A, link CD to a wall pin at D on a 3-4-5 slope, load F⃗_B at B between x₁ and x₂).
