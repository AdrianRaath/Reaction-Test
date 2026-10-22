# Spacebar Reactor: Game Design

A spacebar clicker game page for ReflexLab (reflexlab.co). Target keyword: "Spacebar Clicker". This document covers concept and mechanics only. Execution, stack and visual design are left to the implementer, with the constraint that the whole thing stays lean, single-page, no backend, progress saved locally.

## 1. Core concept

Every spacebar press feeds energy into a lab reactor. Energy is the single currency. The player spends energy on upgrades that make presses worth more and on auto-tappers that generate energy passively. A rhythm-based combo multiplier rewards steady tapping over frantic mashing, which is the game's point of difference and the tie-in to the ReflexLab brand. The reactor itself visibly changes state as the player hits milestones. A single prestige loop gives a reason to keep playing after the first hour.

Design pillars:

- Instant gratification: the first press does something, the first upgrade is affordable within 15 seconds.
- Skill matters: a player who taps with good rhythm earns noticeably more than one who mashes.
- Short sessions, idle friendly: it is fine to play for 3 minutes, close the tab, and come back tomorrow.
- Shallow on purpose: roughly 10 shop items and one prestige layer. No tech tree, no second currency beyond prestige.

## 2. Input

- Spacebar is the primary input. One press = one keydown. Key repeat from holding the key is ignored.
- Clicking or tapping the reactor also counts as a press, so the game is playable on mobile and by mouse.
- Presses are capped at 30 per second. Anything above that is discarded. This stops macro abuse from breaking the economy without needing real anti-cheat.
- Spacebar must not scroll the page while the game is focused.

## 3. Energy and the press

Energy per press (EPP) is calculated as:

EPP = (base + Finger Strength bonus) x Spring Keys multiplier x combo multiplier x surge multiplier x milestone bonus x isotope bonus

- Base press value: 1.
- Every press shows a floating "+N" near the reactor and makes the reactor pulse. This feedback is the most important thing in the game and should feel good before anything else is built.

## 4. Combo (rhythm) system

The combo rewards consistent cadence, not speed.

How it builds:

- The game tracks the interval between consecutive presses.
- A press "keeps rhythm" if its interval is within 25% of the rolling average of the last 5 intervals, and the interval is under 600 ms.
- Each rhythmic press adds 1 to the combo counter.
- The first 5 presses after a break always count, so the combo can start.

Combo tiers and multipliers:

| Combo count | Multiplier | Label     |
| ----------- | ---------- | --------- |
| 0 to 9      | x1.0       | none      |
| 10 to 24    | x1.5       | Steady    |
| 25 to 49    | x2.0       | Locked In |
| 50 to 99    | x2.5       | Resonance |
| 100+        | x3.0       | Harmonic  |

How it breaks:

- Pausing for more than 800 ms resets the combo to 0.
- Three consecutive off-rhythm presses reset the combo to 0.
- One or two off-rhythm presses are forgiven (they simply don't add to the counter).

UI: a combo meter next to the reactor showing the current count, the tier label, and a bar that visibly drains during the 800 ms grace window so the player can see it about to break.

Auto-tapper output is not affected by combo unless the Synchronisation upgrade is bought (see shop).

## 5. Surge events

A short burst challenge that reuses the site's CPS test logic.

- Trigger: randomly every 90 to 180 seconds of active play (tab focused and at least one press in the last 60 seconds). Never triggers while idle.
- Warning: the reactor flashes and a 3 second countdown appears.
- Duration: 5 seconds.
- Effect: every press is worth 10x during the surge (stacks with combo).
- End screen: a small summary shows presses, CPS achieved, and energy earned. If it's a new best CPS, say so.
- Surge CPS is recorded as a stat.

The surge is the moment the player should actually mash, and it's the one place speed beats rhythm. That contrast is intentional.

## 6. Shop

All costs are in energy. Cost after each purchase = base cost x scaling ^ (number owned). Prices are rounded to whole numbers.

### 6a. Press upgrades (make each press worth more)

Numbers below are the tuned values that shipped (see §16); the original draft
values are in brackets where they changed. The live source is
`src/games/spacebar-clicker/config.ts`, and the page's rulebook tables render
from it.

| Upgrade         | Effect                                                                   | Base cost         | Scaling         | Max level    |
| --------------- | ------------------------------------------------------------------------ | ----------------- | --------------- | ------------ |
| Finger Strength | +1 energy per press per level                                            | 15                | x1.8 (was x1.3) | 20 (was 50)  |
| Double Tap      | +5% chance per level that a press counts twice                           | 300 (was 100)     | x2.5 (was x2.0) | 10 (50% cap) |
| Spring Keys     | Press value x1.5 per level (multiplicative)                              | 5,000 (was 1,000) | x6.0            | 5            |
| Stabiliser      | Combo decays by 10 instead of resetting to 0 when broken, one level only | 5,000             | n/a             | 1            |
| Synchronisation | Auto-tappers receive 50% of the current combo multiplier, one level only | 25,000            | n/a             | 1            |

### 6b. Auto-tappers (energy per second, EPS)

| Auto-tapper       | EPS each      | Base cost             | Scaling          | Flavour                           |
| ----------------- | ------------- | --------------------- | ---------------- | --------------------------------- |
| Lab Assistant     | 0.5           | 75 (was 25)           | x1.2 (was x1.15) | An intern tapping the key         |
| Pneumatic Key     | 3             | 750 (was 250)         | x1.2             | A piston on a timer               |
| Robot Arm         | 15            | 7,500 (was 2,500)     | x1.2             | Industrial precision              |
| Quantum Keyboard  | 80            | 75,000 (was 25,000)   | x1.2             | Presses in several states at once |
| Particle Collider | 200 (was 400) | 150,000 (was 300,000) | x1.2             | Not technically a keyboard        |

Auto-tapper EPS is multiplied by milestone bonus and isotope bonus, and by half the combo multiplier if Synchronisation is owned.

Shop items are always visible but greyed out until affordable, except the next unrevealed auto-tapper which stays hidden until the player has earned 50% of its base cost at least once. This gives a sense of discovery without hiding the whole list.

## 7. Offline progress

- On returning to the page, the game calculates time away (capped at 4 hours).
- Award EPS x seconds away x 50%.
- Show a small "While you were away" panel with the amount earned and a single Collect button.
- Only awarded if at least one auto-tapper is owned and the player was away more than 60 seconds.

## 8. Reactor milestones

Milestones are based on lifetime energy earned in the current run. Each one changes the reactor's visual state and gives a permanent +5% to all energy gains for that run (stacking additively: 7 states = up to +30%).

| State         | Lifetime energy | Visual intent            |
| ------------- | --------------- | ------------------------ |
| Dormant       | 0               | Dim, barely glowing      |
| Warming       | 500             | Faint glow, slow pulse   |
| Stable        | 10,000          | Steady glow              |
| Charged       | 100,000         | Bright, faster pulse     |
| Unstable      | 1,000,000       | Flickering, colour shift |
| Critical      | 10,000,000      | Intense, erratic         |
| Supercritical | 100,000,000     | Maxed out, unique look   |

Reaching a milestone shows a brief toast ("Reactor is now Stable") and the state name is always visible under the reactor.

## 9. Prestige: Reset the Experiment

- Unlocks when lifetime energy in the current run reaches 1,000,000.
- Isotopes gained on reset = floor(sqrt(lifetime energy this run / 1,000,000)). So 1M gives 1, 4M gives 2, 25M gives 5, 100M gives 10.
- Each isotope gives a permanent +10% to all energy gains (presses and auto-tappers).
- Reset wipes: energy, all shop purchases, reactor milestone state.
- Reset keeps: isotopes, achievements, lifetime stats, best records.
- The prestige button shows how many isotopes a reset would give right now, and the player must confirm before resetting.
- There is exactly one prestige layer. Do not add a second currency or a prestige shop.

## 10. Achievements

Cosmetic badges, no gameplay effect beyond being listed. Shown as a small grid, locked ones greyed out.

- First Press: press the spacebar once
- Warmed Up: 100 total presses
- Thousand Taps: 1,000 total presses
- Ten Thousand Taps: 10,000 total presses
- Steady Hands: reach combo 25
- Resonance: reach combo 50
- Harmonic: reach combo 100
- Fast Fingers: 8+ CPS in a surge
- Lightning: 12+ CPS in a surge
- Staffed Up: own 10 Lab Assistants
- Automated: own at least one of every auto-tapper
- Critical Mass: reach the Critical reactor state
- Fresh Start: prestige once
- Veteran: prestige 5 times

## 11. Stats panel

Always accessible, compact:

- Total presses (lifetime)
- Energy earned (this run / lifetime)
- Current energy per second
- Current energy per press
- Best combo
- Best surge CPS
- Isotopes owned
- Times prestiged
- Time played

## 12. Pacing targets

Use these to sanity check the numbers. Assumes an average player tapping around 5 presses per second with a decent combo.

The original targets, with what the shipped table does for a greedy optimal buyer (simulated 2026-10-21; a human who buys what looks fun runs slower):

| Event                               | Target       | Shipped table, 5 press/s with a realistic combo                 |
| ----------------------------------- | ------------ | --------------------------------------------------------------- |
| First upgrade (Finger Strength)     | within 15 s  | 3 s                                                             |
| First auto-tapper                   | within 30 s  | 8 s                                                             |
| Pneumatic Key                       | ~2 min       | 1.3 min                                                         |
| Robot Arm                           | ~5 min       | 7 min                                                           |
| Quantum Keyboard                    | ~12 min      | 30 min                                                          |
| Particle Collider                   | ~30 min      | 40 min                                                          |
| First prestige (1M this run)        | 45 to 60 min | 24 min (48 min for a masher with no combo, 39 min at 3 press/s) |
| Idle share of income at 30 / 60 min | ~50%         | 47% / 74%                                                       |

The draft table ran about five times too fast (first prestige at 10 minutes) and the three late targets cannot all hold under the §3 formula: a 300,000 collider at 30 minutes needs more energy by then than a 50-minute first prestige allows. First prestige was kept as the anchor and the collider repriced. A rhythmic tapper reaches prestige in half the time a masher does, which is the skill pillar in numbers.

If the numbers feel off in play, adjust base costs first, scaling second. The simulator lives outside the repo; the config header records the method.

## 13. Save and reset

- Save to localStorage every 5 seconds and on page hide.
- A "Reset all progress" option, buried in settings or the stats panel, with confirmation. This is separate from prestige and wipes everything including isotopes.
- A small version number in the save so future changes can migrate old saves.

## 14. Page structure

Game above the fold: reactor in the centre, combo meter beside it, shop to one side, stats and achievements behind tabs or a toggle so they don't clutter the main view.

Below the game: short intro copy targeting "Spacebar Clicker", a How to Play section (mention the combo mechanic, it's the hook), a short FAQ, and links to the CPS test and reaction time test. Standard structure for the keyword, and gives the page enough text content.

## 16. Build notes (shipped 2026-10-21)

Decisions taken during the build, with the maintainer, that adapt this spec to the site:

- **Name and URL.** H1, title and nav label are "Spacebar Clicker" (the keyword); "reactor" is the in-game fiction only. Live at `/spacebar-clicker`. The spacebar speed test's title dropped "Spacebar Clicker" so the two pages do not split the keyword; it took "Spacebar Counter" instead.
- **A game page, not a tool.** The engine (`src/engine`) is untouched. The registry entry carries `telemetry: false`, which removes the top-bar best/average/rank strip; the game shows its own readout. Pure logic lives in `src/games/spacebar-clicker/` (config, economy, combo, save, achievements, format) with unit tests; `src/scripts/spacebar-clicker.ts` owns the DOM. Reused from the engine: the guarded localStorage adapter and the beeper.
- **Reactor color: the Cherenkov ramp** (revised 2026-10-22; the first build was green-only). The core climbs a closed five-step ramp grounded in the blue glow of a real water-cooled reactor: green through Stable, then teal (Charged), cyan (Unstable), Cherenkov blue (Critical), and a blue-white core in a blue halo (Supercritical). Glow radius and pulse speed still rise with each state. The core, dial, gains and stage name all take the stage color, and stages fade into each other over 0.8 s. No red, no amber, no flicker. Recorded in DESIGN.md as the Reactor-Ramp Exception; the "Unstable: colour shift" and "Critical: erratic" lines in §8 are superseded.
- **Stage-change sequence.** On reaching a state: a ring of light rolls out from the core, the grid lights in a band travelling outward, the new dial light pops on, the name settles in, and the arc holds full before sweeping back to the start of the new state. Six dial lights, one per state past Dormant, each in its own state's color, record the run. Under reduced motion the color change and lights stay and all movement goes.
- **Sound** ships on by default through the site's beeper and toggle, for noteworthy moments only: purchase, combo tier up, surge countdown/start/end, reactor state change, achievement, prestige. Never per press.
- **Two resets.** The toolbar Reset (shared modal) wipes everything including isotopes; sound settings survive. "Reset the experiment" lives in its own tab with its own confirm.
- **Rhythm tolerance** stays at 25%, checked by Monte Carlo: a tapper with 10% interval jitter never breaks on rhythm, 20% jitter breaks about three times a minute. Pauses end most combos, which is the intended behaviour.
- **Reveals survive prestige.** The spec wipes shop purchases on reset; the list of auto-tappers the shop has shown is kept, since a second-run player knows the shop.
- **Away progress** uses the saved `lastSeen` timestamp. A gap under a minute (a tab switch) pays full EPS silently; longer pays half, capped at four hours, behind Collect. A hidden tab counts as away.
- **Shop as two tabs** (Upgrades / Auto-tappers), pinned to the reactor's height, after the first preview showed the stacked lists outgrowing it. The tabs share the site's setting-button styling (recessed, green border when selected). A closed tab wears one amber "New" tag, pinned to its top-right corner, when it gains something: an auto-tapper newly revealed, or any item newly affordable at its current price. Opening the tab clears it. The save remembers the level each item was last seen affordable at, so dipping below a price and earning it back does not re-announce it. This is the one use of amber on the page, written into DESIGN.md as the Shop-Signal Exception. (A per-tab count of affordable items and per-row tags were tried first and dropped as noise.)
- **Shop glyphs.** Each of the ten items has a bespoke line glyph (`src/components/games/ShopIcon.astro`) in a 36px recessed tile, on a fixed three-column row grid so every name starts at the same x. Emoji were tried first and dropped: their uneven widths broke alignment.
- **Reactor dial.** A thin arc outside the core fills toward the next reactor state and snaps on reaching it; the combo row shows the distance to the next tier ("20 to Resonance") and the tier label snaps on tier-up.
- **Content** below the game is ~2,300 words: what it is, how to play, the combo rules, the full shop tables and reactor states rendered from the config, the prestige formula, tips for the "1 million" query, and an eight-question FAQ with JSON-LD. The "unblocked" cluster gets one honest FAQ answer and no proxy advice.

## 15. Explicitly out of scope

- Accounts, leaderboards, or any backend
- A second prestige layer or prestige shop
- More mini-games beyond the surge
- Sound (optional later, off by default if added)
- Anything that overlaps with the separate mining clicker project. This game stays keyboard-first, single-screen and shallow.
