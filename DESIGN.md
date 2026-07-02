---
name: ReflexLab
description: A precision reaction-time instrument — dark chassis, one green signal, honest numbers.
colors:
  signal-green: "#22c55e"
  signal-green-deep: "#16a34a"
  chassis-black: "#0a0a0b"
  panel-01: "#111113"
  panel-02: "#141416"
  panel-03: "#18181b"
  panel-hover: "#1f1f23"
  ink-primary: "#fafafa"
  ink-secondary: "#a1a1aa"
  ink-muted: "#71717a"
  ink-disabled: "#52525b"
  line: "#27272a"
  line-subtle: "#1f1f23"
  hold-red: "#ef4444"
  caution-amber: "#f59e0b"
  rank-elite: "#a855f7"
  rank-advanced: "#3b82f6"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  readout:
    fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "4rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "normal"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
  2xl: "1.5rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "3rem"
  3xl: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-green}"
    textColor: "{colors.chassis-black}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1.5rem"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.signal-green-deep}"
    textColor: "{colors.chassis-black}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1.5rem"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1.5rem"
    height: "44px"
  button-option:
    backgroundColor: "{colors.panel-03}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-option-active:
    backgroundColor: "{colors.chassis-black}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-danger:
    backgroundColor: "{colors.hold-red}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1.5rem"
    height: "44px"
  widget-card:
    backgroundColor: "{colors.panel-02}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.xl}"
    padding: "1.5rem"
  test-card:
    backgroundColor: "{colors.panel-02}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.2xl}"
    padding: "1.5rem"
  rank-badge:
    backgroundColor: "transparent"
    textColor: "{colors.signal-green}"
    rounded: "{rounded.sm}"
    padding: "0.25rem 1rem"
---

# Design System: ReflexLab

## 1. Overview

**Creative North Star: "The Signal Instrument"**

ReflexLab is not a game skin and not a dashboard — it is a **precision measuring instrument** rendered in software. Picture a piece of dark lab equipment: a black chassis, a single green signal light, a monospace readout, and nothing on the panel that isn't earning its place. The user is here to get one honest number — their reaction time in milliseconds — and to chase it downward. Every visual decision serves that reading. The chassis recedes (near-black `#0a0a0b`), the numerals sit in monospace so digits never shift, and the one saturated color on the surface — **Signal Green** — behaves like an instrument's indicator LED: it means *go, active, or personal-best*, never decoration.

The system is **dark by physical necessity, not fashion**. The core interaction is a red→green state change the user must catch in ~250 ms; a dark surround maximizes the contrast of that flash and keeps the eye from wandering. Density is deliberately low on the test surface (one card, one number, generous breathing room) and rises only in the telemetry below it — the personal-best, trend, rank, and history widgets where a returning competitor wants detail. Motion is functional throughout: a pulse while holding, a scale-snap on GO, a shake on a false start. Nothing choreographs an entrance; the tool loads straight into readiness.

This system explicitly **rejects two things** named in the product brief. First, the **cheesy, ad-cluttered reaction-test genre**: no ad slots, no interstitials, no pushy CTAs crowding the measurement. The screen the user came for stays clean. Second, the **loud "RGB gamer" aesthetic**: no neon-everything, no angular carbon-fiber skins, no gradient soup. The energy is real — glows, a green go-signal, rank telemetry in color — but it is *controlled*, the way a serious instrument is controlled. Green is powerful here precisely because it is rationed.

**Key Characteristics:**
- **Instrument, not arcade** — a calibrated measuring device that keeps score, not a light show.
- **The number is the hero** — monospace readout, oversized, dead-center; the chrome around it stays quiet.
- **One rationed accent** — Signal Green marks go / active / best only; the rank palette is the sole licensed exception.
- **Dark by function** — the black chassis exists to make the red→green signal unmistakable.
- **Charged but controlled** — glow and motion appear only as state feedback, never as ambient decoration.

## 2. Colors

A near-black chassis, a cool zinc-gray ink ramp, and a single saturated green signal — with a tightly-scoped rank palette as the only sanctioned burst of extra color.

### Primary
- **Signal Green** (`#22c55e`): The instrument's indicator LED. Used for the GO state, the primary/"Try Again" call-to-action, active setting toggles' focus ring, the personal-best figures, the "Pro" rank, and every focus outline. Its meaning is always *go / active / your best* — never a decorative fill. **It is deliberately rationed** (see the One Signal Rule).
- **Signal Green Deep** (`#16a34a`): The pressed/hover shade of the green CTA only. Never a surface color.

### Secondary
- **Hold Red** (`#ef4444`): The "wait / hold" and "Too soon!" state. Drives the red-hold gradient in the test area, the false-start shake, and the destructive "Reset All Data" button. It is the deliberate opposite pole of Signal Green — the two colors *are* the game's core signal, so nothing else may use them.
- **Caution Amber** (`#f59e0b`): Reserved for the "Intermediate" rank and any soft-warning affordance. Sparse.

### Tertiary — The Rank Palette
A closed set of five telemetry colors, used **only** on rank badges and the matching results-border glow. This is the one place the system is allowed to bloom into color, because rank *is* information the returning user reads at a glance.
- **Elite** — Violet (`#a855f7`)
- **Pro** — Signal Green (`#22c55e`)
- **Advanced** — Blue (`#3b82f6`)
- **Intermediate** — Caution Amber (`#f59e0b`)
- **Beginner** — Muted Gray (`#71717a`)

### Neutral
- **Chassis Black** (`#0a0a0b`): The body/background. The instrument's housing; everything sits on it.
- **Panel 01 / 02 / 03** (`#111113` / `#141416` / `#18181b`): Tonal surface layers. `Panel 02` is the card/widget fill; `Panel 03` is the recessed test-area and setting-toggle rest state; `Panel 01` is the innermost result/attempt strip. Depth is built by *tonal step*, not shadow.
- **Panel Hover** (`#1f1f23`): The universal hover-lift surface for interactive neutrals.
- **Line** (`#27272a`) / **Line Subtle** (`#1f1f23`): Hairline borders and section dividers. Always 1px.
- **Ink Primary** (`#fafafa`): Numbers, headings, primary text.
- **Ink Secondary** (`#a1a1aa`): Supporting copy, labels, units.
- **Ink Muted** (`#71717a`): De-emphasized hints and meta. Floor for text — must not carry essential body copy at small sizes on card surfaces (contrast falls near the AA line).
- **Ink Disabled** (`#52525b`): Disabled controls only.

### Named Rules
**The One Signal Rule.** Signal Green and Hold Red are the game's language — go and wait. They may only ever mean that. Never fill a card, a header, or a decorative shape with either. If green appears somewhere that doesn't mean *go / active / your best*, delete it.

**The Rank-Only Color Rule.** The five rank hues (violet / green / blue / amber / gray) are licensed for rank badges and the results-border glow — nowhere else. The rest of the interface is black, zinc-gray, and one green. This is what separates ReflexLab from the RGB-gamer lane: color is telemetry, not upholstery.

## 3. Typography

**Display / UI Font:** System sans stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`)
**Readout Font:** System monospace stack (`ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, ...`)

**Character:** One sans family carries the entire interface — headings, labels, body, buttons — tuned by weight, not by mixing families. Its foil is the **monospace readout**, reserved exclusively for numbers. That single serif-vs-sans-style contrast axis (proportional UI vs. tabular numerals) is the whole type system: it makes every measured value read as an instrument's output, and it means digits never shift width as the number ticks. No display face, no font pairing beyond this one functional split.

### Hierarchy
- **Display** (700, `3.5rem` / 56px, ls -0.03em): The page H1 ("Reaction Time Test"). Fixed rem, not fluid — it scales down only at mobile breakpoints, structurally.
- **Readout** (700, `4rem` / 64px mono, lh 1): **The signature.** The measured reaction number, the session average, and the personal best. Monospace, oversized, dead-center. This is the thing the user came for.
- **Headline** (700, `1.5rem` / 24px): Test-area state messages ("Click to start", "Wait…", "GO!", "Too soon!") and result emphasis.
- **Title** (600, `1rem` / 16px): Widget and card titles ("Personal Best", "Trend", "Rank").
- **Body** (400, `1rem` / 16px, lh 1.5): Supporting copy in Ink Secondary. Cap prose at 65–75ch.
- **Label** (500, `0.875rem` / 14px): Setting labels, attempt labels, meta. Rank badges use this weight/size with ls `0.05em` and capitalized case.

### Named Rules
**The Monospace-Numerals Rule.** Every *measured value* — reaction times, averages, PBs, attempt times — is set in the monospace readout face. Proportional numerals in a measurement are forbidden; digits must never reflow as the number changes. Conversely, prose and labels are never monospace.

## 4. Elevation

Depth is built primarily by **tonal layering**, not drop shadows. Surfaces step through the panel ramp (`Chassis Black` → `Panel 01/02/03`) to signal hierarchy, and hairline 1px borders (`Line`) define edges. There are no ambient resting shadows on cards — a widget at rest is flat, distinguished from the chassis by tone and a hairline alone. This flatness is what keeps the instrument reading as precise rather than "2014-app glossy."

Shadows exist for exactly one job: **glow as state feedback.** A colored glow is never decorative here; it fires only to communicate a live state — the red hold, the green GO, a rank result, a hovered primary action. If a glow isn't reporting a state, it's wrong.

### Shadow Vocabulary
- **Structural depth** (`box-shadow: 0 4px 6px -1px rgba(0,0,0,0.4), 0 2px 4px -2px rgba(0,0,0,0.3)` / `--shadow-md`; `--shadow-lg` for lifted): Neutral black shadows for genuinely floating surfaces (modal). Used sparingly.
- **Accent glow** (`0 0 20px rgba(34,197,94,0.2), 0 0 40px rgba(34,197,94,0.2)`): The GO state and primary-button hover. Signals *active / go*.
- **Hold glow** (`0 0 30px rgba(239,68,68,0.2)`): The waiting and false-start states. Signals *hold / error*.
- **Rank glow** (`0 0 20px <rank>/0.2, 0 0 40px <rank>/0.1`): The results-border halo, colored to the achieved rank.

### Named Rules
**The Glow-Is-A-Signal Rule.** Colored glow is state telemetry, not ambience. It appears on: waiting (red), GO (green), primary-CTA hover (green), and session-complete (rank color). Nowhere else. A card does not glow because glowing looks nice.

**The Flat-At-Rest Rule.** Cards, widgets, and panels carry no resting drop shadow. Separation from the chassis is tone + 1px hairline. Reserve true black shadows for the modal, which genuinely floats.

## 5. Components

Every interactive element resolves to the same vocabulary: a dark neutral fill, a 1px hairline, a rounded corner from the shared scale, a fast (150 ms) transition, and a green focus ring. Consistency is the point.

### Buttons
- **Shape:** Rounded corners, `0.75rem` (12px, `rounded.lg`) on standard buttons; nav and toggle buttons use `0.5rem` (8px, `rounded.md`). Minimum touch target 44px on primary actions.
- **Primary:** Solid Signal Green fill, Chassis-Black text (dark-on-green for legibility), padding `0.5rem 1.5rem`. Hover deepens to Signal Green Deep, lifts `translateY(-1px)`, and fires the accent glow. Active drops back to `translateY(0)`.
- **Secondary:** Transparent fill, Ink-Primary text, `Line` border. Hover fills to `Panel Hover` and brightens the border.
- **Try-Again (invert):** A white (`Ink Primary`) fill with Chassis-Black text — a high-contrast "reset the loop" action distinct from the green go-signal.
- **Danger:** Solid `Hold Red` fill. Reserved for destructive confirmation ("Reset All Data").
- **Focus:** Every button shows a `2px` Signal-Green outline at `2px` offset on `:focus-visible`.

### Setting Toggles (Button Group)
- **Style:** Segmented options (Test Count, Delay Range, Input Method). Rest state is `Panel 03` fill, Ink-Secondary text, `Line` border, `rounded.md`. Min-width 44px.
- **State:** The active option drops to `Chassis Black` fill, gains a Signal-Green border, and brightens text to Ink Primary — the selection reads as a recessed, illuminated key. Hover lifts to `Panel Hover`.

### Cards / Containers
- **Corner Style:** Widgets `1rem` (16px, `rounded.xl`); the main test card `1.5rem` (24px, `rounded.2xl`) — the largest radius on the page, marking it as the primary surface.
- **Background:** `Panel 02` fill.
- **Shadow Strategy:** Flat at rest (see Elevation → The Flat-At-Rest Rule). No resting shadow.
- **Border:** 1px `Line`. Internal dividers use `Line Subtle`.
- **Internal Padding:** `1.5rem` (`spacing.lg`).

### Navigation
- **Style:** Sticky top bar, `Chassis Black` at 85% opacity with a 12px backdrop-blur, hairline bottom border. 64px tall, content capped at 960px.
- **Brand:** Wordmark + green logo glyph; hovering the brand shifts it to Signal Green.
- **Controls:** Ghost `btn-nav` buttons (sound toggle, reset) — Ink-Secondary, `Panel 01` fill, hover brightens.
- **Mobile:** Sound and reset stay inline, with reset dropping its label to icon-only. Tool links collapse into a tools menu behind a Phosphor list button: a Panel-02 dropdown with a hairline border, lifted shadow, and 44px items. The current tool is marked by a green icon (an active state, sanctioned by the One Signal Rule).

### Iconography
- **Telemetry & content icons — native emoji.** Widget titles (🏆 📊 🎯 📈 📋) and tip/info cards use native color emoji as their icon vocabulary on every test page. This is a deliberate, sanctioned choice: the emoji give the telemetry and guidance sections a human, score-keeping warmth without adding UI color. As pre-rendered glyphs they sit outside the One Signal Rule and the Rank-Only Color Rule — an emoji is never "using" green or red.
- **Shared vocabulary.** The same concept always gets the same emoji across pages: 🏆 best, 📊 average, 🎯 ranks/focus, 📈 trend, 📋 history. Page-specific tip cards may introduce topical emoji (😴 🔥 🖥️ 🖱️ ⌨️ ☕ …), but reuse an existing one wherever the concept overlaps.
- **Always decorative.** Emoji never carry meaning alone — each accompanies a text title, and the emoji `<span>` is marked `aria-hidden="true"` so screen readers skip it.
- **Functional controls — Phosphor icons.** Nav controls (sound toggle, reset, cross-page links) and other functional glyphs use the monochrome Phosphor set in ink colors. The two vocabularies never mix within a slot: widget/tip iconography is emoji; interactive chrome is Phosphor.

### Rank Badge
- **Style:** A capsule (`rounded.sm`) using its rank hue at three intensities — text at full hue, a 20%-alpha fill, a 30%-alpha border. Label typography, `0.05em` tracking, capitalized. The one place the palette is licensed to bloom.

### Test Area (Signature Component)
- **The instrument face.** A `340px`-tall panel, `rounded.xl`, that *is* the game. It cycles through five states, each with its own fill, 2px border, and glow:
  - **Idle:** `Panel 03` fill, `Line` border — quiet, ready.
  - **Waiting (hold):** red-tinted gradient (`#2a1a1a → #3d1f1f`), Hold-Red border, hold glow; the status text pulses.
  - **GO:** green gradient (`#064e3b → #065f46`), Signal-Green border, accent glow; the status snaps with a scale-pulse.
  - **False start:** deep-red gradient, Hold-Red border, error glow; the message shakes.
  - **Session complete:** neutral `Panel 03`, but the border + glow adopt the achieved **rank color**, turning the result into a trophy frame.
- **Accessibility mandate:** because these states are the entire game and pivot on red↔green, state is **never** signaled by color alone — each carries a distinct text message and animation. Preserve that pairing (see Do's & Don'ts).

## 6. Do's and Don'ts

### Do:
- **Do** keep Signal Green (`#22c55e`) rationed to *go / active / your best* and the "Pro" rank. Emphasis elsewhere comes from weight, size, and tone — not more green.
- **Do** set every measured value in the monospace readout face so digits never reflow. Proportional numerals in a measurement are a bug.
- **Do** build depth from the panel tone ramp (`#0a0a0b → #111113 → #141416 → #18181b`) plus 1px hairlines. Keep cards flat at rest.
- **Do** treat colored glow as state telemetry only — red hold, green GO, green CTA-hover, rank result. If a glow isn't reporting a state, remove it.
- **Do** pair every red/green state with a **non-color cue** — a text label ("Wait…", "GO!", "Too soon!") and a motion (pulse, scale-snap, shake) — so red-green color-blind players can play. Ship a `prefers-reduced-motion` alternative for every one, and keep GO a clean state change, not a strobe.
- **Do** hold body text at ≥4.5:1 against its panel. When copy matters, use `Ink Secondary` (`#a1a1aa`) or brighter — not `Ink Muted` — on card surfaces.
- **Do** give every interactive element the shared vocabulary: dark neutral fill, 1px hairline, scale radius, 150 ms transition, green `:focus-visible` ring.
- **Do** icon widget titles and tip cards with the shared emoji vocabulary (🏆 📊 🎯 📈 📋 …) — `aria-hidden`, always beside a text label — and keep functional nav controls on monochrome Phosphor. One icon vocabulary per slot, consistent across pages.

### Don't:
- **Don't** drift toward the **cheesy, ad-cluttered reaction-test look** — no ad slots, interstitials, popups, or CTAs crowding the measurement. The screen the user came for stays clean.
- **Don't** slide into the **loud "RGB gamer" aesthetic** — no neon-everything, angular carbon-fiber/hexagon skins, dragon motifs, or gradient soup. Energy stays controlled; color stays telemetry.
- **Don't** use Signal Green or Hold Red for anything other than their state meaning. No green card fills, no red decorative accents — they are the game's language (The One Signal Rule).
- **Don't** let the rank palette (violet / blue / amber / gray) leak beyond rank badges and the results-border glow (The Rank-Only Color Rule).
- **Don't** add resting drop shadows to cards or widgets, and don't reach for glassmorphism — depth is tone + hairline; glow is reserved for state.
- **Don't** signal any test state by color alone, and don't ship a flashing/strobing GO transition.
- **Don't** carry essential body copy in `Ink Muted` (`#71717a`) at small sizes on card surfaces — it lands on the AA contrast line. Brighten to Ink Secondary.
- **Don't** introduce a second UI font or a display face. One sans in multiple weights, one mono for numbers — that's the whole system.
