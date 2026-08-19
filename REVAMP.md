# ReflexLab Revamp

Rebuilding ReflexLab from a two-tool static site into a hub for browser-based
performance tests (reaction, clicking, aiming, typing, and more).

**Branch:** `revamp` — all work happens here. `main` stays live and untouched.
Merge timing is the maintainer's call; §7 covers what has to be true before it
happens, not when.

---

## 1. Why

The site was built as one or two utility pages plus supporting content. The
category is much larger than that, and a hub covering 30+ tools is a stronger
position than a single test. The current stack does not scale to that:

- **Duplicated shell.** `index.html` (920 lines) and `cps.html` (843) carry
  near-identical head, nav, and footer blocks. A nav change today touches all nine
  HTML files; at 30 tools it touches thirty-five.
- **Duplicated engine.** `app.js` (1347 lines) and `cps.js` (869) are roughly
  60–70% the same code: localStorage persistence, rank resolution, Chart.js
  trend graph, Web Audio beeps, timestamped history log, reset modal, settings
  groups. That was copied once. It cannot be copied 28 more times.
- **Global CSS.** `styles.css` is 1927 lines in a single namespace.
- **Manual sitemap.** `sitemap.xml` is hand-maintained and feeds the IndexNow
  workflow, so a missed entry silently means a page is never submitted.

## 2. Target stack

**Astro**, deployed to Vercel as it is today.

| Concern | Approach |
|---|---|
| Framework | Astro — zero JS by default, islands for the interactive tools |
| Styling | CSS custom properties generated from `DESIGN.md` + Astro scoped styles |
| Content | Astro content collections (MDX) for guides and per-tool copy |
| Charts | Chart.js, dynamically imported only after a session completes |
| Icons | Build-time inline SVG, replacing the CDN Phosphor script |
| Sitemap | `@astrojs/sitemap`, generated from routes |
| Analytics | GA4 `G-XWQNL6HFLK`, hoisted into a single layout |
| Tests | Vitest for pure functions. No browser-level testing for now |

**Why Astro over Next.js:** the product is a sub-millisecond timer. React's
render cycle is a liability there, and we would drive the DOM imperatively
through refs anyway — paying hydration cost for nothing. Astro also lets the
existing IIFE-style JS port over nearly verbatim rather than being rewritten
into components.

**Why not stay static with a partials script:** viable, but we would want
content collections, then asset bundling, then sitemap generation, and end up
having rebuilt a worse Astro.

## 3. Architecture

### 3.1 The tool engine

The shared surface is **not the test — it is everything below the test area.**
Measurement loops differ completely between a reaction test, a click counter, a
canvas aim trainer, and a typing test. The telemetry rig around them is
identical every time: personal best, session average, rank badge, achieved-rank
checklist, trend chart, timestamped history, reset modal, sound toggle,
settings persistence.

**Tools may report more than one metric.** Reaction time and CPS each produce a
single number, but a typing test produces WPM *and* accuracy, and an aim
trainer plausibly produces accuracy alongside time-to-target. The engine is
built for that from the start — retrofitting it at tool five would mean
touching every tool already shipped and re-migrating stored records.

Target shape:

```js
createTool({
  id: 'typing-speed',
  metrics: {
    wpm:      { label: 'WPM',      direction: 'higher-is-better', primary: true },
    accuracy: { label: 'Accuracy', direction: 'higher-is-better', format: pct },
  },
  ranks: [...],          // keyed off the primary metric
  settingsSchema: {...},
})
```

Rules:

- **Exactly one metric is primary.** It drives the rank, the personal best, the
  trend chart, and anything the sidebar surfaces. Everything downstream
  has one unambiguous number to sort and compare on.
- **Secondary metrics are stored and displayed**, and can be charted later, but
  never drive ranking. Keeps the rank system comprehensible as tools multiply.
- **`direction` belongs to the metric, not the tool** — a single tool can carry
  metrics that disagree about which way is better.
- Reaction time and CPS are the degenerate case: one metric, marked primary.
  Same shape, no special-casing.

This supersedes a tool-level `direction` flag. The existing tools already
disagree structurally — `app.js` ranks on `maxMs`, `cps.js` on `minCps` — and
per-metric direction normalizes that once instead of forking every comparison,
chart axis, and is-this-a-PB check downstream.

Each tool then implements only its measurement loop and its test-area
rendering.

### 3.2 Storage migration

Current keys were chosen ad hoc per tool: `reactionlab_*` and `cpslab_*`. Move
to a namespaced `reflexlab:<toolId>:<field>` scheme before there are thirty of
them.

**This carries real user-facing risk.** Returning visitors are the ones with
personal bests worth keeping, and they are exactly the audience we care about.
A migration shim must read both legacy prefixes and rewrite them on first load.
Treat this as a blocking requirement, not a cleanup.

Scores are stored as **records** rather than bare numbers, and all access goes
through a narrow persistence interface:

```json
{
  "toolId": "typing-speed",
  "ts": 1755500000000,
  "metrics": { "wpm": 82, "accuracy": 0.96 },
  "settings": { "duration": 60, "wordList": "common-1k" }
}
```

- `metrics` is an object, never a scalar — required by the multi-metric engine
  (§3.1), and it means adding a secondary metric to an existing tool does not
  break its stored history.
- `settings` captures the conditions the score was achieved under, so results
  stay comparable. Required by §4.1, and unreconstructable after the fact.

The legacy migration maps existing bare numbers into single-metric records.
Neither the record shape nor the persistence interface should be simplified
away without reading §3.1 and §4.1 first.

### 3.3 Tool registry

One `tools.ts` as the single source of truth per tool: slug, name, blurb, icon,
metric definitions, rank table, related tools. It drives the sidebar,
cross-links, the sitemap, JSON-LD, and each tool page's SEO block.

Adding a tool becomes: one registry entry, one content file, one measurement
loop. The registry is also what makes cross-linking scale, which — with no
catalogue page (§3.4) — is where the internal-linking value of a hub site now
comes from.

**No categories.** Tools are standalone and the list stays flat — no taxonomy
field, no nesting. Worth revisiting only when the flat sidebar list stops being
scannable, realistically somewhere past a dozen or fifteen entries. Grouping
can be added later as a purely presentational field without disturbing stored
data or URLs, so there is no cost to deferring it.

### 3.4 Routing and information architecture

**Decided: the reaction test stays at `/`.**

It holds SERP rankings we are not willing to gamble on, and moving a
top-ranking page costs weeks of recovery even behind a correct 301.
`cpstest.org` runs this exact pattern successfully — a hub whose homepage is
also its strongest single tool — so this is not a compromise, it is the proven
shape for the category.

Implications:

- **There is no catalogue page.** No `/tools`, no hub grid. The sidebar (§3.5)
  lists every tool on every page, which makes a dedicated browse page redundant
  at this scale. Revisit only if the tool count outgrows what a sidebar can
  comfortably list — the same trigger as the grouping question in §3.3.
- `/` does double duty: it has to work as the reaction test *and* route people
  into the wider catalogue. With no hub page, discovery rests entirely on the
  sidebar and related-tool cross-links.
- Flat, keyword-clean slugs throughout: `/cps`, `/typing-test`, `/aim-trainer`,
  consistent with what `/cps` already established.
- Revisit only if another tool ever outgrows the reaction test in traffic.

### 3.5 Application shell

Moving from the current top nav to a **sidebar-driven app shell** — more
application than website, and navigable across an extensive catalogue without a
menu dive.

- **Sidebar** — fixed, full viewport height, persistent on every page. A flat
  list of tools driven by the registry (§3.3), so a new tool appears in the nav
  with no separate edit, plus a secondary block for Guides and About. With two
  tools today, those secondary links are also what keeps the sidebar from
  looking empty.
- **Top bar** — above the main column. Sound, reset, and whatever controls
  later tools need.
- **Main column** — the tool, then its long-form content beneath it.

Six things this decision implies:

**The top bar is a slot, not a fixed set of buttons.** Controls are per-tool:
sound and reset apply broadly, but an aim trainer wants sensitivity and a
typing test wants a word-list picker. Each tool should declare its controls and
the shell renders them. Hardcoding sound + reset now means rebuilding the shell
around tool five.

**The sidebar is fixed; the page still scrolls.** This is the one real tension
with §5. Tool pages carry hundreds of lines of prose because that copy is what
ranks, and a strict 100vh non-scrolling app shell has nowhere to put it.
Resolution: sidebar and top bar stay fixed, the main column scrolls normally —
tool occupying roughly the first screen, content below the fold. It reads as an
app without becoming a single-screen app.

**The sidebar replaces the hub page entirely.** There is no `/tools` catalogue
(§3.4) — with every tool listed permanently in the sidebar, a browse page earns
nothing at this scale. That makes the sidebar load-bearing rather than
convenient: it is the only catalogue the site has, so it has to stay scannable
as tools accumulate.

**Keyboard access needs deliberate handling.** Thirty sidebar links means
thirty tab stops before reaching a test that is Space/Enter-driven and is the
entire point of the page. The existing skip link becomes essential rather than
a nicety — it must be the first focusable element, and focus should land on the
test area. This is a WCAG obligation under §8, not a polish item.

**Mobile is a separate design, not a squeezed sidebar.** Options roughly in
order of preference:

- Off-canvas drawer behind a hamburger — conventional, costs no vertical space,
  leaves the full screen to the test.
- Bottom tab bar for the two or three most-used tools, drawer for the rest.
- Collapsed icon rail — likely too cramped past a dozen tools.

Hard constraint either way: **nothing may consume vertical space during an
active test.** The test area needs maximum real estate on mobile, and every
piece of persistent chrome competes with it. Top-bar controls probably collapse
into a menu or move inline with the tool.

**The layout must not foreclose ads.** They are coming eventually (§4.2). We
are not building slots now, but the shell should be laid out so they can be
added without a rebuild — see §4.2 for what that means concretely, chiefly not
committing to a two-column grid that leaves nowhere for a right rail.

`nav.js` is superseded by this and goes away.

## 4. Backlog

Wanted, but deliberately out of scope for the initial rebuild.

### 4.1 Leaderboards and global percentiles

"Faster than 73% of players" is a strong differentiator and a real retention
hook. Not in the rebuild — but it is a genuine roadmap item rather than a
maybe, which changes how the engine gets built in phase 2.

**Do now, because it is cheap now and expensive later:**

- Keep persistence behind a narrow interface so a remote adapter can slot in
  later without touching tool code.
- Store scores as **records, not bare numbers** — score, timestamp, tool id,
  and the settings they were achieved under.

That second point matters more than it looks. A 5-second CPS run is not
comparable to a 60-second one, and a reaction time on a 1–3s delay is not
comparable to one on 3–8s. Without settings context captured at write time, any
future leaderboard rests on data that cannot be fairly compared — and that
history cannot be reconstructed after the fact.

**Defer entirely:** backend, accounts, sync, anti-cheat. Astro + Vercel
functions + serverless Postgres covers it when the time comes; none of it needs
deciding now.

**Flag:** shipping this changes the privacy position in `PRODUCT.md` (nothing
leaves the device). That copy needs revisiting deliberately, not by accident.

### 4.2 Advertising

Confirmed as the primary long-term monetisation, but not shipping soon. Nothing
gets built now — the point is to avoid a layout that has to be torn up later.

**Design the shell so ads can arrive without a rebuild:**

- **Do not commit to a rigid two-column grid.** Sidebar + main leaves no room
  for a right rail, the most conventional desktop placement once the left
  column is nav. Treat the shell as sidebar / main / optional rail even while
  the rail renders nothing.
- **Reserve dimensions, never collapse them.** Slots that appear at runtime and
  push content down produce layout shift, and CLS is a ranking factor — so ads
  would be taxing the SEO the site runs on. Fixed-height containers from the
  start.
- **Mobile placement collides with §3.5.** The rule that nothing may consume
  vertical space during an active test does not bend for an ad unit. Viable
  placements are below the test area and between content sections; a sticky
  mobile banner is not compatible with the test surface.
- **CSP interacts with this.** Ad scripts need explicit allowances, which is
  another argument for treating the §6.2 CSP work carefully rather than
  bolting a policy on and later punching holes in it.

**Product conflict, worth naming once.** `PRODUCT.md` lists "cheesy,
ad-cluttered reaction-test sites" as the primary anti-reference, and Design
Principle 4 promises no ads. Running ads is a business decision and not a
technical one — but those documents will need amending when ads ship, or the
design system asserts something the site no longer does. The distinction worth
writing into them: ads that sit **outside** the measurement, versus the
competitor pattern of ads that crowd it. The test surface itself staying clean
is what keeps the original positioning honest.

## 5. Content is the binding constraint

`index.html` is 920 lines because of the What Is / How It Works / Good Score /
FAQ sections. That copy is what ranks — not the test widget. Thirty tool pages
carrying a widget and two paragraphs is a thin-content site that ranks for
nothing.

So the per-tool template must **require** long-form content and FAQ JSON-LD,
authored as MDX in a content collection rather than hardcoded in markup.

Realistically this is the constraint on how fast tools ship, more than the
engineering is. Plan tool rollout around content capacity.

### Existing content

Copy on the current tool pages, guides, about, and privacy **stays as written**
for now. Phase 5 is a mechanical port — lift the prose into content
collections, keep the section structure and FAQ JSON-LD intact. No rewrite.

Two caveats:

- **This does not relieve the requirement for new tools.** The existing two
  pages already carry their long-form content; the next twenty-eight each need
  it written from scratch. Content capacity remains the binding constraint on
  rollout — see above.
- **Reflow, not rewrite.** The sidebar takes width the main column used to
  have, so the prose needs a typography pass against the 65–75ch cap in
  `DESIGN.md`.
- **Guides use the same shell as tools** — no separate reading layout. They are
  secondary content and not worth a second shell to maintain. The 65–75ch cap
  does the readability work within the standard main column.

## 6. Repository hygiene

Structural cleanups for a repo that has to carry thirty tools. None of these
change page content or how any tool behaves.

### 6.1 Resolved by the migration itself

These need no separate effort — the Astro move fixes them as a side effect, but
they are listed so we can confirm each one actually got fixed rather than
assuming:

| Issue | Current state | Resolution |
|---|---|---|
| GA4 snippet duplicated | Inlined in all 9 HTML files | Single layout |
| `<head>` ordering | GA `<script>` sits **above** `<meta charset>` in every file — charset must land in the first 1024 bytes | Layout template, ordered correctly once |
| Global CSS namespace | 3 stylesheets, no scoping | Scoped component styles |
| Hand-maintained sitemap | Manual `sitemap.xml` | `@astrojs/sitemap` |
| No cache busting | Unhashed `styles.css`, `app.js` | Content-hashed assets |
| No dependency manifest | No `package.json` or lockfile, despite CI running Node | Comes with the scaffold |

### 6.2 Needs deliberate action

**Unpinned third-party script — fix regardless of timeline.** Every page loads
`https://unpkg.com/@phosphor-icons/web` with **no version specified**. That is
live-at-HEAD from a third party on all 9 pages: an upstream breaking change or
a compromised publish lands in production with no deploy on our side. Chart.js
is at least pinned to `4.4.1`. Moving icons to a build-time inline SVG (§2)
removes the risk entirely; until then it is the most likely cause of an
unexplained visual break.

**`.gitattributes` — and it must land first.** No `.gitattributes` exists, and
git already warns about LF→CRLF on this repo. Windows locally, Ubuntu in CI.
Add `* text=auto eol=lf` **before** the bulk file moves, or line-ending
normalization mixes into every migration diff and makes review impossible.

**Toolchain config.** None present:

- `.editorconfig` and Prettier — formatting drift across thirty tools is
  otherwise guaranteed.
- `.nvmrc` plus an `engines` field, matched to the Node 22 the IndexNow
  workflow already pins.
- `tsconfig.json` with strict mode, since the registry and engine are the parts
  most worth type-checking.

**CI does no checking.** The only workflow is IndexNow, which fires *after*
merge to `main`. Nothing validates a build, lint, or test on a PR — so the
first signal that the site is broken is the live site being broken. Add a check
workflow running build + lint + Vitest.

**Security headers.** `vercel.json` contains only `cleanUrls`. Add the standard
set — `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
`Strict-Transport-Security`. Treat CSP separately and carefully: inline GA
requires nonces or hashes, and a careless policy silently kills analytics.
Verify in preview before it reaches `main`.

**Housekeeping.**

- Delete the stale `dev` branch — it is identical to `main` and only invites a
  mistaken push.
- `.impeccable/hook.cache.json` is still on disk. Gitignored, but leftover
  tool state from a disabled plugin.
- No `LICENSE`. Decide one, even if the answer is "all rights reserved."
- `sitemap.xml` has no `lastmod` values, so IndexNow submissions carry no
  freshness signal.

## 7. Migration approach

Incremental. Astro serves untouched files from `public/` while pages port one
at a time, so nothing goes dark.

**Port the CPS test first**, not the reaction test. It is the smaller file, it
is not the traffic centerpiece, and it proves the engine abstraction against
the tool that differs most from the one we would naturally design around.

### Phase order

- [x] **0 — Scaffold.** Astro project, Vercel adapter, `public/` fallback for
      unported pages. Confirm the existing site still renders end to end.
- [x] **1 — Shell and tokens.** Generate `tokens.css` from `DESIGN.md`, then
      build the new sidebar shell (§3.5) — desktop and mobile — rather than
      porting the existing top nav. A conventional sidebar derived from the
      existing visual language, not a redesign: same panel ramp, hairlines,
      rationed green, and type scale. No separate design pass; amend
      `DESIGN.md` afterwards to document what got built.
- [x] **2 — Engine.** Extract the shared telemetry rig plus the storage
      migration shim, built multi-metric per §3.1. Cover it with Vitest.
- [x] **3 — CPS.** Port as the first tool on the new engine. Validate.
- [x] **4 — Reaction test.** Port, with extra care around timing integrity.
- [x] **5 — Content.** Mechanical port of existing copy into collections;
      per-tool MDX content model. Typography pass for the narrowed column.
- [x] **6 — Linking and discovery.** Registry-driven related-tool cross-links
      and generated sitemap. No catalogue page (§3.4).
- [ ] **7 — New tools.** Typing, aim trainer, and onward.

### Cutover: preserving SEO

Non-negotiable: every live URL keeps working at the same address, with the same
metadata. The site has rankings; the rebuild must be invisible to search
engines.

**The URL contract.** These are the addresses in production today:

| URL | Currently served from |
|---|---|
| `/` | `index.html` — reaction test, top-ranking asset |
| `/cps` | `cps.html` |
| `/guides/` | `guides/index.html` — **trailing slash** |
| `/guides/how-to-improve-reaction-time` | guides/ |
| `/guides/how-sleep-affects-reaction-time` | guides/ |
| `/guides/how-caffeine-affects-reaction-time` | guides/ |
| `/about` | `about.html` |
| `/privacy` | `privacy.html` |
| `/145db6405d4006d1f6914fd03af99c1c.txt` | root — IndexNow key |

**Trailing slashes are the first trap.** The convention above is mixed: leaf
pages carry no trailing slash (`/about`, `/cps`), directory indexes do (`/`,
`/guides/`). Astro's default `build.format: 'directory'` emits `/about/` —
which changes six of the eight URLs. Set `build.format: 'file'` against the
existing `cleanUrls: true` to reproduce the no-slash form.

`/guides/` is then the one genuine mismatch. **Decided: 301 it to `/guides`**,
update the canonical and the sitemap entry to match. It is the only deliberate
URL change in the migration — every other address stays byte-identical.

**Titles are the second trap.** The current titles are deliberately
inconsistent: `/` and `/cps` carry **no** `| ReflexLab` suffix because they
target the money keywords, while about, privacy, and the guides all do. A
layout that auto-appends a site-name suffix would silently rewrite the two most
valuable title tags on the site. Titles, descriptions, canonicals, and OG tags
must be per-page authored values with full override — never template-derived
with no escape hatch.

**Preserve exactly:** per-page title, meta description, canonical, OG and
Twitter tags, and the FAQPage JSON-LD on `/`. Keep OG images at stable,
unhashed paths under `public/assets/` — the OG tags reference them by absolute
URL, and content-hashing those filenames breaks every social preview with no
visible error.

**Verify before merge, not after.** Build a URL inventory diff: crawl
production and the preview deployment, then compare status code, canonical,
title, description, and H1 for every URL. Every difference should be either
intentional or a bug. Write it as a script rather than a manual pass — it needs
re-running at each future cutover.

**Temporary artifacts that must not reach `main`:**

- `src/pages/shell-preview.astro` — built in phase 1 so the shell could be
  reviewed before any real page uses it. Noindexed and absent from the sitemap,
  but it is still a public URL on the preview deployment. **Deleted in
  phase 3** when the CPS port gave the shell a real page.

**After merge:** IndexNow fires automatically on push to `main`. Resubmit the
sitemap in Search Console and watch coverage and Core Web Vitals for a few
weeks. Any URL that genuinely must change later gets a 301, never a 302.

## 8. Constraints to preserve

- **Timing integrity is the product.** No change may add latency between the
  stimulus and the input handler. `performance.now()` stays the clock.
- **`DESIGN.md` is a contract**, not a mood board. The One Signal Rule,
  Rank-Only Color Rule, and Monospace-Numerals Rule carry into the token system
  and survive the rebuild. Skipping Tailwind is deliberate: it would scatter a
  design system that is currently centralized and enforceable.
  **Amendment required:** `DESIGN.md` describes a top-nav layout that §3.5
  replaces. Update it as part of phase 1 so it stays the source of truth rather
  than drifting into a historical document.
- **WCAG 2.1 AA**, per `PRODUCT.md`. Never signal state by colour alone — the
  core mechanic is a red→green flip and must stay playable with deuteranopia.
- **`145db6405d4006d1f6914fd03af99c1c.txt` must stay at the site root** for
  IndexNow key verification, which means `public/` in Astro.
- **The IndexNow workflow reads `sitemap.xml`** and fires only on push to
  `main`, so work on this branch will not submit anything. Keep the build
  emitting `sitemap.xml` at the same path and `scripts/submit-indexnow.mjs`
  needs no change.
- **No ads, no dark patterns, private by default** — until §4.1 ships and that
  position is revised deliberately.
- **The reaction test stays at `/`.** Not a routing detail — a traffic
  decision. See §3.4.
- **The existing URLs are a contract.** Same addresses, same trailing-slash
  form, same per-page titles and canonicals after cutover. Verified by diff
  against production before merge, not spot-checked after. See §7.
