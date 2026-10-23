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
| `src/games/spacebar-clicker/config.ts` | The source of truth for every number. The tables below mirror it as of the last changelog entry; if they disagree, the config wins.                                     |
| `DESIGN.md`                            | The site's visual contract. The game has three named exceptions in it: Reactor-Ramp, Surge Gold and Shop-Signal.                                                        |
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
- **Status (2026-10-22).** Built and committed on `dev`, not yet merged to
  `main`. Unit-tested and browser-checked, but not playtested: the balance comes
  from a simulation.

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

| File                                                  | Responsibility                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/games/spacebar-clicker/config.ts`                | Every number and table: shop items, combo tiers and rules, surge, reactor states, prestige, offline, achievements. Pure data.                                            |
| `src/games/spacebar-clicker/economy.ts`               | Pure functions over the save: costs, energy per press and per second, reactor state and progress, prestige gain, offline award, buying, shop reveals, shop-tab notices.  |
| `src/games/spacebar-clicker/combo.ts`                 | `ComboTracker`: the rhythm combo. Takes timestamps from the caller, so it has no clock of its own.                                                                       |
| `src/games/spacebar-clicker/save.ts`                  | `SaveState`, the defensive `parseSave`, and `prestigeReset`.                                                                                                             |
| `src/games/spacebar-clicker/achievements.ts`          | `checkAchievements`, idempotent.                                                                                                                                         |
| `src/games/spacebar-clicker/format.ts`                | Number formatting: `formatEnergy`, `formatRate`, `formatMultiplier`, `formatDuration`.                                                                                   |
| `src/games/spacebar-clicker/spacebar-clicker.test.ts` | Unit tests for all of the above (41 as of 2026-10-22).                                                                                                                   |
| `src/scripts/spacebar-clicker.ts`                     | The browser side: DOM, input, frame loop, surge scheduler, saving, sound, every animation. Reuses only `browserAdapter`/`KEY_PREFIX` and `createBeeper` from the engine. |
| `src/pages/spacebar-clicker.astro`                    | Markup and all game CSS. The frontmatter computes the dial, bezel and mote geometry.                                                                                     |
| `src/components/games/ShopIcon.astro`                 | The ten bespoke shop glyphs and their purchase animations.                                                                                                               |
| `src/content/tools/spacebar-clicker.mdx`              | The long-form copy below the game. Its tables render from `config.ts`.                                                                                                   |
| `src/data/tools.ts`                                   | Registry entry: icon `ph:atom`, `telemetry: false`.                                                                                                                      |

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
  gold.
- `earn()` is the one place energy is credited. It moves `energy`,
  `runLifetime` and `totalLifetime` together.

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
- Surge state is not saved. `bestSurgeCps` and `surges` are.

### 4.5 Shop

Two tabs: **Upgrades** for press upgrades, **Auto-tappers** for passive
income. Cost = `round(base x scale ^ owned)`.

| Upgrade         | Effect                                      | Base cost | Scale | Max |
| --------------- | ------------------------------------------- | --------- | ----- | --- |
| Finger Strength | +1 energy per press, each level             | 15        | x1.8  | 20  |
| Double Tap      | +5% chance a press counts twice, each level | 300       | x2.5  | 10  |
| Spring Keys     | Press value x1.5, each level                | 5,000     | x6    | 5   |
| Stabiliser      | A broken combo drops by 10 instead of to 0  | 5,000     | n/a   | 1   |
| Synchronisation | Auto-tappers get half your combo multiplier | 25,000    | n/a   | 1   |

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
  auto-tapper newly revealed, or any item newly affordable at its current
  price. Opening the tab clears it. The save remembers the level each item was
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
  25M gives 5. Each isotope is +10% to all gains, permanently.
- **Wipes**: energy, `runLifetime`, upgrades, tappers and `announced`. The
  reactor returns to Dormant.
- **Keeps**: isotopes, the prestige count, reveals, achievements, lifetime
  totals and bests.
- It has its own tab and its own confirm dialog. Separately, the toolbar
  Reset, the site's shared modal, wipes everything including isotopes. Sound
  settings survive both.

### 4.8 Away progress

- Measured from the save's `lastSeen`. A hidden tab counts as away.
- A gap of 60 s or less, such as a tab switch, pays full energy per second
  silently.
- Longer, with at least one auto-tapper, pays 50% of energy per second, capped
  at 4 hours. It sits behind a "While you were away" dialog with a Collect
  button.

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
  `prestiges`, `bestCombo`, `bestSurgeCps`, `surges`, `achievements`,
  `playedS`, `lastSeen` and `createdAt`.
- **Settings**: `reflexlab:spacebar-clicker:settings`, holding the sound toggle.
- Adding a field means adding it to `SaveState`, `defaultSave`, `parseSave`
  (defensively), deciding whether `prestigeReset` keeps it, and adding tests.

### 4.11 Sound

Sound plays through the engine's beeper, at gain 0.18. Events: purchase, combo
tier up, surge warning ticks, surge start, surge end, reactor state up,
achievement, prestige and away collect.

### 4.12 Pacing

Simulated 2026-10-21 with a greedy optimal buyer:

| Milestone         | Time                                                              |
| ----------------- | ----------------------------------------------------------------- |
| First upgrade     | 3 s                                                               |
| First auto-tapper | 8 s                                                               |
| Pneumatic Key     | 1.3 min                                                           |
| Robot Arm         | 7 min                                                             |
| Quantum Keyboard  | 30 min                                                            |
| Particle Collider | 40 min                                                            |
| First prestige    | 24 min at 5 presses/s with a combo; 48 min mashing; 39 min at 3/s |

- Idle share of income is 47% at 30 minutes and 74% at 60.
- First prestige is the anchor. If play feels off, tune base costs first,
  scaling second.
- The simulator is not in the repo. `config.ts`'s header records the method.

## 5. Presentation

### 5.1 Layout

- The reactor face sits on the left and the shop on the right, pinned to the
  face's height. A tabbed panel below holds Stats, Achievements and Reset the
  experiment.
- **The reactor face**, top to bottom:
  - Energy readout, with per-second and per-press rates.
  - Isotope shelf in the top-left.
  - The core: a progress dial with six state lights, a turning dashed bezel,
    motes, the core heart, and the readout inside.
  - State name and surge label.
  - Combo row: count, tier label, next-tier target, grace bar, and the rhythm
    scope canvas.
  - The SPACE keycap and the hint line.
- **Narrow faces.** A container query on the face, `reactor / inline-size`,
  steps the energy readout down clear of the shelf. It holds on phones and on a
  laptop with the shop beside the reactor.

### 5.2 Color

- **Reactor-Ramp.** The Cherenkov ramp in §4.6. It covers the core, bezel,
  motes, dial and lights, gains, the rhythm scope and the state name. Isotope
  beads are blue-white on Cherenkov blue at every stage. Stages fade into each
  other over 0.8 s through registered custom properties (`--stage`, `--halo`,
  `--core-heart`, `--core-alpha`, `--core-glow`, `--wash-r`) and
  `color-mix()`.
- **Surge Gold.** Core `#fcd34d`, halo `#fbbf24`, ink `#fef3c7`. Used during
  overdrive and for lucky Double Tap floats.
- **Shop-Signal.** Amber, only for the "New" tag on a closed shop tab.
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
- **Reduced motion.** Color changes and lights stay; all travel, spin, flight
  and implosion goes. Totals and collected energy apply at once, and the scope
  redraws only on presses.

### 5.4 Accessibility

- The face is `role="button"` with `tabindex="0"`.
- A live region announces purchases, state changes, achievements, surges and
  both resets.
- Opening a dialog moves focus into it. Closing hands focus back to where it
  was, or to the reactor when nothing was focused, such as the away dialog on
  load. Shop buttons use `aria-disabled` so they stay focusable while
  unaffordable.
- Tabs follow the ARIA tab pattern, with arrow keys.
- The isotope shelf is `role="img"` with an aria-label such as "N isotopes, +X%
  to all gains". It ignores the pointer, so a tap on it is a press.

## 6. Content and SEO

- **Title**: "Spacebar Clicker - Free Online Idle Spacebar Game", with an
  authored description and FAQ JSON-LD.
- About 2,300 words below the game. The H2s are:
  - What is Spacebar Clicker?
  - How to play Spacebar Clicker
  - The combo: steady beats fast
  - Every upgrade and what it costs
  - Reactor states
  - Reset the experiment
  - How to reach a million energy
  - Spacebar Clicker FAQ, with 8 questions
- The tables render from `config.ts`, so changing a number changes the page.
- When a mechanic changes, update the copy that describes it.

## 7. Testing

- `npm test` runs Vitest, including the 41 clicker tests.
- `npm run check` runs `astro check`. `npm run format:check` runs Prettier.
  `npm run build` should be clean.
- **Browser checks are not in the repo.** The Playwright scripts used during
  the build lived in a session scratchpad and are gone. They covered
  load, press, buy, save and reload, away, prestige, surge phases, all seven
  stages, reduced motion, pass 3, and layout at 1440 and 390 wide. Re-create
  them, or add them to the repo, before the next big change.
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

### 8.1 Perk system: planning, nothing built

**Status (2026-10-23).** The maintainer answered the design questions
(§8.1.6). The build plan (§8.1.7) and the follow-up questions it raises
(§8.1.8) await approval. Don't build until both are approved.

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
- **Drops**
  - Drops roll as the run earns, roughly one every 2 to 3 minutes of play: 8
    to 10 offers in a first run.
  - The first drop is guaranteed early so every player meets the system.
  - A missed roll raises the next one's odds, so dry spells stay short. A
    reactor state change always rolls.
  - At most one live offer per tab.
- **Slots: 5.** _Decided._ At most 5 active perks, and one keystone at a time.
  - Buying a new perk with all 5 slots full asks which perk to drop. The
    dropped perk is gone for the run, levels and all. Cancelling keeps the
    offer open.
  - Buying a keystone while holding one swaps the two.
- **Perk levels.** _Decided:_ if an owned perk drops again, buying it upgrades
  the existing perk instead of taking a new slot.
  - Proposed: three levels, I to III. A perk at level III leaves the drop pool
    for the rest of the run.
  - Proposed: an upgrade costs 1.5 times the base price for each level already
    held, in seconds of income, and needs no free slot.
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
simulation, not final.

Upgrades tab:

| Perk           | Effect at level I / II / III                                                                                         | Rarity   | Family |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| Metronome      | Rhythm tolerance widens from 25% to 40% / 50% / 60%                                                                  | Rare     | Rhythm |
| Held Breath    | A pause can last 2 / 3 / 5 s before the combo breaks, up from 0.8 s                                                  | Common   | Rhythm |
| Overtone       | A new tier above Harmonic: 200 combo for x4 / x4.5 / x5                                                              | Rare     | Rhythm |
| Momentum       | +0.5% / 0.75% / 1% press value per point of combo, no ceiling                                                        | Rare     | Rhythm |
| Glass Rhythm   | Combo multipliers x2 / x2.5 / x3, but one off-beat press breaks the combo and the Stabiliser stops working           | Keystone | Rhythm |
| Finger Memory  | Each Finger Strength level counts x2 / x3 / x4                                                                       | Common   | Press  |
| Coiled Spring  | Spring Keys give x2 / x2.25 / x2.5 per level instead of x1.5                                                         | Rare     | Press  |
| Brute Force    | No combo at all; press value x3 / x4 / x5                                                                            | Keystone | Press  |
| Loaded Dice    | Double Tap +15% / 25% / 35%, and its cap rises from 50% to 75%                                                       | Common   | Luck   |
| Chain Reaction | A Double Tap rolls again at half / three-quarters / all of your Double Tap chance, and can keep chaining: x2, x4, x8 | Rare     | Luck   |
| Lightning Rod  | Surges come 2 / 2.5 / 3 times as often                                                                               | Rare     | Surge  |
| Afterglow      | Presses keep x3 for 10 / 15 / 20 s after a surge                                                                     | Common   | Surge  |
| Storm Front    | Surges hit x25 / x35 / x50 but come with no warning                                                                  | Keystone | Surge  |

Auto-tappers tab:

| Perk            | Effect at level I / II / III                                                                          | Rarity   | Family   |
| --------------- | ----------------------------------------------------------------------------------------------------- | -------- | -------- |
| Overtime        | Lab Assistants produce x4 / x7 / x10                                                                  | Common   | Machines |
| Assembly Line   | +1% / 1.5% / 2% output per auto-tapper owned                                                          | Common   | Machines |
| Bulk Order      | Auto-tappers cost 20% / 30% / 40% less                                                                | Common   | Machines |
| Critical Load   | +10% / 15% / 20% output per reactor state reached                                                     | Common   | Machines |
| Ghost Presses   | Auto-tappers get 1x / 1.5x / 2x your Double Tap chance as bonus output                                | Common   | Luck     |
| Full Sync       | Auto-tappers get your whole combo multiplier, then x1 / x1.25 / x1.5 of it; no Synchronisation needed | Rare     | Rhythm   |
| Surge Lines     | Surges multiply auto-tappers too, and last 5 / 7 / 9 s                                                | Rare     | Surge    |
| Idle Hands      | Auto-tappers x2.5 / x3.5 / x5 after 10 s without a press                                              | Rare     | Machines |
| Night Shift     | Away progress pays 100% instead of 50%, capped at 8 / 12 / 24 h instead of 4                          | Rare     | Machines |
| Feedback Loop   | Each press also pays 5% / 8% / 12% of your per-second income                                          | Rare     | Machines |
| Self-Replicator | A free copy of your cheapest auto-tapper every 60 / 45 / 30 s                                         | Rare     | Machines |
| Autopilot       | Presses earn half; auto-tappers x4 / x5 / x6                                                          | Keystone | Machines |

The builds these make:

| Build  | Perks                                              | How it plays                                         |
| ------ | -------------------------------------------------- | ---------------------------------------------------- |
| Rhythm | Metronome, Overtone, Momentum, Full Sync           | One long combo powers presses and auto-tappers alike |
| Surge  | Lightning Rod, Storm Front, Surge Lines, Afterglow | Play for the bursts                                  |
| Luck   | Loaded Dice, Chain Reaction, Ghost Presses         | Gold floats everywhere                               |
| Masher | Brute Force, Finger Memory, Coiled Spring          | Ignore the beat and hit hard                         |
| Idle   | Idle Hands, Night Shift, Autopilot, Bulk Order     | The reactor runs itself                              |

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
  RNG state, the drop meter and pity count, and the codex.
  - Store each offer's expiry as a `runLifetime` value. The offer is gone once
    `runLifetime` passes it.
  - Away energy must not drain offers (question 5), so Collect pushes each
    expiry forward by the amount collected. The silent full-rate credit for
    gaps of a minute or less does the same.
  - `prestigeReset` clears owned perks and offers, and keeps the codex.
  - Parse defensively and drop unknown perk ids.
- **Income at drop time** needs a rolling measure of what the player actually
  earned over the last few seconds, presses included. The script doesn't track
  this yet.
- **Glyphs.** Each perk needs a glyph in `ShopIcon.astro`, or a sibling
  component: same 24-unit grid, 1.5 stroke, `currentColor`.
- **Content.** Add a perks table to the MDX, rendered from config, with rarity
  and drop odds. Competitors publish nothing like it.
- **Balance.** Perks multiply into each other and can break the 24-minute first
  prestige. Rebuild the pacing simulation with drops, ideally in the repo this
  time, and run each build through it. Starting target: a strong build cuts
  first prestige by about a third.
- **Tests.** Cover drops and pity, pricing and windows, expiry, each perk's
  effect at every level, upgrades, the slot limit and swap, the keystone rule,
  save parsing, and prestige.

#### 8.1.5 Ideas parked for later

- Isotopes could buy a sixth slot, a reroll, or the right to keep one perk
  through a reset. Revisit after phase 1 (question 7).
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

#### 8.1.7 Build plan: phase 1, awaiting approval

Six steps. Each ends with tests passing and a check-in, so the maintainer can
review before the next one, as with the delight passes.

1. **Groundwork, no visible change.**
   - Economy functions take a modifiers object that defaults to "no perks".
   - `ComboTracker` takes its rules, and `comboTier` takes its tier list,
     instead of reading the constants.
   - The surge scheduler and multiplier read their values through modifiers.
   - A seeded random generator, as a pure module.
   - A rolling income meter in the script: energy earned over the last 10 s,
     presses included.
   - Every existing test passes unchanged, and new tests prove the defaults
     behave exactly as today.
2. **Perk logic and save, pure, no UI.**
   - The 25 perks with their three levels go in `config.ts`.
   - `perks.ts` holds the drop meter and pity, rarity weights, offer pricing
     and windows, expiry, buying, upgrading, the slot limit and swap, the
     keystone rule, and turning owned perks into modifiers.
   - The save gets its perks block, with defensive parsing, prestige clearing
     and the codex.
   - Unit tests for all of it.
3. **Pacing simulation, in the repo.**
   - A pure simulation module, with a Vitest pacing test that asserts first
     prestige stays within a band, both with no perks and for each build.
   - Tune drop rates, prices, windows and perk values until the bands hold.
   - Report the numbers before any UI work.
4. **Shop offers and perk effects in play.**
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
5. **Shelf, tooltips and the Perks panel.**
   - Up to 5 perk tiles top-right, with level pips. Tooltips on hover, focus
     and tap, and a tap never counts as a press.
   - A Perks tab beside Stats and Achievements: active perks in full, and the
     codex.
   - The away dialog mentions a waiting offer. Announcements for drops,
     purchases, upgrades and expiries.
   - A reduced-motion version of everything.
6. **Content, docs and verification.**
   - A perks section in the MDX: a table rendered from config, with rarity and
     drop odds, and an FAQ answer.
   - Update this doc's sections and changelog.
   - Browser checks at 1440 and 390 wide, then the full check suite.

#### 8.1.8 Follow-up questions: awaiting answers

Raised by the upgrade caveat in question 3.

1. Three levels per perk, I to III, with a maxed perk leaving the drop pool?
   _Recommended: yes._ **Answer: pending.**
2. An upgrade costs 1.5 times the base price for each level already held, and
   needs no free slot? _Recommended: yes._ **Answer: pending.**
3. Browser checks: keep them as throwaway scripts, or add Playwright to the
   repo as a dev dependency so they survive between sessions? The pacing
   simulation goes in the repo either way, with no new dependency.
   _Recommended: add Playwright._ **Answer: pending.**

### 8.2 Unassigned ideas

From the 2026-10-22 delight brainstorm, never assigned to a pass. Build only if
the maintainer asks.

- A ping ring from the combo on tier-up.
- A resonance ripple across the face at Harmonic.
- On a combo break, the combo row desaturates and shakes. This shakes the row
  only, never the screen.

### 8.3 Known gaps

- Browser tests are not in the repo (§7).
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
  were drafted, both awaiting approval.
