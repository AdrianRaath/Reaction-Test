# Adding a New Tool

Process doc for Claude (and anyone else) adding a tool to ReflexLab. The
architecture is deliberately shaped so that a new tool is **five files and no
engine changes**: a registry entry, an engine definition, a content file, a
page, and a measurement script. If a tool seems to need engine edits, stop and
reconsider — the engine (`src/engine/`) is shared, fully unit-tested, and
tool-agnostic.

Companion docs: `REVAMP.md` (architecture, §3), `DESIGN.md` (visual contract),
`PRODUCT.md` (what the site is).

---

## When the pattern doesn't fit — ask first

This doc describes the pattern the current tools follow, not a cage. Some
future tool will genuinely not fit it — a tool with no meaningful rank tiers,
a two-player mode, a tool where "one primary metric" is the wrong model, a
test that isn't a timed run at all. When that happens, **do not** force the
tool into the template and ship something wrong, and **do not** silently
improvise around the architecture. Stop and ask the user clarifying questions
first: what should rank/PB/trend mean here, which parts of the rig apply,
whether the engine needs a considered extension. Build only once the shape is
agreed. A wrong tool shipped "by the book" is worse than a conversation.

---

## Copy and SEO — every tool page

- **All copy is written with the `stop-slop` skill.** Invoke it before
  drafting any user-facing text — page copy, MDX content, FAQ answers, UI
  strings, meta descriptions. The goal is natural, human writing with none of
  the usual AI tells.
- **SEO is always a big priority.** The user provides the primary keyword(s)
  when requesting a tool — if they haven't, ask before writing copy. Optimise
  the page for that primary keyword and its related secondary keywords:
  title, meta description, H1, section headings, FAQ questions, and body copy
  should work the keyword set in naturally (no stuffing — the stop-slop
  standard applies here too).

---

## Before writing code — decisions to settle

1. **Primary metric.** Exactly one metric drives rank, personal best, and the
   trend graph. Pick its `direction` (`'higher-is-better'` or
   `'lower-is-better'`) and unit. Secondary metrics (like the CPS test's
   `clicks`) are recorded for context but never ranked.
2. **Rank table.** Five tiers, always the same ids: `elite`, `pro`,
   `advanced`, `intermediate`, `beginner`. Thresholds are the *worst* value
   that still earns the tier (`Infinity`/`0` for beginner). Each tier gets a
   human `rangeLabel` for the checklist.
3. **Settings.** What the user can configure (duration, difficulty, input
   method…). Every recorded score stores the settings it was achieved under —
   this is the leaderboard-readiness rule (REVAMP.md §4.1). Keep the set
   small; each setting needs UI in the settings panel and validation in the
   loader.
4. **URL slug + SEO.** One flat, depth-1 route (`/typing`, `/aim`). Titles on
   tool pages target the primary keyword and carry **no "| ReflexLab"
   suffix**. Title and meta description are authored by hand, never derived.
   The primary keyword comes from the user (see "Copy and SEO" above) — get
   it before writing any SEO text.
5. **Content.** The long-form copy below the test (what-is, how-it-works,
   good-score table, FAQ). Content is the binding constraint — don't ship a
   tool page with placeholder copy. Written with `stop-slop`, optimised for
   the keyword set.

---

## Step 1 — Registry entry (`src/data/tools.ts`)

Add one object to the `tools` array: `href`, `name`, `navLabel`, `icon`
(Phosphor, `ph:*`, inlined at build time), `blurb`. This alone puts the tool
in the sidebar, the footer, every other tool's "More tools" section, and the
sitemap. The list is deliberately flat — no categories.

## Step 2 — Engine definition (`src/data/tool-defs.ts`)

Export a `defineTool({...})` with `id`, `metrics`, `ranks`, `maxHistory`.
Follow `cpsTool` as the template.

- `id` becomes the localStorage namespace (`reflexlab:<id>:<field>`) — pick it
  once, never rename it.
- Exactly one metric has `primary: true` (`defineTool` throws otherwise).
- Ranks are listed **best-first**; give each a `rangeLabel`.
- Numeric display formatting belongs on the metric (`format: (v) => ...`),
  not in the UI code.
- **No `legacy` block.** Legacy key migration exists only for the two
  pre-revamp tools. New tools start clean.

Keep this file free of DOM/UI imports — it is loaded by client code and the
split from `tools.ts` exists to keep rank tables out of nav-only bundles.

## Step 3 — Content (`src/content/tools/<id>.mdx`)

Frontmatter is a `faq` array (`question`/`answer` pairs) — the page builds
FAQPage JSON-LD from it. The body is the visible long-form copy, using the
global class vocabulary from `src/styles/content.css` (`info-section`,
`steps-list`, `rank-table`, `note`, `disclaimer`, FAQ `details`, …).

**MDX gotchas (learned the hard way):**

- Never wrap multi-line text in a literal `<p>` tag — MDX wraps the text in
  its own `<p>`, producing nested paragraphs the browser splits apart. Write
  bare text paragraphs (blank-line separated) and let MDX generate the `<p>`.
- Classed block wrappers (`.note`, `.disclaimer`, intro paragraphs) must be
  `<div class="...">`, not `<p class="...">`, for the same reason.
- Links/buttons that must not gain an inner `<p>` (e.g. a `.btn` anchor) go
  on **one line**: `<a href="/" class="btn btn-primary">Take the Test</a>`.

## Step 4 — Page (`src/pages/<slug>.astro`)

Copy the structure of `src/pages/cps.astro`:

1. `BaseLayout` with authored `title`, `description`, `path`, `topbarLabel`.
2. FAQ JSON-LD `<script slot="head" is:inline type="application/ld+json">`
   built from the content entry's frontmatter.
3. Top-bar controls via `slot="controls"` — the bar is a slot, not a fixed
   set of buttons (§3.5). Sound toggle (`#sound-toggle` with
   `#sound-icon-on`/`#sound-icon-off`) and reset (`#reset-btn`) are the
   standard pair; add tool-specific controls as needed.
4. Hero (`h1` + subtitle), then the test card: `.settings-panel` (space-
   between; one `.setting-group` per setting, `.btn-group` of `.btn-option`
   buttons) and the test area. Test-area element ids are tool-prefixed and
   are the DOM contract with your script.
5. `<ResetModal message="..." />` and `<ProgressWidgets ... />` — these are
   the **rig's static skeleton**. Their element ids (`widget-pb-*`,
   `widget-avg-*`, `rank-checklist`, `history-list`, `session-chart`,
   `reset-modal`, …) are the rig's DOM contract; never rename them. Pass
   `ranks={[...tool.ranks].reverse()}` (checklist shows the climb
   worst-first).
6. `<Content />` (the MDX body), then `<RelatedTools current="/<slug>" />`.
7. Load the script at the bottom: `<script> import '../scripts/<id>'; </script>`.

Scoped styles on the page cover only what's unique to this tool's test area;
shared long-form styling comes from importing `../styles/content.css`.
Remember Astro scoped styles need `:global()` for elements your script
creates at runtime.

## Step 5 — Measurement script (`src/scripts/<id>.ts`)

This file owns **only** the measurement loop and test-area state machine.
Everything below the test area (best, average, ranks, trend, history, reset)
is the rig's job. Follow `src/scripts/cps.ts`:

1. `const { store, adapter } = openTool(tool)` — storage, namespaced keys.
2. `loadSettings()` — read via `store.getSettings(DEFAULTS)` and validate
   every field (stored values are untrusted).
3. `createRig(tool, store, adapter, copy, config)` — `copy` supplies the
   tool's phrasing (best/avg descriptions, history line, chart tooltip, run
   label); `config` takes `onReset` and optionally `telemetryWindow` /
   `chartBeginAtZero`.
4. The loop itself. Record a finished run with
   `rig.recordScore({ <metrics> }, { <settings snapshot> })` — metrics plus
   the settings context, always.
5. Sound via `createBeeper({ enabled: () => settings.sound })`.

**Timing integrity (REVAMP.md §8, non-negotiable):** `performance.now()` is
the clock, and nothing — no DOM reads, no allocation-heavy work — sits
between the stimulus (or input event) and the measurement. Stamp the time
first, do everything else after.

**Accessibility baseline:** the test area is focusable (`tabindex="0"`,
`role="button"`, a real `aria-label`), has a keyboard path in every input
mode, and announces state changes through a `visually-hidden`
`aria-live` element.

## Step 6 — What you get for free

- Sidebar/footer/cross-links and the sitemap entry (priority 0.9) — from the
  registry; the sitemap regenerates on every build.
- localStorage persistence, PB/average/trend/history/rank-checklist UI, the
  reset flow, and lazy Chart.js loading — from the rig.
- Canonical URL, OG/Twitter tags, GA — from `BaseLayout`.

---

## Design rules (see DESIGN.md — binding)

- **One Signal Rule:** Signal Green means "act now" and nothing else.
- **Rank-Only Colour Rule:** the rank palette colours ranks, nothing else.
- **Monospace-Numerals Rule:** every changing number gets the `.readout`
  class.
- Panels use the tonal ramp (`--panel-0X`); glow communicates state, not
  decoration.

## Verification checklist

- [ ] `npm test` passes (engine untouched, definitions valid).
- [ ] `npx astro build` succeeds; `public/sitemap.xml` gained exactly the new
      URL.
- [ ] Dev-server pass: settings persist across reload, a run records, PB/avg/
      history/chart/checklist update, reset clears and the modal focuses
      correctly, sound toggle works.
- [ ] Rendered HTML has no nested `<p><p>` (the MDX gotcha above):
      `curl -s localhost:4321/<slug> | grep -c '<p><p>'` → 0.
- [ ] Playwright smoke test (system Chrome: `channel: 'chrome'`) covering the
      happy path and keyboard input, mirroring the scripts used for the CPS
      and reaction tests.
- [ ] Mobile viewport (~390px) eyeball: settings panel wraps, test area is
      usable, top bar intact.
- [ ] SEO block review: authored title (no suffix), description, canonical =
      `https://reflexlab.co/<slug>`, FAQ JSON-LD parses.

## Don'ts

- Don't modify `src/engine/*` for a tool-specific need.
- Don't rename a tool `id` or any rig DOM id after shipping.
- Don't add a `legacy` block to a new tool, or touch `reactionlab_*` /
  `cpslab_*` keys.
- Don't derive titles/descriptions from templates — SEO text is authored.
- Don't add categories/grouping to the registry — presentational concern,
  deliberately deferred.
