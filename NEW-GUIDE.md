# Adding a New Guide

Process doc for Claude (and anyone else) writing or revising a guide on
ReflexLab. The architecture is shaped so that a guide is **one category, one
MDX file, its figures, and its sources — no template changes**. The shared
template (`src/pages/guides/[slug].astro`) supplies the header, structured
data, TOC rail, and everything else. If a guide seems to need template edits,
stop and reconsider.

This doc was distilled from the full revamp of the how-to-improve guide —
every rule below was applied there, not invented here. That page
(`src/content/guides/how-to-improve-reaction-time.mdx`) is the reference
implementation.

Companion docs: `NEW-TOOL.md` (tools), `REVAMP.md` (architecture), `DESIGN.md`
(visual contract), `PRODUCT.md` (what the site is).

---

## When the pattern doesn't fit — ask first

Some future guide will not fit this template: a data study with original
numbers, an interactive explainer, a comparison page. Do not force it into the
pattern, and do not silently improvise around it. Ask the user first, agree on
the shape, then build. A wrong guide shipped "by the book" is worse than a
conversation.

---

## Does this guide earn its place?

The strategy gate, agreed 2026-09-01. Every guide must pass all four before a
word is written:

1. **It directly bolsters a live tool.** A clear internal-link relationship to
   a tool page — topical authority for the tools' rankings is the primary goal
   of the guides program. No orphaned essays.
2. **Quality over quantity.** Few, deep pieces. A guide that reads rushed or
   bulk-generated damages the site more than its absence would.
3. **No commodity explainers.** "What is reaction time" is fully cannibalized
   by AI Overviews; every competitor has one. Favor **benchmark and data
   content** ("average reaction time by age", "average CPS") — comparison
   queries pair with the interactive tests, earn links, and get _cited_ by AI
   Overviews rather than replaced.
4. **Content capacity is the binding constraint** (REVAMP.md §5). When guides
   and tool rollout compete for effort, tools win.

## Copy and SEO — every guide

- **All copy is written with the `stop-slop` skill** — body prose, FAQ
  answers, figure titles, chart labels, source lines, meta descriptions. An
  em dash in a figure caption is still an em dash.
- **SEO is a priority.** The user provides the primary keyword(s) — if they
  haven't, ask before writing. Work the keyword set into title, description,
  H1, headings, and FAQ questions naturally; the stop-slop standard applies
  to SEO text too.
- **Honesty is the differentiator.** Say what doesn't work ("no training plan
  turns an average adult into a 150 ms outlier"; hardware fixes "stop your
  equipment padding the number" rather than making anyone faster). This is
  deliberate positioning against content-farm competitors — never trade it
  for a rounder claim.
- **Never** "Key Takeaways" boxes (the most recognizable AI-content trope),
  never padded sections, never filler tips ("stay hydrated").

---

## Step 0 — Research before writing

The research pass comes first because it decides what the article and its
figures can honestly say.

- **Verify every numeric or factual claim against the actual literature**
  (search, then fetch the paper). A claim inherited from an old draft gets
  corrected to what the studies say — never sourced as-is.
- **Never cite a source whose exact title and author list you haven't
  confirmed.** Fetch the paper's page; "et al." is fine, guessed names are
  not.
- **Citations are numbered footnotes:** `<sup class="cite"><a
href="#source-N">N</a></sup>` in prose, numbered by first appearance,
  resolving to a `## Sources` section:

  ```html
  <ol class="sources-list">
    <li id="source-1">
      Woods, D. L., et al. (2015). Factors influencing the latency of simple reaction time.
      <em>Frontiers in Human Neuroscience</em>.
      <a href="https://...">frontiersin.org</a>
    </li>
  </ol>
  ```

- **No decorative citations** — every source is load-bearing for a specific
  claim. The reference guide carries ten; treat that as the ceiling, not a
  target.
- **Never link competitors** (Human Benchmark et al.), even when citing a
  statistic associated with them — attribute as "large public web datasets".

## Step 1 — Category (`src/data/guide-categories.ts`)

Every guide declares one `category` in frontmatter, validated against the
registry. The registry owns each category's display name and emoji (rendered
as the header eyebrow; later, the /guides hub grouping). Existing ids:
`reaction-time` ⚡, `click-speed` 🖱️, `memory-cognition` 🧠.

A new category is **one registry entry** — never an ad-hoc string in
frontmatter. This is content-side taxonomy only; the tool registry and
sidebar stay flat (REVAMP.md §3.3).

## Step 2 — The MDX file (`src/content/guides/<slug>.mdx`)

The filename is the live URL slug — pick it once, never rename it.

**Frontmatter:**

| Field                            | Notes                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                          | H1 and breadcrumb label                                                                                                                                    |
| `pageTitle`                      | The complete `<title>`. Guides carry the `\| ReflexLab` suffix (tool money-pages don't — REVAMP.md §7)                                                     |
| `description`                    | Meta description, keyword-targeted                                                                                                                         |
| `subtitle`                       | Dek under the H1                                                                                                                                           |
| `snippet`                        | Card copy on the guides index                                                                                                                              |
| `order`                          | Position on the guides index                                                                                                                               |
| `category`                       | Registry id (Step 1)                                                                                                                                       |
| `datePublished` / `dateModified` | ISO dates. `dateModified` moves **only when content changes**, never on redeploys — it renders as the visible "Updated" line and feeds the Article JSON-LD |
| `tocLabels`                      | Optional, keyed by heading slug — overrides for TOC entries still too long after the automatic colon-trim                                                  |
| `faq`                            | Optional `question`/`answer` pairs → FAQPage JSON-LD. Visible FAQ lives in the body **worded identically**                                                 |

**Body structure** (follow the reference guide):

1. Component imports (figures).
2. Intro: `<div class="article-intro article-intro-callout">` — the green
   callout is the page's above-the-fold accent.
3. Sections as **markdown `##` headings**, never `<section>` wrappers — the
   TOC rail extracts markdown headings only. Number the method sections
   (`## 1. …`) only when they form a real sequence; the TOC pulls the number
   into its marker gutter and trims the heading at the first colon, so write
   headings as `N. Short name: the dek part`.
4. **Contextual tool links**: link the tool at moments of action ("run one
   session to set a baseline"), not as generic CTAs.
5. `## Frequently asked questions` — 2–4 genuinely-asked questions max, `###`
   per question, never forced. Skip the section entirely (and the `faq`
   frontmatter) if none earn a place.
6. `## Sources` — the ol above.
7. Closing CTA: `<section class="article-cta">` with an `<h2>`, one bare-text
   paragraph, and the `.btn.btn-primary` link on a single line.

**MDX gotchas** (superset of NEW-TOOL.md's — all learned the hard way):

- Never wrap multi-line text in a literal `<p>` — MDX nests paragraphs.
  Bare, blank-line-separated text; `<div>` for classed wrappers.
- Inline elements that must not gain an inner `<p>` (the CTA button) go on
  one line.
- MDX wraps `<li>` content in `<p>`; `sources-list` CSS already resets it.
- **Never put `{/* */}` JSX comments in MDX** — prettier's markdown pass
  rewrites the asterisks (`{/_ _/}`) and the build fails with a cryptic
  parser error. Authoring notes go in component comments or this doc.

## Step 3 — Figures (`src/components/guides/`)

Charts are what separate the guides from the text-only competition — and they
are load-bearing, not decorative.

- **Every figure illustrates sourced data.** If the data isn't cited, the
  figure doesn't exist. Two or three excellent figures beat six mediocre ones.
- **Static HTML/CSS components, zero JS.** Not Chart.js — that stays the tool
  pages' trend graph. Read the `dataviz` skill before writing any chart code.
- **Anatomy** (`.guide-figure`, shared chassis in `article.css`): emoji +
  title (widget emoji vocabulary: 📊 😴 ☕ — aria-hidden, beside text), a
  subtitle naming measure and units, the plot, a source line naming the
  study. Plot-specific styles stay scoped in the component.
- **Color encodes data semantics only** (DESIGN.md, Guide-Figure Data
  Encodings): green tint = measured-benefit zone, amber = rising side
  effects/severity, Hold Red = danger-level reading; rank hues only in
  figures charting the rank bands themselves. Every colored zone or bar is
  also labeled in text. Neutral ink/panel fills otherwise.
- **Monospace for every measured value** in a figure (Monospace-Numerals
  Rule); axis ticks and value labels included.
- **Labels must survive narrow widths**: hide or restructure below the width
  where they'd collide or clip (legend fallback, dropped zone labels) —
  never `overflow: hidden` on a label.
- An `aria-label` on the figure carries the data for screen readers; the
  surrounding prose states the key numbers regardless.

## Step 4 — What you get for free

From `[slug].astro` + the registry, with zero per-guide work:

- Category eyebrow, H1/dek, "Updated {date} │ {N} min read" meta row (read
  time computed from the body — never hand-written).
- Breadcrumbs (all three crumbs, wrapping as whole items) + BreadcrumbList
  JSON-LD.
- Article JSON-LD — **publisher-level attribution only; there is never a
  personal byline anywhere on ReflexLab** (maintainer decision).
- FAQPage JSON-LD when `faq` frontmatter exists.
- TOC rail (≥3 markdown H2s, ≥1100px): colon-trimmed labels, number gutter,
  tier gaps, scrollspy active state, "↑ Back to top". The scrollspy's inline
  script is the **one sanctioned exception** to guides shipping zero JS —
  don't add more.
- Sitemap entry (priority 0.7), canonical, OG/Twitter tags, GA, the guides
  index card, and the guide-appropriate disclaimer.

---

## Design rules (see DESIGN.md — binding)

- **Premium, never bulked** — if a section doesn't earn its place, cut it.
- One Signal Rule, Rank-Only Color Rule, Guide-Figure Data Encodings, and
  the emoji iconography rules all apply to guide surfaces.
- Green on hover for interactive elements (citations, TOC links) is
  sanctioned "active" use. Decorative green is not.
- **Rejected by the maintainer — don't reintroduce:** a rank-spectrum rule in
  the header, a visible source count in the meta row, a green meta separator
  (it's a grey hairline), per-guide emoji (category owns the emoji), "Key
  Takeaways" boxes, colored H2s, gradient headers, decorative glows.
- **Deferred, not rejected** (ask before building): training-protocol
  centerpieces, per-guide OG images, localStorage-personalized guide content,
  a mobile TOC, /guides hub category grouping.

## Verification checklist

- [ ] `npx prettier --write`, `npm run check`, `npm run build` all clean.
- [ ] Built HTML greps clean: `grep -c '<p><p>' dist/guides/<slug>.html` → 0;
      Article/BreadcrumbList (+FAQPage if applicable) JSON-LD present; TOC
      links and heading ids match.
- [ ] Sources: every superscript resolves to the right `#source-N`; every URL
      fetched and alive; numbering follows first appearance.
- [ ] Stop-slop scoring pass on the final prose (target ≥35/50).
- [ ] Desktop eyeball at ~1440px: figures, TOC alignment, header.
- [ ] **True mobile eyeball** at 375px and 320px. Headless Edge on this
      machine enforces a ~500px window floor — render the page inside a
      375px iframe (see the scratchpad harness pattern) or use devtools
      emulation. Check: breadcrumbs wrap as whole items, figure labels
      behave, callout padding, no horizontal scroll.
- [ ] `dateModified` reflects this change; other guides' dates untouched.
- [ ] After content-schema changes (`content.config.ts`): **restart the dev
      server** — it 404s or serves stale schemas until restarted.

## Don'ts

- Don't touch `src/pages/guides/[slug].astro` for a single guide's need.
- Don't add a personal byline, author name, or author schema — ever.
- Don't bump `dateModified` without a content change.
- Don't link competitor tools, cite unverified papers, or keep a claim the
  literature contradicts.
- Don't force a FAQ, an extra figure, or a section to hit some imagined
  quota — the premium bar is what's enforced, not length.
- Don't add client-side JS to a guide beyond the template's scrollspy.
- Don't invent category strings — one registry entry, schema-validated.
