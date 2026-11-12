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
| `src/games/spacebar-clicker/config.ts` | Every number and table: shop items, combo tiers and rules, surge, reactor states, prestige, the run-down, perks, the isotope track, achievements. Pure data.            |
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
- **Status (2026-10-27).** Built on `dev` with perk phase 1, the isotope UX
  pass and phase 2, the isotope track, not yet merged to `main`. Unit-tested
  and browser-checked, but not playtested: the balance comes from a
  simulation.

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

| File                                                  | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/games/spacebar-clicker/config.ts`                | Every number and table: shop items, combo tiers and rules, surge, reactor states, prestige, the run-down, achievements. Pure data.                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/games/spacebar-clicker/economy.ts`               | Pure functions over the save: costs, energy per press and per second, what the combo gives the auto-tappers (`syncMultiplier`), what Synchronisation would add before it is bought (`syncGain`), what a surge press pays from the auto-tappers (`surgePay`), and their output split into the machines' own and what play adds (`tapperSplit`), the luck roll, reactor state and progress, prestige gain and where the next isotope comes, buying, shop reveals, shop-tab notices, and which one-off upgrades a perk switches off. |
| `src/games/spacebar-clicker/mods.ts`                  | A run's modifiers: every rule a perk or a track rung can bend, in one object. `BASE_MODS` is the shipped game; `modsOf(state)` folds in the Stabiliser, Synchronisation, every owned perk at its level, then the track's rungs in force.                                                                                                                                                                                                                                                                                          |
| `src/games/spacebar-clicker/combo.ts`                 | `ComboTracker`: the rhythm combo, with the Stabiliser's tier drop and the 10-second pause. `RestartTracker`: the restart's 10 presses on a beat. Both take timestamps from the caller, so they have no clock of their own, and read the run's rules on every press.                                                                                                                                                                                                                                                               |
| `src/games/spacebar-clicker/rng.ts`                   | A seeded random generator (mulberry32). Pure; for perk drops, so a reload can't reroll them.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/games/spacebar-clicker/income.ts`                | `IncomeMeter`: energy per second actually earned over the last 10 s, presses and auto-tappers together, without a surge's or Afterglow's boost. Perk prices and windows are set in it. `ShareMeter`: the player's share of recent energy, for the share bar (§4.2).                                                                                                                                                                                                                                                               |
| `src/games/spacebar-clicker/rundown.ts`               | The run-down (§8.5): the output share of a reactor left alone, the energy over a stretch of it, the fault, tending and the restart, and what a hidden or closed tab earned. Pure.                                                                                                                                                                                                                                                                                                                                                 |
| `src/games/spacebar-clicker/save.ts`                  | `SaveState`, the defensive `parseSave`, and `prestigeReset`, which starts the new run with the track's head starts and any kept perk.                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/games/spacebar-clicker/achievements.ts`          | `checkAchievements`, idempotent; the records, `recordMillion` and `bestRun` (§4.9).                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/games/spacebar-clicker/format.ts`                | Number formatting: `formatEnergy`, `formatRate`, `formatMultiplier`, `formatDuration`.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/games/spacebar-clicker/perks.ts`                 | Perk drops, offers, expiry, buying and upgrading, the slot limit and keystone swap (`needsSlot`, `keystoneSwap`), away deferral, Self-Replicator's copy, perk text. Pure.                                                                                                                                                                                                                                                                                                                                                         |
| `src/games/spacebar-clicker/spacebar-clicker.test.ts` | Unit tests for the game without perks, the run-down, the restart, the share meter and the records included (97 as of 2026-11-11).                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/games/spacebar-clicker/sim.ts`                   | The pacing simulation: plays whole runs headless against the real rules, with simulated players and perk policies (§4.12), and whole careers of runs and resets with the isotope track (§8.3.7).                                                                                                                                                                                                                                                                                                                                  |
| `src/games/spacebar-clicker/pacing.test.ts`           | Holds the simulation's results in the agreed bands. About 5 s.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/games/spacebar-clicker/career.test.ts`           | Holds careers to the isotope track's targets (§8.3.7): a first run unchanged, the two sides of each fork. About 20 s.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/games/spacebar-clicker/perks.test.ts`            | Unit tests for perks: the table, every effect, drops, buying, notices and the save (63 as of 2026-11-10).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/games/spacebar-clicker/track.ts`                 | The isotope track (§8.3): which rungs are in force for an isotope count and fork picks, what a reset reaches, which forks still need a pick, and the next steps to show. Pure.                                                                                                                                                                                                                                                                                                                                                    |
| `src/games/spacebar-clicker/track.test.ts`            | Unit tests for the track: the table, every rung, both sides of every fork, the reset, the save, and the credits (37 as of 2026-11-09).                                                                                                                                                                                                                                                                                                                                                                                            |
| `tests/browser/*.e2e.ts`, `playwright.config.ts`      | Browser checks in Playwright: the main flows, a whole surge on a fake clock, every reactor state, perks in play, isotopes, and the isotope track in play (§7).                                                                                                                                                                                                                                                                                                                                                                    |
| `src/scripts/spacebar-clicker.ts`                     | The browser side: DOM, input, frame loop, surge scheduler, perks in play, the isotope track in play (tooltips, the Isotopes tab, the reset dialog, the unlock card, the reroll), the run-down in play (time away, the fault and the restart), the share bar and the combo's auto-tapper line, saving, sound, every animation. Reuses only `browserAdapter`/`KEY_PREFIX` and `createBeeper` from the engine.                                                                                                                       |
| `src/pages/spacebar-clicker.astro`                    | Markup and all game CSS, including the perk offer rows, the isotope and perk shelves and their tooltips, the swap and reset dialogs, the isotope track, the unlock card, the run-down's label and restart marks, the share bar, the Perks panel and the glyph template. The frontmatter computes the dial, bezel, mote, restart-mark and offer-ring geometry.                                                                                                                                                                     |
| `src/components/games/ShopIcon.astro`                 | The ten bespoke shop glyphs and their purchase animations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/components/games/PerkIcon.astro`                 | The 25 perk glyphs, in ShopIcon's idiom. The page renders them all into a `<template>` for the script to clone.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/content/tools/spacebar-clicker.mdx`              | The long-form copy below the game. Its tables render from `config.ts`, every perk and the drop odds included.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/data/tools.ts`                                   | Registry entry: icon `ph:atom`, `telemetry: false`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

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

- **Surge** is x10 on presses. Since 2026-11-10 each surge press also pays
  half a second of auto-tapper output, more under Storm Front (§4.4,
  `surgePay`).
- **Milestone** is `1 + 0.05` per reactor state past Dormant, up to +30%.
- **Isotope** is `1 + 0.1` per isotope, additive.
- **Sync** is 1 unless Synchronisation is owned. With it, auto-tappers get half
  the combo multiplier: `1 + (combo - 1) x 0.5` (`syncMultiplier`). Since
  2026-11-10 the combo meter shows it (§4.3).
- **Whose energy** (2026-11-10, §8.5.10). A bar under the readouts shows the
  player's share of the last few seconds' energy: their presses and surges,
  and what their combo adds to the auto-tappers through Synchronisation, or a
  surge through Surge Lines, against what the auto-tappers make alone
  (`tapperSplit`). It is what stops when the player does. Idle Hands rewards
  not pressing, so it counts for the machines. Both sums fade over 4 s, and
  the share shown is eased over 0.8 s (`ShareMeter`), so a stop drains it over
  seconds and single presses don't make it flicker. Energy from time away
  isn't counted. The bar shows once the run has an auto-tapper and stands
  down on a fault; the Stats panel lists the same share as "Energy from you".
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
- With the Stabiliser, a break drops the combo to the start of the tier below
  instead of resetting it: Harmonic to 50, Resonance to 25, Locked in to 10,
  Steady to 0, and Overtone to 100. A pause past 10 seconds ends the combo
  even so, so walking away keeps no tier (§8.5). A long pause breaks twice:
  one tier at 0.8 s, the rest at 10 s.
- **Perfect Pitch** (§8.3) widens the 25% to 30%. A press it catches, kept
  inside 30% but outside 25% with no perk's window wider, wears an isotope
  bead on its peak on the rhythm scope, and "Perfect Pitch" drifts off the
  core in the isotopes' blue, at most once every 30 s. The tracker reports
  each press's `drift` from the beat for this.
- **The auto-tappers' line** (2026-11-10, §8.5.10). Once Synchronisation, or
  Full Sync, shares the combo, a line under the tier's multiplier says what it
  gives the auto-tappers: "auto-tappers x1.75" at Resonance, x2 at Harmonic.
  It opens with the purchase and closes with a reset; under Brute Force it
  stays closed. Multipliers show two places where they need them (x1.25,
  x3.75) rather than rounding to one.
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
- **What a surge press pays** (2026-11-10, §8.5.13): its value at x10, and on
  top half a second of the auto-tappers' output at that moment
  (`SURGE.paysS`), with the combo's lift through Synchronisation. Early in a
  run the presses carry a surge anyway; once the auto-tappers outearn them,
  this keeps a surge worth about half a minute of output, where it had fallen
  to 6 or 8 seconds. A Double Tap doubles the whole press. The income meter
  that prices perks leaves it out, as it leaves out the x10.
- **Summary**: a results card over the core for 4 s, tallying presses, rate,
  energy, and the best rate. A new best gets one sheen.
- **Surge drops.** As each surge ends, one in eight drops a perk (§4.13), and
  the results card names it in its family hue.
- **Perks that change surges.**
  - Lightning Rod brings them sooner. Buying it, or dropping it from a slot,
    rescales the wait for the surge already on its way.
  - Storm Front skips the countdown: the surge strikes at once, with the
    stage-change ring rolling off the core. Its x20 to x32 raises what a
    surge press pays from the auto-tappers in proportion: a second to 1.6.
  - Surge Lines lengthens the overdrive and lets it reach auto-tappers. What a
    surge press pays from them leaves Surge Lines' boost out, so the two don't
    compound.
  - Afterglow keeps presses at x3 for a while after the surge. The label
    under the core counts it down in gold ("Afterglow x3, 12 s") in place of
    the stage name, and gains float in gold.
- **Capacitor** (§8.3) adds a second. The results card credits it with what
  that last second brought in, "Capacitor +1 s: 8 presses, 441 energy", and
  the "Surge over" announcement says the same.
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
| Stabiliser      | A broken combo drops one tier, not to 0     | 5,000     | n/a   | 1   |
| Synchronisation | Auto-tappers get half your combo multiplier | 100,000   | n/a   | 1   |

Press-upgrade prices went up four to five times on 2026-10-23, and auto-tapper
prices stayed put (§4.12). The Stabiliser came down from 20,000 to 5,000 on
2026-11-09, when it began to drop a tier rather than 10 (§8.5.7).

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
- **Synchronisation's figure** (2026-11-10, §8.5.12). Until it is bought, its
  row has a third line: what it would add to the auto-tappers each second at
  the player's combo tier, "+291 per second at Resonance", or at Steady while
  they have no tier, so the number climbs with the combo (`syncGain`). It
  shows even before Synchronisation is affordable, and its number brightens
  with the row once it is. It hides where Synchronisation would add nothing
  even at the top tier: no auto-tappers yet, Brute Force, or Full Sync
  sharing more.
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
- Pays one isotope at 1M, and one more each time the run's energy triples:
  1M gives 1, 3M gives 2, 9M gives 3, 27M gives 4 (§8.5, decided
  2026-11-09; it was squares, 1M, 4M, 9M). `prestigeGain` counts whole steps,
  so 3M is exactly 2. Each isotope is +10% to all gains, permanently. The next
  one comes at `nextIsotopeAt`, the thresholds are `isotopeThreshold`, and
  `isotopeProgress` is how far the run has come from the last threshold to
  the next.
- **Wipes**: energy, `runLifetime`, upgrades, tappers, `announced`, and the
  run's perks and offers. The reactor returns to Dormant, and the perk shelf
  fades with the imploding core.
- **Keeps**: isotopes, the prestige count, reveals, achievements, lifetime
  totals and bests, the perk codex, and the drop generator's seed.
- It has its own tab and its own confirm dialog. Separately, the toolbar
  Reset, the site's shared modal, wipes everything including isotopes. Sound
  settings survive both.
- **The isotope track** (§8.3, phase 2): each isotope held unlocks a rung,
  and a reset starts the new run with the ones it now holds. From one isotope,
  Warm Start's 500 energy and a Lab Assistant. Its picks and a kept perk are
  made in the reset dialog.
- **When a reset opens.** That is at 1M, which is also Unstable, so the stage
  toast carries it: "Reactor is now Unstable. You can reset the experiment."
  It is announced the same way, once a run.
- **The isotope badge**, over the face's top-left corner (2026-11-10,
  §8.5.17; it was a row of beads, shown only once isotopes were held or a
  reset was open). It shows from a first run's first moment, so a new player
  sees the goal:
  - A ring with the isotopes held as a count; before the first, a dim bead
    waits in it, and brightens once a reset would pay one. The ring fills
    toward the next isotope (`isotopeFill`): before a reset opens, on a
    cube-root scale toward 1M, so it keeps pace with the clock (half full
    at 125K, 84% at 600K); once one is open, linearly from one isotope's
    threshold to the next, starting again from empty at each.
  - Beside it, two lines: "13 isotopes" over "next in 400K"; before any is
    held, "First isotope" over "600K to go"; once a reset is open, "Reset for
    +1" in the isotopes' blue. A "+1" tag hangs from the ring's foot, grows
    in when the reset opens and pops at each isotope more, and the ring
    glows.
  - Hover or focus shows a tooltip. Before a reset opens: "3 isotopes" (or
    "Isotopes"), "+30% to all gains" (or "Each adds 10% to all gains"), what
    they're worth and how far off a reset is, "A reset opens at 1.00M
    energy: 580K to go.", then the track's next unlock: "Next at 4 isotopes:
    Night Lab." Past 12: "Every rung of the isotope track is unlocked." Once
    one is open: "Reset now for 1 isotope", "+30% now, +40% after", what the
    reset unlocks, then where the next isotope comes.
  - A click or tap opens the Isotopes tab and scrolls it into view; from the
    keyboard, focus follows to the tab. Touch has no tooltip: a tap opens
    the tab.
  - On a narrow face, when the perk shelf leaves no room for the lines, they
    go and the ring stands alone (`fitShelves`): on a 390-wide phone with
    six sockets, or on a 360-wide one with any perk.
  - Like the perk shelf, it sits beside the face in the markup, so a click or
    tap on it is never a press.
- **The Isotopes tab** (rebuilt 2026-11-11, §8.5.19; before that §8.4 and
  §8.5.17). Everything spans the panel.
  - **Isotopes.** Until the player's first reset, the paragraph saying what
    a reset is: it starts the run over, and each isotope adds 10% to every
    gain and unlocks the next rung. Then one card in two halves. On the
    left, what the player holds: the count in a medal, dashed and empty
    before the first and rimmed and lit after, "4 isotopes" ("No isotopes
    yet"), and "+40% to all gains" ("Each adds 10% to all gains" with none
    held, never "+0%"). On the right, tinted in the isotopes' blue, the
    reset. Once one is open: "A reset now pays", +2, "isotopes"; the gains
    before and after, "+40% -> +60% to all gains" (with none held, the
    after alone); the button beside them; and "Unlocks Lucky Find and a
    choice of Reroll or Patience.", the rungs in blue. Before one opens:
    "Next reset" and "The next reset unlocks Lucky Find." Under either,
    the way to the next isotope: "Next isotope at 9.00M energy" ("Reset
    opens at 1.00M energy"), "5.90M to go", and the meter on the badge's
    scale (`isotopeFill`). Past twelve isotopes there is no unlock line. On
    a narrow panel the halves stack and the button takes the width.
  - **Isotope track, 7 of 12 unlocked.** A rail: twelve rungs on a line, in
    order, the line lit as far as the last rung held. A rung is a gem with
    its number: lit like a bead when held, rimmed in blue for the next two,
    dashed further on. A fork's gem is a diamond. Under a held or next rung,
    its name: a held fork shows its pick, a next fork both names ("Heirloom
    or Cornerstone"); further rungs show nothing, so the track keeps the
    rule that only the next two are revealed. One card under the rail reads
    a rung: its gem, its name, "Unlocked" or "Next", and what it does; for
    a fork, "A fork: a choice of two", both options side by side with "Your
    pick" on the one picked, and the line saying when it is picked and that
    it can be switched (a fork reached with no pick says to pick one at the
    next reset); for a hidden rung, "At 10 isotopes" and "Not revealed
    yet." The card reads the rung under the mouse, else the one picked by a
    click, a tap or keyboard focus (a second click lets go), else the next
    unlock, or the last rung once all are held. The rail is the pattern of
    the Perks tab's codex board and its reading card. On a narrow panel the
    gems shrink and the names go; the card gives them.
  - **Wiped and Kept**, two quiet lines under the track, the label beside
    the list, as in the reset dialog.
- **The dialog** (rebuilt 2026-11-11, §8.5.19) opens at the top, its
  buttons pinned bottom right under a body that scrolls on a short screen:
  - **The pay, first and large.** "Reset the experiment?", quiet, over a
    bead and "+2 isotopes", with the gains before and after under them,
    "+169% -> +195% to all gains" (the after alone with none held). The
    bonus follows the capstone pick: Enrichment counts 13% an isotope.
  - **"You unlock"**, the plain rungs the reset reaches, each a card rimmed
    in blue with a bead, its name and what it does.
  - A fork reached for the first time, as two option cards with a radio's
    dot and what each does, nothing chosen, and "You can switch at any
    reset after." Reset and collect waits for a pick, with an amber hint
    over the buttons: "Pick one at 3 isotopes to reset: Sixth Slot or
    Prodigy."
  - With Heirloom or Cornerstone picked, the perks it may carry as chips, each
    with its glyph and level, best first and chosen, the rule said once ("It
    starts the next run in its slot, at level I."), two to a row at equal
    widths, with "Keep none" as the last of them, across the row when the
    count is odd. The chips follow the fork-9 pick as it changes; "Keep
    none" holds through a switch. Hovering a chip, or focusing it from
    the keyboard, shows what the perk does at level I, the level it is
    kept at, in a tooltip in the perk's hue: "Assembly Line, at level I".
    Touch shows none, as a tap makes the choice.
  - **"Your picks" on one line**, by name, "Sixth Slot · Reroll · Heirloom ·
    Enrichment", with "Change". "Change" opens the switches under it, as
    they were: each fork picked before as a two-way switch, "At 3", the
    names only, the pick lit with a dot, with a tooltip in the isotopes'
    blue on hover or keyboard focus saying what that rung does. Touch shows
    none, as a tap makes the pick; the Isotopes tab reads every rung. The
    line follows the switches.
  - **Head start and Wiped**, two quiet lines: "500 energy and a Lab
    Assistant", with a Pneumatic Key and Finger Strength III from Hot Start.
    Kept shows too on a first reset; after that it is behind "What's kept?"
  - If the run earns another isotope while the dialog is open, Reset and
    collect rebuilds it for the new count first.
  - Late in a career, with every fork and six perks, it is 659px tall at
    1440x900 with the picks on their line, and 852px with them open; it was
    824px, and 1,268px before §8.5.17. On a 390x844 phone it is 730px.
- **After the reset.** The toast: "Experiment reset. 1 isotope gained: +40% to
  all gains." Once the isotopes land in the badge, the unlock card over the core names each
  new rung, a fork as its pick, for 5 seconds. A kept perk is on the shelf at
  level I. Stats shows isotopes with their bonus: "3, +30%".

### 4.8 Time away: the run-down

Since 2026-11-09 (§8.5), replacing half-speed away progress and its dialog.
The rules are pure, in `rundown.ts`; the numbers are `RUNDOWN` in the config.

- **One clock.** It runs from `tendedAt`, the last press, purchase or
  restart, whether the tab is in view, hidden or closed.
- **The curve.** Full output for 30 minutes, then a straight fall to nothing
  over 90, and a fault at 2 hours. Any absence pays at most 75 minutes of
  output, however long it lasts. The output is the auto-tappers' with no
  combo; Idle Hands counts.
- **In view**, the frame loop scales its output by the share left
  (`outputShare`). **Hidden or closed**, the time is credited on return
  (`untendedAward`), from `lastSeen`. A page that stalls in view for more
  than 3 s, such as a laptop asleep with the game open, is paid the same way.
- **`lastSeen`** is the moment energy was last counted. The frame loop moves
  it every frame and a return moves it; a save doesn't, so a background tab's
  save timer can't swallow time away it hasn't paid for.
- **Coming back.** There is no dialog. Up to 60 s away is paid silently.
  Longer, the energy counts into the readout over 0.9 s, with a toast,
  "Untended 1h 40m: +3.2M energy", and an announcement that adds the
  reactor's state and any offer still waiting. Where Night Lab held full
  output past the usual half hour, a second toast credits it in the isotopes'
  blue: "Night Lab held full output for an hour".
- **Running down.** `data-power="down"` on the face, and `--power` steps by
  whole percents from 1 to 0, so the core and the dial fade and lose their
  color in step. The label under the core reads "Running down 64%" in place
  of the stage name, and the hint says a press brings it back. The next
  press, or a purchase, does: the color returns over the 0.9 s fade, the
  stage name settles, and "Full power" drifts off the rim. That press earns
  as usual.
- **A fault.** `data-power="fault"`: a grey, still core whose motes stop, and
  the per-second and per-press readouts at 0. The dial's arc and lights give
  way to ten restart marks on the arc's circle. The label reads "Fault 10
  presses on a beat to restart", the hint and the face's accessible name say
  how, and the combo stands down, "after the restart". Nothing earns, surges
  and drops wait (there is no active play), and a purchase doesn't clear it.
  A fault reached in view is announced, with no sound and no toast.
- **The restart.** Presses go to `RestartTracker` and earn nothing, but draw
  on the rhythm scope. The first two set the beat, and each after must keep it
  by the run's rhythm rules, so Metronome and Perfect Pitch widen it. Each
  one on the beat lights a mark in the stage color, landing a touch heavy. A
  press off the beat, or after a pause, starts the count from itself: the lit
  marks fade, and the label says "Off the beat: 9 to restart". The tenth
  swells the ring, rolls the stage-change ring and the graticule's wash out
  from the core, and plays a rising chord as the color flows back; a toast
  says "Reactor restarted". A reset of either kind also clears a fault.
- **Night Lab** keeps full output for an hour; **Night Shift** stretches the
  fall to 3, 4.5 or 6 hours. They add up.
- Energy credited for time away moves every perk offer's window past itself
  (`deferPerks`), so being away never runs an offer down.

### 4.9 Achievements

Nineteen cosmetic badges with no gameplay effect: First Press, Warmed Up (100
presses), Thousand Taps, Ten Thousand Taps, Steady Hands (25 combo), Resonance
(50), Harmonic (100), Fast Fingers (8/s in a surge), Lightning (12/s), Staffed
Up (10 Lab Assistants), Automated (one of every auto-tapper), Critical Mass,
Fresh Start (1 prestige) and Veteran (5).

**The endgame** (2026-11-10, §8.5.16): five more, for something to chase once
the track is complete. Supercritical (reach the Supercritical state), Full
Track (all twelve rungs), Big Bang (a reset paying 5 isotopes, a run to 81M),
Collector (all 25 perks in the codex) and Quick Study (a million in one run
in under 10 minutes). Collector is checked as each perk drops, Big Bang as a
reset pays.

**Records**, in the Stats panel beside the best combo and best surge:

- **Best run**: the most energy one run has earned, the run under way
  included (`bestRun`). A reset folds the run it ends into `bestRunEnergy`.
- **Fastest million**: the wall-clock time from a run's start to its first
  million (`recordMillion`), time away included, so leaving the tab can't
  shorten it. A run that beats an earlier record says so in a toast and the
  announcer, "New record: a million in 9m 08s"; a first million is recorded
  quietly. A run begun before records were kept has no start time and sets
  nothing.

### 4.10 Save and settings

- **Save**: one JSON blob at `reflexlab:spacebar-clicker:save`, version 1.
  Written every 5 s once the player has pressed, on `pagehide`, and when the
  tab is hidden.
- `parseSave` trusts nothing. Every field is coerced or falls back, unknown ids
  are dropped, levels are clamped to their max, and a `lastSeen` in the future
  is pulled back to now. Owned tappers always count as revealed and seen.
- **Fields**: `energy`, `runLifetime`, `totalLifetime`, `totalPresses`,
  `upgrades`, `tappers`, `revealed`, `seen`, `announced`, `isotopes`,
  `forks`, `prestiges`, `bestCombo`, `bestSurgeCps`, `bestMillionS`,
  `bestRunEnergy`, `surges`, `achievements`, `playedS`, `lastSeen`,
  `tendedAt`, `runStartedAt`, `createdAt` and `perks`.
- **The records** (§4.9): `bestMillionS`, null until a timed run reaches a
  million, and `bestRunEnergy`; prestige keeps both. `runStartedAt` is when
  the run began, set by a new save and by every reset, and `null` in a save
  from before records, so that run can't set the fastest million.
- **`tendedAt`**: when the reactor was last tended, by a press, a purchase or
  a restart; the run-down's clock runs from it (§8.5). A save from before it
  reads it as `lastSeen`. A reset sets it, which also clears a fault.
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
achievement, prestige, and the restart after a fault: a rising run, lower
than a stage change's. A fault itself makes no sound.

Perks add two. A drop chimes by rarity: two rising notes for a common, three
for a rare, five for a keystone, so a high tier is heard as an event. A surge's
drop chimes just after the surge's own end chord. Buying a perk has its own
two-note chord. An offer running out makes no sound.

### 4.12 Pacing

**Decided 2026-10-23: about 24 minutes to first prestige for a steady
player.** This was option 1, chosen by the maintainer.

**Retuned 2026-11-09** (§8.5.7). The Stabiliser's new rule, a tier for a
break and nothing kept past a 10-second pause, slowed a steady first run to
26.2 minutes. Its price came down from 20,000 to 5,000, which put the run
back at 24.7.

**Surges, 2026-11-10** (§8.5.13). Each surge press also pays half a second
of auto-tapper output, which brought a steady first run to 23.7 minutes, and
an idler's from 48.8 to 45.2. The tables below are from then.

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
`pacing.test.ts` holds the results in bands (§7). The simulator also plays
careers, run after run with resets and the isotope track (§8.3.7).

**First prestige without perks**, median over 8 runs:

| Player      | Minutes                                  |
| ----------- | ---------------------------------------- |
| Steady      | 23.7                                     |
| Sloppy      | 28.2                                     |
| Masher      | 36.4, about 1.53 times as long as steady |
| Idler       | 45.2                                     |
| Perfect bot | 21.6                                     |

The idler is slower than before 2026-11-09 (43.2): its 40-second rests end
its combo. Surges paying from the auto-tappers won some of that back.

**A steady first run.** The first purchase of each item comes at:

| Item              | First bought |
| ----------------- | ------------ |
| Finger Strength   | 10 s         |
| Lab Assistant     | 1.7 min      |
| Pneumatic Key     | 2.0 min      |
| Double Tap        | 2.7 min      |
| Stabiliser        | 4.2 min      |
| Spring Keys       | 6.2 min      |
| Robot Arm         | 7.3 min      |
| Particle Collider | 14.5 min     |
| Synchronisation   | 16.7 min     |
| Quantum Keyboard  | 20.5 min     |
| First prestige    | 23.7 min     |

So a first run sees the whole shop. The Collider pays better per energy than
the Quantum Keyboard, so it comes first.

**Auto-tappers versus presses.** Auto-tappers overtake presses and surges for
good at about minute 18 for a steady player and 27 for a masher. An idler's
auto-tappers earn 55 to 66% of its energy from minute 10, though its bursts
of tapping and its surges still win some minutes. For a steady player they
earn 20% of income in minutes 10 to 15, 55% in minutes 15 to 20, and 77% in
minutes 25 to 30. That last was 87% before surges paid from the
auto-tappers.

**Against the spec's §12 targets:**

- **Met:** the first upgrade within 15 s; the first auto-tapper within 30 s
  (both cost 75, affordable at about 11 s of steady tapping); the Pneumatic
  Key at about 2 min.
- **Missed:** the Robot Arm at 7.3 min against a 5-minute target; the
  Quantum Keyboard at 20.5 against 12, and the Particle Collider at 14.5
  against 30; an idle share of 77% at 30 min against the spec's 50%.
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
  theirs. Since 2026-11-11 it is laid out as a card (§8.5.18): name, rarity
  and price on one line, the effect at full width under them, and its note,
  credits and Reroll in a foot inside it.
  - Its glyph tile is lit in the family hue, affordable or not. The tile's
    border is a ring that drains as the window runs down, and it breathes in
    the last fifth. A rare's tile glows; a keystone's sits in a second ring.
  - The name, with a level badge past level I, then the effect with its
    number in the family hue. An upgrade strikes out the number held beside
    the number it becomes. A perk not held is never an upgrade, even at level
    II with Prodigy: its badge says II, with nothing struck out.
  - The price, and the rarity: "Common" in grey, "Rare" and "Keystone" in the
    family hue, "Upgrade" for an upgrade.
  - A note when buying costs more than energy: "All 5 slots are full: you'll
    pick one to drop" (6 with Sixth Slot), "Both keystone slots are full:
    you'll pick one to drop" with Twin Keystones, or "Swaps out your
    keystone, Glass Rhythm II".
  - **Credits.** What the isotope track did for the offer, a line each in the
    isotopes' blue after a bead (`offerCredits`): "Prodigy: level II for the
    level I price", "Lucky Find: a rare, not a common" (or Rich Find, "a
    keystone, not a rare"), "Patience: still on offer" once it outlives the
    window it would have had, and "Familiar: 25% off".
  - **A drop a find rung raised.** Lucky Find and Rich Find mark an ordinary
    drop `lifted` when the same roll at the usual 65/30/5 odds lands a tier
    lower: from the roll alone, so the drop sequence never changes. It is
    saved with the offer. The toast and the announcement end ", thanks to
    Lucky Find". About 9 drops in 100 with Lucky Find, 20 with Rich Find. A
    surge's drop has its own odds and is never marked.
  - **Reroll.** With the Reroll rung, a small pill in the family hue sits
    under the row while the run has its reroll. It swaps the offer for a
    fresh drop on the run's odds, which slides in like a drop, and is gone
    for the run. "Rerolled Momentum II." joins the drop's announcement.
- **Buying.** An upgrade, or a new perk with a slot free, buys at once: the
  tile flares and the row folds away.
  - With every slot full, the swap dialog shows the offer and lists the held
    perks as cards. Picking one drops it and buys.
  - A keystone while another is held asks first: "Swap your keystone?" With
    Twin Keystones, a third keystone opens the swap dialog instead, "Both
    keystone slots are full", listing the two.
  - Cancel keeps the offer. Presses are ignored while the dialog is open, and
    it closes if the offer runs out meanwhile.
- **Running out.** Once the run's energy passes the window, the row fades and
  folds away, silently, and "Overtone is no longer on offer." is announced.
- **The shelf** sits over the face's top-right corner, mirroring the isotope
  badge top-left: five sockets, six with Sixth Slot, a chip in the family hue
  for each perk held, and three pips under it for its level. Empty sockets
  show as dashed outlines. It fills from the corner inward: the first perk
  takes the rightmost socket, the next the one to its left, and Sixth Slot's
  socket opens on the far left (§8.5.17).
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
    reactor to the chips, first perk first, so from the corner leftward.
- **The Perks panel**, a tab between Achievements and Isotopes (rebuilt
  2026-11-11, §8.5.17). Each perk shows once, and only its tile carries its
  hue: no rare or keystone glow here, though a keystone keeps its inner ring.
  - This run: "N of 5 slots" (6 with Sixth Slot), and a card per perk held,
    shaped like the isotope track's: tile, name and level on one line,
    "Rare" or "Keystone" quietly at its end (a common says nothing), the
    effect under them.
  - The codex, "N of 25 found": a board with a socket per perk, one row per
    shop tab with its label and count ("9 of 12"), the sockets in family
    bands: rhythm, press power, luck, surge, machines. Found perks are lit,
    dimmer if never held, with a dot under those held this run. Undiscovered
    ones are dashed sockets in their rarity's shape (a keystone's has a
    dashed inner ring) with no name; their band gives away their family.
  - Under the board, one reading card for whichever socket is pointed at,
    else the one picked by a click, a tap or keyboard focus; a second click
    or tap, or Escape, lets go. It gives the name, "Rare · Rhythm", the
    effect at the level held this run (else the best held, else the first),
    every level's number as a ladder with those held filled and the quoted
    one in the hue, and "Held this run, level 3", "Held up to level 2" or
    "Found, never held". An undiscovered perk reads "Undiscovered", its
    rarity, and "Not found yet. It drops into the shop's Auto-tappers tab."
    With none shown, the card says what the codex is: "Point at a perk to
    read it. The codex keeps every perk you find, through every reset; only
    the top-bar reset clears it."
  - The board is one Tab stop. Arrow keys move along it, left and right
    through every socket and up and down between the rows; Home and End go
    to its ends. A clicked or tapped socket lets go of focus, so Space keeps
    pressing the reactor.
- **Coming back from time away**, the announcement names any offer still
  waiting: "Still on offer: Overtone II." Time away doesn't count against
  its window.
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
  Isotopes. The tabs sit in one row; where the panels are under 440px wide,
  as on a phone, they sit two by two at equal widths (a container query on
  `.panels`), rather than leave one wrapped alone.
- **The reactor face**, top to bottom:
  - Energy readout, with per-second and per-press rates, and under them the
    share bar (§4.2): "You 52%", the bar, "48% auto-tappers". The number
    and the bar sit on the core's axis (§8.5.18): "energy" hangs off the
    number's right without widening its row, and the bar, 168px, has equal
    sides. Its row is always laid out, so nothing moves when it fades in.
  - Isotope badge in the top-left, perk shelf in the top-right. Both sit
    beside the face in the markup, positioned over its corners. The badge's
    button is padded, and its 30px ring sits 16px in from the face's outer
    edge, level with the perk chips.
  - The core: a progress dial with six state lights, a turning dashed bezel,
    motes, the core heart, and the readout inside. Every lit light wears the
    dial's color, as the arc does: the stage's, and gold from a surge's
    countdown to its results (since 2026-11-11; each used to keep the color
    of the stage it marks). Unlit ones are grey.
  - State name and surge label.
  - Combo row: count, tier label, next-tier target, the multiplier with the
    auto-tappers' line under it (§4.3), grace bar, and the rhythm scope
    canvas.
  - The SPACE keycap and the hint line. Toasts sit over the hint line, which
    is standing instructions, since the top corners belong to the shelves.
    Since 2026-11-11 (§8.5.18) a toast takes the keycap's place at the
    face's foot, and the hint is retired once the player has held a Steady
    combo: its line closes and the face spreads that room above, over the
    readouts, the dial and the combo, keeping its height.
    They sat top-right until step 5. Where the face's content is 460px or
    wider (1440 and 1280 wide) the hint takes one line.
- **Fitting 1440x900** (2026-11-10). The share bar and the auto-tappers' line
  are paid for by the one-line hint, the face's gap (12px to 10) and the
  energy number's leading (1 to 0.9). The face is 572px before
  Synchronisation and 587 after, against 588 before, and a browser check
  holds it. The isotope badge's lines end 16px short of the energy number at
  1440, so the readout no longer steps down for it there: until the badge,
  the isotope shelf stepped it down 14px and the face was 601px (§8.5.11).
- **Narrow words.** Where the face's content is 400px or less, as on a phone,
  "auto-tappers" shortens to "auto" on the share bar and the combo meter.
- **Narrow faces.** Both shelves answer to `reactor-wrap`, a container
  around the face. At 566px of face (1440 and 1280 wide) the readout clears
  them as it is. Below 550px it steps down under both, measured from the
  face's padding token, `--face-pad`, so it holds on phones and on a laptop
  with the shop beside the reactor. The badge always shows, so the readout
  keeps one place through a run.
- **When the shelves would meet.** `fitShelves` measures from the badge's
  ring, which never moves, on every shelf change and on resize. When the
  badge's lines (a fixed 5.5rem) wouldn't end 12px short of the perk shelf,
  they go and the ring stands alone. When even the ring wouldn't, the perk
  shelf drops below the badge, and the readout with it; no phone width gets
  there.

### 5.2 Color

- **Reactor-Ramp.** The Cherenkov ramp in §4.6. It covers the core, bezel,
  motes, dial and lights, gains, the rhythm scope, the state name, and the
  player's part of the share bar, against the track's grey for the machines.
  Isotopes are blue-white on Cherenkov blue at every stage, on and off the
  face: the badge's ring, bead, tag and "Reset for +1", the isotope tooltip,
  the meter in the Isotopes tab, and the isotope track: its rail and reading card
  in that tab, the line in the Next reset card naming what a reset unlocks,
  the picks in the reset dialog, the unlock card, and the credits
  where a rung acts (an offer's lines, the surge card's line, Perfect Pitch's
  float and its beads on the scope).
  The ramp's tokens live on
  `.game-section` so they reach past the face. Stages fade into each
  other over 0.8 s through registered custom properties (`--stage`, `--halo`,
  `--core-heart`, `--core-alpha`, `--core-glow`, `--wash-r`) and
  `color-mix()`.
- **Surge Gold.** Core `#fcd34d`, halo `#fbbf24`, ink `#fef3c7`. Used during
  overdrive, the share bar's part included, and for lucky Double Tap floats.
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
  - The core snaps on every press and breathes at its stage's pace between
    presses. A stage change's larger snap plays out in full first. Both
    classes come off the core once played; until 2026-10-28 they stayed on,
    so a page's first stage change silenced the press pulse and its first
    press stopped the breathing, until a reload.
  - Lucky presses float in gold.
  - Each shop glyph plays its own motion when bought: press, pop, emerge,
    compress, phase, nod, stroke, swing, ghost or spin.
  - Auto-tapper income gathers for 1.2 s and drifts off the core's rim as a dim
    float.
  - The bezel turns once per `max(16, 120 - 26 x log10(1 + eps))` seconds, and
    stays still with no income.
  - Motes: two more per stage, twelve at most.
  - Reset sequence: the core implodes for 0.5 s while the face dims, then
    blooms back as Dormant over 0.9 s, while the isotopes just earned fly
    from the core into the badge as beads over 0.7 s, up to three for any
    number. The badge keeps its old count until they land, steps up as each
    does, and pops.
  - Time away (2026-11-09, §4.8): the energy counts in over 0.9 s. The core
    and dial fade with the run-down, a fault greys and stills them, the
    restart's marks land one by one, and the restart swells the ring and
    rolls the stage-change ring and wash out as the color returns.
- **Whose energy (2026-11-10).** The share bar fades in over 0.6 s when the
  run's first auto-tapper starts earning, and its edge glides with the eased
  share. The auto-tappers' line opens under the multiplier over 0.42 s with
  Synchronisation, easing out, and closes the same way with a reset.
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
- **Isotope track (2026-10-27).** The unlock card rises in over the core like
  the surge card, once the reset's beads have landed, and goes after 5 s. A
  reroll's new offer slides in like a drop.
- **Reduced motion.** Color changes and lights stay; all travel, spin, flight
  and implosion goes. Totals and energy from time away apply at once, and the scope
  redraws only on presses. Perk rows appear and go at once, and the ring steps
  rather than glides and never breathes. A bought perk is simply on the shelf,
  and the shelf clears without fading. The isotope ring appears and counts
  without growing or popping, and its fill and the meter step. The unlock card
  appears as the reset does, without rising. The restart's marks light
  without landing, and the restart clears them at once with no swell. The
  share bar and the auto-tappers' line appear at once.

### 5.4 Accessibility

- The face is `role="button"` with `tabindex="0"`.
- A live region announces purchases, state changes, achievements, surges and
  both resets. Messages from one moment are read as one, so a reset's unlocks
  and the achievement it earns are both heard.
- Opening a dialog moves focus into it. Closing hands focus back to where it
  was, or to the reactor when nothing was focused. Shop buttons use `aria-disabled` so they stay focusable while
  unaffordable.
- Tabs follow the ARIA tab pattern, with arrow keys.
- The isotope badge is one button, named like "3 isotopes, +30% to all
  gains, kept through every reset. A reset opens at 1.00M energy. Next unlock
  at 4 isotopes: Night Lab." Before any is held it begins "No isotopes yet.
  Resetting the experiment pays them, and they last through every reset."
  Once a reset is open the name goes on: "Reset the experiment now for 1
  isotope, taking all gains to +30% and unlocking a choice of Sixth Slot or
  Prodigy. The next isotope comes at 3.00M energy." It names thresholds, not
  the energy to go, so it doesn't change with every press. Its lines and
  tooltip are visual only, like the perk shelf's tooltip. Tab goes from the
  reactor to the badge, then the perk chips. Opening the tab from the badge
  by keyboard moves focus to the tab.
- A reset opening is announced with the stage change. A rise in what a reset
  pays is not announced; the badge's name carries it.
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
- **The Perks panel.** This run's cards give each perk's rarity and family
  in hidden words, "Glass Rhythm, keystone rhythm perk"; the visible "Rare"
  or "Keystone" is hidden from screen readers. The codex board's rows are
  groups named by their label and count. Its sockets are buttons whose names
  carry the reading card's words: "Overtone, rare rhythm perk, held up to
  level 2. A new tier above Harmonic: 200 combo for x3.5 / x3.75 / x4", or
  "Undiscovered rare perk". The card's ladder speaks each step as "Level 1:
  x3.5".
- **The Isotopes tab** has three sections, each a heading; the last's,
  "What a reset does", is for screen readers only. Wiped and Kept are a
  description list.
- **The isotope track.** In the Isotopes tab it is one ordered list labelled
  by its heading, a button a rung, one Tab stop with the arrow keys, Home
  and End moving along it, and Escape letting go of a picked rung. Each
  button's name says where it sits, its state and what it does: "At 3
  isotopes, unlocked: Sixth Slot. … Or Prodigy, your pick. …", "At 8
  isotopes, next: Hot Start. …", or "At 10 isotopes: not revealed yet." The
  gem, the name under it and the reading card are visual only, like the
  codex's. In the reset
  dialog each fork and the keeping rung's perks are a fieldset of radios with
  a legend ("At 3 isotopes: pick one"), the inputs over their cards, chips or
  switch halves so focus and arrow keys work, with a focus ring on each. A
  past pick's legend reads "At 3 isotopes" though it shows "At 3", and each
  half's radio is described by what the rung does; its tooltip is visual
  only, stays while hovered, and Escape closes it before the dialog. The pick
  hint is an alert, and focus goes to the fork that needs a pick. The unlock card is
  visual; the reset's announcement names each rung unlocked and any perk
  kept: "Unlocked Prodigy: Perks you don't hold drop at level II, for their
  level I price." The reroll pill is a button named "Reroll: swap this offer
  for a fresh drop, once a run". An offer's credit lines are inside its
  button, so they are read with it. Capacitor's line joins the "Surge over"
  announcement and a raised drop's thanks joins its own. Perfect Pitch's
  float and scope beads are visual only, like the combo row.

## 6. Content and SEO

Rebuilt 2026-11-11 (§8.5.20), from a spec sheet of tables into blocks drawn
with the game's own parts.

- **Title**: "Spacebar Clicker Game - Play Free Online" (2026-11-12; it
  was "Spacebar Clicker - Free Online Spacebar Clicker Game", the keyword
  twice), with an authored description and FAQ JSON-LD. "Idle" left the
  title, since a reactor left alone runs down; the copy still says "idle
  game" where it fits.
- **House rules for the page's copy** (maintainer, 2026-11-11, refined
  2026-11-12):
  - No "no ads" claim anywhere; the site may carry ads later.
  - No times for how long a run, an isotope or the track takes; runs differ
    by player. Rule durations are fine: a surge's 5 seconds, 30 minutes of
    full output.
  - A heading that uses the keyword gives it an identifier, "this
    spacebar clicker", never the bare term, which reads like any generic
    spacebar clicker. Only a few headings carry it: five H2s saying "this
    Spacebar Clicker" read formulaic, so two do now, the first and the
    last.
  - Copy reads as written by a person, specific to this game, and shows
    what each system brings rather than how it is computed.
  - The stop-slop skill on every draft. The keyword lives in the title,
    the meta description, the H1, the subtitle, About's first sentence, two
    H2s and the FAQ's questions. "Unblocked" queries are not a target.
- **The header**: every tool page's header (the display title, a 1.125rem
  subtitle in a 600px column; 2rem and body size on a phone): H1
  "Spacebar Clicker", a subtitle that names it a spacebar clicker game,
  and four chips, each a selling point a first-time visitor can read
  ("Rhythm pays more than mashing", "Perks change how each run plays",
  "Auto-tappers earn while you're away", "Free saves in your browser"):
  four in a row, two and two where they don't fit, hidden on a phone.
- **Under the game**, a jump strip, then these H2s:
  1. About this spacebar clicker game (`#about`): three paragraphs, what
     the game is, the builds its perks allow, and the save.
  2. How to play (`#how-to-play`): six cards.
  3. The combo: a steady beat pays up to 3x (`#combo`): tier ladder, two
     traces, three rules.
  4. Upgrades and auto-tappers (`#shop`): rows like the game's shop.
  5. Perks: 25 random drops (`#perks`): two paragraphs on what perks
     bring, filter chips, and a row per perk by family, built like the
     shop's rows.
  6. Reactor states (`#reactor`): seven dials.
  7. When you stop pressing (`#rundown`): output against time away.
  8. Prestige: reset for isotopes (`#prestige`), with an H3, "The isotope
     track: 12 rungs" (`#isotope-track`).
  9. Questions about this spacebar clicker (`#faq`): 12 questions. (A
     tips section stood before it until 2026-11-12; §8.5.21.)
- **Everything with a number reads from `config.ts`** (and `economy.ts`
  for the payout and the reactor states' notes), so changing a number
  changes the page. The exceptions are the FAQ's answers, which the
  frontmatter holds as plain text for the JSON-LD: the combo's top
  multiplier at 100, the 0.8 s pause and the 33 ms floor, the drop odds in
  words (two in three commons, one in twenty keystones), the run-down's 30
  and 90 minutes, the track's first rung and "all 25 perks". Recheck them
  when a rule changes. The FAQ is written twice, in the frontmatter and on
  the page, and the two match word for word, curly apostrophes included.
- **No claim from the simulation is left on the page.** The last, "a
  steady first run to a million sees three to seven" drops, went with the
  perks' rebuild on 2026-11-12 (§8.5.21).
- **Explain what a system brings, not how it is computed** (maintainer,
  2026-11-12): the page is not a thesis on the mechanics. The drop odds
  stay in words in the FAQ's perks answer; prices and level costs are left
  to the game.
- **Kept off the page on purpose:** the 10-minute ceiling on the wait for a
  drop. Published, it would be the visible pity the maintainer ruled out
  (§8.1.2). And every time-to-finish figure, as above.
- **The page lists all 25 perks and all twelve rungs**, though the game
  reveals only the next two rungs and the codex hides the undiscovered.
- **Files.** The copy and markup are `src/content/tools/spacebar-clicker.mdx`;
  the blocks' styles, and the colour tokens the game shares, are
  `src/styles/clicker-page.css`; the perk filter is
  `src/scripts/clicker-page.ts`. A section that uses the ramp or the perk
  hues takes the class `sc-doc`.
- **Writing in the MDX.** Outside a `.map()`, prose is bare text between
  blank lines; a `<p>` or an SVG `<text>` with words on their own line
  gets a paragraph inside it and breaks. Prettier mangles `{/* */}`
  comments, so there are none. A space between an expression and an
  inline element (`{n} <small>`) is dropped; write it as `{' '}`. The FAQ
  is written twice, in the frontmatter and on the page; the page's copy
  adds the links. A count of things in prose is a word, through `word()`
  ("five families", "seven states", "you can hold five"); a game value
  stays a figure (25%, 0.8 s, 5 presses, 30 minutes).
- **Section openings say what playing feels like** (2026-11-12): each
  section opens on the experience ("Find a rhythm and hold it", "At the
  start, every point of energy comes from your own presses") and leaves
  the reference data (perk lines, rungs, shop rows) to carry the numbers.
  The perk families say who each suits ("For mashers.", "For players who
  leave the game running."). The shop rows show a price, an effect and a
  level cap, no price multipliers.
- **Glow, mono and type on the page** (§8.5.21): one glow, the beat
  trace's; numbers mono and words sans; the size ladder at the top of
  `clicker-page.css`.
- When a mechanic changes, update the copy that describes it.

## 7. Testing

- `npm test` runs Vitest: the 97 clicker tests, the 63 perk tests, the 37
  track tests, the pacing bands and the career bands.
- `npm run check` runs `astro check`. `npm run format:check` runs Prettier.
  `npm run build` should be clean.
- `npm run test:browser` runs the Playwright checks in `tests/browser/`,
  86 as of 2026-11-11, in about ten minutes.
  - **Coverage:** the page shell, the perks section, the isotope track table
    and FAQ rendering from the config, presses and the combo, buying, the
    shop tabs and "New" tag, save and reload, time away with no dialog, prestige, the
    full reset, the panel tabs in one row and two by two on a phone, the
    phone layout, a whole surge on a fake clock with and without reduced
    motion, every reactor state with its lit lights in its color, the
    lights turning gold in a surge and back, a live stage change, and the
    press pulse and breathing after one.
  - **Perks** (`spacebar-clicker-perks.e2e.ts`): a live drop, its row, toast
    and tag; buying and an upgrade; the swap dialog and the keystone swap;
    switched-off upgrades and Brute Force's combo row; a window running out,
    and time away not running it down; Chain Reaction's floats; a surge with
    Storm Front, a surge drop, Afterglow and Self-Replicator on a fake clock;
    reduced motion; the swap dialog on a phone. From step 5: the shelf, its
    pips and the flight to it; tooltips on hover, focus, Escape and a tap,
    with no press; the Perks panel and codex, through a prestige; the
    codex's reading card by hover, click, keyboard and a tap, with no press,
    and Space pressing after a click; the drop,
    expiry and away-dialog wording; the shelf clearing the readout and the
    isotope badge on a phone.
  - **Isotopes** (`spacebar-clicker-isotopes.e2e.ts`): the badge's name,
    lines and tooltip on hover, focus and Escape, its click opening the tab
    with no press; a new player's badge, its cube-root fill and the tab's
    meter on the same scale, and its lines clear of the readout at 1440 with
    the face within 588px; a reset opening, with its one notice, the tag and
    the way into the tab by mouse and keyboard; the tag counting up; the
    tab's card closed and open, its unlock line and meter, the dialog, the
    toast, the count landing, and plurals; a
    tap on the badge; the badge, its lines and the perk shelf on a phone.
  - **The track** (`spacebar-clicker-track.e2e.ts`): the badge tooltip's
    unlock line, before a reset opens and once one is; the track in the
    Isotopes tab as cards, held, picked, next and hidden, and the tab with
    every rung held; a new fork waiting for its pick, the
    unlock card and the saved pick; Heirloom and Cornerstone carrying a perk,
    and "Keep none" holding through a switch; the dialog late in a career
    fitting 1440x900, its switches, and their tooltip on hover, on focus and
    with Escape; a reroll, and none without the rung; Prodigy's level II offer; six sockets
    and the Twin Keystones swap; the credits on an offer, and none without
    the track; Night Lab's toast on return; Perfect Pitch's float on a fake
    clock; the unlock card under reduced motion; the dialog with every fork
    opening at the top with its buttons pinned, the Isotopes tab a rung a row
    with the hidden ones as sockets, six sockets beside the badge's lone ring, and a reset that lands every rung, its
    card listing three and the rest, on a phone.
  - **The run-down** (`spacebar-clicker-rundown.e2e.ts`): a return to a
    run-down reactor and a press bringing it back; a return to a fault, the
    readouts at 0, ten presses on a beat restarting it; a stumble; the
    run-down starting and the fault arriving in view, on a fake clock; a
    stalled page paid as time away; and the Stabiliser's tier drop and
    10-second pause.
  - **Whose energy** (`spacebar-clicker-share.e2e.ts`): the share bar waiting
    for auto-tappers, rising with presses and draining after; the
    auto-tappers' line opening with Synchronisation and following the combo;
    Synchronisation's shop figure climbing with the combo and going once
    bought; a fault standing the bar down; the face at 1440x900 within 588px with both
    showing; and the short words on a phone, with nothing in the combo row
    wrapping.
  - **Records** (`spacebar-clicker-records.e2e.ts`): a faster million told,
    kept, and earning Quick Study; a first million recorded quietly; the best
    run in Stats.
  - **Toasts that queue.** `recordToasts` in `fixtures.ts` notes every toast
    as it shows, from the page's first moment, so a check can't miss one that
    rotated out while a cold dev server was slow to settle. The Night Lab
    return check uses it.
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
- `career.test.ts` runs with `npm test` too, about 30 s, alongside the pacing
  tests. It plays four reset habits and, since 2026-11-09, careers in
  sittings with the run-down between. Its table: `CAREER_REPORT=career.txt npx vitest run career`.
- Run every check at the end of each step.
- **Never verified**: a real touch device, Firefox and Safari, long-session
  feel, and a human playtest of the balance.
- **Jump to prestige** for testing. Paste this in the console, then use the
  "Isotopes" tab:

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
  - **Isotopes quicken the clock** (since 2026-11-10, §8.5.14). Every gap and
    the ceiling divide by 1 + 0.05 per isotope held (`perIsotope`): at 12
    isotopes the mean is under 4 minutes and the ceiling about 6. The runs
    isotopes shorten still see four or five drops.
  - **Surges are boss fights.** Each surge ends with a 1-in-8 chance of a
    bonus drop, on rarer odds. Surge drops don't affect the ordinary timing.
  - **Steep tiers.** Ordinary drops are 65% common, 30% rare and 5% keystone.
    Surge drops are 45%, 45% and 10%. A tier with nothing left to drop is
    skipped and the odds are spread over the rest. A perk is then picked
    evenly within its tier.
  - **An early first drop, every run** (since 2026-11-10, §8.5.14). A run's
    first drop comes at a random moment 1 to 3 minutes into active play
    (`firstDropS`). On a player's very first run, meaning their codex is
    empty, it is a common; after a reset it is on the usual odds. A full reset
    empties the codex, so a fresh start gets the tutorial drop again. Nothing
    later is timed. Until 2026-11-10 only a player's very first run had it:
    the step 2 model's guaranteed first drop on every run was removed on
    2026-10-23 (below), and the maintainer brought an early one back, at a
    random moment, for the short runs isotopes bring.
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
   for all 25 were tried first and read as a wall of "Undiscovered". (The
   cards gave way to one reading card under the board on 2026-11-11,
   §8.5.17.)
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

### 8.3 Isotope track: phase 2, done

**Status (2026-10-27).** Designed with the maintainer and approved: the fork
pairs, the build plan, the simulation targets and the rules in §8.3.6. Step 1
of 4, the logic and the save, is done and signed off. Its rules act in the
game already, with no UI to explain them until step 3. Step 2, the career
simulation, is done: every target is met after the two changes the maintainer
approved on 2026-10-27 (§8.3.7). Step 3, the track in play, and the credits
pass after it (§8.3.9) are done; the maintainer signed off their calls on
2026-10-27. Step 4, the content, is done. Phase 2 is complete, pending a
playtest and the merge to `main`.

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
  once. _Enrichment_: each isotope adds 13% to all gains instead of 10%.
  Proposed at 15%, set to 13% from the career simulation (§8.3.7).

**When rungs land**, as total play time for a steady player who buys perks,
from the career simulation (§8.3.7): the median over 8 seeds and six sets of
fork picks. Waiting longer before a reset lands several rungs at once.

| Isotopes | Reset at 1M | Reset at 3M | Reset at 9M | Reset at 27M |
| -------- | ----------- | ----------- | ----------- | ------------ |
| 1        | 21 minutes  | 26 minutes  | 36 minutes  | 47 minutes   |
| 3        | 54 minutes  | 47 minutes  | 36 minutes  | 47 minutes   |
| 6        | 99 minutes  | 66 minutes  | 61 minutes  | 75 minutes   |
| 9        | 137 minutes | 97 minutes  | 84 minutes  | 99 minutes   |
| 12       | 168 minutes | 110 minutes | 101 minutes | 99 minutes   |

Re-measured 2026-11-10, after surges began to pay from the auto-tappers
(§8.5.13) and isotopes to quicken the drop clock (§8.5.14). On 2026-11-09,
on the tripling payout with the Stabiliser at 5,000 (§8.5.7), all twelve
came at 182, 122, 108 and 117 minutes. Before, on squares, resets at 1M, 4M and 9M held all twelve
rungs at 177, 124 and 104 minutes.

These include the rungs' own effect. They come in up to 9% sooner than the
estimates made before the track existed.

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
2. **Career simulation.** _Done 2026-10-27, §8.3.7._ Extend the simulation to play run after run with
   resets, applying the track, for each fork pick and a few reset habits.
   Targets, approved 2026-10-26:
   - A player's first run is unchanged, at about 24 minutes.
   - No run to a million drops under 8 minutes before the capstone. Changed
     on 2026-10-27 to: none under 7, and at most one run in 100 under 8.
   - The two sides of each fork end within 15% of each other.
3. **The track in play.** _Done 2026-10-27; calls in §8.3.8 signed off._
   The tooltips, the track in the Reset tab, fork picks
   in the reset dialog, the unlock card, the reroll button, a sixth socket and
   two keystones on the shelf and in the swap dialog, and reduced motion.
4. **Content, docs and verification**: the track on the page, an FAQ answer,
   this doc, and checks at 1440 and 390 wide. _Done 2026-10-27 (§6)._

#### 8.3.6 Rules, approved 2026-10-26

The maintainer approved these as proposed:

- **Capacitor with Surge Lines**: the extra second goes on top of Surge Lines'
  length.
- **Perfect Pitch with Metronome**: the wider tolerance wins.
- **Warm Start and Hot Start** add up.
- **Prodigy's upgrades**: a level II perk can still drop again, to level III.
- **Twin Keystones**: a third keystone asks which of the two to replace.
- **Picks never change mid-run.** A fork pick applies from the next run.

Settled while building step 1, approved with it on 2026-10-27:

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

#### 8.3.7 Step 2: the career simulation, 2026-10-27

**What it plays.** `simulateCareer` in `sim.ts` plays run after run from a new
save, resetting through the real `prestigeReset`. The player is the steady
tapper, buying perks as in the pacing tests. There are three reset habits:

- **Eager** resets at 1M, for one isotope.
- **Patient** waits for 4M, for two.
- **Saver** waits for 9M, for three.

The rest of the setup:

- **How long.** Careers run to 15 isotopes, three past the capstone, so its
  two sides have runs to differ on.
- **Fork picks** are made when each fork is reached.
- **Keeping a perk.** Heirloom keeps the rarest other perk, highest level
  first. Cornerstone keeps the keystone.
- **Rerolls.** The player rerolls an offer they wouldn't buy.
- **Not simulated.** Time away isn't played, so Night Lab measures nothing,
  as Night Shift doesn't in the pacing tests.

`career.test.ts` plays 8 seeds of each habit with six sets of picks:

- every fork on its first side;
- every fork on its second side;
- each fork flipped alone.

**Against the targets**, with the two changes below in place:

| Target                                                                                     | Result                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A first run is unchanged                                                                   | Met. It is the same run, to the tenth of a second, with or without the track: 21.9 minutes for a steady player buying perks.                                                                                                                              |
| A million in 8 minutes or more before the capstone, all but 1 run in 100, and none under 7 | Met. In the test's pick sets, one eager run in 576 took 7.8 minutes, at 10 isotopes with Prodigy and Cornerstone. Over all 16 pick sets, 4 runs in 256 at 10 and 11 isotopes took 7.6 to 7.9. The 10th percentile is 10.7 minutes or more on every habit. |
| The two sides of each fork end within 15%                                                  | Met: 1 to 7% apart at forks 3, 6 and 9, and 9 to 13% at the capstone.                                                                                                                                                                                     |

The fork figures, as minutes from the reset that reaches the fork to 15
isotopes, first side against second:

| Fork                             | Eager           | Patient        | Saver         |
| -------------------------------- | --------------- | -------------- | ------------- |
| 3, Sixth Slot or Prodigy         | 150 vs 144 (4%) | 100 vs 94 (7%) | 85 vs 80 (5%) |
| 6, Reroll or Patience            | 103 vs 104 (1%) | 79 vs 78 (2%)  | 59 vs 60 (2%) |
| 9, Heirloom or Cornerstone       | 62 vs 63 (1%)   | 42 vs 45 (7%)  | 36 vs 37 (3%) |
| 12, Twin Keystones or Enrichment | 29 vs 25 (13%)  | 27 vs 24 (11%) | 17 vs 15 (9%) |

**What each rung is worth in time.** Measured by switching each rung off in
turn, over the part of the career that follows it. With 8 seeds, anything
within about 2% is noise.

- **Measurable:**
  - Enrichment, 9 to 13% at 13%. It was 17 to 20% at 15%.
  - Heirloom, about 7%.
  - Prodigy, 4 to 8%.
  - Capacitor, 2 to 6%.
  - Cornerstone, 1 to 6%.
  - Warm Start, 1 to 2%.
- **Within the noise:** Sixth Slot, Reroll, Patience, Lucky Find, Familiar,
  Hot Start, Rich Find, Perfect Pitch and Twin Keystones.

**Why the perk rungs barely move the time.** Later runs last 8 to 11 minutes
and see one to three drops:

- A sixth socket rarely fills.
- In 48 runs past the capstone with Cornerstone and Twin Keystones, the
  player held both of their keystones only twice.
- The simulated player checks the shop every 10 seconds and never misses an
  offer it wants, so Patience is worth more to a real player than it measures
  here.

Two changes were tried, and neither helps:

- Keystones at 20% or 35% of drops with Twin Keystones gain 0 to 5%.
- Drops twice as often by 12 isotopes make careers 2 to 4% faster, and Twin
  Keystones still gains about nothing.

A career's pace comes from the isotope bonus and a few rungs. The perk rungs
change what a run feels like more than how long it takes, so step 3 has to
make them felt.

**Decided 2026-10-27.** As first built, two targets missed. The maintainer
approved both proposals:

1. **The capstone. Enrichment at 13% an isotope instead of 15%.** At 15%
   Enrichment ended 17 to 20% ahead of Twin Keystones.
   - The fork now ends 9 to 13% apart. At 12% it would be 6 to 9%; at 14% it
     missed at 13 to 16%.
   - Enrichment's lead still grows slowly past 15 isotopes, since it scales
     with every isotope held.
   - Twin Keystones still rarely comes into play, so the fork stays a
     steady bonus against a build option.
   - The alternative was to replace Twin Keystones with a capstone that pays
     in time, a bigger design change.
2. **The 8-minute floor, held on nearly every run.** No run under 7 minutes,
   and at most one in 100 under 8. Holding every run missed by a little.
   - The misses are lucky runs, with rare drops landing early, which the drop
     feel promises.
   - Holding every run over 8 minutes would mean slowing late runs for
     everyone.

#### 8.3.8 Step 3: calls the maintainer signed off, 2026-10-27

Made while building the track's UI (§4.7, §4.13 and §5 have it in full), and
approved with it.

1. **The ring's tooltip leads with what the reset unlocks**, before where the
   next isotope comes, since it is the hook. The beads' tooltip ends with the
   next unlock.
2. **The track sits under the Reset button** in its tab, so what a reset does
   stays first. Every rung held gets a card, so with all twelve the list runs
   long, about two screens on a phone. Cards became rows in the 2026-10-28
   redesign (§8.4).
3. **A new fork has nothing chosen**, and the reset waits for a pick with an
   amber hint (Caution Amber, the soft warning DESIGN.md allows). Forks picked
   before come chosen, and every one reached shows at each reset, as approved.
4. **Heirloom and Cornerstone come with the best perk chosen**, the rarest
   then the highest level, as the career simulation keeps it, with "Keep
   none" last.
5. **The unlock card** stays 5 seconds, a second longer than the surge card,
   since it has more to read. A fork reached shows as its pick.
6. **The reroll is a pill under the offer row**, in the perk's hue, since a
   button can't sit inside the row's own button. It hides once used. No
   toast, since the row itself changes.
7. **Prodigy's offers no longer read as upgrades.** Step 1 let a level II
   drop of a perk not held show "Upgrade", a struck-out level I and "Upgrade
   drop". A perk not held now shows its level badge alone, and its rarity.
8. **The announcer joins messages from one moment.** A first reset used to
   have its announcement replaced by Fresh Start's; now both are read.
9. **The reset dialog names the head start**, which closes the gap of it
   saying energy goes to zero.

**Not built: making the perk rungs felt.** Step 2 found Sixth Slot, Lucky
Find, Familiar, Patience and the rest worth about nothing in time (§8.3.7).
Step 3 shows them on the track and the unlock card, and Reroll, Sixth Slot,
Twin Keystones and Prodigy now show where they act. Others still act
silently: Familiar's lower price, Lucky and Rich Find's odds, Patience's
longer window, Capacitor's longer surge, Perfect Pitch's wider window. A small
credit on the moment each acts, such as "Familiar: 25% off" on an offer, would
make them felt. The maintainer asked for it on 2026-10-27: §8.3.9.

#### 8.3.9 Credits where a rung acts: calls signed off, 2026-10-27

Built at the maintainer's request after step 3. Each quiet rung is now named
at the moment it acts, in the isotopes' blue (§4.3, §4.4, §4.8, §4.13):

| Rung              | Where it is credited                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Prodigy           | The offer: "Prodigy: level II for the level I price"                                                       |
| Lucky / Rich Find | The offer, "Lucky Find: a rare, not a common"; the drop's toast and announcement, ", thanks to Lucky Find" |
| Patience          | The offer, once it outlives its usual window: "Patience: still on offer"                                   |
| Familiar          | The offer: "Familiar: 25% off"                                                                             |
| Capacitor         | The surge card: "Capacitor +1 s: 8 presses, 441 energy"                                                    |
| Perfect Pitch     | A bead on the scope for each press it catches, and its name off the core at most every 30 s                |
| Night Lab         | The away dialog: "60% speed with Night Lab", and past 4 hours, that it kept them running                   |

Calls, approved with it:

1. **A find rung is credited only for drops it truly raised**: the same roll
   at the usual odds would have been a tier lower. Most rares under Lucky
   Find would have been rares anyway, so most get no credit. The mark is
   saved with the offer, and a reroll can carry one.
2. **Patience waits for its moment.** The credit shows only once the offer
   has outlived the window it would have had, not on every offer.
3. **Familiar shows on upgrades too**, since a perk held this run counts as
   held before (§8.3.6), so most upgrade offers wear it.
4. **Perfect Pitch's float is limited to once every 30 s.** A sloppy tapper
   gets several catches a minute; the scope's beads mark every one.
5. **No credit for Warm Start, Hot Start, Sixth Slot, Twin Keystones or
   Reroll.** The reset dialog names the head starts; the others show
   themselves.
6. **Two lost spaces fixed on the way**: the away dialog read "at60% speed"
   and "made31,752", and the surge card "Perk drop:Ghost Presses". Astro drops
   the space before an element on the next line; the markup now keeps it with
   `{' '}`.

### 8.4 Reset tab redesign: done 2026-10-28

The maintainer found the Reset the experiment tab cluttered and
unstructured, and asked for a design review. It found:

- The reference text came first, with the button 335 px down on desktop.
- The numbers sat in sentences: the bonus twice, "+0% now", "1,000,000"
  beside "1.00M".
- There were no section headings, six text sizes, and 43% of the desktop
  panel was left empty.
- The track's cards led with a blue all-caps "AT 3 ISOTOPES".
- What a reset unlocks was missing beside the button.
- Small copy was in Ink Muted.

The maintainer approved every recommendation; §4.7 has the result.

1. **Action first, reference last.** Next reset, then Isotope track, then
   What a reset does, each a heading as on the Perks tab.
2. **The explanation stays visible** at the bottom, not collapsible.
3. **The track as compact rows**, the next two first, each with the socket
   and number it has on the rail. "Switch at any reset" is said once.
4. **Tiles for the numbers**, as on the Stats tab, and the reset's unlocks
   beside the button, as the ring's tooltip leads with them (§8.3.8, call 1).
5. **Smaller fixes:** one number format, no "+0% now", Ink Secondary for
   small copy, and three text sizes (12, 14 and 16 px) plus the monospace
   numbers.

Settled while building:

- **Each tile has the same three rows**, so they line up at every width. At
  1024 wide an inline value and its line wrapped in one tile and not the
  next.
- **The meter's tile takes the middle tile's space** until a reset opens, so
  the first tile keeps its width.
- **The panel is a container** (`reset-panel`), so the tiles, rows and lists
  follow its own width, beside the sidebar or on a phone.

**The tab renamed "Isotopes"**, approved later the same day. The review
said the name would keep the phone's tab row on one line. Measured, it
doesn't: the four tabs need 368 px on a 390-wide phone, which has 324, so
Isotopes still wraps onto a second row. The button, the dialog and the
page's section keep "Reset the experiment" as the action's name.

**The panel tabs two by two on a phone**, chosen by the maintainer from three
options: this, tighter padding (one row at 390 wide but not at 360), or also
renaming Achievements to Badges. Under 440px of panels the tabs form a 2x2
grid at equal widths; the four need about 370px, and the margin covers wider
system fonts. Only the panel tabs change; the shop's two keep their row.

### 8.5 Launch review: planning, 2026-11-09

**Status.** Decided: the Stabiliser, the run-down and the tripling payout
(§8.5.2). The run-down's details and a four-step build plan were approved
(§8.5.3, §8.5.4). Step 1, the logic and the save, is built and signed off
(§8.5.6). Step 2, the simulation and tuning, is done: the maintainer
approved its proposals and every check passes (§8.5.7). Step 3, the run-down
in play, is built (§8.5.8). Step 4, the page copy, is deferred to a full
copy audit just before the merge (§8.5.9). Finding 5 was discussed on
2026-11-10 (§8.5.10): ideas 1 and 2, the share bar and the auto-tappers'
line, are built, and their calls await review (§8.5.11). Idea 3,
Synchronisation's shop figure, is built too (§8.5.12). Idea 4, surge presses
paying from the auto-tappers, is decided and built (§8.5.13). Finding 6 was
discussed the same day; its ideas 1 and 2, isotopes quickening the drop
clock and an early first drop every run, are decided and built (§8.5.14).
Finding 7 was measured again and parked (§8.5.15). For finding 8, five
endgame achievements and two records are built (§8.5.16). Every finding has
now been discussed. A UI polish pass began the same day (§8.5.17): the reset
dialog, the perk shelf filling from the right, the isotope badge, the
Isotopes tab, the Perks tab, and the dial's lights in the stage's color.

#### 8.5.1 The review

After a playtest that went well, the maintainer asked for a review of the
mechanics and progression before launch. It ran the simulation past where the
tests stop, with purchase and income logging, and one browser check. Its
findings, most serious first:

1. **Waiting always pays more.** A run's income grows faster than time, and
   the squares payout rewards holding the run, so isotopes per minute keep
   rising until 400 to 625M in a first run. Resetting at 1M is the slowest
   path, 12 isotopes in 180 minutes. One first run held to 144M gets all 12 in
   one reset, at 86 minutes. The ring never slows: each isotope comes in 5 to
   8 minutes, and faster in later runs.
2. **Time away could skip the track.** A night away with Night Lab took a
   reset from 3 isotopes to 13. Night Shift III's 24 hours was worth about 34.
3. **The unlock card overflows** when many rungs land at once. With all
   twelve it is 727 px tall on a 602 px face at 1440 wide, and 835 px on 542
   at 390 wide. It runs under the reset toast and over the core's labels.
4. **The Stabiliser takes the stakes out of the rhythm.** A pause costs 10
   points once, however long it lasts, so a combo of 1,000 survives about 90
   breaks. An idle player keeps Harmonic and Synchronisation's x2 while the
   tab is open.
5. **Presses and surges fade mid-run.** In a first run, press income stays at
   about 285/s from minute 11 to 26 while auto-tappers go from 144/s to
   6,660/s. Nothing shows that the rhythm still doubles auto-tappers through
   Synchronisation.
6. **Runs after an early reset are short for perks:** about 11 minutes, 2.6
   drops and 3 perks held at the reset.
7. **Every run opens the same way.** About 40% of an early-reset run is the 0
   to 100K opening.
8. **Nothing to chase after the capstone.** Players who reset by 9M never see
   Critical or Supercritical.

#### 8.5.2 Decisions, 2026-11-09

1. **The Stabiliser.** A break drops the combo to the start of the tier below
   (Harmonic to 50, Resonance to 25, Locked in to 10, Steady to 0) instead of
   by 10. Simulated minutes to 1M without perks:

   | Player | Now  | One tier |
   | ------ | ---- | -------- |
   | Steady | 24.6 | 26.2     |
   | Sloppy | 26.5 | 30.5     |
   | Masher | 38.4 | 38.7     |
   | Idler  | 43.2 | 46.3     |

   Added the same day: **a pause past 10 seconds ends the combo**, even with
   the Stabiliser. Shorter pauses, such as a visit to the shop, drop one
   tier. Without this, a pause breaks the combo once and an idle player keeps
   the tier below for as long as the tab stays open. Ten seconds is also when
   Idle Hands takes over.

2. **Away progress becomes a run-down.** It replaces the half-speed away pay,
   the away dialog and its Collect button.
   - The clock is the time since the player last tended the reactor, with a
     press or a purchase. It runs the same whether the tab is in view, hidden
     or closed, so a closed tab earns on the same curve, worked out on return.
   - Untended, the reactor gives full output for 30 minutes, then falls in a
     straight line to nothing over 90, then faults at 2 hours. Any absence
     pays at most 75 minutes of output.
   - Energy earned untended goes straight into the totals.
   - A reactor that has partly run down recovers on the next press. A faulted
     one needs a restart: 10 presses on a beat. Nothing earns until then.
   - The run-down only slows earning. Energy, auto-tappers, perks and offers
     are never touched.
   - Night Lab and Night Shift stay, with new jobs on the run-down.

   The numbers were chosen for feel: someone who checks in every hour never
   sees a fault, and a long meeting does. The simulation found the size
   barely moves pacing. Players in 45-minute evenings finish the track in the
   same number of evenings with a 75-minute cap, a 30-minute one or none.
   Hourly check-ins at work take 9 sittings to 12 isotopes with it and 17
   without.

3. **The tripling payout.** Each isotope takes three times the run energy of
   the last: 1M pays 1, 3M pays 2, 9M pays 3, 27M pays 4. It replaces
   squares. The candidates, from the simulation with the steady player buying
   perks, median of 5 seeds:

   | Payout                | Best reset   | 12 isotopes | At 1M   | Ring in a first run, minutes between isotopes |
   | --------------------- | ------------ | ----------- | ------- | --------------------------------------------- |
   | Squares (1M, 4M, 9M)  | hold to 144M | 86 min      | 180 min | 7.7, 5.8, 6.5, 5.3, 4.6: never slows          |
   | Doubling (1M, 2M, 4M) | 4M to 32M    | 78–96 min   | 180 min | 3.5, 4.2, 4.7, 7.7, 8.2, 11.9, 19.5           |
   | Tripling (1M, 3M, 9M) | 9M to 27M    | 105–107 min | 180 min | 5.8, 7.7, 12.9, 19.1, 42.8                    |

   Why tripling:
   - The ring slows after the third isotope, so it shows when to reset
     without a nudge.
   - The track keeps its approved length, 105 minutes at the best reset, as
     a reset at 9M takes today. Doubling cut it by about a fifth.
   - A reset at 9M pays 3 each time, so each reset reaches one fork, the
     first at about 35 minutes.
   - Critical, at 10M, falls inside the best range. Supercritical stays a
     stretch.
   - A full run-down on top of a run at 27M with 6 isotopes adds 1 isotope,
     against 2 with doubling and 6 with squares.

   The cost: isotopes come more slowly after the capstone, the career targets
   need rerunning, and the page copy changes. A reset at 1M takes 180 minutes
   on every payout; that is the cost of starting runs over (finding 7).

#### 8.5.3 Details, approved 2026-11-09

1. **Night Lab** (rung 4): full output holds 60 minutes instead of 30. An
   absence pays up to 105 minutes of output, with a fault at 2.5 hours.
2. **Night Shift** (rare perk): the fall takes 3, 4.5 or 6 hours instead of
   1.5, by level. An absence pays up to 120, 165 or 210 minutes, with faults
   at 3.5, 5 and 6.5 hours. Night Lab and Night Shift add up.
3. **Idle Hands** counts toward untended output, so a tab in view, hidden or
   closed earns the same.
4. **The restart** counts presses on the beat, by the run's rhythm rules, so
   Metronome and Perfect Pitch widen it. The first two presses set the beat.
   A press off the beat, or a pause past 0.8 s, starts the count over.
   Restart presses earn nothing and don't build the combo.
5. **The look, with no new color.**
   - As output falls, the core dims and loses its color in step, building on
     the away dialog's asleep look. The label under the core reads "Running
     down, 64%" in place of the stage name.
   - A fault is a grey, still core with the dial stopped, and the label
     "Fault: 10 presses on a beat to restart", counting down.
   - Ten marks around the core light in the reactor's color, one for each
     press on the beat. A stumble clears them. The tenth plays the
     stage-change ring and a chord, and the color comes back.
   - No sound at the fault itself. Reduced motion shows each state without
     the transitions.
6. **Coming back.** No dialog. What came in rolls into the readout, and a
   toast and the announcer say it: "Untended 1 h 40 min: +3.2M energy." Time
   away still never runs a perk offer down. The 60-second rule goes, since
   the first 30 minutes pay in full.
7. **The unlock card** (finding 3) lists up to four rungs, then "+N more in
   the Isotopes tab". Tripling makes big landings rare, but a run held long
   enough can still land six or more.

#### 8.5.4 Build plan, approved 2026-11-09

Four steps, each ending with every check passing and a check-in, as in
phases 1 and 2.

1. **Logic and save, pure, no UI.** _Built 2026-11-09; calls in §8.5.6._
   - Tripling in `prestigeGain`, `nextIsotopeAt` and `isotopeProgress`,
     counted in whole steps so 3M is exactly 2 isotopes.
   - The Stabiliser's tier drop and the 10-second pause in `combo.ts`, and
     its shop line.
   - The run-down in the config, with pure functions for the output share at
     an untended time, the energy over a stretch of it, and the fault.
   - A restart tracker, `tendedAt` in the save, and Night Lab and Night Shift
     in `mods.ts`. The half-speed away rules go.
   - Unit tests for each.
2. **Simulation and tuning.** _Done 2026-11-09, §8.5.7._ The simulation plays the new Stabiliser, the
   tripling payout, and sittings with absences. The pacing and career tests
   rerun, with new bands proposed. The calls to make:
   - The Stabiliser slows a steady first run by about 1.6 minutes, 24.6 to
     26.2, against the 24-minute target.
   - The capstone fork's balance moves with fewer isotopes.
3. **In play.** _Built 2026-11-09; calls in §8.5.8._
   - The frame loop runs the run-down, and a return from a hidden or closed
     tab credits it. The away dialog goes.
   - The running-down and fault looks, the restart, toasts, announcements and
     reduced motion.
   - The ring, its tooltips and the Isotopes tab read the new thresholds.
   - The unlock card's cap.
   - Browser checks on a fake clock: a return to a run-down and to a fault,
     the restart and a stumble, the Stabiliser, and a big landing on a phone.
4. **Content and docs.** _Deferred 2026-11-09: the maintainer will run a
   full copy audit and refresh just before the merge, and this goes into it
   (§8.5.9)._ The page copy: the idle-game line, the away paragraphs, the
   FAQ and the reset section's examples. This doc's §4. Checks at 1440 and
   390 wide.

#### 8.5.5 Not yet discussed

None: finding 5 is §8.5.10, 6 §8.5.14, 7 §8.5.15 and 8 §8.5.16.

#### 8.5.6 Step 1: calls signed off, 2026-11-09

Built: tripling in the economy, the Stabiliser's tier drop and the 10-second
pause in `combo.ts`, `RestartTracker`, `rundown.ts`, `mods.rundown` with Night
Lab and Night Shift on it, and `tendedAt` in the save. The tripling payout
and the Stabiliser act in the game now. The rest has no UI until step 3.

1. **The legacy away code stays until step 3.** The plan had it go in step
   1, but the script still calls it, and without it time away would earn
   nothing between steps. It is marked legacy in the config, the economy and
   the modifiers. One side effect: Night Shift's legacy cap reads its new
   values, so until step 3 it pays full speed for 3, 4.5 or 6 hours instead
   of 8, 12 or 24.
2. **Night Lab's and Night Shift's descriptions already describe the
   run-down**, as their config text feeds the track and the perk tables:
   "Left alone, the reactor holds full output for an hour instead of 30
   minutes" and "Left alone, the reactor takes 3 h / 4.5 h / 6 h to run down
   instead of 1.5 h".
3. **The Stabiliser drops through the run's own tiers**, so with Overtone a
   combo of 250 drops to 100. The tracker reads the tiers from the run's
   modifiers: one line each in the script and the simulation, no UI.
4. **A long pause with the Stabiliser breaks twice**, one tier at 0.8 s and
   the rest at 10 s. The script's break handler only resets a cached
   multiplier, so nothing shows twice.
5. **The restart** counts from the press that starts it. An off-beat press,
   or one after a pause, starts a new count at 1 rather than 0, since it can
   be the first press of a new beat.
6. **Saves from before the run-down** read `tendedAt` as their last visit,
   so a returning player's first run-down starts at full output.
7. **A reset tends the reactor**, which also clears a fault.
8. **Three tests fail, all bands for step 2.** The Stabiliser change acts in
   the simulation now:
   - A masher's perfect Brute Force run, 25.3 minutes, now beats a steady
     tapper without perks, 26.2. Brute Force ignores the combo, so the
     Stabiliser change doesn't slow it.
   - The idle build's perfect run is 45% faster than a plain idler, against
     a 40% band, as the plain idler slowed more.
   - One eager run reaches a million in 6.5 minutes, under the 7-minute
     floor: 11 isotopes with Prodigy, holding Glass Rhythm II, Full Sync,
     Momentum II and Critical Load II. Glass Rhythm switches the Stabiliser
     off, so the change can't touch that run itself; it differs because the
     run before it played out differently and Heirloom carried Full Sync
     across.
9. **Browser checks updated for tripling:** the ring's next isotope at
   3.00M, the Isotopes tab's 400K to go and its meter at 0.8, and a seed
   under 3M for the ring's count-up. All 60 pass.
10. **The page copy is stale on dev** where it explains the payout: the reset
    section still gives the square root and its examples. Step 4 rewrites
    it, with the away paragraphs.

#### 8.5.7 Step 2: the simulation, and proposals, 2026-11-09

**Decided 2026-11-09.** The maintainer approved proposals 1 to 3: the
Stabiliser at 5,000, the idle build's band widened to 45% (Autopilot
untouched), and the sittings band. All three are in, and every check passes.
The results below were measured before; the tests' own reports give saver's
12 isotopes at 108 minutes against the 111 quoted here, from the way each
takes a median.

**What the simulation plays now.**

- The career habits reset on the tripling thresholds: eager at 1M, patient
  at 3M, saver at 9M, and a fourth, late, at 27M for four isotopes, the top
  of the best range. `career.test.ts` plays all four.
- `simulateSittings` plays a career in sittings with the run-down between
  them: Evenings, 45 minutes then a night away, and At work, 5 minutes an
  hour. It can play the same career with nothing for time away, to compare.

**With the step 1 rules and no tuning:**

- First run to a million without perks: steady 26.2 minutes, sloppy 30.5,
  masher 38.7, idler 49.4, bot 23.4 (were 24.6, 26.5, 38.4, 43.2 and 22.7).
  The idler slows most: its 40-second rests now end its combo.
- Careers to 12 isotopes, median: eager 187 minutes, patient 124, saver 111,
  late 119. The forks end 0 to 13% apart.
- The three bands in §8.5.6, call 8, fail.

**Proposals:**

1. **The Stabiliser at 5,000 instead of 20,000.** Its effect is smaller now,
   so is its price, and a steady player buys it at about 4 minutes instead of 11. It fixes two of the three bands and the pace:

   | Measure                                  | Step 1             | Stabiliser at 5,000 |
   | ---------------------------------------- | ------------------ | ------------------- |
   | Steady first run, no perks               | 26.2               | 24.7                |
   | Sloppy, masher, idler                    | 30.5, 38.7, 49.4   | 29.4, 37.8, 48.8    |
   | Steady, buying perks                     | 23.7               | 21.9                |
   | Masher's perfect run (must beat steady)  | 25.3               | 25.6                |
   | Fastest million before the capstone      | 6.5                | 7.8                 |
   | Forks apart                              | 0–13%              | 0–14%               |
   | 12 isotopes: eager, patient, saver, late | 187, 124, 111, 119 | 182, 122, 111, 118  |

   Tried and dropped: a cheaper Finger Strength (60), Spring Keys (20,000),
   or every press upgrade (10% or 15% off). Each speeds the masher's Brute
   Force run as much as the steady player, so it still wins.

2. **The idle build**, 44% faster than a plain idler against a 40% band, is
   untouched by price changes. Two ways:
   - **Widen the idle build's band to 45%.** Recommended. The build is no
     stronger: its perfect run takes 27.3 minutes, as before. The plain idler
     is slower because it lost the combo it used to keep through its rests,
     the fix finding 4 asked for. Trimming Autopilot would slow idle players
     twice, and the maintainer wants idle play supported.
   - **Trim Autopilot** from x1.7, x1.95 and x2.2 to x1.6, x1.85 and x2.1.
     The build lands at 39%.
3. **A new band for sittings:** a reset straight after an absence pays at
   most 2 isotopes beyond the habit's own. Measured, at most 2. With
   proposal 1, the sittings to 12 isotopes:

   | Schedule                | Eager              | Saver      | Late       |
   | ----------------------- | ------------------ | ---------- | ---------- |
   | Evenings, with run-down | 4                  | 3          | 3          |
   | Evenings, without       | 5                  | 3          | 3          |
   | At work, with run-down  | 20 (1.7 h of play) | 12 (0.9 h) | 12 (0.9 h) |
   | At work, without        | 40                 | 23         | 26         |

   Evening players gain at most an evening; players who check in at work
   need about half as many check-ins, as intended.

4. **The capstone fork stays as it is.** Twin Keystones and Enrichment end 8
   to 14% apart, inside the 15% band.
5. **The page's claims, for step 4,** with proposal 1: 4 to 7 drops in a
   steady first run; buying perks, a million in about 22 minutes against 25;
   without perks, the first isotope at about 25 minutes and the second about
   10 minutes later; all twelve rungs after 110 to 180 minutes of play,
   depending on how often you reset. The FAQ's "20 to 25 minutes" still
   holds.

#### 8.5.8 Step 3: calls, 2026-11-09

Built: the run-down in play, as §4.8 describes, and the legacy away code
removed: `OFFLINE`, `offlineAward`, `mods.offline`, the away dialog and its
Collect, and their tests. The unlock card's cap. 7 new browser checks, and
the three away checks rewritten.

1. **A sleeping laptop is paid.** A page that stalls in view for more than
   3 s, such as a laptop asleep with the game open, is credited as time away
   on its next frame. Before, the frame loop capped each frame at a second,
   so that time was lost while the run-down's clock kept running.
2. **A bug fixed on the way.** Every save set `lastSeen` to now, and the
   5-second save timer keeps running in a background tab, about once a
   minute. So a hidden tab's time away was mostly lost before this step, a
   save at a time. Now only counting energy moves `lastSeen`.
3. **The dial clears for the restart.** On a fault the arc and the stage
   lights fade out, and the ten marks take the arc's circle in a layer of
   their own, so the grey never reaches them. The lights sat on the marks
   otherwise.
4. **No new color.** The run-down and the fault are grey and the stage
   color; the hint, the label and the face's accessible name carry the
   fault. DESIGN.md's Reactor-Ramp Exception now says so, and names the
   restart's marks and Night Lab's toast.
5. **Readouts while down.** The per-second rate shows what the reactor makes
   now, run down or 0; the per-press shows 0 on a fault.
6. **The press that brings a run-down reactor back earns as usual**, and
   floats "Full power" off the rim. A purchase brings it back too, without
   the float's press.
7. **The restart** is silent press by press, and announced on a stumble and
   on the restart. Restart presses draw on the scope, count no combo, and
   don't add to the press total.
8. **Coming back** toasts the untended time, not just the time away, as the
   run-down measures it. An absence with no auto-tappers says nothing. The
   announcement adds the reactor's state and any offer still waiting, as the
   away dialog did.
9. **The unlock card** lists up to four rungs; a reset that lands more names
   three and adds "+N more in the Isotopes tab", and stays a second longer
   for each line past two. While a card is over the core, the core's area
   comes forward, so a tall card covers the labels rather than sitting under
   them. Measured with all twelve: 250 px on a 602 px face at 1440 wide, and
   286 on 542 at 390.
10. **Sound:** the away collect chord is gone; the restart has its own, a
    rising run lower than a stage change's.
11. **The page copy** still describes half-speed away progress. Step 4
    rewrites it, with the payout.

#### 8.5.9 For the copy audit before the merge

Decided 2026-11-09: no copy changes until a full audit and refresh just
before the merge. What the launch review left stale in
`src/content/tools/spacebar-clicker.mdx`, as of step 3 (line numbers will
drift):

- **Time away.** "Offline progress at half speed" in the FAQ (frontmatter and
  visible, about lines 16 and 534); "even while you are away" (108); "earn at
  half speed while you are away, for up to four hours" (443); "away progress"
  as a rung's effect in the track FAQ (22, 564). The run-down, the fault and
  the restart aren't described anywhere.
- **"An idle game"** (14, 62, 521): still true of progress carrying over,
  though time away now runs down. Worth a look with the title, "Free Online
  Idle Spacebar Game".
- **The payout.** "Isotopes gained equal the square root of your run's
  energy" and its examples, "a hundred million gives 10" (356 to 358): now 1M
  pays 1, 3M pays 2, 9M pays 3, 27M pays 4.
- **Simulation claims** (§6), with the numbers since surges paid from the
  auto-tappers (§8.5.13):
  - "Four to eight drops" on a first run (249): now 3 to 7.
  - "About three minutes sooner" with perks (455): about 21 minutes
    against 24, so still about three.
  - The first isotope "at about 24 minutes and the second about 12 minutes
    later" (364): still about 24, and the second about 9 later.
  - All twelve rungs "after 100 to 180 minutes": now 100 to 170.
  - The FAQ's "20 to 25 minutes" to a first reset still holds.
- **Surges** (§8.5.13): wherever the page describes them as x10 presses
  for five seconds, they now also pay half a second of auto-tapper output a
  press, more with Storm Front.
- **Drops** (§8.5.14): the perks section's "You can't time a drop" paragraph
  could add that every run's first drop comes early and that isotopes bring
  drops sooner, without numbers for the ceiling.
- **The Stabiliser** reads from the config ("drops one tier") in the shop
  table, but any prose about it is worth a check.
- **The share bar and the auto-tappers' line** (§8.5.10) aren't described
  on the page. Their words in the game are worth the audit too: "You",
  "auto-tappers" and "auto" on the bar and the combo meter, "Energy from
  you" in the Stats panel, and Synchronisation's "+291 per second at
  Resonance" in the shop.
- **The reset dialog** (§8.5.17): its new words are the mockup's, approved
  for layout, not as final copy: "All gains", "isotope, to 13", "from
  +156%", the Wiped, Kept and Head start lines, "It starts the next run in its
  slot, at level I.", "Keep none", "Your picks" and "Switch at any reset". At
  1440 the Wiped line leaves "run's perks" on a second line, and on a phone
  the head start leaves "III" alone on its third.
- **The isotope badge** (§8.5.17): "First isotope", "600K to go", "13
  isotopes", "next in 400K", "Reset for +1"; its tooltip's "Isotopes", "Each
  adds 10% to all gains", "Resetting the experiment pays them, and they last
  through every reset. The first comes at 1.00M energy: 600K to go." and "A
  reset opens at 1.00M energy: 580K to go."; and its name, "No isotopes yet."
  The page still describes beads: "beads in the reactor's top-left corner: point
  at them or tap them" (about line 135 of the MDX) and "isotope beads and the
  Isotopes tab" (about 365).
- **The Isotopes tab** (§8.5.17): "The next reset unlocks Lucky Find.",
  "isotopes, to 6", "from +40%", "each adds 10%", "Next" on the track's
  cards, and Wiped and Kept as one line each ("Energy, upgrades and
  auto-tappers, the reactor's state, and this run's perks and offers"). Its
  explanation still says 10% an isotope where Enrichment makes it 13%.
- **The Perks tab** (§8.5.17): "Point at a perk to read it. The codex keeps
  every perk you find, through every reset; only the top-bar reset clears
  it.", "Held this run, level 3", "Undiscovered", "Not found yet. It drops
  into the shop's Auto-tappers tab.", "Rare" and "Keystone" on this run's
  cards, and each row's count ("9 of 12").
- **The design review** (§8.5.18): the "Achievements" heading over its
  count, a badge's count, "4,821 of 10,000", and the swap dialog's labels,
  "On offer", "Drop one" and "Swapped out".
- **The isotope rebuild** (§8.5.19): every word listed in its first call
  for review. The earlier dialog and tab entries above are superseded where
  the words are gone ("isotope, to 13", "from +156%", "All gains", "Next" on
  the track's cards).
- **This doc's §6**, once the page changes.
- **The audit became the page's rebuild on 2026-11-11 (§8.5.20), and the
  page's part of it is done:** every item above about the MDX is dealt
  with there. Still waiting for a read of their own: the in-game words
  listed here (the dialogs, the badge, the tabs, the share bar).

#### 8.5.10 Finding 5: presses and surges fade, 2026-11-10

Measured again on the current rules (tripling, the run-down, the new
Stabiliser), with a scratch copy of the simulation that also counts the
auto-tapper output the combo adds through Synchronisation.

- **Pressing doesn't fade; the credit for it does.** A steady player's
  income, and the share of it that hangs on pressing:

  | Stretch                                             | Presses and surges | The combo's lift on the auto-tappers | Auto-tappers alone | Hangs on pressing |
  | --------------------------------------------------- | ------------------ | ------------------------------------ | ------------------ | ----------------- |
  | First run, minutes 3 to 6                           | 91%                | 0%                                   | 9%                 | 91%               |
  | First run, minutes 12 to 15                         | 77%                | 0%                                   | 22%                | 77%               |
  | First run, minutes 21 to 24 (Synchronisation at 17) | 22%                | 35%                                  | 41%                | 57%               |
  | A run held to 27M, minutes 20 to 25                 | 7%                 | 41%                                  | 48%                | 48%               |

  Medians, so the rows don't sum exactly. The per-second readout showed the
  lift as the auto-tappers' own, and nothing in play named Synchronisation,
  so a rhythm player saw their presses as about 15% of their income.

- **The per-press readout stalls:** 57 from minute 9 to the reset of a first
  run, with no press upgrade worth buying in between (Spring Keys' next level
  costs 150K), while per second grows fifteenfold.
- **Surges do shrink.** A surge multiplies presses only. It pays about 60 s of
  income in a run's first 12 minutes, 17 s by the end of a first run, and 7 to
  11 s from minute 24 of a long run.
- Mashers never buy Synchronisation, since their combo averages 5, and idlers
  press less. Their smaller share is honest.

Ideas put to the maintainer: (1) a bar under the readouts for where the
energy comes from; (2) the combo meter showing the auto-tappers' multiplier;
(3) Synchronisation's shop row showing what it would add now; (4) surge
presses also paying a share of a second's income, so a surge stays worth
about half a minute of output, leaving Surge Lines its own job. The stalled
per-press number left alone: with the bar it matters less.

**Decided:** 1 and 2 first, built (§8.5.11). Then 3, built (§8.5.12). Then 4,
simulated, decided and built (§8.5.13).

#### 8.5.11 Ideas 1 and 2: calls for review, 2026-11-10

Built: the share bar (§4.2) and the auto-tappers' line (§4.3), with
`tapperSplit` and `syncMultiplier` in the economy and `ShareMeter` in
`income.ts`. 7 unit tests and 6 browser checks.

1. **What counts as the player's:** presses and surges, the combo's lift on
   the auto-tappers through Synchronisation or Full Sync, and a surge's
   through Surge Lines: what stops when they do. Feedback Loop is paid by a
   press, so it is theirs. Idle Hands rewards not pressing, so it is the
   machines'.
2. **The bar's timing.** Both sums fade over 4 s and the share shown is eased
   over 0.8 s, so it holds within a point press by press. Stopped with
   Synchronisation at Harmonic, it falls from 51% to 44% over nine seconds
   while the Stabiliser keeps Resonance, then to 17% by 16 s once the combo
   ends.
3. **The words.** "You 52%", the bar, "48% auto-tappers", and "auto-tappers
   x1.75" under the multiplier. "Auto-tappers" rather than "machines",
   because Synchronisation's own description says it; both shorten to "auto"
   on a narrow face. The copy audit can revisit them (§8.5.9).
4. **When it shows:** from the run's first auto-tapper, not from
   Synchronisation. Before it, the bar honestly falls as the machines grow,
   and the purchase lifts it: 16% to 47% in a check. A page load starts it at
   "You 0%" until the first presses. It is hidden on a fault and dims with the
   run-down.
5. **Color.** The player's part is the stage color, so gold in a surge; the
   machines' part is the track's grey. No glow. DESIGN.md's Reactor-Ramp and
   Surge Gold now name it.
6. **The auto-tappers' line opens with the purchase**, moving the hint and
   the keycap down 15px, and closes with a reset. Reserving its space from the
   start would leave a gap under the multiplier for most of a first run. On a
   page load it is simply there.
7. **The fold.** The face is 572px before Synchronisation and 587 after,
   against 588 before. The one-line hint on a wide face pays for the bar; the
   face's gap, 12px to 10, and the energy number's leading, 1 to 0.9, pay for
   the line. A browser check holds it.
8. **Found on the way, not changed.** With the isotope shelf showing, the
   narrow-face rule steps the readout down 14px at 1440 as well, because the
   face's content box is 514px, under the rule's 520. So a player with
   isotopes has a face 601px tall, 602 before this change: past the fold.
   Worth a decision.
9. **Multipliers to two places** where they need them: x1.25, x1.75, and
   Glass Rhythm's x3.75, which read x3.8 before.
10. **Stats** lists the share as "Energy from you", for anyone not looking at
    the face, whose contents sit inside the reactor's button.

#### 8.5.12 Idea 3: calls for review, 2026-11-10

Built: Synchronisation's shop figure (§4.5), `syncGain` in the economy, 1
unit test and 2 browser checks.

1. **Which combo it prices.** The player's own tier, so the number climbs as
   the combo does: in a check, +97, +194, +291 and +389 per second from Steady
   to Harmonic. With no tier it shows Steady's, not Harmonic's, so a broken
   combo never makes the number jump up.
2. **The words:** "+291 per second at Resonance", on one line in the row's
   text column, which "Up to" would have wrapped. In the detail's muted grey,
   the number in the row's own ink. The copy audit can revisit it (§8.5.9).
3. **It shows from the start of a run**, priced and climbing long before
   Synchronisation is affordable, since saving for it is the point. It goes
   once bought, and the row reads Owned as before.
4. **Room.** It adds a line to the last row of Upgrades. At 1440 the list
   still fits with a perk offer showing; an offer with a note and a credit
   would make it scroll, as it already scrolls on a phone.
5. **It prices the reactor at full power**, run down or not: it is what the
   upgrade does, not what the reactor makes this minute.

#### 8.5.13 Idea 4: the simulation, 2026-11-10

Each surge press also pays a share of a second's auto-tapper output. Played
on a scratch copy of the simulation against every pacing and career band.
"Surge" is a surge's payout in seconds of the income just before it, for a
steady player who buys perks, in a first run held to 27M.

|                            | Now        | 0.5 s      | 0.75 s                     | 1 s       | 0.5 s, scaled |
| -------------------------- | ---------- | ---------- | -------------------------- | --------- | ------------- |
| Surge, first 12 minutes    | 56 to 64 s | 62 to 67   | 63 to 68                   | 61 to 69  | 62 to 67      |
| Surge, minutes 18 to 24    | 11 s       | 29         | 34                         | 45        | 29            |
| Surge, minute 24 on        | 6 to 8 s   | 29 to 34   | 32 to 43                   | 48 to 72  | 32 to 40      |
| Steady first run, no perks | 24.7 min   | 23.7       | 23.2                       | 23.0      | 23.7          |
| Idler first run            | 48.8 min   | 45.2       | 43.4                       | 42.1      | 45.2          |
| All 12 rungs, by habit     | 111 to 182 | 105 to 175 | 99 to 173                  | 98 to 169 | 103 to 175    |
| Storm Front held, I / III  | 16% / 26%  | 15% / 24%  | 14% / 24%                  | 13% / 24% | 16% / 32%     |
| Surge Lines held, I / III  | 7% / 20%   | 7% / 20%   | 5% / 20%                   | 4% / 19%  | 7% / 20%      |
| Bands                      | pass       | pass       | fork 12 16% apart (15 max) | pass      | pass          |

"Scaled" multiplies the share by the surge's multiplier over 10, so Storm
Front's x20 to x32 lifts it too. The masher stays 1.5x the steady tapper's
time in every variant, and an absence never pays more than 2 extra isotopes.

- Early surges barely change, since presses carry them anyway; the share
  matters once the auto-tappers do.
- 1 s overshoots: by minute 40, a surge outpays the early ones. 0.75 s breaks
  the fork band by a point.
- Unscaled, Storm Front quietly weakens late in a run, its x25 reaching only
  the presses. Scaled, its level III goes from 26% to 32%, under the 45% cap.
- The idler gains most (48.8 to 45.2 minutes), since their income is mostly
  auto-tappers.

**Proposed:** 0.5 s, scaled: half a second of auto-tapper output a surge
press at x10, and in proportion under Storm Front. The income is the
auto-tappers' at that moment, with the combo's lift but not Surge Lines'
boost, so the two don't multiply; a Double Tap doubles it; Feedback Loop
stacks; and the pace meter that prices perks leaves it out, as it leaves out
the surge's own boost. First runs come about a minute sooner, and the track
3% to 8% sooner.

**Decided 2026-11-10: 0.5 s, scaled.** Built the same day: `SURGE.paysS` in
the config, `surgePay` in the economy and in every press, and the income
meter leaving it out, in the game and the simulation alike. The repo's own
pacing and career tests give the scaled 0.5 s column above to the tenth of a
minute, and every band passes. 1 unit test.

Calls for review:

1. **No new UI.** A surge's presses, their floats and the results card's
   energy simply pay more late in a run, and the share bar's "You" side
   climbs during a surge. There is no line crediting the auto-tappers, which
   would read as Surge Lines.
2. **No browser check of its own.** The surge check asserts presses and rate,
   not energy, and the rule is pure, so the unit test covers it.
3. **The doc's figures** (§4.12, §8.3.3) are re-measured. The page's are for
   the copy audit (§8.5.9).

#### 8.5.14 Finding 6: short runs for perks, 2026-11-10

Measured again on the current rules, for a steady player who buys perks, run
after run over 8 seeds. Drops come on a clock of active play, so they come at
about the same rate per minute in every run, one every 4 minutes or so. What
falls is drops per run, as isotopes shorten the runs. A player who resets at
every 1M:

| Isotopes held | Run      | Drops | Perks held at the reset | A perk at level II+ | A keystone |
| ------------- | -------- | ----- | ----------------------- | ------------------- | ---------- |
| None          | 20.7 min | 5.1   | 3.8 of 5                | 75% of runs         | 25%        |
| 4 to 6        | 14.6 min | 3.5   | 3.2 of 6                | 17%                 | 4%         |
| 10 to 12      | 10.2 min | 2.7   | 3.3 of 6                | 13%                 | 4%         |

So the perk system's depth, and the track's perk rungs, Sixth Slot to Twin
Keystones, mostly miss the players who reset most. Players who wait for 9M or
27M have 18 to 35 minute runs, 4 to 8 drops, and about 5 of 6 slots filled.

Ideas put to the maintainer: (1) isotopes speed up the drop clock, the same
random gaps, shorter; (2) each run's first drop comes early, at a random
moment in its first 1 to 3 minutes, as a first-ever run's does; (3) surges
drop more often as isotopes stack; (4) a draft at the reset, a perk to start
the next run with. Not proposed: perks surviving a reset a level down, which
would undo "perks last the run" and empty Heirloom and Cornerstone. The
maintainer's brief: drops stay regular but never predictable, and not so
rare that the game goes stale. **Picked to simulate: 1 and 2.**

Simulated on a scratch copy of the drop clock against every career band (a
first run is unchanged by both, so the pacing bands can't move). Idea 1
divides the gap between drops, and its 10-minute ceiling, by (1 + b x
isotopes). The figures are for the player who resets at every 1M, runs with
4 to 12 isotopes held:

| Variant        | Drops a run | Perks held at the reset | A perk at level II+ | All 12 rungs, by habit | Bands                     |
| -------------- | ----------- | ----------------------- | ------------------- | ---------------------- | ------------------------- |
| Now            | 2.7 to 3.5  | 2.9 to 3.3 of 6         | 13% to 17%          | 101 to 174 min         | pass                      |
| 2 alone        | 2.5 to 4.3  | 3.0 to 3.7              | 13% to 25%          | 99 to 173              | pass                      |
| 1, b 0.05      | 3.3 to 4.4  | 3.7 to 3.8              | 21% to 29%          | 101 to 171             | a fork 16% apart (15 max) |
| 1, b 0.05, + 2 | 4.1 to 4.7  | 3.9 to 4.5              | 29% to 38%          | 99 to 168              | pass                      |
| 1, b 0.1       | 4.5 to 5.3  | 4.0 to 5.0              | 17% to 38%          | 97 to 168              | a 6.8-minute run (7 min)  |
| 1, b 0.1, + 2  | 4.7 to 5.3  | 4.1 to 4.7              | 33% to 42%          | 99 to 166              | 6 runs in 576 under 8 (5) |

- Idea 2 alone does little at high isotopes: one early drop in place of one
  later. With idea 1 it fills the opening of every run.
- Players who wait longer get denser drops too: at 27M, 9 to 10 drops a run
  and full slots in most runs, from 6 to 8, and their twelve rungs 11 minutes
  sooner.
- Drops come more often as isotopes stack: one every 2.5 minutes or so at 10
  to 12 isotopes, against every 4 in a first run. Still on random gaps.
- The fork and floor bands sit near their edges with 8 seeds, so one failing
  by a point is partly noise; b 0.1 fails the floor in two of two runs.

**Proposed:** idea 1 at b 0.05, so 12 isotopes bring the average gap from 6
minutes to under 4 and the ceiling from 10 to about 6, with idea 2: every
run after a reset has its first drop at a random moment 1 to 3 minutes into
active play, on the usual odds rather than commons only.

**Decided 2026-11-10: idea 1 at b 0.05, with idea 2.** Built the same day:
`PERK_DROPS.perIsotope` and `firstDropS` (renamed from `firstEverS`) in
the config, and the drop clock in `perks.ts`. A first run is untouched, so
the pacing report is the same to the tenth. The repo's career test matches
the simulated variant and every band passes: the worst fork 11% apart, the
fastest million before the capstone 7.9 minutes, one run in 192 under 8. 2
unit tests.

Calls for review:

1. **Every run's first drop comes early.** This brings back part of what was
   removed on 2026-10-23, the step 2 model's guaranteed first drop on every
   run (§8.1.2), in a random form: a random moment 1 to 3 minutes in, on the
   usual odds. A drop due while both tabs hold offers would still be lost,
   but at a run's start they are empty.
2. **Applied by rule, not by reset count:** any run whose drop clock hasn't
   started gets the early drop. That is every new run, and a save from before
   perks.
3. **No new UI**, and nothing on the page yet: drops come sooner as isotopes
   stack, and the copy audit can say so (§8.5.9). The 10-minute ceiling stays
   off the page (§6).

#### 8.5.15 Finding 7: every run opens the same way, parked 2026-11-10

Measured again after finding 6, for a steady player who buys perks. The
opening is the climb to 100K.

| Resetting at 1M         | Run      | Opening | Share | First drop | Runs buying a perk in it |
| ----------------------- | -------- | ------- | ----- | ---------- | ------------------------ |
| 1 to 3 isotopes, before | 17.6 min | 6.7 min | 39%   | 3.7 min    | 63%                      |
| 1 to 3 isotopes, now    | 16.7 min | 6.9 min | 40%   | 2.1 min    | 96%                      |
| 8 to 12, before         | 10.7 min | 4.5 min | 42%   | 3.7 min    | 63%                      |
| 8 to 12, now            | 10.6 min | 4.6 min | 42%   | 1.9 min    | 100%                     |

The early first drop (§8.5.14) puts a perk decision into nearly every
opening, about two perks bought before 100K rather than one, so no two
openings play quite alike. The opening's share of a run hasn't moved, since
isotopes shorten it and the rest alike: about 40% resetting at 1M, a third at
3M, a quarter at 9M. The climb itself, the stages and the first purchases, is
the same every run; Warm Start and Hot Start trim its first minutes. A real
fix would be a bigger head start that grows with isotopes, and it would press
on the 8-minute floor (fastest million before the capstone: 7.9 minutes).

**Decided 2026-11-10: parked.** Good enough for launch. Revisit after a
playtest of the new drop rules, if openings still feel samey.

#### 8.5.16 Finding 8: nothing to chase after the capstone, 2026-11-10

Measured on the current rules. The twelfth rung comes after 99 to 168
minutes of play. Past it, an isotope adds 10% to gains and unlocks nothing.
From there a run reaches Critical (10M) in about 16 minutes and
Supercritical (100M) in about 31, and holding pays: about 0.18 isotopes a
minute for runs held to 10M to 81M, against 0.10 resetting at 1M. Players who
reset by 9M never see the hot stages, and only Critical had a badge.

Options put to the maintainer: leave it, as few players reach the capstone in
a launch week; cosmetic endgame goals; or, after launch, a real post-capstone
layer.

**Decided 2026-11-10: the cosmetic goals.** Built the same day: five
achievements and two records (§4.9). No balance change. 5 unit tests and 2
browser checks.

Calls for review:

1. **The names** are the proposal's: Supercritical, Full Track, Big Bang,
   Collector and Quick Study. In-game words, so the copy audit can rename
   them; the page doesn't list achievements.
2. **The fastest million runs on the wall clock**, time away included, so a
   run left overnight is slow rather than fast, and leaving can't game it.
   Quick Study's 10 minutes is a late-career time: about 8 to 10 minutes for
   a steady player with 12 isotopes.
3. **Told only when beaten.** A first million is recorded without a word,
   since a first run's million already has its own notices; beating a record
   gets a toast and the announcer. Best run has no notice.
4. **Stats grew to 13 tiles**, the four bests now together in one row. That
   leaves Time played alone on the last row of four (and of two on a phone).
   Folding Experiments reset into the Isotopes tile ("12, +120%, 9 resets")
   would bring it to an even 12.
5. **A save from before records** can't set the fastest million in the run it
   loads into: that run has no start time. The next run is timed.

#### 8.5.17 UI polish pass, 2026-11-10

**1. The reset dialog.**

The maintainer started a UI polish pass with the reset dialog, which grew
too tall late in a career. Measured with every fork and Heirloom's six
perks: 1,268px at 1440x900, where 852px fit, and 1,616px on a 390x844 phone.
It opened scrolled to the bottom, as focus went to Keep going, so the title
and the numbers were out of view. Every fork picked before came back as two
full cards on each reset, and Heirloom's list repeated one sentence on seven
cards.

Ideas went to the maintainer, then a mockup on the late-career save, injected
into the page. **Approved 2026-11-10, with one change: past picks get a
tooltip on hover.** Built the same day (§4.7, §5.4):

1. The numbers as two tiles, and what a reset does in three short lines,
   in place of a 53-word sentence.
2. Forks picked before as two-way switches, names only, with a tooltip on
   hover or keyboard focus. A new fork keeps its cards.
3. Heirloom's and Cornerstone's perks as chips with their glyphs, the rule
   said once, "Keep none" beside the heading.
4. In decision order: unlocks, a new fork, the perk to keep, then the past
   picks, quieter.
5. The buttons pinned under a scrolling body; on a phone both on one row.
   The dialog opens at the top.

Late in a career it is now 824px at 1440x900, with no scroll, and on a phone
about 34px of scroll. No new colors: picks keep the isotopes' blue, chips
their perks' family hues. 1 browser check, 79 in all, and three updated.

Calls for review:

1. **No tooltip on touch.** A tap on a switch makes the pick, so it can't
   also open a tooltip. Touch players read rungs in the Isotopes tab.
2. **"Keep none" holds** when a fork is switched. Before, any fork change
   put the best perk back.
3. **A mouse resting where the reset button was** shows a tooltip as the
   dialog opens if a switch lands under it, as any hover would.
4. **The words** are on the copy-audit list (§8.5.9).

**2. The perk shelf fills from the right**, asked for by the maintainer the
same day: the first perk takes the corner socket, and later ones fill
leftward, mirroring the beads, which fill rightward from the top-left corner.
The row is reversed in CSS only (`flex-direction: row-reverse`), so the
script, the save's order, the screen reader's order and Tab are unchanged:
Tab now moves right to left across the chips, from the corner. Sixth Slot's
socket opens on the far left. A shelf check asserts the order.

**3. The isotope badge.** The maintainer's problem: a new player who doesn't
know what an isotope is gets no sense of how far off the next one is.
Measured: the shelf was hidden for a whole first run, about 21 minutes, then
showed a bare "+1" ring with no word for it; later runs showed beads with no
progress until 1M; past ten, beads read "+3". Simulated, a linear bar to 1M
would sit at 13% halfway through a first run and 41% at 16 of 21 minutes; a
cube-root scale reads 51% and 74%, within a few points of the clock.

Three layouts went to the maintainer: a bar under the beads, a count badge
with a progress ring, and the next bead forming. **Decided 2026-11-10: the
count badge, on the cube-root scale.** Built the same day (§4.7, §5.1, §5.3,
§5.4): one button, a 30px ring around the count (a waiting bead before the
first), "13 isotopes" over "next in 400K", a "+1" tag at the ring's foot once
a reset is open, and the reset's isotopes flying into it. The Isotopes tab's
meter fills on the same scale before a reset opens. 1 unit test; isotope
checks rewritten, 78 browser checks in all (the three phone checks by bead
count became one).

Side effect: at 1440 the readout no longer steps down for the isotopes, so
the face is 572px (587 with Synchronisation) whatever is held; with beads it
was 586, and 601 in §8.5.11 item 8, which this resolves.

Calls for review:

1. **It shows from the first moment of a first run**, at 0 energy: "First
   isotope / 1.00M to go", an empty ring. The goal is there from the start;
   the cost is one more thing on a new player's first screen.
2. **Two scales.** Cube root before a reset opens; linear between isotopes
   after, where each step is 2 to 3 minutes and the run's growth is gentler.
3. **Touch has no tooltip.** A tap opens the Isotopes tab, which says it all;
   the beads used to pin a tooltip on a tap.
4. **The lines give way on narrow faces** with the perk shelf near (six
   sockets at 390, any perk at 360): the ring and its count stay.
5. **The readout steps down on every phone now**, perks or not, as the badge
   is always there: it no longer jumps when the first perk arrives.
6. **The words** go to the copy audit (§8.5.9).

**4. The Isotopes tab.** The maintainer found it "a total mess". Measured:
1,004px at 1440 with 4 isotopes and 1,164px with 13; 1,618px and 1,865px on
a 390 phone. The track was drawn twice, as a rail of sockets and as rows,
in two orders (the rail 1 to 12, the rows "Next" then "Unlocked"); the rail
was small and stranded, forks half-circles; the rows read like a table; the
tiles had uneven widths; the unlock line's bead read as a stray bullet once
the face's beads went; prose, tiles and lists had three widths; a new
player met "Isotopes held 0" before any word of what an isotope is.

Four suggestions went to the maintainer. **Approved 2026-11-10, built
without a mockup** (§4.7, §5.4): one Next reset card, its button beside the
figures; the track as cards in rows of three, in order, with the hidden
rungs as sockets; the explanation at the top and Wiped and Kept as two
lines; one width. Now 736px for a new player, 785px with 4 isotopes and
880px with 13 at 1440; 1,174px, 1,480px and 1,889px on a phone. 1 browser
check, 79 in all; three updated.

Calls for review:

1. **The explanation shows until the first reset only** (a save holding
   isotopes counts). The approved plan put it at the top "for new players";
   veterans don't need it on every visit.
2. **This revisits two calls of §8.4** (2026-10-28): the track is cards, not
   rows, and the next two no longer come first; they sit in order with a
   blue rim and "Next". The explanation stays visible, as §8.4 decided, in
   two lines.
3. **A phone late in a career is no shorter** (1,889px against 1,865): every
   rung's card keeps what it does, one to a row. Desktop is 284px shorter.
4. **Never "+0%".** With none held, the gains figure reads "each adds 10%"
   in the tab and now in the reset dialog too, as §8.4 decided for the tab.
5. **A fork's "Next" runs down its side,** turned, as the side is narrow.
6. **The words** go to the copy audit (§8.5.9).

**5. The Perks tab, 2026-11-11.** The maintainer found it "very chaotic and
overwhelming". Measured on a late save (13 isotopes, 6 of 6 perks, 22 of 25
found): 1,567px at 1440 and 3,850px on a 390 phone; 632px early on (2
held, 4 found). It grew with the collection, to 27 cards late in a career.
Each held perk showed three times in the tab: a card, a socket and a codex
card. Every card carried four accents: an uppercase "RARE · RHYTHM" in the
hue, a glowing tile, hued numbers and a hued badge. The codex's numbers ran
in slashes ("25% to 40% / 55% / 70%"). Nothing showed the board's family
order, and an undiscovered rare looked like a common.

Four suggestions went to the maintainer: each perk once; the board as the
codex, with one reading card; quieter cards; a board that explains itself.
A mockup on the late save was approved **2026-11-11** and built (§4.7,
§5.4). On the late save it is now 599px at 1440 and 1,247px on a phone with
a perk read; 482px early on, and 431px for a new player. 2 browser checks,
81 in all; one updated.

Calls for review:

1. **No glow in this tab.** Rare and keystone tiles still glow on the shelf,
   in the shop and in the dialogs.
2. **The bands give away a family.** An undiscovered perk's socket sits in
   its family's band, so "three machines perks left" can be read off the
   board. The old board was in the same order, unmarked.
3. **The dot has no legend;** the reading card says "Held this run".
4. **The codex is read one perk at a time,** by pointer, tap or keyboard;
   the 22 cards it replaces could be scanned at a glance. The fallbacks
   offered were tooltips, or the cards behind a closed "Show all".
5. **Undiscovered sockets answer too,** with their rarity and the shop tab
   they drop into, so hover and the arrow keys cover every socket.
6. **On a phone "This run" is most of the tab,** a card a row: it is what
   the tab is read for.
7. **The swap dialog keeps its cards** as they were.
8. **A perk's number never breaks from its unit** ("5 s") anywhere on the
   page now; Surge Lines' card split it.
9. **The words** go to the copy audit (§8.5.9).

**6. The dial's lights, 2026-11-11.** The maintainer asked why the lit
lights keep the colors of the stages they mark, green ones beside a blue
arc and a gold reactor, when one color would look better. There was no
functional reason: the colors were meant as the run's own ramp, a history,
while lit and unlit read by brightness and halo, and progress by the count
and the stage name. **Approved and built the same day:** every lit light
takes the dial's color, as the arc does. On a stage change they all fade to
the new color with the core while the new light pops; they turn gold with
the arc at a surge's countdown and fade back after its results; the run-down
fades them with the arc as before. Unlit ones stay grey. Two browser checks
extended, 81 in all.

#### 8.5.18 Design review, 2026-11-11

The maintainer asked for a design review of the whole interface: some of it
still felt "haphazard and all over the place". New, mid-run, late, run-down
and fault saves were staged and shot at 1440x900, 1280x720, 820 and 390 wide.
Twenty-one findings, to be worked through stage by stage, the structural
ones first:

1. The face's height follows the shop's: 572px new, 587 with
   Synchronisation, 613 with a perk on offer in the open shop tab, and back
   to 587 on the other tab. **Open.**
2. Each surface had its own card. **Done, below.**
3. Section headings followed no one pattern. **Done, below.**
4. Each panel tab has its own column grid (four, four, three, twelve), and
   the shop's tabs stretch where the panels' hug the left. **Open.**
5. The three dialogs are three designs: width, alignment, buttons, and
   "Reset All Data?" in title case. **Open.**
6. The hint never retires, and toasts cover the middle of it. **Done,
   below.**
7. The energy number and the share bar sit about 25px left of the core's
   axis. **Done, below.**
8. The keyboard focus ring around the face is the loudest thing on screen.
   **Open.**
9. Seven rows of small text under the core; the combo row stays as dead
   text in a fault. **Done, below.**
10. Floating gains collide with the dial. **Open.**
11. A perk's offer row is 2.5 times a shop row, with its notes and Reroll
    hanging off it. **Done, below.**
12. Late in a run most of the Upgrades tab is maxed rows at full height, in
    two wordings. **Open.**
13. Shop rows run from about 58 to 97px. **Open.**
14. Stats is 13 equal tiles with no groups, and one label wraps. **Open.**
15. A locked achievement's grey cross reads as failed; nothing shows
    progress. **Done, below.**
16. A new player's isotope track ends in ten small sockets on two ragged
    rows. **Done, below.**
17. A new player's Isotopes tab says "1000K to go" where the badge says
    "1.00M to go". **Done, below.**
18. The reset dialog's two section labels differ, a fifth chip is an
    orphan, and on a phone the last switch is cut by the buttons. **Done
    with the rebuild, §8.5.19.**
19. In the swap dialog the incoming perk looks like the six to drop.
    **Done, below.**
20. On a phone the keycap and hint take about 90px, and the shop is a
    scroll away from the reactor. **Open.**
21. The 588px fit is held against a 900px viewport; a 1440x900 screen shows
    about 790. **Open, the maintainer's call.**

**Findings 2 and 3, built 2026-11-11.** CSS and markup only.

- **One card.** Tokens on `.game-section`: `--card-bg` (Panel 03),
  `--card-line` (Line Subtle), `--card-radius` (Radius md) and `--card-pad`.
  Shop rows, perk cards, track cards and the codex's reading card already
  matched and now read the tokens. Stat tiles and achievements were
  borderless fills and gain the hairline; the Stats grid's column gap drops
  from 24px to 8, as every other grid's. The Next reset card stays the one
  large card, Radius lg with wider padding. Glyph tiles under 36px (the
  shelf's chips and empty sockets, this run's cards) take Radius sm, 6px,
  from a one-off 7px.
- **One heading.** `.perks-title` and `.perks-count` became `.section-title`
  and `.section-count`, and the shop's heading and the Achievements tab take
  them: "Achievements 15 of 19 unlocked", as "Codex 22 of 25 found".

Calls for review:

1. **Stats has no heading yet.** "Stats" under a tab named Stats says
   nothing; finding 14's groups will bring their own.
2. **"Achievements" repeats its tab's name**, as the count needs a title to
   sit beside. The word is one for the copy audit (§8.5.9).
3. **The Stats tiles are wider** with the smaller gap, so "Energy per
   second" no longer wraps at 1440; "Best surge, per second" still does.
4. **No new browser check.** Borders and radii aren't asserted anywhere.

**Findings 6, 7 and 9, built 2026-11-11** (§5.1, §5.3).

- **6, the hint.** Once the player has held a Steady combo in any run
  (`bestCombo` at the first tier's 10), the standing hint is retired
  (`is-retired`, `renderHint`). The run-down's and the fault's instructions
  still show. As first built the hint kept its line, for the toasts, and
  faded under one; the maintainer found the empty line awkward, the face
  cramped above it and bare below, and chose the first of three options the
  same day:
  - **A toast takes the keycap's place.** It sits at the face's foot, at
    least the key's width and its height with the lip, so the key never
    shows around it; a long one grows wider, then upward. The key is
    decoration, and the core answers every press. No line is kept for it.
  - **The hint's line closes** when it retires, over 400ms where the
    browser can ease a height to nothing (`interpolate-size`), at once
    elsewhere and under reduced motion.
  - **Its room goes above** (`is-roomy` on the face, `--room`): the line
    and its gap, 31px on a wide face and 52px on a narrow one. The face
    keeps its height: 572px and 587 at 1440. The first split spread it
    evenly, 6px of it over the number. With six perks the maintainer still
    found the top tight: the number shared a band with the badge and the
    perk shelf, its top level with the shelf's pips and "energy" under the
    last chips. Of three options (a new split, the perk shelf as a rail
    beside the dial, a badge without its lines) the maintainer chose the
    split, built the same day:
    - **A wide face** (550px of wrap and up): 60% over the readouts, 10%
      under the number, 10% under the rates, 20% over the dial, none under
      it. The number's box starts at 359px on the page at 1440, where the
      shelf's pips end at 361, so its digits clear them.
    - **A narrow face,** where the readout already sits under the shelves:
      20% over the readouts, 13% each under the number and the rates, 22%
      over the dial, 19% over the combo and 13% over the keycap.
- **7, the axis.** The energy number sits on the core's axis: "energy"
  takes no width and hangs off the number's right. The share bar is a grid
  with equal sides, each side's text against the bar: the bar is 168px on
  the axis, in a row up to 400px wide; it was about 197px and 25px left.
- **9, the fault.** The combo's row and grace bar fade out in a fault and
  come back with the restart, keeping their room. The scope stays: it draws
  the restart's beat.

Three browser checks: a toast covering the keycap, the hint retiring with
the face's height held and the core lower, kept through a reload; the
number and the bar within 1px of the core's centre; the fault's row and bar
gone with the scope showing. 83 in all.

Calls for review:

1. **A toast hides the keycap's press for its 2.6 seconds,** as agreed. If
   the keycap goes on phones (finding 20), toasts there need a new place;
   the maintainer set that aside for now.
2. **It retires on the best combo ever held,** so a full reset brings it
   back, and a reset of the experiment doesn't. A new player keeps the hint
   and the old spacing until their first Steady combo, as agreed.
3. **The face moves once, at the tenth press of a first combo,** as the
   line closes and the core settles 21px lower; and again whenever the
   run-down or a fault brings an instruction back and a press sends it away.
4. **The perk shelf as a rail beside the dial** is the structural answer
   if the top still reads as busy; it would be mocked up first.
5. **A six-character number under a sixth socket is 48px, not 56.**
   Centred, 10,000 to 99,999 would end 2px from the sixth perk socket on
   Windows and under it on a wider monospace face, as a Mac's. With six
   sockets showing on a wide face the number steps down a size
   (`is-long`) until 100K shortens it; its row keeps its height.
6. **The share row is 400px wide, the combo meter 360,** so their outer
   edges no longer line up; the bar and the number share the axis instead.
7. **On a phone the bar sits 2px left of the axis,** as "100% auto" is
   wider than "You 0%" and there isn't room for equal sides.
8. **"energy" now runs under the perk shelf's last sockets** at 1440, as it
   did before by less; it is below their pips.

**Finding 11, built 2026-11-11** (§4.13). The maintainer set the open
structural and face findings (1, 4, 5, 8, 10) aside for now and asked for 11
alone of the shop's three. CSS and markup only; no words changed.

- **A card, not a row.** The offer no longer keeps the shop rows' column for
  numbers the whole way down. One head line: the name and level, the rarity
  as a small tag after it, the price at the end. The effect under it at the
  card's full width, so a three-line effect is two; it is never cut short.
  The glyph tile sits at the top, not the middle.
- **A foot inside the card,** under a hairline in the perk's hue: the note
  (slots full, a keystone swapped out), then the track's credits, a line
  each. `.perk-foot` wraps the two; it shows when either does or when
  Reroll needs its corner.
- **Reroll inside the card,** over the end of the foot's last line, which
  keeps room for it; it hung under the card before. It is still the
  button's sibling, as a button can't hold a button.
- The row's text and number wrappers dissolve (`display: contents`) onto the
  card's own grid, so the script and the offer's spoken name are unchanged.

Measured, card and pill together, at 1440 and 390: a plain rare 77px to 60;
an upgrade 77 to 78; a keystone that swaps one out 115 to 93; the worst case
(Chain Reaction's three lines, slots full, Familiar, Reroll) 181 to 131.
With that worst case in the open tab the face was 633px and is 587: an
offer no longer stretches it in any case measured, though finding 1's fixed
height is still unbuilt.

Calls for review:

1. **The rarity moved** from under the price to after the name, as a tag;
   an upgrade's "Upgrade" with it.
2. **An upgrade's card is 1px taller** than before: its struck-out value
   takes the effect to two lines either way.
3. **With Reroll and nothing else to say, the foot shows empty** but for the
   pill, 31px, as the pill needs a place inside the card.
4. **A note with no credits wraps beside the pill** on a narrow shop
   column; with credits the note keeps the card's width.

**Findings 15, 16 and 17, built 2026-11-11** (§4.9, §4.7).

- **15, achievements.** A badge not yet earned shows an empty ring, not a
  cross; an earned one the ring in Signal Green with a tick. A badge with a
  count shows the way to it until it is earned: a thin bar and the count,
  "4,821 of 10,000", at the card's foot so a row's bars line up, in the
  neutral ramp, as green waits for the badge. Counted: the three press
  badges, the three combos (best combo), the two surge badges (best
  presses per second, to one place), Staffed Up (Lab Assistants this run),
  Automated (kinds owned), Veteran, Full Track (isotopes) and Collector
  (perks found). First Press and Fresh Start need one of a thing, and
  Critical Mass, Supercritical, Big Bang and Quick Study are earned by a
  moment: no bar. `achievements.ts` now holds each counted badge as a need
  and a count (`COUNTS`), which earns it and feeds `achievementProgress`;
  the moments are `MOMENTS`. Hidden words say "locked" or "unlocked" after
  each name, as the mark is visual.
- **16, the hidden rungs.** The first hidden rung starts a row, so the
  sockets sit in one row under the named cards: ten for a new player, where
  six ran on after the two cards and four wrapped. Each socket's head keeps
  one height, a fork's larger gem or not. On a phone they stay six to a row, as before: five
  to a row was tried the same day and left a rung alone on a second row
  with six hidden.
- **17, "1000K".** `formatEnergy` rounds before it counts figures and picks
  a suffix: 999,999 is "1.00M", and 99.96M is "100M", not "100.0M". The
  badge's "1000K to go" on a new player's first presses went with it.

2 unit tests, 97 clicker tests in all; 2 browser checks, 85 in all.

Calls for review:

1. **"4,821 of 10,000" and the hidden "locked" and "unlocked"** are new
   words, for the copy audit (§8.5.9).
2. **Staffed Up counts this run's Lab Assistants,** so its bar empties at a
   reset, as the badge's rule reads.
3. **The surge badges count the best surge ever,** "7.4 of 8", and "0.0"
   never shows: before a first surge it reads "0 of 8".
4. **Earned badges show no count,** only the tick.
5. **A new player's first row of the track is half empty,** two named
   cards, with the sockets' row under it at ten twelfths of the width.

**Finding 19, built 2026-11-11** (§4.13). The maintainer kept 18 for a
prompt of its own, as the reset dialog has a bigger problem.

- **Two groups under labels.** "On offer" over the perk on offer; "Drop
  one" over the perks it could replace, or "Swapped out" over the one
  keystone when there is nothing to pick. The explanation sits under the
  title, over both, not between them.
- **The offer looks like its shop card:** its hue on the rim and a faint
  tint, its price over its rarity at the end. The perks to drop stay
  neutral.
- **A perk to drop says its rarity,** "Rare" or "Keystone" in the muted ink
  at the end of its name's line; a common says nothing, as on this run's
  cards (`perk-card-end`, built in `swapCard`).
- **The list scrolls inside the dialog** when it is taller than the screen,
  with the title, the offer and the button in place. With six perks on a
  390x844 phone the dialog was 831px before the labels and would have been
  894 with them; it is 812.

Three assertions added to the swap checks, and the phone check holds the
dialog inside the screen's height.

Calls for review:

1. **"On offer", "Drop one" and "Swapped out"** are new words, for the copy
   audit (§8.5.9).
2. **On a phone with six perks the sixth is a scroll away;** the fifth card
   is cut at the list's edge, which is the only sign of it.
3. **The dialog's text is still centred over left-set cards;** that is
   finding 5, set aside.

#### 8.5.19 Isotopes, presented again, 2026-11-11

Finding 18 became a wider question. The maintainer: "the entire way we
currently present isotopes is awkward and poorly designed. The dialog itself
is ugly and messy, also not very intuitive. And the panel is not much
better", and wanted both to show their value as a player progresses.

**What was wrong.** The dialog did five jobs at one weight: confirm, report
the gain, list what is wiped and kept, ask for a perk to keep, and show
every past pick again. The past picks took the most room and changed least.
The pay was two small tiles in ledger words ("isotopes, to 15", "from
+169%"), and what a reset unlocks, the reward, was a line. The panel's card
was a row of figures with the button to one side, and the track a wall of
up to twelve like cards: a table, with nothing saying where the player is.

**The proposal, approved 2026-11-11** after mockups on three staged saves (a
first reset, a mid-career reset with a new fork, a late one with Heirloom)
at 1440 and 390 wide. The maintainer took all three recommendations: the
track as a rail with one reading card; the past picks collapsed in the
dialog, not moved to the panel, which would have been a rule and save
change; and the value said in facts, the named unlock and the gains before
and after, as time estimates and nudges to wait were declined on 2026-10-26.
On the three questions asked of the mockup: the direction is right; a click
on a rung holds its card, with hover as a preview, as on the codex; and the
dialog's buttons sit bottom right.

**Built the same day** (§4.7, §5.4):

- **The panel's card**, in two halves: what the player holds, a medal with
  the count and what it adds; and the reset, tinted, with what it pays, the
  gains before and after, what it unlocks and the button, or before one
  opens what the next will unlock. The way to the next isotope under either.
- **The track as a rail** of twelve gems on a line lit as far as the player
  has got, forks as diamonds, the next two named, and one reading card under
  it (`renderTrack`, `renderTrackRead`, `fillTrackRead`, `wireRailNode`).
- **The dialog**: the pay first and large over the gains before and after;
  "You unlock" as cards; only the choices this reset needs; the past picks
  on one line behind "Change"; the head start and Wiped as quiet lines, with
  Kept behind "What's kept?" after a first reset; buttons bottom right.
  The picks' radios stay in the dialog while collapsed, so the reset's logic
  (`dialogPicks`, `renderKeep`) is unchanged.
- Finding 18's three points went with it: one label style, chips that wrap,
  and the switches no longer under the buttons unless opened.

Measured, old to new:

| Save                  | Panel, 1440 | Panel, 390   | Dialog, 1440 | Dialog, 390 |
| --------------------- | ----------- | ------------ | ------------ | ----------- |
| First reset           | 643 to 627  | 1,088 to 871 | 519          | 521         |
| Mid-career, new fork  | 692 to 569  | 1,335 to 777 | 686          | 754         |
| Late career, Heirloom | 787 to 572  | 1,744 to 861 | 824 to 659   | 730         |

The mockup's panels were about 90px shorter than the build: the build keeps
the meter, the two Wiped and Kept lines and a taller reading card.

Ten browser checks rewritten for the new markup, among them the track's
(the rail, the card by hover, click and keyboard), the late dialog's (the
picks' line, then their switches) and the phone's (the rail in one row).
85 in all.

Calls for review:

1. **The words are the mockup's,** approved for layout, not as final copy,
   and go to the copy audit (§8.5.9): "A reset now pays", "Next reset", "No
   isotopes yet", "Each adds 10% to all gains", "A fork: a choice of two",
   "Your pick", "Unlocked", "You unlock", "You can switch at any reset
   after.", "Change" and "What's kept?".
2. **The panel's heading is "Isotopes",** under a tab of the same name, as
   "Achievements" is; it was "Next reset".
3. **The track is read one rung at a time.** The twelve cards could be
   scanned; the rail shows where the player is and names the next two. The
   same trade as the codex (§8.5.17).
4. **The fork explanation moved into the reading card,** shown with a fork;
   the line over the track is gone.
5. **"What a reset does" has no visible heading** now; its two lines sit
   quiet under the track.
6. **The medal shows no progress.** The mockup's ring filled toward the next
   isotope; the build keeps the meter for that, which the tests and the
   badge's scale already share, so the two don't say the same thing twice.
7. **With the picks opened late in a career the dialog is 852px** at
   1440x900, its full height, and the body scrolls a little.
8. **On a phone the rail's gems are 22px,** a small target, a rung a
   twelfth of the width; the arrows and the card make up for it.
9. **A first reset names the head start twice,** in Warm Start's card and
   in the Head start line.
10. **The chips to keep, corrected the same day.** The rebuild let them
    wrap at their own widths to lose the orphan fifth, which left them
    ragged and short of the dialog's edge; the maintainer flagged it. They
    are two equal columns again, and "Keep none" is the last cell rather
    than a pill beside the heading: five perks make three full rows.

**The gems, restyled 2026-11-11.** The maintainer found the isotope marks
in the tab and the dialog, glossy beads with a white highlight, "off with
the rest of the ui style", and asked for them nearer the reactor: not the
reactor, but of its theme. Scope, the maintainer's: the Isotopes tab and
the reset dialog only. The badge on the face, its beads in flight, the
credit beads on an offer and the surge card, and the unlock card keep the
bead. Held rungs must stay clearly brighter than the next two. Approved
from a before-and-after mockup, with one change of mine: the mark on a
"You unlock" card as a point of light, not a ring with a dot, which read as
a picked radio over a fork's real ones.

- **A held rung is a small core:** a dark centre with a faint blue heart, a
  lit ring, a fine ring inside it (none on a phone's 22px gems), the glow
  from the ring, and the number in Blue-White on the dark. The reading
  card's gem and a fork's diamond are the same.
- **A next rung is the ring unlit,** its number in blue; a hidden one the
  dashed bezel.
- **The medal** has the reactor's dashed bezel inside its ring.
- **In the dialog,** the isotope being paid is a core with a point of light,
  and each unlocked rung's mark a point of light.

CSS only. Blue-White on Cherenkov Blue as before, so DESIGN.md's exception
holds; its wording now says cores, not beads, for these two places.

**Tooltips on the perks to keep, 2026-11-11.** The maintainer noticed the
dialog names the perks to keep without a word of what they do, and asked
for a tooltip on hover. Built on the past picks' tooltip (`showPickTip`,
`TIPPED`): over a chip it reads "Assembly Line, at level I" and the effect
at level I, as that is the level a kept perk starts at, whatever level is
held, in the perk's family hue (`is-perk`). Keyboard focus shows it too,
and each chip's radio is described by the same words. One browser check
extended.

Calls for review:

1. **It shows level I, not the level held,** since that is what is kept;
   the chip itself still shows the level held, "Assembly Line III".
2. **Touch shows none,** as with the past picks: a tap makes the choice. A
   line under the chips reading the chosen perk would cover touch, if
   wanted.
3. **"at level I" in the tooltip's name** is a new word or two, for the
   copy audit (§8.5.9).

From the 2026-10-22 delight brainstorm, never assigned to a pass. Build only if
the maintainer asks.

- A ping ring from the combo on tier-up.
- A resonance ripple across the face at Harmonic.
- On a combo break, the combo row desaturates and shakes. This shakes the row
  only, never the screen.

#### 8.5.20 The page below the game, rebuilt, 2026-11-11

The copy audit of §8.5.9 became a rebuild. The maintainer's brief: the
content under the game and the header dated from a much simpler game; the
page should show how much game there is, read less like a spec sheet, be
more visual (the tables above all), and stay optimised for "spacebar
clicker" keywords. Ideas, then mockups, then a build in three passes.

- **Decided.**
  - Every perk and every rung stays listed, though the game hides the ones
    not yet found.
  - The perk grid gets filter chips, the page's one new script.
  - The perk families' hues may be used in the page's content (DESIGN.md,
    the Perk-Family Exception, widened).
  - The title drops "Idle" (§6).
  - No "no ads" claim, and no times for a run (§6). The simulation's
    timings leave the page as their sections are rebuilt: the first isotope
    at about 24 minutes, the second about 9 later, the track in 100 to 170
    minutes, and the FAQ's "20 to 25 minutes".
  - The isotope track is laid out three rungs to a row, each row ending in
    its fork, not as the Isotopes tab's rail.
- **The outline.** H1 "Spacebar Clicker"; a jump strip; then:
  1. About this Spacebar Clicker Game (the maintainer's title)
  2. How to play Spacebar Clicker
  3. The combo: a steady beat pays up to 3x
  4. Spacebar Clicker upgrades and auto-tappers
  5. Spacebar Clicker perks: 25 random drops
  6. Reactor states
  7. When you stop pressing (new: full output, the run-down, the fault and
     the restart)
  8. Reset for isotopes, with an H3, "The isotope track: 12 rungs"
  9. Spacebar Clicker tips
  10. Spacebar Clicker FAQ, with two more questions: what happens when you
      leave, and whether the game ends
      A "first run" timeline was in the outline and waits on a call: without
      times it repeats the reactor states (see the calls below).
- **Built, pass 1, part 1.**
  - **The header.** A 2.5rem title (it was the 3.5rem display size), a
    subtitle held to 600px that names it a spacebar clicker game, and a row
    of chips counted from the config: 25 perks, 4 combo tiers, 7 reactor
    states, 12 isotope rungs, and "Free, saves in your browser". Measured
    at 1440x900: the header is 186px, as before (185px), so the face still
    ends at 888px. On a phone the chips are hidden: they would take three
    rows above the game, and the About section gives the same counts.
  - **The jump strip** under the game: one link per section, in the MDX.
  - **About this Spacebar Clicker Game** replaces "What is Spacebar
    Clicker?" (`#about`, was `#what-is`): two paragraphs and four panels,
    each a figure, a heading and two sentences. Rhythm beats mashing (x3),
    Perks change the run (25), Resets add rules (+10%), The reactor needs
    you (30 min). Every figure reads from the config. The panels carry no
    coloured top border; the maintainer turned that down at the mockup.
  - **`src/styles/clicker-page.css`**, new and global, since a page's
    scoped styles don't reach its MDX. It holds the content's blocks, and
    the Reactor-Ramp, Surge Gold and perk-family tokens, moved out of the
    page's scoped `.game-section` rule so the game and the content share
    one definition (`:where(.game-section, .sc-doc)`). A content section
    that uses them takes the class `sc-doc`.
  - "No ads" is gone from the description, the About copy and the first
    FAQ answer, in the frontmatter and on the page.
- **Built, pass 1, part 2: How to play** (`#how-to-play`). The heading is
  "How to play this Spacebar Clicker". The maintainer's rule, 2026-11-11:
  headings say "this Spacebar Clicker", since the game is a variation on
  the type and the bare name reads as generic; the rest of the outline's
  headings follow it as they are built. Six cards, three to a row (two
  under 900px, one under 480px), each a small drawing on the face's grid
  over a heading and two sentences: the keycap; the rhythm scope's trace,
  drawn with `drawScope`'s own shape (a dip, a spike and a dip per press,
  one short spike off the beat) in the reactor's green with its glow, at
  the maintainer's ask; four shop glyphs; "x10 for 5 seconds" in Surge
  Gold; a perk tile with its ring part drained; and an isotope as a small
  core. `ShopIcon` and `PerkIcon` are imported into the MDX. The old
  steps' long paragraphs, the beads line and "even while you are away" are
  gone. Prettier turns an MDX `{/* */}` comment into `{/_ _/}` and breaks
  the page, so the MDX carries no comments; the CSS explains each drawing.
- **Built, pass 2: the combo, the shop and the perks.**
  - **The combo** (`#combo`), "The combo: a steady beat pays up to 3x". A
    ladder of the five tiers, each a column as tall as its multiplier and
    greener the higher it is (on a phone, a tier a row with a bar as wide);
    two traces in the rhythm scope's shape, "On the beat" in green and "Off
    the beat" in grey with short spikes; three rule cards (25%, 0.8 s, 5
    presses); and a closing paragraph on Synchronisation, Overtone and
    Glass Rhythm. The figures read from `COMBO` and `COMBO_TIERS`.
  - **The shop** (`#shop`), "Upgrades and auto-tappers in this Spacebar
    Clicker". Two columns of rows built like the game's shop rows, with
    `ShopIcon`: name, effect, base cost, and the scaling and cap under it.
    An auto-tapper's output is in the reactor's green. The line about
    auto-tappers out-earning fingers "after fifteen or twenty minutes" is
    gone (no times).
  - **The perks** (`#perks`), "Perks in this Spacebar Clicker: 25 random
    drops". Two stacked bars for the odds of an ordinary drop and a surge
    drop, in three steps of grey so no hue is spent on rarity, over each
    rarity's line and price. Then the 25 perks as cards, grouped by family
    under a heading and one line in the family's hue, commons first: glyph
    tile, name, rarity, which shop tab it drops in, and the effect with its
    three levels' values in mono. A keystone's card is rimmed and tinted.
    "Three to seven drops" on a first run stays: a count, not a time.
  - **The filter chips** (`src/scripts/clicker-page.ts`, new): All and the
    five families, then the three rarities; one family and one rarity at a
    time, a chip pressed again lets go, and a family with nothing to show
    hides with its heading. The chips are hidden until the script runs, so
    without it every perk shows. A pair with no perk (Luck and Keystone)
    shows "No perk is both. Pick another pair."
  - **MDX and paragraphs.** In the MDX a `<p>` whose words sit on their own
    lines gets a second paragraph inside it, which a browser splits in two,
    so a class or `hidden` on the outer one is lost. Outside a `.map()`,
    prose is bare text between blank lines, and a classed block is a `<div>`
    whose inner paragraph the CSS styles (`.sc-lede p`, `.sc-fine p`).
  - **Checks.** "the page lists every perk and the drop odds" now reads the
    bars and the cards, and runs the filter by mouse and by Space on a chip,
    with no press landing on the reactor.
- **Built, pass 3, part 1: the isotopes** (`#prestige`), "Reset for
  isotopes", to the mockup approved with the perks. A strip of what a
  reset pays, 1M, 3M, 9M and 27M for 1 to 4, read from `isotopeThreshold`,
  each isotope a small core. The track as four rows of three, each row
  ending in its fork: a rung is a gem with its number, its name and what
  it does; a fork is a diamond, tinted, with "Pick one, and switch at any
  reset" over its two options. The square-root payout, the simulation's
  minutes for the first two isotopes and for the whole track, and the
  beads are gone. One line says what a reset keeps: isotopes,
  achievements, records and the codex. The check "the page lists the
  isotope track" reads the new rungs, rows and payout strip.
- **Answered, 2026-11-11.** The first-run timeline is dropped (call 3
  below); the reactor states' strip is to name what opens at each
  threshold. Rule durations stay (call 2): "30 min" of full output, a
  surge's five seconds. Only times for a run are out.
- **Calls for review.**
  1. **The combo chip says 4 tiers**, not the mockup's 5: Steady, Locked
     in, Resonance and Harmonic. The fifth was "no tier yet".
  2. **"30 min" in the fourth panel** is a rule (full output for 30 minutes
     after the last press), not a time for a run, so it stayed.
  3. **The first-run timeline.** With no times it is a list of energy
     thresholds, which the reactor states already are. Suggested: drop it,
     and let the reactor states' strip name what opens at each threshold.
  4. **The chips on a phone** are hidden, as above.
  5. **The jump strip** doesn't follow the scroll or mark the current
     section; it is a plain row of links.

#### 8.5.21 The page audit, 2026-11-12

The maintainer found the rebuilt page better but "a bit overdesigned and
chaotic in areas", and asked for a design audit of the content below the
game, feedback only, keeping it optimised for "spacebar clicker". Shot at
1440x900 and 390 wide, beside the spacebar speed test and the CPS test.

- **The diagnosis.** Three habits run through the page: each section
  invents its own block (about 17 designs in ten sections, against about
  four on a sibling page); colour, glow and monospace used as decoration
  as well as meaning; and the same facts told three or four times (the
  combo's x3 eight times). The page was 11,255px at 1440 and 21,689px at
  390, the perks 2,218 and 4,836 of it.
- **Kept as they are:** the run-down chart, the shop rows, the combo's
  traces and ladder, the header chips and the jump strip. The grid-panel
  diagrams are the page's signature; the rest should be plainer.
- **The findings.**
  1. About and How to play say the same thing back to back. **Done,
     below.**
  2. The perks overexplain: four paragraphs and the odds before the list,
     and 25 cards each with "Drops in …" and an uppercase rarity. **Done,
     below.**
  3. Four hues in the first block under the game, before any is
     explained; How to play adds four more. **Left as it is** (maintainer,
     2026-11-12).
  4. About seven glows at rest (the trace, the gold x10, isotope cores,
     rung gems, the reactor dials, the run-down line, the payout dots),
     against DESIGN.md's Glow-Is-A-Signal Rule. Suggested: keep the
     trace's, which the maintainer asked for. **Done, below.**
  5. Words set in mono ("energy in a run", "x1.2 per purchase", "0 to 9
     combo", the chart's labels), against the Monospace-Numerals Rule.
     **Done, below.**
  6. Uppercase labels and per-card repeats: "PICK ONE, AND SWITCH AT ANY
     RESET" on each fork, "x1.2 per purchase" on each auto-tapper,
     "energy in a run" on each payout. **Done, below.**
  7. 17 font sizes in `clicker-page.css`, six between 11 and 14px.
     **Done, below.**
  8. Nearly everything sits in a card; the combo stacks three card styles.
     **The tips section cut; nothing else** (maintainer, 2026-11-12, below).
  - Section notes, all **open**: How to play's drawings at six scales; the
    ladder's gradients; the reactor states two to a row on a phone with
    Supercritical alone (1,258px); the run-down chart about 75px tall on a
    phone with labels too small to read; empty lower halves on the track's
    rungs at 1440.
  - SEO, **open**: the content holds 11 H2s, 40 H3s and 37 H4s, nearly
    every card title a heading; suggested, card titles as bold text. Five
    H2s in a row say "this Spacebar Clicker"; the H2s without the keyword
    could take a natural variant ("prestige" is a clicker search term).
- **Decided, 2026-11-12.** Findings 1 and 2. On the perks, the
  maintainer's direction: introduce what perks are and how they fit the
  game, and drop the odds table; the content is not a thesis on the
  mechanics but should show what each system brings (now a rule in §6).
- **Built.**
  - **About**: the four panels are cut, and the two paragraphs stay.
    The second now says what sets the game apart ("a steady beat pays
    more per press than mashing does, and random perks change the rules
    of each run") in place of "Four things set this game apart". The two
    paragraphs share one `.sc-lede`, so the first keeps its margin: before,
    each was the last child of its own block and `content.css` zeroed the
    gap between them.
  - **Perks**: two short paragraphs, on what perks bring (Metronome and
    Self-Replicator as examples), what the three rarities mean, the five
    slots, the codex and the isotope track. Gone: the odds bars and the
    rarity legend, prices in seconds of income, level pricing, the swap
    rule, the surge bonus drop and "three to seven" drops a run. The list
    is rows built like the shop's, two columns at 1440 and one under
    900px: glyph tile, name, the rarity as a plain word where the shop
    has the price, and the effect with its levels in mono. A keystone's
    one mark beyond its word is a rim in its family's hue (the tint and
    filled badge are gone). Family headings lose their coloured rule and
    count; the filter chips keep the counts. "Drops in …" is gone.
  - Measured: About 519 to 330px at 1440 (1,199 to 561 at 390); perks
    2,218 to 1,698px (4,836 to 3,207); the page 11,255 to 10,546px
    (21,689 to 19,422).
  - The check "the page lists every perk" reads the rows' rarity and
    effect, and that About's two paragraphs sit apart.
- **Calls for review.**
  1. **The About keeps one line of difference** (rhythm and perks), so
     "spacebar clicker" stays in it; How to play below gives the rest.
  2. **Families of 3 and 9 end on a half row.** Two columns read as one
     list, so the empty cell reads as the list's end.
  3. **"Common" shows on every common**, in muted grey, a step below
     rare and keystone, as the game's labels do.
  4. **The levels footnote stays** ("Where a perk lists three values, they
     are levels I, II and III"), since the intro no longer covers levels.
  5. **The FAQ's perks answer is untouched**, so the odds survive there in
     words, as does the JSON-LD.
- **Decided, 2026-11-12, later.** Findings 4 to 7; finding 3 stays as it
  is.
- **Built, findings 4 to 7.** CSS and a few lines of markup; no copy
  rewritten beyond the cuts below.
  - **4, glow.** The beat trace keeps its glow, in How to play and on the
    combo's "On the beat" (one drawing). Gone: the gold x10's, the How to
    play isotope core's, the reactor dials' cores and lamps, the run-down's
    live line, the payout dots' and the rung gems'. The cores and gems keep
    their fills, so they still read as cores; the reactor dials show the
    climb in fill, lamps and heart.
  - **5, mono.** Words left mono: the surge drawing's "for 5 seconds",
    the ladder's ranges, the shop's scaling notes, the run-down's stage
    times, and the chart's words ("full output", "last press", "you
    return"). Its two times, "30 min" and "2 h", stay mono as values. The
    combo's "5 presses" is the number in mono and the word in sans. What
    stays mono is all numbers, and the keycap in How to play, drawn as the
    game's.
  - **6, labels and repeats.** The forks' "Pick one, and switch at any
    reset" is gone (the track's intro says it); a screen reader still hears
    "At 3 isotopes, pick one." "x1.2 per purchase" leaves the five
    auto-tapper rows for the column's heading, computed from the config, so
    rows get their notes back if the scales ever differ. "energy in a run"
    leaves the payout strip. The reactor cards' "+5% to all gains" is
    "+5%", the lede having said it. "On this page" in the jump strip stays
    uppercase: it is the guides' "On this page" label, the same size and
    case.
  - **7, type.** One ladder, noted at the top of `clicker-page.css`: 0.75,
    0.8125, 0.875, 0.9375 (every block's title, How to play's cards
    included, from 1rem), 1.125 (the shop's and the perk families'
    headings, from 1.0625), 1.25 (the ladder's multipliers, from 1.375)
    and 1.75; 0.6875 only for the jump strip's label. About's paragraphs
    take the body size like every other section's opening (they were
    1.0625). Eight sizes, from 17 at the audit; the run-down chart's two
    SVG sizes are in its own units.
  - Measured at 1440: the page 10,466px (19,288 at 390). Three browser
    checks gained lines: the forks' hidden line, a reactor card's "+5%",
    and the auto-tappers' heading with no row notes.
- **Calls for review, findings 4 to 7.**
  1. **The payout strip reads "1M", dots, "pays 1 isotope"**, with the
     lede above saying a run that has earned a million can reset.
  2. **About's paragraphs are body size now**, a little smaller than the
     lede they were.
  3. **The ladder's ranges keep "combo"** ("10 to 24 combo"), now in sans;
     without it a bare range under a tier's name could read as presses.
- **Finding 8, decided and built, 2026-11-12.** The maintainer cut "Tips
  for this Spacebar Clicker" as filler that repeated the page (the surge,
  the half hour and the perks were all said above it), and asked for no
  other change under finding 8: the combo's cards stay. Gone with it: the
  `TIPS` table, the jump strip's Tips link (eight links now), its two CSS
  rules, and the MDX's `Icon` and `SURGE` imports, used by nothing else.
  The FAQ drops `alt-bg`, so the sections still alternate (Reset for
  isotopes keeps it). The page is 9,824px at 1440. The jump strip's check
  counts eight links.
- **The header, 2026-11-12.** The maintainer asked for the title and
  subtitle at the other pages' sizes, and for fewer chips, each a selling
  point a newcomer can read: "25 perks", "4 combo tiers", "7 reactor
  states" and "12 isotope rungs" meant nothing before playing.
  - **Built.** The header takes the values every other tool page shares:
    padding `--space-xl` / `--space-md`, a 600px column, the display title
    (3.5rem, from 2.5) with a `--space-md` gap, a 1.125rem subtitle (from
    1rem), and 2rem and body size under 768px. Without its chips it is
    185px at 1440, as the spacebar speed test's is. The subtitle is
    unchanged and runs two lines.
  - **The chips**, four from five, a bold word and its value: Rhythm pays
    more than mashing; Perks change how each run plays; Auto-tappers earn
    while you're away; Free saves in your browser (kept as it was). They
    sit outside the 600px column, four to a row up to 940px; a container
    query sets them two and two where four don't fit (below about 1,280px
    wide), never three and one. Hidden on a phone, as before.
    `COMBO_TIERS` left the page's imports.
  - **Measured.** The header is 227px at 1440x900 (186 before), so the
    reactor face ends at 928px, 28px past a 900px fold (888 before): the
    keycap sits under it. No check guards the fold; the isotopes check
    holds the face's height, which is unchanged at 572px.
- **Calls for review, the header.**
  1. **The face now ends past the 900px fold** at 1440x900, against the
     working rule in §2. A real 1440x900 screen shows about 790px of page
     under the browser's bars (design review finding 21), so the face was
     already cut there. Ways back if wanted: chips below the game, at the
     head of the content; or no chips.
  2. **The chips repeat two of the subtitle's points**, rhythm and perks,
     in plainer words. A shorter subtitle could leave those to the chips.
  3. **Auto-tappers earn while you're away** is true up to the fault at
     two hours, with full output for the first 30 minutes; the chip names
     no time, per the house rules.
- **The copy, 2026-11-12.** The maintainer asked for a stop-slop audit of
  the whole page's copy for quality and SEO: rank for "spacebar clicker"
  without cramming it, read as written by a person, specific to this game,
  and show what it offers rather than how it is built.
  - **The audit.** About 33/50 on stop-slop's rubric, lowest on density
    and rhythm. The keyword's cramming sat in the headings (five H2s with
    "this Spacebar Clicker") and three section openings that began "This
    spacebar clicker…"; the title and meta description each said it twice.
    Beyond that: formulas and limits still on the page (the shop's price
    formula, the 75-minute cap, "Three things stretch this"), facts said up
    to five times (+10% per isotope), lists of three, things doing what the
    player does ("as a run earns"), tier names before they are explained,
    and FAQ answers pointing at sections.
  - **Decided.** Every line in the audit's draft, as written. The heading
    rule kept its identifier but on two H2s only; no "unblocked" question.
  - **Built.** Title "Spacebar Clicker Game - Play Free Online"; a meta
    description in plain words; the subtitle's "isotopes that last" became
    "bonuses that carry into later runs". H2s: "About this spacebar clicker
    game", "How to play", "Upgrades and auto-tappers", "Perks: 25 random
    drops", "Prestige: reset for isotopes", "Questions about this spacebar
    clicker"; the combo, reactor and time-away headings unchanged. Section
    openings rewritten for what each system brings; the shop's formula,
    the 75-minute cap, the Glass Rhythm and Overtone details, "Each isotope
    costs 3 times…" and "Three things stretch this" cut. Six FAQ answers
    rewritten, the pointers to sections gone (and with them three anchor
    links). "Spacebar clicker" appears 11 times in the page's text, from
    17; "+10%" three times, from five.
  - Unused values left the MDX (`glass`, `mostMin`, `nightShift`,
    `ISOTOPE_SCALE`, `TRACK_EFFECT`). The FAQ's frontmatter takes curly
    apostrophes, so it matches the page's text exactly. Two checks updated:
    the title, and the run-down stage that quoted the 75-minute cap. The
    page is 9,712px at 1440 (17,333 at 390).
- **The subtitle, 2026-11-12, later.** The maintainer wanted the gameplay's
  difference to come across at once, the reactor left out: a clicker game
  set apart by its systems. Four options, each measured in the header (two
  lines at 1440 and 820, as before); the maintainer chose: "A spacebar
  clicker game where skill and strategy both pay. Keep a steady beat to
  earn more, and build each run around the perks you catch." It overlaps
  the first two chips on purpose, the subtitle summing up and the chips
  giving the detail. Three lines on a phone, as before.
- **About, 2026-11-12, later.** The maintainer found it bland, without the
  personality of what perks allow: builds around different playstyles.
  Two drafts, then three variants of the perks paragraph with no perk
  named (the maintainer: describe the experience, not the perks). Built,
  variant 1, between the opening and the save line, now three paragraphs:
  "Perks let you shape each run around how you like to play. They drop at
  random, and you can hold five. Keep a steady beat and the right perks
  lift your combo past its usual top tier. If you'd rather mash, trade the
  combo for harder presses. Leave the game running, and your auto-tappers
  can carry the run." The opening merges its first two sentences ("Each
  press charges a lab reactor, and the energy buys…"); the old line on a
  steady beat paying more than mashing folds into the perks paragraph. The
  check counts three paragraphs.
- **The combo onwards, 2026-11-12, later.** The maintainer asked for the
  same approach, gameplay experience over mechanics, on every section from
  the combo down, with stop-slop. Feedback, then every suggestion approved
  and built, after a last stop-slop pass (five small fixes: no repeated
  "each press", no "a rung asks you", no unclear "it").
  - **Combo**: opens "Find a rhythm and hold it…"; the three rule cards
    read as play ("A press within 25% of your rhythm still counts, so
    small slips won't cost you"; "Pause for longer and the combo breaks.
    The bar under the counter drains to warn you"; "After a break, your
    first 5 presses always count, so you can find the beat again").
  - **Shop**: opens on the arc from pressing to machines ("At the start,
    every point of energy comes from your own presses…"); closes "Bigger
    machines unlock as you earn, and perks turn up in the same shop at
    random." Row notes keep the level cap only ("20 levels", "one
    purchase"); the auto-tappers' "x1.2 per purchase" is gone, and with it
    `tapperScale`.
  - **Perks**: the intro no longer repeats About (random drops, five
    slots, playstyles); it leads into the list: five families, what the
    rarities do, the codex and the track. Each family's line now says who
    it suits.
  - **Reactor states**: opens on the climb from a dim green glow to a
    blue-white core; the notes read "Now in reach: …" (were "First prices
    in reach: …").
  - **Time away**: closes "The isotope track and the right perks let you
    stay away longer," naming no perk or rung, as About doesn't.
  - **Prestige**: opens on why you reset ("…reset it for isotopes and
    start again stronger"); the track's intro on what it gives ("from a
    head start on each run to better perk drops").
  - Small counts in prose are words, through a new `word()` (§6). The
    shop check now asserts the level cap and no "per purchase". The page
    is 9,767px at 1440 (17,486 at 390).

### 8.7 Known gaps

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
- **2026-10-27.** Isotope track step 2, the career simulation. `sim.ts` plays
  run after run with resets, rerolls and kept perks; `career.test.ts` holds a
  first run unchanged and forks 3, 6 and 9 within 15%. The capstone and the
  8-minute floor miss narrowly, with proposals in §8.3.7. The rung timings in
  §8.3.3 are now measured.
- **2026-10-27.** The maintainer approved both step 2 proposals: Enrichment
  at 13% an isotope, and the 8-minute floor held on all but one run in 100,
  with none under 7. Every career target now passes.
- **2026-10-27.** Isotope track step 3, the track in play. The tooltips name
  the next unlock and what a reset unlocks; the Reset tab draws the track; the
  reset dialog takes fork picks, waits for a new fork's, and offers
  Heirloom's or Cornerstone's perk; an unlock card names new rungs; a reroll
  pill; a sixth socket; Twin Keystones in the swap dialog. Prodigy's offers no
  longer read as upgrades, and the announcer joins messages from one moment.
  `spacebar-clicker-track.e2e.ts`, 11 checks. Calls for review in §8.3.8.
- **2026-10-27.** Credits where a rung acts, asked for after step 3: an
  offer's lines for Prodigy, a raised drop, Patience and Familiar; Capacitor
  on the surge card; Perfect Pitch on the scope and off the core; Night Lab in
  the away dialog. Lucky and Rich Find mark only drops they truly raised. Two
  lost spaces fixed. 6 unit tests and 4 browser checks. Calls in §8.3.9.
- **2026-10-27.** Isotope track step 4, the content; phase 2 done. The track
  on the page: a table from the config under Reset the experiment, mentions
  in What is, How to play and the perks section, the perks FAQ answer
  updated, and a tenth FAQ on what the track unlocks. A browser check for the
  table. Checked at 1440 and 390 wide. The step 3 and credits calls (§8.3.8,
  §8.3.9) signed off.
- **2026-10-28.** Fixed the core's press pulse dying after a stage change
  until a reload. The press and stage-snap classes never came off the core,
  and the snap's outranked the press's. Taking both off once played also
  brings back the core's breathing between presses, which had stopped at a
  page's first press. 1 browser check.
- **2026-10-28.** The Reset the experiment tab redesigned after a design
  review (§8.4). Next reset comes first, as tiles with the button and what
  the reset unlocks; then the isotope track as rows, the next two first;
  then what a reset does, with Wiped and Kept side by side. Only the prose
  keeps to the 72ch cap. The browser checks follow the new markup, plus 1
  for the tab with every rung held. DESIGN.md's Reactor-Ramp Exception names
  the rows and the unlock line.
- **2026-10-28.** The Reset the experiment tab renamed "Isotopes": the tab,
  the ring's tooltip, the page copy and its FAQ, DESIGN.md, comments and
  test names. "Reset the experiment" stays the action's name. On a phone the
  tab row still wraps (§8.4). 1 more assertion, for the tab's name.
- **2026-10-28.** On a phone the panel tabs sit two by two at equal widths,
  instead of three in a row and Isotopes alone under them (§5.1, §8.4). 2
  browser checks: one row on a desktop, two even rows on a phone.
- **2026-11-09.** Launch review after the playtest (§8.5). Decided: the
  Stabiliser drops a broken combo one tier, and a pause past 10 seconds ends
  it; away progress becomes a run-down with a fault and a restart; isotopes
  pay on a tripling scale (1M, 3M, 9M). The details and a build plan await
  approval.
- **2026-11-09.** Launch review step 1, the logic and the save. Isotopes pay
  on the tripling scale, and the Stabiliser drops a broken combo one tier,
  with a pause past 10 seconds ending it; both act in the game. The
  run-down's rules (`rundown.ts`), the restart's beat (`RestartTracker`),
  `tendedAt` in the save, and Night Lab and Night Shift on the run-down, with
  no UI until step 3. 18 more unit tests; browser checks follow the new
  thresholds. The pacing and career bands fail on the Stabiliser change and
  wait for step 2. Calls in §8.5.6.
- **2026-11-09.** Launch review step 2, the simulation. Careers reset on the
  tripling thresholds, with a fourth habit at 27M, and `simulateSittings`
  plays careers in sittings with the run-down between. Proposals in §8.5.7:
  the Stabiliser at 5,000, the idle build's band, a sittings band.
- **2026-11-09.** Step 2's proposals approved and applied. The Stabiliser
  costs 5,000, and a steady first run is back at 24.7 minutes. The idle
  build's perfect run may be up to 45% faster than a plain idler. A new
  career band holds a reset after an absence to at most 2 isotopes beyond
  the habit's own, on two schedules and four habits. §4.12's tables and
  §8.3.3's rung timings re-measured. Every check passes.
- **2026-11-09.** Launch review step 3, the run-down in play (§4.8). Time
  away is paid on the run-down's clock with no dialog: a toast and the
  energy counting in, and Night Lab credited in blue. A run-down reactor
  fades and loses its color with its output and comes back on a press; a
  faulted one greys and stills, its dial giving way to ten restart marks that
  light one press on the beat at a time, and the tenth brings the color back
  with the stage-change ring and wash. A stalled page is paid as time away,
  and a save no longer moves `lastSeen`, which had lost a hidden tab's time
  away. The unlock card lists three rungs and the rest past four. The legacy
  away code and the dialog removed. 7 new browser checks, 68 in all. Calls in
  §8.5.8.
- **2026-11-10.** Launch review, finding 5 (§8.5.10): pressing still earns
  about half of a rhythm player's income through Synchronisation, but the
  screen credited it to the auto-tappers. A bar under the readouts now shows
  the player's share of the last few seconds' energy against the
  auto-tappers' own, and a line under the combo multiplier what the tier gives
  the auto-tappers. The hint takes one line on a wide face and the face's
  spacing tightens, so it still fits 1440x900. Multipliers show two decimal
  places where they need them. "Energy from you" in Stats. 7 unit tests and 6
  browser checks, 74 in all. Calls in §8.5.11.
- **2026-11-10.** Finding 5, idea 3 (§8.5.12): until it is bought,
  Synchronisation's shop row says what it would add to the auto-tappers at
  the player's combo tier, climbing with the combo. 1 unit test and 2 browser
  checks, 76 in all.
- **2026-11-10.** Finding 5, idea 4 (§8.5.13): each surge press also pays
  half a second of auto-tapper output, more under Storm Front, so a surge late
  in a run is worth about half a minute of output again rather than 6 to 8
  seconds. A steady first run comes in 23.7 minutes, from 24.7; every pacing
  and career band passes. §4.12's and §8.3.3's figures re-measured. 1 unit
  test.
- **2026-11-10.** Finding 6 (§8.5.14): isotopes quicken the drop clock, every
  gap and the ceiling shorter by 1 + 0.05 per isotope held, and every run's
  first drop comes at a random moment 1 to 3 minutes in. A player who resets
  at every 1M now sees four or five drops in a late run rather than two or
  three. A first run is unchanged; every career band passes. §8.3.3's figures
  re-measured. 2 unit tests.
- **2026-11-10.** Finding 7 measured again and parked (§8.5.15). Finding 8
  (§8.5.16): five endgame achievements, Supercritical, Full Track, Big Bang,
  Collector and Quick Study, and two records in Stats, the best run and the
  fastest million, told when beaten. 19 achievements in all. 5 unit tests and
  2 browser checks, 78 in all. The Night Lab return check records its toasts
  as they show (`recordToasts`), as a cold dev server could make it miss them.
- **2026-11-10.** UI polish, the reset dialog (§8.5.17): the numbers as
  tiles, Wiped, Kept and the head start as three lines, a kept perk as chips,
  forks picked before as switches with a tooltip on hover or focus, the
  buttons pinned, and it opens at the top. Late in a career it fits 1440x900:
  824px, from 1,268. 1 browser check, 79 in all.
- **2026-11-10.** UI polish (§8.5.17): the perk shelf fills from the right,
  the first perk in the corner socket, as the beads fill from the left.
- **2026-11-10.** UI polish (§8.5.17): the isotope beads become a badge, a
  ring around the count with "13 isotopes" and "next in 400K" beside it,
  shown from a first run's start, filling toward the next isotope on a
  cube-root scale before a reset opens, with a "+1" tag once one is. The
  tab's meter fills on the same scale. At 1440 the face is 572px whatever is
  held. 1 unit test; 78 browser checks. The perks' time-away check records
  its toasts (`recordToasts`), as the stage's toast after it could rotate it
  out under the full suite.
- **2026-11-10.** UI polish (§8.5.17): the Isotopes tab rebuilt. One Next
  reset card with the button beside its figures; the track as a card per
  rung in rows of three, in order, forks with both options side by side and
  the hidden rungs as sockets, replacing the rail and the rows; what a reset
  is at the top until the first reset; Wiped and Kept as two lines. 880px
  late in a career at 1440, from 1,164. The reset dialog says "each adds
  10%" rather than "from +0%". 1 browser check, 79 in all.
- **2026-11-11.** UI polish (§8.5.17): the Perks tab rebuilt. This run's
  cards in the isotope track's shape, without the uppercase kind line; the
  codex as its board alone, in family bands with a count per row and a dot
  for each perk held this run, read one perk at a time in a card under it
  by hover, click, tap or keyboard; no rare or keystone glow in the tab.
  599px late in a career at 1440, from 1,567; 1,247px on a phone, from
  3,850. Perk numbers no longer break from their unit. 2 browser checks, 81
  in all.
- **2026-11-11.** UI polish (§8.5.17): every lit light on the dial wears the
  dial's color, as the arc does, the stage's or a surge's gold, instead of
  the color of the stage it marks. Two browser checks extended.
- **2026-11-11.** Design review of the whole interface (§8.5.18), 21
  findings. The first two built: one card, so stat tiles and achievements
  gain the hairline the shop rows, perk cards and track cards have, on
  shared tokens, and small glyph tiles share one radius; one heading, so
  the shop and the Achievements tab take the Perks and Isotopes tabs'
  title with its count. CSS and markup only.
- **2026-11-11.** Design review, findings 6, 7 and 9 (§8.5.18). A toast
  takes the keycap's place; the hint retires once a Steady combo has been
  held, its line closes, and the face spreads the room above it.
  The energy number and the share bar sit on the core's axis. A fault's
  combo row and grace bar fade out, the scope staying for the restart's
  beat. 3 browser checks, 83 in all.
- **2026-11-11.** The retired hint's room re-split on a wide face
  (§8.5.18): most of it over the energy number, which now sits clear below
  the perk shelf's pips, and none under the dial.
- **2026-11-11.** Design review, finding 11 (§8.5.18): a perk's offer is a
  card, its name, rarity and price on one line, the effect at full width,
  and its note, credits and Reroll in a foot inside it. The worst case is
  131px, from 181, and no longer stretches the face.
- **2026-11-11.** Design review, findings 15, 16 and 17 (§8.5.18). A badge
  not yet earned shows an empty ring and, where it has a count, a bar and
  the count to it. The isotope track's hidden rungs sit in one row. The
  energy format rounds before it picks a suffix, so "1000K" reads "1.00M".
  2 unit tests and 2 browser checks, 85 in all.
- **2026-11-11.** Design review, finding 19 (§8.5.18): the swap dialog's
  two groups under labels, the perk on offer in its hue with its price, a
  rarity on the perks to drop, and a list that scrolls inside the screen.
- **2026-11-11.** Isotopes presented again (§8.5.19), after the maintainer
  found the dialog and the tab awkward. The tab: one card with what the
  player holds beside what a reset pays, and the track as a rail of twelve
  gems with one reading card. The dialog: the pay first and large over the
  gains before and after, what it unlocks as cards, the past picks on one
  line behind "Change", buttons bottom right. Late in a career the dialog
  is 659px, from 824, and the tab 572px, from 787. Ten browser checks
  rewritten; 85 in all.
- **2026-11-11.** The isotope marks in the Isotopes tab and the reset
  dialog redrawn in the reactor's manner (§8.5.19): a held rung a small
  core, a lit ring around a dark centre, in place of a glossy bead. The
  face's badge and the credit beads are unchanged.
- **2026-11-11.** The reset dialog's perks to keep have a tooltip on hover
  and keyboard focus saying what each does at level I (§8.5.19).
- **2026-11-11.** The page below the game, rebuild begun (§8.5.20): a
  shorter header with a new subtitle and chips counted from the config, a
  jump strip, and "About this Spacebar Clicker Game" with four panels in
  place of "What is Spacebar Clicker?". The title drops "Idle". "No ads" is
  gone from the page. The ramp, gold and perk-family tokens moved to
  `src/styles/clicker-page.css`, shared by the game and the content.
- **2026-11-11.** "How to play this Spacebar Clicker" rebuilt as six cards
  with drawings from the game, the beat drawn as the rhythm scope draws it
  (§8.5.20).
- **2026-11-11.** The combo, the shop and the perks rebuilt on the page
  (§8.5.20): a tier ladder and two traces; shop rows with the game's
  glyphs; odds bars and a card per perk by family, with filter chips
  (`src/scripts/clicker-page.ts`).
- **2026-11-11.** "Reset for isotopes" rebuilt on the page (§8.5.20): a
  payout strip from the game's own thresholds and the track three rungs to
  a row.
- **2026-11-11.** The page's rebuild finished (§8.5.20, §6): seven reactor
  dials, a new "When you stop pressing" section with a chart of output
  against time away, tips with the site's icons, and a 12-question FAQ. No
  time-to-finish figure is left on the page.
- **2026-11-12.** A design audit of the page (§8.5.21), then findings 1
  and 2: About's four panels cut, leaving two paragraphs with a gap
  between them at last; the perks introduced by what they bring, the odds
  bars gone, and the 25 perks as rows like the shop's. The page is 10,546px
  at 1440, from 11,255.
- **2026-11-12.** The audit's findings 4 to 7 (§8.5.21): one glow left on
  the page, the beat trace's; words out of mono; the forks' caps line, the
  auto-tappers' repeated scaling and "energy in a run" cut; eight type
  sizes, from 17.
- **2026-11-12.** The tips section cut (§8.5.21, finding 8): it repeated
  the sections above it. Eight links in the jump strip; the page is 9,824px
  at 1440.
- **2026-11-12.** The header at every tool page's sizes (§8.5.21): the
  display title and a 1.125rem subtitle. Four chips in place of five, each
  a selling point in plain words instead of a count. The face now ends at
  928px at 1440x900.
- **2026-11-12.** The page's copy audited with stop-slop and rewritten
  (§8.5.21): a new title and meta description, the keyword in two H2s
  instead of six, section openings on what each system brings, formulas and
  repeats cut, six FAQ answers tightened.
- **2026-11-12.** A new subtitle, on skill and strategy rather than the
  reactor (§8.5.21).
- **2026-11-12.** About rewritten around the builds perks allow for
  rhythm players, mashers and idle players, no perk named (§8.5.21).
- **2026-11-12.** Every section from the combo down opens on what playing
  feels like (§8.5.21): rule cards, the shop, the perks' intro and family
  lines, the reactor states, time away and prestige rewritten; price
  multipliers off the shop rows; small counts in prose as words.
