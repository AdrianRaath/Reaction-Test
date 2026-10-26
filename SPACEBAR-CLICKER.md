# Spacebar Clicker: Product Doc

The running document for the Spacebar Clicker game at `/spacebar-clicker`. It
records how the game works today, the rules for working on it, and what is
planned next. Read this first when picking up a session on the game.

**Keeping it current.** When a change ships, update §3 to §6 to match the code
and add a line to the changelog (§9). When something is planned, it goes in §8
with its status. Decisions the maintainer makes in a session belong here, not
only in chat.

**Related docs**

| Doc                                    | What it holds                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPACEBAR-CLICKER-DESIGN.md`           | The original spec, from before the build. §16 records the reasoning behind each build decision. It is history now: where it and this doc disagree, this doc is current. |
| `src/games/spacebar-clicker/config.ts` | Every number and table: shop items, combo tiers and rules, surge, reactor states, prestige, offline, perks, the isotope track, achievements. Pure data.                 |
| `DESIGN.md`                            | The site's visual contract. The game has four named exceptions in it: Reactor-Ramp, Surge Gold, Shop-Signal and Perk-Family.                                            |
| `NEW-TOOL.md`                          | "Games are not tools": the architecture pattern this game set.                                                                                                          |

## 1. At a glance

- **What it is.** An idle clicker. Each spacebar press feeds energy into a lab
  reactor. Energy buys press upgrades and auto-tappers. A rhythm combo pays
  steady tapping over mashing, surges reward a short burst of speed, and
  "Reset the experiment" is a single prestige layer paid in isotopes.
- **Keywords.** Primary: "spacebar clicker", "spacebar clicker game". The
  spacebar speed test was retitled "Spacebar Speed Test - Free Online Spacebar
  Counter" so the two pages don't split the keyword.
- **Our edge over the SERP.** The rhythm combo, which no competitor has. The
  full shop and reactor tables published on the page. No ads, and honest copy:
  the "unblocked" query gets one plain FAQ answer, no proxy or VPN advice.
- **Status (2026-10-26).** Built on `dev` with perk phase 1 and the isotope UX
  pass, not yet merged to `main`. Unit-tested and browser-checked, but not
  playtested: the balance comes from a simulation.

## 2. Working rules

These are maintainer decisions. Follow them unless the maintainer changes them.

- **Git.** Work on `dev`. The maintainer commits and merges. Never offer to
  commit; give a pre-merge checklist instead.
- **A game page, not a tool.** The shared engine in `src/engine` stays
  untouched. See `NEW-TOOL.md`.
- **Plan before building.** For new features, the maintainer asks for ideas
  first ("don't change any code yet"), picks, then approves the build, often
  in passes. Don't build ahead of an approval.
- **Visual quality matters.** The maintainer checks alignment closely and wants
  the game visually engaging. Clean grids, even spacing and bespoke SVGs.
  Emoji were tried in the shop and rejected because they misaligned.
- **Color.** The palette was opened beyond green and black on 2026-10-22, "as
  long as it looks good". Every new color still needs a named exception in
  `DESIGN.md` saying what it means and where it may appear.
- **Notifications stay quiet.** The shop's only notice is one amber "New" tag
  on a closed tab. Per-tab counts of affordable items and per-row tags were
  tried and rejected as noise.
- **Sound** is on by default, for noteworthy moments only. Never per press.
- **Motion guardrails.** No strobe, no screen shake, no confetti. Every effect
  needs a reduced-motion version.
- **Fit the viewport.** The reactor face is held to about 590px tall so the
  whole game fits a 1440x900 screen.

## 3. Code map

| File                                                  | Responsibility                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/games/spacebar-clicker/config.ts`                | Every number and table: shop items, combo tiers and rules, surge, reactor states, prestige, offline, achievements. Pure data.                                                                                                                                           |
| `src/games/spacebar-clicker/economy.ts`               | Pure functions over the save: costs, energy per press and per second, the luck roll, reactor state and progress, prestige gain and where the next isotope comes, offline award, buying, shop reveals, shop-tab notices, and which one-off upgrades a perk switches off. |
| `src/games/spacebar-clicker/mods.ts`                  | A run's modifiers: every rule a perk or a track rung can bend, in one object. `BASE_MODS` is the shipped game; `modsOf(state)` folds in the Stabiliser, Synchronisation, every owned perk at its level, then the track's rungs in force.                                |
| `src/games/spacebar-clicker/combo.ts`                 | `ComboTracker`: the rhythm combo. Takes timestamps from the caller, so it has no clock of its own, and reads the run's rules on every press.                                                                                                                            |
| `src/games/spacebar-clicker/rng.ts`                   | A seeded random generator (mulberry32). Pure; for perk drops, so a reload can't reroll them.                                                                                                                                                                            |
| `src/games/spacebar-clicker/income.ts`                | `IncomeMeter`: energy per second actually earned over the last 10 s, presses and auto-tappers together, without a surge's or Afterglow's boost. Perk prices and windows are set in it.                                                                                  |
| `src/games/spacebar-clicker/save.ts`                  | `SaveState`, the defensive `parseSave`, and `prestigeReset`, which starts the new run with the track's head starts and any kept perk.                                                                                                                                   |
| `src/games/spacebar-clicker/achievements.ts`          | `checkAchievements`, idempotent.                                                                                                                                                                                                                                        |
| `src/games/spacebar-clicker/format.ts`                | Number formatting: `formatEnergy`, `formatRate`, `formatMultiplier`, `formatDuration`.                                                                                                                                                                                  |
| `src/games/spacebar-clicker/perks.ts`                 | Perk drops, offers, expiry, buying and upgrading, the slot limit and keystone swap (`needsSlot`, `keystoneSwap`), away deferral, Self-Replicator's copy, perk text. Pure.                                                                                               |
| `src/games/spacebar-clicker/spacebar-clicker.test.ts` | Unit tests for the game without perks (67 as of 2026-10-26).                                                                                                                                                                                                            |
| `src/games/spacebar-clicker/sim.ts`                   | The pacing simulation: plays whole runs headless against the real rules, with simulated players and perk policies (§4.12).                                                                                                                                              |
| `src/games/spacebar-clicker/pacing.test.ts`           | Holds the simulation's results in the agreed bands. About 5 s.                                                                                                                                                                                                          |
| `src/games/spacebar-clicker/perks.test.ts`            | Unit tests for perks: the table, every effect, drops, buying, notices and the save (61 as of 2026-10-23).                                                                                                                                                               |
| `src/games/spacebar-clicker/track.ts`                 | The isotope track (§8.3): which rungs are in force for an isotope count and fork picks, what a reset reaches, which forks still need a pick, and the next steps to show. Pure.                                                                                          |
| `src/games/spacebar-clicker/track.test.ts`            | Unit tests for the track: the table, every rung, both sides of every fork, the reset and the save (29 as of 2026-10-26).                                                                                                                                                |
| `tests/browser/*.e2e.ts`, `playwright.config.ts`      | Browser checks in Playwright: the main flows, a whole surge on a fake clock, every reactor state, perks in play, and isotopes (§7).                                                                                                                                     |
| `src/scripts/spacebar-clicker.ts`                     | The browser side: DOM, input, frame loop, surge scheduler, perks in play, saving, sound, every animation. Reuses only `browserAdapter`/`KEY_PREFIX` and `createBeeper` from the engine.                                                                                 |
| `src/pages/spacebar-clicker.astro`                    | Markup and all game CSS, including the perk offer rows, the isotope and perk shelves and their tooltips, the swap dialog, the Perks panel and the glyph template. The frontmatter computes the dial, bezel, mote and offer-ring geometry.                               |
| `src/components/games/ShopIcon.astro`                 | The ten bespoke shop glyphs and their purchase animations.                                                                                                                                                                                                              |
| `src/components/games/PerkIcon.astro`                 | The 25 perk glyphs, in ShopIcon's idiom. The page renders them all into a `<template>` for the script to clone.                                                                                                                                                         |
| `src/content/tools/spacebar-clicker.mdx`              | The long-form copy below the game. Its tables render from `config.ts`, every perk and the drop odds included.                                                                                                                                                           |
| `src/data/tools.ts`                                   | Registry entry: icon `ph:atom`, `telemetry: false`.                                                                                                                                                                                                                     |

## 4. How the game works

### 4.1 Input

- Space presses anywhere on the page, except when a button, link, summary,
  input, textarea, select or details element has focus. The page never scrolls
  on Space, and a held key counts as one press.
- A primary-button pointerdown on the reactor face counts as a press, so the
  game works by mouse and touch. Enter on the focused face counts too.
- Presses are capped at 30 per second. Extra presses are discarded.
- Presses are ignored while a dialog is open and during the half-second reset
  implosion.
- Shop buttons and tabs blur themselves after use, so Space keeps pressing the
  reactor.

### 4.2 Energy

```
Energy per press  = (1 + Finger Strength) x 1.5^Spring Keys x combo x surge x milestone x isotope
Energy per second = sum of auto-tapper output x sync x milestone x isotope
```

- **Surge** is x10, and applies only to presses.
- **Milestone** is `1 + 0.05` per reactor state past Dormant, up to +30%.
- **Isotope** is `1 + 0.1` per isotope, additive.
- **Sync** is 1 unless Synchronisation is owned. With it, auto-tappers get half
  the combo multiplier: `1 + (combo - 1) x 0.5`.
- **Double Tap** is rolled per press after the formula: a chance of 5% per
  level, capped at 50%, to count the whole press twice. A lucky press floats in
  gold. With Chain Reaction a lucky press can roll on to x4 and x8, and each
  doubling pops out beside it as its own gold float.
- `earn()` is the one place energy is credited. It moves `energy`,
  `runLifetime` and `totalLifetime` together.
- **Modifiers.** The formulas above read their rules from the run's modifiers
  (`mods.ts`), not straight from the constants. With no perks the modifiers
  equal the constants, and unit tests hold them there. `energyPerPress` and
  `energyPerSecond` take a play context: the combo count, whether a surge is
  in overdrive, whether presses are in an afterglow, and seconds since the last
  press.

### 4.3 The rhythm combo

- A press keeps rhythm when its interval is within 25% of the rolling mean of
  the last 5 intervals, and under 600 ms. Each kept press adds 1 to the combo.
- The first 5 presses after a break always count, so a combo can start.
- One or two off-rhythm presses in a row add nothing. The third breaks the
  combo, and so does a pause past 800 ms.
- With the Stabiliser, a break drops the combo by 10 instead of resetting it.
- The combo is not saved, so a reload starts at 0.

| Combo | Multiplier | Label     |
| ----- | ---------- | --------- |
| 0     | x1         |           |
| 10    | x1.5       | Steady    |
| 25    | x2         | Locked in |
| 50    | x2.5       | Resonance |
| 100   | x3         | Harmonic  |

The 25% tolerance was checked by Monte Carlo: a tapper with 10% interval
jitter never breaks on rhythm, and one with 20% breaks about three times a
minute. Pauses end most combos, which is intended.

### 4.4 Surges

- Surges are scheduled on **active play**: seconds with the page visible and a
  press within the last 60 s. An idle player never gets one.
- The gap between surges is random, 90 to 180 active seconds.
- The 3 s **warning** counts 3, 2, 1 inside the core, with a tick each second,
  while the dial drains in gold.
- **Active**: 5 s of x10 presses. The core shows live presses per second and
  each press throws sparks.
- **Summary**: a results card over the core for 4 s, tallying presses, rate,
  energy, and the best rate. A new best gets one sheen.
- **Surge drops.** As each surge ends, one in eight drops a perk (§4.13), and
  the results card names it in its family hue.
- **Perks that change surges.**
  - Lightning Rod brings them sooner. Buying it, or dropping it from a slot,
    rescales the wait for the surge already on its way.
  - Storm Front skips the countdown: the surge strikes at once, with the
    stage-change ring rolling off the core.
  - Surge Lines lengthens the overdrive and lets it reach auto-tappers.
  - Afterglow keeps presses at x3 for a while after the surge. The label
    under the core counts it down in gold ("Afterglow x3, 12 s") in place of
    the stage name, and gains float in gold.
- Surge state is not saved, and neither is Afterglow. `bestSurgeCps` and
  `surges` are.

### 4.5 Shop

Two tabs: **Upgrades** for press upgrades, **Auto-tappers** for passive
income. Cost = `round(base x scale ^ owned)`.

| Upgrade         | Effect                                      | Base cost | Scale | Max |
| --------------- | ------------------------------------------- | --------- | ----- | --- |
| Finger Strength | +1 energy per press, each level             | 75        | x1.8  | 20  |
| Double Tap      | +5% chance a press counts twice, each level | 1,500     | x2.5  | 10  |
| Spring Keys     | Press value x1.5, each level                | 25,000    | x6    | 5   |
| Stabiliser      | A broken combo drops by 10 instead of to 0  | 20,000    | n/a   | 1   |
| Synchronisation | Auto-tappers get half your combo multiplier | 100,000   | n/a   | 1   |

Press-upgrade prices went up four to five times on 2026-10-23, and auto-tapper
prices stayed put (§4.12).

| Auto-tapper       | Energy/s each | Base cost | Scale |
| ----------------- | ------------- | --------- | ----- |
| Lab Assistant     | 0.5           | 75        | x1.2  |
| Pneumatic Key     | 3             | 750       | x1.2  |
| Robot Arm         | 15            | 7,500     | x1.2  |
| Quantum Keyboard  | 80            | 75,000    | x1.2  |
| Particle Collider | 200           | 150,000   | x1.2  |

- **Reveals.** Upgrades are always listed. The Lab Assistant is always shown;
  each later auto-tapper appears once the run has earned half its base cost,
  with a toast. Reveals survive prestige, since a second-run player knows the
  shop.
- **The "New" tag** (DESIGN.md, Shop-Signal Exception). A closed tab wears one
  amber "New" tag in its top-right corner when it gains something: an
  auto-tapper newly revealed, any item newly affordable at its current price,
  or a perk offer, when it drops and again when it first becomes affordable.
  Opening the tab clears it. The save remembers the level each item was
  last seen affordable at (`announced`), so dipping below a price and earning
  it back does not re-announce it. The open tab is always treated as seen.
- **Rows** are a three-column grid: a 36px glyph tile, the name and detail, and
  the cost and level. Unaffordable rows are greyed.
- The shop is pinned to the reactor's height and scrolls inside itself.

### 4.6 Reactor states

States come from `runLifetime`, the energy earned this run.

| State         | Lifetime energy | Color                                    |
| ------------- | --------------- | ---------------------------------------- |
| Dormant       | 0               | green `#22c55e`                          |
| Warming       | 500             | green                                    |
| Stable        | 10,000          | green                                    |
| Charged       | 100,000         | teal `#2dd4bf`                           |
| Unstable      | 1,000,000       | cyan `#22d3ee`                           |
| Critical      | 10,000,000      | Cherenkov blue `#38bdf8`                 |
| Supercritical | 100,000,000     | blue-white `#e0f2fe` in a `#38bdf8` halo |

Glow radius and pulse speed rise with each state. A state change plays the
stage-change sequence (§5.3), a toast, an announcement and a chord.

### 4.7 Prestige: Reset the experiment

- Unlocks at 1,000,000 `runLifetime`.
- Pays `floor(sqrt(runLifetime / 1,000,000))` isotopes: 1M gives 1, 4M gives 2,
  25M gives 5. Each isotope is +10% to all gains, permanently. The next one
  comes at (n + 1)² million (`nextIsotopeAt`), and `isotopeProgress` is how far
  the run has come from the last threshold to the next.
- **Wipes**: energy, `runLifetime`, upgrades, tappers, `announced`, and the
  run's perks and offers. The reactor returns to Dormant, and the perk shelf
  fades with the imploding core.
- **Keeps**: isotopes, the prestige count, reveals, achievements, lifetime
  totals and bests, the perk codex, and the drop generator's seed.
- It has its own tab and its own confirm dialog. Separately, the toolbar
  Reset, the site's shared modal, wipes everything including isotopes. Sound
  settings survive both.
- **The isotope track** (§8.3, phase 2) starts each reset run with the rungs
  the isotopes now held unlock: from one isotope, Warm Start's 500 energy and
  a Lab Assistant. Its rules are in the game from step 1; the UI that explains
  them comes in step 3.
- **When a reset opens.** That is at 1M, which is also Unstable, so the stage
  toast carries it: "Reactor is now Unstable. You can reset the experiment."
  It is announced the same way, once a run.
- **The isotope shelf**, over the face's top-left corner:
  - One bead per isotope, up to ten, then "+N". Hover, focus or a tap shows a
    tooltip: "3 isotopes", "+30% to all gains", and that each adds 10% and
    lasts through every reset.
  - Once a reset is open, a ring follows the beads. It shows the isotopes a
    reset pays now ("+1") and fills toward the next one. When the count rises
    it pops, and the fill starts again from empty.
  - The ring's tooltip: "Reset now for 1 isotope", "+30% now, +40% after",
    and where the next isotope comes. A click or tap opens the Reset the
    experiment tab and scrolls it into view. From the keyboard, focus follows
    to the tab.
  - Like the perk shelf, it sits beside the face in the markup, so a click or
    tap on it is never a press.
- **The Reset the experiment tab**, top to bottom: what a reset is; Wiped and
  Kept lists; the isotopes held and their bonus; when a reset unlocks, or what
  it gives now with the bonus before and after; a meter to the next isotope,
  captioned "420K of 1.00M" or "Next isotope at 4.00M, 1.40M to go"; and the
  button, once a reset is open.
- **The dialog** names what's wiped, the isotopes gained, and the bonus before
  and after. The toast after it: "Experiment reset. 1 isotope gained: +40% to
  all gains." Stats shows isotopes with their bonus: "3, +30%".

### 4.8 Away progress

- Measured from the save's `lastSeen`. A hidden tab counts as away.
- A gap of 60 s or less, such as a tab switch, pays full energy per second
  silently.
- Longer, with at least one auto-tapper, pays 50% of energy per second, capped
  at 4 hours. It sits behind a "While you were away" dialog with a Collect
  button. With Night Shift it pays all of it, and the dialog says "full speed"
  instead of "half speed".
- Energy credited for time away, by Collect or by the silent short gap, moves
  every perk offer's window past itself (`deferPerks`), so being away never
  runs an offer down.

### 4.9 Achievements

Fourteen cosmetic badges with no gameplay effect: First Press, Warmed Up (100
presses), Thousand Taps, Ten Thousand Taps, Steady Hands (25 combo), Resonance
(50), Harmonic (100), Fast Fingers (8/s in a surge), Lightning (12/s), Staffed
Up (10 Lab Assistants), Automated (one of every auto-tapper), Critical Mass,
Fresh Start (1 prestige) and Veteran (5).

### 4.10 Save and settings

- **Save**: one JSON blob at `reflexlab:spacebar-clicker:save`, version 1.
  Written every 5 s once the player has pressed, on `pagehide`, and when the
  tab is hidden.
- `parseSave` trusts nothing. Every field is coerced or falls back, unknown ids
  are dropped, levels are clamped to their max, and a `lastSeen` in the future
  is pulled back to now. Owned tappers always count as revealed and seen.
- **Fields**: `energy`, `runLifetime`, `totalLifetime`, `totalPresses`,
  `upgrades`, `tappers`, `revealed`, `seen`, `announced`, `isotopes`,
  `forks`, `prestiges`, `bestCombo`, `bestSurgeCps`, `surges`, `achievements`,
  `playedS`, `lastSeen`, `createdAt` and `perks`.
- **`perks`** holds:
  - `owned`, in slot order, with levels.
  - `offers`, at most one per tab, with price, window, and whether they've
    been seen.
  - `rng`, the drop generator's state.
  - `activeS`, seconds of active play this run, and `nextDropAtS`, the moment
    of the next drop on that clock. `nextDropAtS` is `null` until it is drawn.
  - `codex`: every perk ever dropped, with the best level held.
  - `rerollsUsed`: offers swapped this run with the Reroll rung.
  - Prestige clears everything except `rng` and `codex`. A save from before
    perks loads with an empty block.
- **`forks`**: the isotope track's fork picks, keyed by the fork's isotope
  count, such as `{ "3": "prodigy" }`. Only a pick that belongs to its fork
  survives parsing. Prestige keeps it; the full reset clears it.
- **The track shapes parsing.** How many perks and keystones a save may hold,
  and the level a fresh offer may carry, come from the rungs in force, so a
  save holding a sixth perk, a second keystone or a Prodigy offer keeps it only
  with the rung that allows it.
- **Settings**: `reflexlab:spacebar-clicker:settings`, holding the sound toggle.
- Adding a field means adding it to `SaveState`, `defaultSave`, `parseSave`
  (defensively), deciding whether `prestigeReset` keeps it, and adding tests.

### 4.11 Sound

Sound plays through the engine's beeper, at gain 0.18. Events: purchase, combo
tier up, surge warning ticks, surge start, surge end, reactor state up,
achievement, prestige and away collect.

Perks add two. A drop chimes by rarity: two rising notes for a common, three
for a rare, five for a keystone, so a high tier is heard as an event. A surge's
drop chimes just after the surge's own end chord. Buying a perk has its own
two-note chord. An offer running out makes no sound.

### 4.12 Pacing

**Decided 2026-10-23: about 24 minutes to first prestige for a steady
player.** This was option 1, chosen by the maintainer.

The old out-of-repo simulator had claimed 24 minutes, but by the real rules
the game took about 14. The fix raised the press upgrades' base costs four to
five times and left the auto-tappers' alone. The new prices are in §4.5.

Raising every price by the same factor was tried first and rejected. It hit 24
minutes, but auto-tappers fell from 58% to 2% of income in minutes 10 to 15,
so the game stopped feeling idle. A press's value grows from the combo,
surges and Finger Strength's cheap levels, none of which get dearer. Auto-tappers
only grow by being bought. Raising auto-tapper prices at all made the
simulated buyer drop them.

**The simulator.** `sim.ts` plays whole first runs headless against the real
rules: economy, combo tracker, surges and perks. Its players:

| Player      | Rate        | Rhythm     | Habits                                                                                   |
| ----------- | ----------- | ---------- | ---------------------------------------------------------------------------------------- |
| Steady      | 5 presses/s | 10% jitter | a short break every 40 s or so; checks the shop every 10 s, and stops tapping 2 s to buy |
| Sloppy      | 5 presses/s | 20% jitter | as steady                                                                                |
| Masher      | 7 presses/s | 50% jitter | as steady                                                                                |
| Idler       | 5 presses/s | 10% jitter | taps 20 s, then leaves it 40 s                                                           |
| Perfect bot | 5 presses/s | 10% jitter | shops every half second without missing a beat                                           |

Every player buys the shop item that adds the most income per energy spent.
`pacing.test.ts` holds the results in bands (§7).

**First prestige without perks**, median over 8 runs:

| Player      | Minutes                                  |
| ----------- | ---------------------------------------- |
| Steady      | 24.6                                     |
| Sloppy      | 26.5                                     |
| Masher      | 38.4, about 1.56 times as long as steady |
| Idler       | 43.2                                     |
| Perfect bot | 22.7                                     |

**A steady first run.** The first purchase of each item comes at:

| Item              | First bought |
| ----------------- | ------------ |
| Finger Strength   | 10 s         |
| Lab Assistant     | 90 s         |
| Pneumatic Key     | under 2 min  |
| Spring Keys       | 5.7 min      |
| Robot Arm         | 7.0 min      |
| Stabiliser        | 10.2 min     |
| Particle Collider | 15.0 min     |
| Synchronisation   | 17.0 min     |
| Quantum Keyboard  | 21.1 min     |
| First prestige    | 24.6 min     |

So a first run sees the whole shop. The Collider pays better per energy than
the Quantum Keyboard, so it comes first.

**Auto-tappers versus presses.** Auto-tappers overtake presses at about minute
16 for a steady player, 19 to 20 for a masher, and 7 to 8 for an idler. For a
steady player they earn 17% of income in minutes 10 to 15, 50% in minutes 15
to 20, and 85% in minutes 25 to 30.

**Against the spec's §12 targets:**

- **Met:** the first upgrade within 15 s; the first auto-tapper within 30 s
  (both cost 75, affordable at about 11 s of steady tapping); the Pneumatic
  Key at about 2 min.
- **Missed:** the Robot Arm at 7 min against a 5-minute target; the Quantum
  Keyboard at 21 against 12, and the Particle Collider at 15 against 30;
  an idle share of 85% at 30 min against the spec's 50%.
- **Page copy:** the FAQ's "about twice that if you mash" now reads "about
  half as long again". The overview's "auto-tappers out-earn your fingers
  after about an hour" now reads "after fifteen or twenty minutes".
- **Tuning:** if play feels off, tune base costs first, scaling second. Rerun
  the pacing test after any change.

**History.**

- The old 2026-10-21 table claimed first prestige at 24 min for a 5
  presses/s tapper, 48 mashing, and 39 at 3 presses/s; the Pneumatic Key at
  1.3 min, the Robot Arm at 7, the Quantum Keyboard at 30 and the Particle
  Collider at 40.
- By the real rules, the old prices gave 14.0 min for a steady player and
  24.2 for a masher.

### 4.13 Perks

In the game since steps 4 and 5 (2026-10-23). The design, the full table and
the build plan are in §8.1.

- **Drops** come on active play, at random (§8.1.2). The perk lands at the top
  of its shop tab as an offer row.
  - A closed tab gets the "New" tag, and a chime rings by rarity (§4.11).
  - A toast names it in its family hue: "Perk drop", "Rare drop", "Keystone
    drop" or "Upgrade drop". A surge's drop is named on its results card
    instead.
  - It is announced: "Rare drop: Overtone, in the Upgrades tab for 18,000
    energy." A surge's drop joins the "Surge over" announcement.
- **The offer row** sits on the shop rows' grid, so its name lines up with
  theirs.
  - Its glyph tile is lit in the family hue, affordable or not. The tile's
    border is a ring that drains as the window runs down, and it breathes in
    the last fifth. A rare's tile glows; a keystone's sits in a second ring.
  - The name, with a level badge on an upgrade, then the effect with its
    number in the family hue. An upgrade strikes out the number held beside
    the number it becomes.
  - The price, and the rarity: "Common" in grey, "Rare" and "Keystone" in the
    family hue, "Upgrade" for an upgrade.
  - A note when buying costs more than energy: "All 5 slots are full: you'll
    pick one to drop", or "Swaps out your keystone, Glass Rhythm II".
- **Buying.** An upgrade, or a new perk with a slot free, buys at once: the
  tile flares and the row folds away.
  - With all five slots full, the swap dialog shows the offer and lists the
    held perks as cards. Picking one drops it and buys.
  - A keystone while another is held asks first: "Swap your keystone?"
  - Cancel keeps the offer. Presses are ignored while the dialog is open, and
    it closes if the offer runs out meanwhile.
- **Running out.** Once the run's energy passes the window, the row fades and
  folds away, silently, and "Overtone is no longer on offer." is announced.
- **The shelf** sits over the face's top-right corner, mirroring the isotope
  beads: five sockets, a chip in the family hue for each perk held, and three
  pips under it for its level. Empty sockets show as dashed outlines.
  - A bought perk flies from its offer tile to its socket and lands with a
    pop; an upgrade flies to the chip it raises and fills a pip.
  - **Tooltips**: the perk's name and level, rarity and family in words
    ("Rare · Rhythm"), and its effect now. They show on mouse hover (and stay
    while the pointer crosses onto them), on keyboard focus, and on a tap,
    which pins them until a second tap, a tap elsewhere or a press. Escape
    dismisses one.
  - A click or tap on the shelf is never a press, and a clicked chip lets go
    of focus so Space keeps pressing the reactor.
  - The shelf sits beside the face in the markup, not inside it, so its
    buttons aren't nested in the face's `role="button"`. Tab goes from the
    reactor to the chips.
- **The Perks panel**, a tab between Achievements and Reset the experiment:
  - This run: "N of 5 slots", and a card per perk held with its rarity and
    family, level and effect.
  - The codex, "N of 25 found": a board with a socket per perk, one row per
    shop tab. Found perks are lit, dimmer if never held. Undiscovered ones are
    empty sockets with their rarity's shape (a keystone's has its inner ring)
    and no name. Then a card for each perk found, with every level's number,
    the best held lit, and "Held up to level 2" or "Found, never held".
- **The away dialog** names any offer still waiting in the shop: "Overtone is
  still on offer in the shop: time away doesn't count against its window."
- **Effects the script runs:**
  - Afterglow, Storm Front and Lightning Rod (§4.4).
  - Chain Reaction's float chain (§4.2).
  - Self-Replicator: a free copy of the best auto-tapper every so many seconds
    of active play. "+1 Robot Arm" drifts off the core in lime. Its count is
    not saved, so a reload starts it over.
  - Idle Hands: the per-second rate turns lime while the boost runs.
  - Brute Force: the combo row stands down ("0 combo, off with Brute Force,
    x1"). The scope still draws the beat, and no combo counts toward the best
    combo or the combo achievements.
- **Switched-off upgrades.** The shop marks a one-off upgrade "Off" when a held
  perk leaves it doing nothing, owned or not: the Stabiliser under Glass
  Rhythm, Synchronisation under Brute Force (`upgradeSwitchedOff`).
- **The income meter** leaves out a surge's and Afterglow's boost, so a drop
  during or just after a surge is priced at the player's own pace. The
  simulation does the same.

## 5. Presentation

### 5.1 Layout

- The reactor face sits on the left and the shop on the right, pinned to the
  face's height. A tabbed panel below holds Stats, Achievements, Perks and
  Reset the experiment.
- **The reactor face**, top to bottom:
  - Energy readout, with per-second and per-press rates.
  - Isotope shelf in the top-left, perk shelf in the top-right. Both sit
    beside the face in the markup, positioned over its corners. The isotope
    shelf's buttons are padded to 24px targets, and the beads sit 16px in from
    the face's outer edge, where they always have.
  - The core: a progress dial with six state lights, a turning dashed bezel,
    motes, the core heart, and the readout inside.
  - State name and surge label.
  - Combo row: count, tier label, next-tier target, grace bar, and the rhythm
    scope canvas.
  - The SPACE keycap and the hint line. Toasts sit over the hint line, which
    is standing instructions, since the top corners belong to the shelves.
    They sat top-right until step 5.
- **Narrow faces.** A container query on the face, `reactor / inline-size`,
  steps the energy readout down clear of the isotope shelf. It holds on phones
  and on a laptop with the shop beside the reactor.
- **The perk shelf** answers to `reactor-wrap`, a container around the face.
  At 566px of face (1440 and 1280 wide) it clears the readout as it is. Below
  530px the readout steps down to clear it, measured from the face's padding
  token, `--face-pad`, so it holds on phones too.
- **When the shelves would meet.** If the isotope row's last bead, "+N" or
  ring would come within 12px of the perk shelf, the perk shelf drops below
  the isotopes, and the readout with it. The script measures this
  (`fitShelves`), on every shelf change and on resize, since the row's length
  depends on its contents. On a 390-wide phone that is 10 isotopes with the
  ring showing, or 12 without it. Until 2026-10-26 a fixed rule did this, at
  six beads below 340px of face.

### 5.2 Color

- **Reactor-Ramp.** The Cherenkov ramp in §4.6. It covers the core, bezel,
  motes, dial and lights, gains, the rhythm scope and the state name.
  Isotopes are blue-white on Cherenkov blue at every stage, on and off the
  face: the beads, the ring for the next reset, the isotope tooltip, and the
  meter in the Reset the experiment tab. The ramp's tokens live on
  `.game-section` so they reach past the face. Stages fade into each
  other over 0.8 s through registered custom properties (`--stage`, `--halo`,
  `--core-heart`, `--core-alpha`, `--core-glow`, `--wash-r`) and
  `color-mix()`.
- **Surge Gold.** Core `#fcd34d`, halo `#fbbf24`, ink `#fef3c7`. Used during
  overdrive and for lucky Double Tap floats.
- **Shop-Signal.** Amber, only for the "New" tag on a closed shop tab.
- **Perk-Family.** Each perk wears its family's hue: violet `#a78bfa` for
  rhythm, rose `#fb7185` for press power, fuchsia `#e879f9` for luck, Surge
  Gold for surges, lime `#a3e635` for machines. All are measured against the
  reserved colors in DESIGN.md, and a perk's name always goes with its color.
  Surge Gold also now marks Chain Reaction's doublings and Afterglow.
- Everything else follows the site's rules: the One Signal Rule, Rank-Only
  Color, Glow-Is-A-Signal, and monospace numerals for every readout.

### 5.3 Animation and feedback

The visuals were built in three passes, all shipped 2026-10-22.

- **Pass 1, stage changes.** A shockwave ring, a grid wash travelling outward,
  the new dial light popping on, the name settling in, and the arc holding full
  before sweeping back.
- **Pass 2, surges and rhythm.**
  - The countdown sits in the core and the dial drains in gold.
  - Gold overdrive, with sparks per press.
  - The tallied results card, with a sheen on a new best.
  - The rhythm scope: one spike per press. Off-rhythm presses draw at half
    height, and mashing crowds into a scribble.
- **Pass 3, small delights.**
  - The keycap bottoms out on every press.
  - Lucky presses float in gold.
  - Each shop glyph plays its own motion when bought: press, pop, emerge,
    compress, phase, nod, stroke, swing, ghost or spin.
  - Auto-tapper income gathers for 1.2 s and drifts off the core's rim as a dim
    float.
  - The bezel turns once per `max(16, 120 - 26 x log10(1 + eps))` seconds, and
    stays still with no income.
  - Motes: two more per stage, twelve at most.
  - Reset sequence: the core implodes for 0.5 s while the face dims, then
    blooms back as Dormant over 0.9 s, while new isotope beads fly to the shelf
    over 0.7 s. The shelf shows up to 10 beads, then "+N".
  - Away wake-up: the core sits dim behind the dialog, and Collect brightens it
    over 0.9 s while the energy counts in.
- **Perks, step 4 (2026-10-23).**
  - A drop slides its row in and pops the tile. A rare or a keystone throws a
    ring off its tile, and a keystone sends a sheen down the row.
  - Buying flares the tile and throws its ring, then the row folds away.
    Running out just fades and folds.
  - The window's ring glides as it drains, and breathes in its last fifth.
  - Chain Reaction pops x2, x4, x8 in gold, each a beat later and a little
    larger. Self-Replicator's copy drifts off the rim in lime.
- **Perks, step 5 (2026-10-23).** A bought perk flies in an arc from its offer
  tile to its socket, and the chip lands with a pop. The shelf fades as the
  core implodes on a reset.
- **Isotopes (2026-10-26).** The ring grows in when a reset opens and pops
  each time its count rises; its fill starts again at once rather than winding
  back. The tab's meter glides.
- **Reduced motion.** Color changes and lights stay; all travel, spin, flight
  and implosion goes. Totals and collected energy apply at once, and the scope
  redraws only on presses. Perk rows appear and go at once, and the ring steps
  rather than glides and never breathes. A bought perk is simply on the shelf,
  and the shelf clears without fading. The isotope ring appears and counts
  without growing or popping, and its fill and the meter step.

### 5.4 Accessibility

- The face is `role="button"` with `tabindex="0"`.
- A live region announces purchases, state changes, achievements, surges and
  both resets.
- Opening a dialog moves focus into it. Closing hands focus back to where it
  was, or to the reactor when nothing was focused, such as the away dialog on
  load. Shop buttons use `aria-disabled` so they stay focusable while
  unaffordable.
- Tabs follow the ARIA tab pattern, with arrow keys.
- The isotope shelf is two buttons. The beads are named like "3 isotopes,
  +30% to all gains, kept through every reset." The ring is named like "Reset
  the experiment now for 1 isotope, taking all gains to +40%. The next isotope
  comes at 4.00M energy." Their tooltips are visual only, like the perk
  shelf's. Tab goes from the reactor to the beads, the ring, then the perk
  chips. Opening the tab from the ring by keyboard moves focus to the tab.
- A reset opening is announced with the stage change. A rise in what a reset
  pays is not announced; the ring's name carries it.
- A perk offer row reads as one button: its name and level ("level 2", not the
  numeral), its effect ("now 40%, then 55%" on an upgrade), any note, how much
  of its window is left in tens of percent, the price and the rarity.
- The swap dialog focuses its cancel button. Buying a perk announces "Bought
  X.", "X is now level 2." or "Bought X, in place of Y." Drops and expiries
  are announced too (§4.13).
- The perk shelf is a list labelled "Perks this run, N of 5 slots"; empty
  sockets are hidden from screen readers. Each chip is a button whose name
  carries the tooltip's words: "Overtone, level 2, rare rhythm perk. A new tier
  above Harmonic: 200 combo for x3.75". The tooltip itself is visual only,
  stays while hovered, and Escape dismisses it.
- The codex board's sockets are images with names such as "Overtone, held up
  to level 2" or "Undiscovered rare perk".

## 6. Content and SEO

- **Title**: "Spacebar Clicker - Free Online Idle Spacebar Game", with an
  authored description and FAQ JSON-LD.
- About 2,900 words below the game, tables and FAQ answers included. The H2s
  are:
  - What is Spacebar Clicker?
  - How to play Spacebar Clicker
  - The combo: steady beats fast
  - Every upgrade and what it costs
  - Perks: random drops that bend the rules
  - Reactor states
  - Reset the experiment
  - How to reach a million energy
  - Spacebar Clicker FAQ, with 9 questions
- The tables render from `config.ts`, so changing a number changes the page.
  That includes the perks section: the drop odds by rarity, with each tier's
  price and window, and a table per shop tab of all 25 perks with their
  rarity, family and every level's effect (`perkDetailAllLevels`). The rarity
  and family names come from `PERK_RARITY_NAMES` and `PERK_FAMILY_NAMES`,
  which the game uses too.
- **Claims from the simulation**, each said to be from it on the page, and to
  recheck when the pace or the perks change (§4.12):
  - Four to eight drops in a steady first run to a million (10th to 90th
    percentile, buying what drops).
  - A steady player who buys what drops reaches a million about three minutes
    sooner (about 21 minutes against 24).
  - With no perks, the first isotope comes at about 24 minutes and the second
    about 12 minutes later. Until 2026-10-26 the page said waiting for the
    second isotope was slower than resetting and earning a million again; the
    pace change of 2026-10-23 had made that false.
  - "Around 20 to 25 minutes" to the first reset, in the FAQ.
- **Kept off the page on purpose:** the 10-minute ceiling on the wait for a
  drop. Published, it would be the visible pity the maintainer ruled out
  (§8.1.2).
- On a phone the spec tables stack, and a cell with a `data-label` names
  itself (`content.css`). The odds table uses it, so its two percentages
  don't lose their headings.
- When a mechanic changes, update the copy that describes it.

## 7. Testing

- `npm test` runs Vitest: the 67 clicker tests, the 61 perk tests, the 29
  track tests and the pacing bands.
- `npm run check` runs `astro check`. `npm run format:check` runs Prettier.
  `npm run build` should be clean.
- `npm run test:browser` runs the Playwright checks in `tests/browser/`,
  40 as of 2026-10-26, in about six minutes.
  - **Coverage:** the page shell, the perks section and FAQ rendering from
    the config, presses and the combo, buying, the shop tabs and "New" tag,
    save and reload, away progress, prestige, the full reset, the phone
    layout, a whole surge on a fake clock with and without reduced motion,
    every reactor state, and a live stage change.
  - **Perks** (`spacebar-clicker-perks.e2e.ts`): a live drop, its row, toast
    and tag; buying and an upgrade; the swap dialog and the keystone swap;
    switched-off upgrades and Brute Force's combo row; a window running out,
    and time away not running it down; Chain Reaction's floats; a surge with
    Storm Front, a surge drop, Afterglow and Self-Replicator on a fake clock;
    reduced motion; the swap dialog on a phone. From step 5: the shelf, its
    pips and the flight to it; tooltips on hover, focus, Escape and a tap,
    with no press; the Perks panel and codex, through a prestige; the drop,
    expiry and away-dialog wording; the shelf clearing the readout and the
    isotope beads on a phone.
  - **Isotopes** (`spacebar-clicker-isotopes.e2e.ts`): the beads' tooltip on
    hover, focus and Escape, with no press; a reset opening, with its one
    notice, the ring and its way into the tab by mouse and keyboard; the ring
    counting up; the tab locked and open, the dialog, the toast and plurals;
    a tap on the beads and on the ring; the ring, beads and perk shelf on a
    phone with 4, 9 and 12 isotopes.
  - **Staging a save.** The perk and isotope checks write a whole save before
    the page loads (`seedSave` in `fixtures.ts`), with seed 7 when they need a
    known draw: its first draw is under one in eight, so the first surge drops
    a perk.
  - **Browser:** your installed Chrome (`channel: 'chrome'`), so there is
    nothing to download.
  - **Dev server:** a server already on `127.0.0.1:4321` is reused; otherwise
    one is started. One started with a bare `npx astro dev` listens on IPv6
    `localhost` only and isn't found, so start it with
    `npm run dev -- --host 127.0.0.1 --port 4321`. Astro backgrounds its dev server when an AI agent launches it, so
    an agent should start one first with `npm run dev`. Stop it with
    `npx astro dev stop`.
  - **Speed:** one worker, because several checks press on a real-time beat.
    The surge checks take a few minutes, because they run minutes of fake
    time frame by frame.
  - **Naming:** the files are `*.e2e.ts`, not `*.spec.ts`, so Vitest leaves
    them alone.
- `pacing.test.ts` runs with `npm test`, adding about 5 s. To write the full
  table to a file: `PACING_REPORT=pacing.txt npx vitest run pacing` in Git
  Bash, or `$env:PACING_REPORT="pacing.txt"; npx vitest run pacing` in
  PowerShell.
- Run every check at the end of each step.
- **Never verified**: a real touch device, Firefox and Safari, long-session
  feel, and a human playtest of the balance.
- **Jump to prestige** for testing. Paste this in the console, then use the
  "Reset the experiment" tab:

  ```js
  const k = 'reflexlab:spacebar-clicker:save',
    s = JSON.parse(localStorage.getItem(k));
  s.runLifetime = 4e6;
  s.totalLifetime = Math.max(s.totalLifetime, 4e6);
  s.lastSeen = Date.now();
  localStorage.setItem(k, JSON.stringify(s));
  Storage.prototype.setItem = () => {};
  location.reload();
  ```

  The `setItem` stub stops the page's own save on unload from overwriting the
  edit. Reload again to restore normal saving.

## 8. Roadmap

### 8.1 Perk system: phase 1 done

**Status (2026-10-26).** All six steps are done: groundwork, perk logic,
pacing simulation, shop offers with perk effects in play, the shelf, tooltips
and Perks panel, and the page content. Perks are whole in the live game
(§4.13) and on the page (§6).

Signed off: the step 3 tuning with the pace (option 1, §4.12), step 4 with its
calls in §8.1.10, and step 5 with its calls in §8.1.11 (2026-10-26). Between
steps 5 and 6 the maintainer asked for an isotope UX pass (§8.2), signed off
too. Step 6 and its calls in §8.1.12 were signed off on 2026-10-26.
Isotope tie-ins became phase 2, the isotope track (§8.3).

Check in with the maintainer after each step.

**Scope note.** The original spec called the game "shallow on purpose", and
its §15 ruled out a prestige shop. The maintainer asked for perks on
2026-10-22, so the first rule is deliberately relaxed. Isotope tie-ins would
bend the second, and are deferred to after phase 1 (question 7).

#### 8.1.1 The maintainer's brief

- Add RNG through a perk system. Each perk is either press-focused or
  auto-tapper-focused, and drops at random into the matching shop tab.
- An available perk's icon is a bright color, different per perk, to stand
  apart from the regular items.
- A perk can only be bought for a limited time, measured in future energy
  gain. This creates urgency and a reason to pay attention.
- A bought perk shows as an icon in the reactor's top-right, the way isotopes
  show in the top-left. Hovering it reveals its name and effect in a tooltip.
- There should be quite a few perks. They should interact with existing
  mechanics to make build-defining choices, so each run plays differently.

#### 8.1.2 Design

Items marked _Decided_ were settled by the maintainer on 2026-10-23. The rest
are proposals carried into the build plan.

- **Perks last the whole run** and clear on reset. _Decided._ That is what
  makes them build-defining, and it gives resetting a new appeal: each run is a
  fresh build.
- **Price and time limit are counted in seconds of income** at the moment the
  perk drops, presses included.
  - Energy grows exponentially, so fixed amounts would be huge early and
    trivial late.
  - Example: earning 200/s when a Rare drops, it costs 90 s of income, 18,000.
    It leaves once the run earns another 36,000, about 3 minutes at the same
    pace.
  - Spending in the shop meanwhile risks not affording it. A surge drains the
    window ten times faster. If the player stops, the offer waits.
  - Energy collected after being away does not drain an offer. _Decided._
    Collect pushes each live offer's expiry forward by the amount collected,
    and the "While you were away" dialog mentions a waiting offer.
  - Commons are cheaper with shorter windows; keystones dearer with longer
    ones. Exact numbers come from simulation.
- **Drops feel like rune drops in Diablo II.** _Decided 2026-10-23._ The
  maintainer's brief: drops should feel random and never linear, so you never
  know when one is coming. A high tier should be an event. Not scarce, but
  never constant.
  - **Random in time.** Each gap is drawn fresh from an exponential
    distribution over seconds of active play, with a 6-minute mean. A drop
    can land seconds after the last one or many minutes later.
  - **Active play only.** Active play means the page is visible and the
    player pressed within the last minute, the same rule surges use. Leaving
    the game running never brings a drop.
  - **One hidden ceiling.** A gap never exceeds 10 minutes. With the ceiling,
    the average gap is about 4.9 minutes. There is no visible pity.
  - **Surges are boss fights.** Each surge ends with a 1-in-8 chance of a
    bonus drop, on rarer odds. Surge drops don't affect the ordinary timing.
  - **Steep tiers.** Ordinary drops are 65% common, 30% rare and 5% keystone.
    Surge drops are 45%, 45% and 10%. A tier with nothing left to drop is
    skipped and the odds are spread over the rest. A perk is then picked
    evenly within its tier.
  - **One guaranteed drop, ever.** It comes on a player's very first run,
    meaning their codex is empty: a common, at a random moment 1 to 3 minutes
    into active play. Nothing else is guaranteed. A full reset empties the
    codex, so a fresh start gets the tutorial drop again.
  - **Full tabs lose the drop.** At most one live offer per tab. A drop due
    while both tabs hold offers is lost, not held, because holding it would
    make the next drop predictable. A fresh moment is drawn.
  - **Removed from the step 2 model:** the fixed roll schedule, the pity
    ramp, the roll on each reactor stage change, and the guaranteed first drop
    on every run. In simulation that model gave about 21 drops in a 30-minute
    run, never more than about 3 minutes apart.
  - **Checked through the real code.** Simulated 30-minute runs give 5 to 10
    drops, usually 7, with a keystone in about 38% of runs. About one drop in
    two runs is lost to full tabs if the player never buys.
  - **Prices** are 15, 30 and 60 s of income by rarity, with windows of 60,
    90 and 150 s. They were cut from 45, 90 and 150 in step 3: at 45 s of
    income, a common worth +5% couldn't pay for itself within a first run.
- **Slots: 5.** _Decided._ At most 5 active perks, and one keystone at a time.
  - Buying a new perk with all 5 slots full asks which perk to drop. The
    dropped perk is gone for the run, levels and all. Cancelling keeps the
    offer open.
  - Buying a keystone while holding one swaps the two.
  - If the dropped perk had an upgrade on offer, that offer turns back into a
    level I offer at the base price.
- **Perk levels.** _Decided:_ if an owned perk drops again, buying it upgrades
  the existing perk instead of taking a new slot.
  - _Decided:_ three levels, I to III. A perk at level III leaves the drop pool
    for the rest of the run.
  - _Decided:_ an upgrade costs 1.5 times more for each level already held, and
    needs no free slot. Built as compounding: level II costs 1.5 times the base
    price, level III 2.25 times.
  - Owned perks drop at normal odds. With 25 perks and 5 owned, about one
    offer in five is an upgrade, so roughly two a run. The simulation checks
    this.
  - Commons and rares grow their number at each level. Keystones keep their
    downside and grow their upside.
- **In the shop**
  - An offer sits at the top of its tab. Its glyph tile lights in the perk's
    color, with a ring that drains as the window runs down.
  - An upgrade offer shows the level it leads to and the effect now and next.
  - A closed tab gets the existing "New" tag. A drop plays a short chime.
  - An expired offer fades out.
- **Rarity**
  - Common: a number boost.
  - Rare: changes a rule.
  - Keystone: breaks a rule, with a real downside.
- **Color by family, glyph per perk.** _Decided._ Green, the reactor blues,
  Surge Gold and the Shop-Signal amber are taken. That leaves about five hues
  that read on black, so 25 perks would repeat colors anyway.
  - Proposed: violet for rhythm, orange for surges, fuchsia for luck, rose for
    press power, lime for machines.
  - Lime sits near the signal green and orange near the amber. Check both
    before settling.
  - The payoff: the shelf reads as the build at a glance.
  - This needs a new `DESIGN.md` exception.
- **Shelf and tooltips.** _Decided:_ perks show top-right, mirroring the
  isotope shelf. Each tile shows its level as small pips.
  - Today the whole face is the press target and the isotope shelf ignores the
    pointer. Perk icons must take hover and taps without counting as a press,
    for example by stopping propagation on pointerdown.
  - Touch has no hover, so a tap opens the tooltip.
  - For keyboard and screen-reader users, add a **Perks** panel beside Stats
    and Achievements, listing active perks in full and a **codex** of every
    perk found. The codex survives prestige and gives players a collection
    goal across runs.
- **No reroll by reload.** Use a seeded generator whose state lives in the
  save. Live offers save with their remaining window.

#### 8.1.3 Starter pool (25 perks)

Values are given as level I / II / III. They are starting points for the
simulation, not final. The live table is `PERKS` in `config.ts`, and its
wording is what the game will show. These rows mirror it as of step 3's tuning.

How a few effects were built in step 2:

- **Held Breath.** A pause longer than 600 ms but inside the grace is a
  rest. It neither keeps nor misses, and it stays out of the rhythm average.
  Without rests, the pause would inflate the average and the next presses
  would break the combo anyway.
- **Brute Force.** Every formula sees a combo of zero, so Momentum, Full Sync
  and Synchronisation give nothing.
- **Chain Reaction.** The chain stops at x8. Uncapped, the expected payout at a
  75% chance has no limit.
- **Glass Rhythm.** Applied after Overtone, so it scales the Overtone tier too.
- **Feedback Loop.** Adds its share of energy per second to each press. Double
  Tap applies to that share too.

Upgrades tab:

| Perk           | Effect at level I / II / III                                                                                         | Rarity   | Family |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| Metronome      | Rhythm tolerance widens from 25% to 40% / 55% / 70%                                                                  | Common   | Rhythm |
| Held Breath    | A pause of up to 2.5 s / 4 s / 6 s keeps the combo, up from 0.8 s                                                    | Common   | Rhythm |
| Overtone       | A new tier above Harmonic: 200 combo for x3.5 / x3.75 / x4                                                           | Rare     | Rhythm |
| Momentum       | +0.25% press value per point of combo, up to +25% / 40% / 60%                                                        | Rare     | Rhythm |
| Glass Rhythm   | Combo multipliers x2 / x2.5 / x3, but two off-beat presses in a row break the combo and the Stabiliser stops working | Keystone | Rhythm |
| Finger Memory  | Finger Strength gives 10% / 20% / 30% more energy a level                                                            | Common   | Press  |
| Coiled Spring  | Spring Keys give x1.7 / x1.8 / x1.9 a level instead of x1.5                                                          | Rare     | Press  |
| Brute Force    | No combo at all, but press value x1.8 / x2 / x2.2                                                                    | Keystone | Press  |
| Loaded Dice    | Double Tap +15% / 25% / 35%, and its cap rises from 50% to 75%                                                       | Common   | Luck   |
| Chain Reaction | A Double Tap rolls again at 150% / 200% / 300% of your Double Tap chance (at most 60%), up to x8                     | Rare     | Luck   |
| Lightning Rod  | Surges come 1.75 / 2 / 2.5 times as often                                                                            | Rare     | Surge  |
| Afterglow      | Presses keep x3 for 10 s / 15 s / 20 s after a surge                                                                 | Common   | Surge  |
| Storm Front    | Surges hit x20 / x25 / x32 but strike with no warning                                                                | Keystone | Surge  |

Auto-tappers tab:

| Perk            | Effect at level I / II / III                                                       | Rarity   | Family   |
| --------------- | ---------------------------------------------------------------------------------- | -------- | -------- |
| Overtime        | Lab Assistants and Pneumatic Keys produce x1.75 / x2.5 / x3.25                     | Common   | Machines |
| Assembly Line   | +1% / 1.5% / 2% auto-tapper output per auto-tapper owned                           | Common   | Machines |
| Bulk Order      | Auto-tappers cost 20% / 30% / 40% less                                             | Common   | Machines |
| Critical Load   | +10% / 15% / 20% auto-tapper output per reactor state reached                      | Common   | Machines |
| Ghost Presses   | Auto-tappers add 100% / 150% / 200% of your Double Tap chance to their output      | Common   | Luck     |
| Full Sync       | Auto-tappers get 75% / 90% / 105% of your combo bonus, no Synchronisation needed   | Rare     | Rhythm   |
| Surge Lines     | Surges multiply auto-tappers too, and last 5 s / 7 s / 9 s                         | Rare     | Surge    |
| Idle Hands      | Auto-tappers x1.4 / x1.7 / x2 after 10 s without a press                           | Rare     | Machines |
| Night Shift     | Away progress pays 100% instead of 50%, capped at 8 h / 12 h / 24 h instead of 4 h | Rare     | Machines |
| Feedback Loop   | Each press also pays 8% / 12% / 16% of your per-second income                      | Rare     | Machines |
| Self-Replicator | A free copy of your best auto-tapper every 180 s / 130 s / 90 s                    | Rare     | Machines |
| Autopilot       | Presses earn half, but auto-tappers x1.7 / x1.95 / x2.2                            | Keystone | Machines |

The builds these make:

| Build  | Perks                                                           | How it plays                                                                                        |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Rhythm | Glass Rhythm, Full Sync, Momentum, Overtone                     | A precise beat powers presses and auto-tappers alike. Metronome and Held Breath help a looser hand. |
| Surge  | Storm Front, Lightning Rod, Surge Lines, Afterglow              | Play for the bursts                                                                                 |
| Luck   | Loaded Dice, Chain Reaction, Ghost Presses                      | Gold floats everywhere                                                                              |
| Masher | Brute Force, Coiled Spring, Finger Memory                       | Ignore the beat and hit hard                                                                        |
| Idle   | Autopilot, Idle Hands, Self-Replicator, Bulk Order, Night Shift | The reactor runs itself                                                                             |

Each build is listed strongest first, the order the simulation's perfect run
takes them. In step 3, Glass Rhythm and Full Sync proved to be the rhythm
build's core: Glass Rhythm doubles the combo multipliers, and Full Sync passes
the whole bonus to auto-tappers.

Keystones shut doors on purpose. With Brute Force owned, Metronome and Full
Sync do nothing, and letting them expire is the right call. Those skips are
where the decisions come from.

#### 8.1.4 Where perks hook into the code

- **New pure module**, `src/games/spacebar-clicker/perks.ts`. It holds the
  definitions (id, name, effect text, tab, family, rarity, glyph), the drop
  roll, pricing, windows, and a function that turns owned perks into modifiers.
  The definitions go in `config.ts` with everything else.
- **Economy.** `energyPerPress`, `energyPerSecond`, `doubleTapChance`,
  `upgradeCost`, `tapperCost` and `offlineAward` take the modifiers.
- **Combo.** `ComboTracker` reads the `COMBO` constants directly, and
  `comboTier` reads `COMBO_TIERS`. Metronome, Held Breath, Glass Rhythm and
  Overtone need both to take per-run rules instead. Do this as a small, tested
  refactor first.
- **Surges.** The scheduler and multiplier live in the script and read
  `SURGE`. Lightning Rod, Storm Front, Surge Lines and Afterglow need them to
  take modifiers.
- **Save.** Add a perks block: owned ids with their levels, live offers, the
  RNG state, the active-play clock and next drop, and the codex.
  - Store each offer's expiry as a `runLifetime` value. The offer is gone once
    `runLifetime` passes it.
  - Away energy must not drain offers (question 5), so Collect pushes each
    expiry forward by the amount collected. The silent full-rate credit for
    gaps of a minute or less does the same.
  - `prestigeReset` clears owned perks and offers, and keeps the codex.
  - Parse defensively and drop unknown perk ids.
- **Income at drop time.** `IncomeMeter` measures what the player is actually
  earning, presses included (step 1).
  - In step 4, feed it surge presses at their value without the surge
    multiplier. Otherwise a drop during or just after a surge is priced and
    timed at ten times the player's real pace. A surge's bonus drop is the
    obvious case.
  - The script calls `perkTick(state, income, activeDt)` every frame, with
    the same active-play seconds the surge scheduler counts. It calls
    `surgeDrop` as each surge ends.
- **Glyphs.** Each perk needs a glyph in `ShopIcon.astro`, or a sibling
  component: same 24-unit grid, 1.5 stroke, `currentColor`.
- **Content.** Add a perks table to the MDX, rendered from config, with rarity
  and drop odds. Competitors publish nothing like it.
- **Balance.** Perks multiply into each other and can break the 24-minute first
  prestige. Rebuild the pacing simulation with drops, ideally in the repo this
  time, and run each build through it. Starting target: a strong build cuts
  first prestige by about a third.
- **Tests.** Cover drop timing and tiers, pricing and windows, expiry, each perk's
  effect at every level, upgrades, the slot limit and swap, the keystone rule,
  save parsing, and prestige.

#### 8.1.5 Ideas parked for later

- Isotopes could buy a sixth slot, a reroll, or the right to keep one perk
  through a reset. Revisit after phase 1 (question 7). _Taken up 2026-10-26 as
  phase 2, the isotope track (§8.3)._
- Perk achievements, such as owning a keystone, or completing the codex.
- Visual hooks: Chain Reaction chains of gold floats, a label and color for
  Overtone's tier, and Storm Front striking with no countdown.

#### 8.1.6 Design questions: answered 2026-10-23

1. Does the perk shelf sit top-right, mirroring the isotopes top-left?
   **Answer: yes.**
2. Do perks last the run and clear on reset? **Answer: yes.**
3. Cap active perks, with one keystone at a time? **Answer: yes, at 5 slots.**
   Caveat from the maintainer: if a perk the player already owns drops again,
   buying it upgrades the existing perk.
4. Color by family with a unique glyph per perk, rather than a different color
   for every perk? **Answer: yes, by family.**
5. Does energy earned while away count down a live offer? **Answer: no. The
   offer waits, and the away dialog mentions it.**
6. Do keystones carry real downsides? **Answer: yes. The maintainer wants it
   for buildcraft.**
7. Isotope tie-ins, such as an extra slot, a reroll or keeping a perk?
   **Answer: revisit after phase 1.**

#### 8.1.7 Build plan: phase 1, approved 2026-10-23

Six steps. Each ends with every check passing and a check-in, so the
maintainer can review before the next one, as with the delight passes.

1. **Groundwork, no visible change.** _Done 2026-10-23._
   - `mods.ts`: a `Mods` object holding every rule a perk can bend, and
     `modsOf(state)`, cached per distinct set. Economy functions take
     `mods = modsOf(state)` as an optional last argument, which tests use to
     bend one field at a time.
   - `ComboTracker` takes a rules callback and reads it on every press.
     `comboTier` and `nextComboTier` take a tier list.
   - The surge scheduler, countdown, overdrive and results read the run's
     surge rules. Each surge fixes its own timings when it starts, and a zero
     warning skips the countdown, ready for Storm Front.
   - `rng.ts`, the seeded generator, and `IncomeMeter`, fed by presses and
     auto-tappers but not away awards.
   - Existing assertions are unchanged. The energy tests now pass a play
     context instead of loose arguments.
   - 25 new unit tests. The browser checks moved into the repo, and the 16 of
     them pass against the new code.
2. **Perk logic and save, pure, no UI.** _Done 2026-10-23._
   - `PERKS`, `PERK_EFFECT`, `PERK_DROPS` and the slot and level constants in
     `config.ts`.
   - `mods.ts` applies each owned perk at its level.
   - `economy.ts` gained `luckyMultiplier`, the Double Tap and chain roll, and
     `cheapestTapper`. It counts perk offers as shop-tab news, and handles
     Brute Force's combo-off and Feedback Loop.
   - `perks.ts`: `perkTick` for drops and expiry, `surgeDrop`, `buyPerk` and
     `needsSlot`, `deferPerks`, `replicate`, `offerRemaining`, and the perk
     text.
   - `combo.ts` gained rests, for Held Breath.
   - The save's `perks` block (§4.10).
   - Unit tests in `perks.test.ts`, 59 after the drop rework. Drops are
     seeded, so a test replays a run through a save and reload and gets the
     same drops.
   - **Drop rework, same day.** On the maintainer's feedback, the scheduled
     rolls with pity were replaced by the random, Diablo-style model in
     §8.1.2.
3. **Pacing simulation, in the repo.** _Done 2026-10-23._
   - `sim.ts` and `pacing.test.ts` (§4.12, §7).
   - Results are in §8.1.9, and the open pacing question is in §4.12.
   - Drop timing and tier odds were left as decided.
4. **Shop offers and perk effects in play.** _Done 2026-10-23._ What shipped
   is in §4.13, and the calls made along the way are in §8.1.10. The plan was:
   - The offer row: family-color tile, draining ring, price, level badge, and
     the upgrade's effect now and next.
   - The "New" tag on a drop, the chime, and the fade on expiry.
   - The swap dialog when slots are full, and the keystone swap.
   - Glyphs for all 25 perks.
   - A family-hue exception in `DESIGN.md`, with each hue checked against the
     reserved colors.
   - Live effects that need the script, such as Afterglow, Self-Replicator,
     Idle Hands, Feedback Loop and Storm Front, and the Chain Reaction gold
     float chain.
5. **Shelf, tooltips and the Perks panel.** _Done 2026-10-23._ What shipped is
   in §4.13, and the calls made along the way are in §8.1.11. The plan was:
   - Up to 5 perk tiles top-right, with level pips. Tooltips on hover, focus
     and tap, and a tap never counts as a press.
   - A Perks tab beside Stats and Achievements: active perks in full, and the
     codex.
   - The away dialog mentions a waiting offer. Announcements for drops,
     purchases, upgrades and expiries.
   - A reduced-motion version of everything.
6. **Content, docs and verification.** _Done 2026-10-26._ The calls made
   along the way are in §8.1.12. The plan was:
   - A perks section in the MDX: a table rendered from config, with rarity and
     drop odds, and an FAQ answer.
   - Update this doc's sections and changelog.
   - Browser checks at 1440 and 390 wide, then the full check suite.

#### 8.1.8 Follow-up questions: answered 2026-10-23

Raised by the upgrade caveat in question 3.

1. Three levels per perk, I to III, with a maxed perk leaving the drop pool?
   **Answer: yes.**
2. An upgrade costs 1.5 times the base price for each level already held, and
   needs no free slot? **Answer: yes.**
3. Add Playwright to the repo as a dev dependency so the browser checks
   survive between sessions? **Answer: yes.** Done in step 1.

#### 8.1.9 Step 3 results: tuning, 2026-10-23

These are simulated first runs at the retuned shop prices (§4.12), median
minutes over 8 seeds, from `pacing.test.ts`. Rerun it to refresh these.

| Run                                    | Minutes | Faster than the same player without perks |
| -------------------------------------- | ------- | ----------------------------------------- |
| Steady, takes every perk that suits it | 22.2    | 10%, with 5.5 perks bought                |
| Rhythm build, perfect run (steady)     | 16.6    | 33%                                       |
| Surge build, perfect run (steady)      | 17.9    | 27%                                       |
| Luck build, perfect run (steady)       | 17.6    | 28%                                       |
| Masher build, perfect run (masher)     | 25.3    | 34%                                       |
| Idle build, perfect run (idler)        | 26.0    | 40%, right at the band's edge             |

A perfect run means every drop is the build's next perk. Even on one, a masher
or an idler doesn't catch a steady tapper with no perks (24.6), so rhythm
stays the best way to play.

The longer runs roughly doubled what a typical player gets from perks: from
5% to 10% faster, with 5.5 perks bought instead of 3.5.

**One perk held all run**, for the player it suits, % faster at level I / III:

- **Commons:** 2 to 10% at I, 6 to 18% at III.
- **Rares:** 4 to 15% at I, 14 to 23% at III.
- **Keystones:** 15 to 28% at I, 28 to 41% at III.
- Night Shift shows 0%, because the simulation has no time away.

**What tuning changed** (values in §8.1.3):

- **Prices** went from 45, 90 and 150 s of income to 15, 30 and 60. Windows
  went to 60, 90 and 150 s. At 45 s of income, a common worth +5% couldn't
  pay for itself within a first run.
- **Momentum** was 52% faster at level I: with the Stabiliser, a steady
  combo climbs without limit. It is now +0.25% a point up to a cap.
- **Finger Memory** was 41% at I. It is now +10%, 20% or 30% Finger Strength.
- **Brute Force** was 55% for a masher, and let a masher outpace a steady
  tapper.
- **Glass Rhythm** was negative for a steady tapper: one miss ended the
  combo, and a 10% jitter misses about every 16 s. It now breaks on two
  misses in a row. It still switches off the Stabiliser and still punishes
  a sloppy hand.
- **Overtime** did 3%, because it boosted only Lab Assistants. It now boosts
  Pneumatic Keys too.
- **Self-Replicator** did 0%, because the cheapest tapper is a Lab Assistant.
  It now copies your best auto-tapper.
- **Metronome** is now a common. It and Held Breath stay small: the
  Stabiliser already forgives most misses. They are comfort perks for a
  looser hand.
- **After the shop retune**, auto-tappers carry more of each run, so the
  machine perks were reined in. Autopilot, Idle Hands, Self-Replicator,
  Overtime and Full Sync are all lower. Chain Reaction and Coiled Spring went
  up, because Double Tap and Spring Keys now cost more.
- **The build lists** were corrected so each opens with its strongest perk.
  The rhythm build now leads with Glass Rhythm and Full Sync.

#### 8.1.10 Step 4: calls the maintainer signed off, 2026-10-23

Made while building step 4, and approved with it.

1. **The family hues** (DESIGN.md, Perk-Family Exception): violet rhythm, rose
   press power, fuchsia luck, Surge Gold for surges, lime machines. The plan
   had orange for surges. Orange sat too close to the amber "New" tag, and
   gold already means a surge on this page. Every hue clears the reserved
   colors by at least ΔE 13; the tightest pair is violet and fuchsia.
2. **Rarity in the row.** A rare's tile glows and a keystone's has a second
   inner ring. The rarity label is grey for a common and in the family hue for
   a rare or keystone, so a high tier stands out.
3. **A toast on every drop**, in the family hue. The plan said only the "New"
   tag and a chime. A toast names what dropped, the way a rune's name shows on
   the ground in Diablo II. A surge's drop is named on its results card
   instead.
4. **The keystone swap asks first.** The plan had the swap dialog for full
   slots only. Swapping a keystone throws away the old one's levels, so it
   gets a confirm too.
5. **"Off" in the shop** for the Stabiliser under Glass Rhythm and
   Synchronisation under Brute Force, owned or not, so nobody pays for an
   upgrade that does nothing.
6. **Brute Force's combo row** reads "0 combo, off with Brute Force, x1". The
   scope still draws the beat.
7. **Afterglow** counts down under the core in gold in place of the stage name,
   and gains float in gold while it lasts.
8. **Self-Replicator counts active play**, like drops and surges, and the count
   isn't saved. A reload restarts it, which only ever costs the player.
9. **Lightning Rod rescales the surge already on its way** when bought or
   dropped, instead of waiting for the next one.
10. **The income meter leaves out Afterglow** as well as surges, in the script
    and the simulation. The pacing results didn't move.

#### 8.1.11 Step 5: calls the maintainer signed off, 2026-10-23

Made while building step 5, and approved with it on 2026-10-26.

1. **Toasts moved to the hint line**, centred above the keycap, for every
   notice. The shelf took the top-right corner, and anywhere below it covered
   the energy number. The hint is standing instructions, so a notice may
   cover it for a moment.
2. **Empty sockets show** as dashed outlines once a perk is held, so the five
   slots are visible before the swap dialog ever appears. With no perks the
   shelf is hidden, like the isotope shelf with no isotopes.
3. **A bought perk flies to the shelf**, in an arc from its offer tile, like
   isotopes fly on a reset.
4. **The codex is a board of sockets** with cards for found perks only. Cards
   for all 25 were tried first and read as a wall of "Undiscovered".
   Undiscovered perks show their rarity's shape but not their name, so
   finding one is still a surprise.
5. **The shelf sits beside the face in the markup**, positioned over it.
   Buttons can't nest inside the face's `role="button"`, and this also means
   a tap on the shelf can never reach the face as a press.
6. **A tap pins a tooltip** until a second tap, a tap elsewhere or a press;
   a mouse click shows nothing extra, since hover already does.
7. **Self-Replicator's copies aren't announced.** They come every one and a
   half to three minutes, which would be chatty; the plan's list was drops,
   purchases, upgrades and expiries.

#### 8.1.12 Step 6: calls the maintainer signed off, 2026-10-26

Made while writing the page content, and approved with it.

1. **The perks section sits after the shop tables**, since perks drop into
   the shop, and the sections after it swap their alternating backgrounds.
2. **Drop odds as a table**, one row per rarity: the chance per drop, the
   chance on a surge's bonus drop, and the price and window in seconds of
   income. The 10-minute ceiling stays unpublished (§6).
3. **The reset copy now says each isotope comes sooner than the one before**,
   with the simulation's 24 and 12 minutes, and leaves the timing to the
   player. It replaces a claim the pace change had made false. In keeping
   with the call against an in-game nudge, it states the facts and doesn't
   tell anyone to wait.
4. **The "Reset early" tip became "Take the perks that fit"**, since its
   advice no longer held. The section is about reaching a million, so the tip
   speaks to that.
5. **Other stale copy fixed along the way:**
   - "Ten shop items and no more" and "shallow on purpose".
   - The first upgrade being affordable "within your first few seconds"; it
     costs 75 since the pace change, about fifteen seconds of steady tapping.
   - What a reset wipes and keeps, which predated perks.
   - The FAQ's 25 minutes to a first reset is now 20 to 25.
6. **Smaller additions:** a perks line in "What is Spacebar Clicker?", a
   "Catch the perks" step in how to play, the isotope beads and ring in the
   reset step, and a line under the combo table on Overtone and Glass Rhythm.
7. **Words in a table column are set in the UI face**, not monospace
   (`.spec-word` in `content.css`), per the Monospace-Numerals Rule.

### 8.2 Isotope UX pass: built and signed off 2026-10-26

**The brief.** The maintainer found the isotope shelf odd once you have one:
hovering a bead said nothing about its bonus. Asked to look at the whole
mechanic first, without changing anything.

**What was wrong.** The shelf ignored the pointer, so its hover label never
showed. Nothing said when a reset opened: the only notice was "Reactor is now
Unstable", and the tab sits under the game, off screen at 1440x900. The tab
said what a reset gives now, but not what waiting gets. The copy dropped
spaces ("worth+30%", "You gain1 isotopes"), said "1 isotopes", and predated
perks. After a reset, nothing said what the isotopes do.

**Approved 2026-10-26:** A, the shelf explains itself; B, a ring for the next
reset; C, a clearer tab and dialog. Declined: a time estimate to the next
isotope, and any nudge to wait.

**Calls the maintainer signed off** ("fine for now", 2026-10-26):

1. **The ring's fill runs between thresholds**, from the last isotope to the
   next, so it empties and starts again at each one. The tab's meter does the
   same, captioned "Next isotope at 4.00M, 1.40M to go" so the numbers match
   the bar.
2. **Only the ring opens the tab.** A click on the beads does nothing more
   than hover does, like a perk chip.
3. **One notice, joined to Unstable's toast**, once a run. A second toast
   would follow the stage change by a few seconds.
4. **A rise in the ring's count isn't announced**, only popped. It comes every
   ten minutes or so, and the ring's name carries it.
5. **The perk shelf now drops below the isotopes by measurement** (§5.1), not
   a fixed rule. The ring makes the isotope row longer, and the old rule would
   have stacked it on a 390-wide phone with 4 isotopes and 60px to spare.
6. **Isotope colors reach off the face**: the ring, the tooltip and the tab's
   meter, under the Reactor-Ramp Exception in DESIGN.md.
7. **"+N" no longer makes the shelf taller.** With more than ten isotopes the
   beads used to sit 5px lower.

**For step 6.** The page's "Reset the experiment" section says that going from
one million to four takes far more time than resetting and earning a million
again. By the simulation it is the reverse now: about 12 minutes to wait for
the second isotope, against about 23 to reach a million again with one
isotope. The pace change of 2026-10-23 turned it around. Content is step 6's.

### 8.3 Isotope track: phase 2 in progress

**Status (2026-10-26).** Designed with the maintainer and approved: the fork
pairs, the build plan, the simulation targets and the rules in §8.3.6. Step 1
of 4, the logic and the save, is done. Its rules act in the game already, with
no UI to explain them until step 3. Waiting on the maintainer's review of
step 1 before step 2, the career simulation.

#### 8.3.1 The brief

- The tie-ins parked in §8.1.5: isotopes buying a sixth slot, a reroll, or
  keeping a perk through a reset.
- On 2026-10-26 the maintainer was shown five tie-ins and three ways to pay
  for them: milestones, spending isotopes, or a pick at each reset. They chose
  milestones: holding a number of isotopes unlocks a tie-in for good, and
  nothing is spent.
- Their concern with unlocks only at 3, 6 and 10 isotopes: the first isotope
  would be just +10%, and players might stop before the first real unlock. So
  every isotope unlocks something, some much bigger than others, to give
  players a reason to engage beyond the bonus.

#### 8.3.2 Decisions, 2026-10-26

1. **One unlock per isotope**, twelve in all. The track stops at 12 for now.
   The +10% per isotope stays on top.
2. **Every third rung is major, and a major is a fork**: two options, and the
   player picks one. Picks can change at every reset.
3. **The rungs and their order** as in §8.3.3, the second option at each
   fork included.
4. **Only the next two rungs are revealed.** Later ones show as empty sockets,
   majors drawn larger, like the codex.
5. **Not a prestige shop.** Nothing is spent, so the original spec's ruling
   against one (§15) holds in spirit.

#### 8.3.3 The track

| Isotope | Rung                                   | Kind       |
| ------- | -------------------------------------- | ---------- |
| 1       | Warm Start                             | Head start |
| 2       | Capacitor                              | Surge      |
| 3       | **Fork:** Sixth Slot or Prodigy        | Major      |
| 4       | Night Lab                              | Idle       |
| 5       | Lucky Find                             | Perks      |
| 6       | **Fork:** Reroll or Patience           | Major      |
| 7       | Familiar                               | Codex      |
| 8       | Hot Start                              | Head start |
| 9       | **Fork:** Heirloom or Cornerstone      | Major      |
| 10      | Rich Find                              | Perks      |
| 11      | Perfect Pitch                          | Rhythm     |
| 12      | **Fork:** Twin Keystones or Enrichment | Capstone   |

**The minor rungs**, approved:

- **Warm Start.** Each run starts Warming, with a Lab Assistant already
  working. Felt in the first second of a second run.
- **Capacitor.** Surges last 6 seconds instead of 5.
- **Night Lab.** Away progress pays 60% instead of 50%, for up to 6 hours.
- **Lucky Find.** Drops lean rarer: rares 35%, keystones 7%.
- **Familiar.** Perks you've held before cost 25% less.
- **Hot Start.** Runs also start with Finger Strength III and a Pneumatic Key.
- **Rich Find.** Drops lean rarer again: rares 40%, keystones 10%.
- **Perfect Pitch.** Rhythm tolerance 30% instead of 25%.

**The forks.** The first option at each was approved as a rung; the second is
proposed. Each pair sets two ways to play against each other:

- **3, width or depth.** _Sixth Slot_: a sixth perk socket. _Prodigy_: a perk
  you don't hold drops at level II, at its level I price.
- **6, choice or time.** _Reroll_: once a run, swap a live offer for a fresh
  drop on the same odds, never the same perk. _Patience_: offers stay on twice
  as long.
- **9, a steady base or a build that carries.** _Heirloom_: keep one
  non-keystone perk through a reset, at level I. _Cornerstone_: keep your
  keystone through a reset, at level I.
- **12, buildcraft or raw power.** _Twin Keystones_: hold two keystones at
  once. _Enrichment_: each isotope adds 15% to all gains instead of 10%.

**When rungs land**, as total play time for a steady player who buys perks,
from the simulation with today's rules. Waiting longer before a reset lands
several rungs at once.

| Isotopes | Reset at 1M | Reset at 4M | Reset at 9M |
| -------- | ----------- | ----------- | ----------- |
| 1        | 22 minutes  | 30 minutes  | 38 minutes  |
| 3        | 60 minutes  | 55 minutes  | 38 minutes  |
| 6        | 110 minutes | 77 minutes  | 67 minutes  |
| 9        | 152 minutes | 115 minutes | 89 minutes  |
| 12       | 190 minutes | 131 minutes | 112 minutes |

The rungs themselves will speed later runs, so these are the slow end. Step 2
of the build plan measures the real figures.

#### 8.3.4 How it shows

- **The ring's tooltip names what a reset unlocks**: "Reset now for 1
  isotope: +10% and Warm Start." This is the main hook, since it lands on a
  first run the moment a reset opens.
- **The isotope tooltip names the next unlock**: "Next at 4 isotopes: Night
  Lab."
- **The track in the Reset tab**: twelve sockets, majors drawn larger and
  forks as two halves. Unlocked rungs are lit, the next two are named with
  their effect, and the rest are empty.
- **Fork picks in the reset dialog.** Each unlocked fork shows its two
  options, preselected to the last pick. The first time a fork unlocks, the
  dialog asks for a pick before it resets. Heirloom and Cornerstone pick their
  perk there too.
- **An unlock card after a reset.** Once the beads land, a card over the core
  names each new rung, like the surge results card.
- **Reroll** is a small button on an offer row, once a run.

#### 8.3.5 Build plan, approved 2026-10-26

Four steps, each ending with every check passing and a check-in, as in
phase 1.

1. **Track logic and the save, pure, no UI.** _Done 2026-10-26._ The track in
   `config.ts` (`ISOTOPE_TRACK`, `TRACK_EFFECT`), `track.ts`, the rungs in
   `mods.ts`, the reset in `save.ts`, the reroll and the slot and keystone
   rules in `perks.ts`, and `track.test.ts`. The plan was:
   - The track in `config.ts`, and fork picks and the Heirloom or Cornerstone
     perk in the save.
   - Each rung through the modifiers (`mods.ts`) or the reset
     (`prestigeReset`): head starts, slots, odds, windows, prices, tolerance,
     the second keystone and Enrichment. Reroll in `perks.ts`.
   - Unit tests for every rung and both sides of every fork.
2. **Career simulation.** Extend the simulation to play run after run with
   resets, applying the track, for each fork pick and a few reset habits.
   Targets, approved 2026-10-26:
   - A player's first run is unchanged, at about 24 minutes.
   - No run to a million drops under 8 minutes before the capstone.
   - The two sides of each fork end within 15% of each other.
3. **The track in play**: the tooltips, the track in the Reset tab, fork picks
   in the reset dialog, the unlock card, the reroll button, a sixth socket and
   two keystones on the shelf and in the swap dialog, and reduced motion.
4. **Content, docs and verification**: the track on the page, an FAQ answer,
   this doc, and checks at 1440 and 390 wide.

#### 8.3.6 Rules, approved 2026-10-26

The maintainer approved these as proposed:

- **Capacitor with Surge Lines**: the extra second goes on top of Surge Lines'
  length.
- **Perfect Pitch with Metronome**: the wider tolerance wins.
- **Warm Start and Hot Start** add up.
- **Prodigy's upgrades**: a level II perk can still drop again, to level III.
- **Twin Keystones**: a third keystone asks which of the two to replace.
- **Picks never change mid-run.** A fork pick applies from the next run.

Settled while building step 1, for the maintainer's review:

- **A rung a reset unlocks acts on the run that reset starts.** So the first
  reset gives the second run Warm Start, and a reset that reaches 9 isotopes
  can keep a perk with Heirloom or Cornerstone at once.
- **Warm Start credits its 500 energy** like any earning, so it counts in
  energy all time.
- **Lucky Find and Rich Find change ordinary drops only.** A surge's bonus drop
  keeps its own odds, already rich at 45, 45 and 10.
- **Familiar counts any perk held before**, this run included, so it also
  cheapens upgrades. A perk only found, never held, pays full price.
- **A reroll draws on the run's odds**, Lucky and Rich Find included, and is
  used up only when a new perk comes. With nothing else to draw, nothing
  changes.
- **The save follows the rungs.** A sixth perk, a second keystone or a Prodigy
  offer loads only with the rung that allows it.
- **Heirloom and Cornerstone carry the perk at level I**, even with Prodigy.

### 8.4 Unassigned ideas

From the 2026-10-22 delight brainstorm, never assigned to a pass. Build only if
the maintainer asks.

- A ping ring from the combo on tier-up.
- A resonance ripple across the face at Harmonic.
- On a combo break, the combo row desaturates and shakes. This shakes the row
  only, never the screen.

### 8.5 Known gaps

- The isotope track's rules act on `dev` from phase 2 step 1, but nothing
  explains them until step 3: a reset run starts Warming with 500 energy and
  a Lab Assistant, and the reset dialog still says energy goes to zero. Fork
  rungs stay off until a pick exists, which needs step 3's dialog.
- Not playtested, and not checked on real touch devices, Firefox or Safari.
- Not yet merged to `main`.

## 9. Changelog

- **2026-10-21.** Built on `dev` as a game page. Economy retuned from the spec
  by simulation. Speed test retitled to protect the keyword.
- **2026-10-22.** Two UI passes:
  - The shop split into two tabs, styled like the site's setting buttons.
  - One amber "New" tag replaced the affordable counts.
  - Bespoke shop glyphs replaced the emoji.
  - Added the progress arc, the combo next-target text and the tier-up snap.
- **2026-10-22.** Palette opened. Delight passes:
  - Pass 1: the Cherenkov ramp and the stage-change sequence.
  - Pass 2: the surge rework and the rhythm scope.
  - Pass 3: small delights, the staged reset with the isotope shelf, and the
    away wake-up.
- **2026-10-22.** Perk system planning started (§8.1). This doc created as the
  game's running product doc.
- **2026-10-23.** Perk design questions answered. Slots set at 5, and owned
  perks can drop again as upgrades. Per-level values and a six-step build plan
  were drafted, then approved along with three levels per perk, upgrade pricing
  and Playwright in the repo.
- **2026-10-23.** Perks step 1, groundwork. Added a modifiers layer, per-run
  combo and surge rules, a seeded generator and an income meter. No visible
  change. Playwright added as a dev dependency, with 16 browser checks in
  `tests/browser/`.
- **2026-10-23.** Perks step 2, the logic and the save. Added the 25 perks with
  three levels each, their effects through the modifiers, drops, offers priced
  and timed in seconds of income, buying and upgrading, five slots with one
  keystone, and the save block with the codex. No visible change yet.
- **2026-10-23.** Perks step 3, the pacing simulation. Added `sim.ts` and
  `pacing.test.ts` in the repo. Perks tuned (§8.1.9): prices cut to 15, 30
  and 60 s of income, five overpowered perks reined in, four weak ones
  reworked, Metronome made a common, and the build lists corrected.
  Finding: by the real rules a steady player reaches first prestige in about
  14 minutes, not the 24 the page says. The pace question is open in §4.12.
- **2026-10-23.** Pace retuned (option 1, §4.12). Press-upgrade base costs
  went up four to five times, and auto-tapper costs stayed put. First prestige
  is back to about 24 minutes for a steady player, and the whole shop is
  reached in a first run. Uniform scaling was rejected: it starved
  auto-tappers. The machine perks were rebalanced for the new shape. The page
  copy now says mashing takes "half as long again", and that auto-tappers
  overtake presses at 15 to 20 minutes.
- **2026-10-23.** Drops reworked on the maintainer's feedback, to feel like rune
  drops in Diablo II rather than a steady schedule. They are now random in
  active-play time, averaging 6 minutes before a hidden 10-minute ceiling.
  Surges end with a 1-in-8 bonus drop on rarer odds. Tiers are 65/30/5, and the
  only guaranteed drop is a player's first ever. Simulated: 5 to 10 drops in a
  30-minute run, with a keystone in about 38% of runs.
- **2026-10-23.** Perks step 4, shop offers and effects in play. Perks now drop
  into the shop as offer rows, with a family-hue tile, a draining ring, the
  effect, price and rarity, and an upgrade's old value struck out. Drops get a
  chime by rarity and a toast; surges name theirs on the results card. Buying,
  the swap dialog for full slots, a confirm for the keystone swap, and the row
  folding away when bought or run out. Afterglow, Storm Front, Lightning Rod,
  Self-Replicator, Idle Hands, Chain Reaction's floats and Brute Force's combo
  row run in the script; away energy no longer drains offers; the shop marks
  switched-off upgrades. 25 perk glyphs (`PerkIcon.astro`), the Perk-Family
  Exception in DESIGN.md, 2 more unit tests and 9 browser checks. Calls to
  review in §8.1.10.
- **2026-10-23.** Perks step 5, the shelf, tooltips and the Perks panel. Held
  perks show top-right in five sockets with level pips, a bought perk flies
  there from the shop, and each chip has a tooltip on hover, focus and tap
  that never counts as a press. A Perks tab lists this run's perks and the
  codex, as a board of sockets and a card per perk found. Drops and expiries
  are announced, the away dialog names a waiting offer, and toasts moved to
  the hint line. 5 more browser checks, and more assertions in the perk
  checks. Calls to review in §8.1.11.
- **2026-10-26.** Isotope UX pass (§8.2). The isotope shelf moved beside the
  face like the perk shelf, so its beads have a tooltip on hover, focus and
  tap and are never a press. Once a reset opens, a ring follows the beads with
  what a reset pays now and its fill toward the next isotope; it opens the
  Reset the experiment tab. Unstable's toast says a reset is open. The tab
  lists what's wiped and kept, shows the bonus before and after and a meter
  to the next isotope, and its dialog and toast name the bonus. Fixed the
  dropped spaces and "1 isotopes". The perk shelf drops below the isotopes by
  measurement now. 1 more unit test and 9 browser checks. Calls to review in
  §8.2.
- **2026-10-26.** Perks step 6, content and docs; perk phase 1 done. The page
  has a perks section after the shop: how drops work, the drop odds by rarity
  with each tier's price and window, and a table per shop tab of all 25 perks,
  all rendered from the config. A ninth FAQ answer covers perks. Stale copy
  fixed: the reset section's claim about waiting (false since the pace
  change), the "Reset early" tip, "ten shop items and no more", the first
  upgrade's timing, what a reset keeps, and the FAQ's time to a first reset.
  Rarity and family names moved into the config for the game and the page to
  share. 1 more browser check. Calls to review in §8.1.12.
- **2026-10-26.** Phase 2 planned: the isotope track (§8.3). One unlock per
  isotope up to 12, every third a fork between two options, picks changeable
  at each reset, and only the next two rungs revealed. The second option at
  each fork and the build plan await the maintainer's approval.
- **2026-10-26.** Isotope track step 1, the logic and the save. The twelve
  rungs and four forks in the config; `track.ts` for what's in force; the
  rungs through the run's modifiers and the reset; Prodigy's level II offers,
  Familiar's discount, Patience's windows, the reroll, six slots and two
  keystones in the perk rules; fork picks and rerolls in the save. 29 unit
  tests. The rules act in the game now; their UI comes in step 3.
