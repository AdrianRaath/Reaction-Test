# Product

## Register

product

## Users

Gamers, athletes, and curious individuals who want to measure and improve their reaction speed. They arrive competitively-minded — often comparing themselves to a benchmark ("am I fast?"), chasing a personal best, or landing from a search like "reaction time test." Context is usually a quick, self-directed session at a desktop (gaming mouse/keyboard) or on mobile, wanting an instant, trustworthy read on their reflexes. A secondary audience arrives via SEO guides looking to *understand* reaction time (caffeine, sleep, training) before or after testing.

## Product Purpose

ReflexLab is a free, accurate reaction-time test. It measures visual reaction speed in milliseconds, tracks results over a session and across visits (personal best, history, trend, achieved ranks), and helps people improve. Everything is stored locally in the browser — nothing is sent to a server. Success looks like: a user completes a test within seconds of landing, trusts the number, is compelled to run "just one more," and returns to beat their best. The guides deepen engagement and earn organic search traffic.

## Brand Personality

**Precise, competitive, controlled.** The voice of a serious measuring instrument that also keeps score. It respects that the user is here to compete — with themselves or a benchmark — so it speaks in fast, confident, numbers-first language (ms, ranks, PBs, trends) without hype. Energy is real but disciplined: esports focus, not arcade noise. It should evoke sharpness and momentum (the satisfying snap of a fast reaction), and reward progress rather than manufacture urgency.

## Anti-references

- **Cheesy, ad-cluttered reaction-test / quiz sites** — the typical genre competitor drowning in ad units, interstitials, popups, and pushy CTAs. No clutter, no dark patterns, no ads competing with the test itself.
- **Loud "RGB gamer" clichés** — over-the-top neon-everything, aggressive angular skins, dragon/hexagon/carbon-fiber motifs, gradient-soup gaming branding. The green energy stays controlled and purposeful, never a light show.
- Also avoid: generic SaaS-dashboard blandness (corporate blue, endless identical card grids) and anything childish/toy-like that undermines the tool's credibility.

## Design Principles

1. **The number is the product.** The measured time and its ranking are the payoff. Make measurement feel instant, honest, and precise — timer integrity and a fast, unambiguous result beat any decoration around it.
2. **Controlled intensity.** Competitive, kinetic energy *without* the RGB circus. Restraint — one disciplined accent, deliberate motion — is exactly what separates ReflexLab from the ad-quiz and gamer-skin crowd.
3. **Reward the loop.** Ranks, personal bests, session history, and the trend graph exist to make "one more try" irresistible. Every result should show where the user stands and give them a reason to go again.
4. **Respect the player.** No ads, no dark patterns, private by default (localStorage, nothing leaves the device). Frictionless in, honest throughout — trust is a core feature, not a footnote.
5. **Fast to react.** Minimize everything between landing and the first test. The interface must never sit between the user and their reflex; clarity and speed win over completeness on the primary surface.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥4.5:1 contrast (≥3:1 for large text), full keyboard operability (the test is already Space/Enter-driven), visible focus states, and correct ARIA/live regions for status and results. Critically, because this is a reaction test built on a red→green color transition: **never signal state by color alone** — pair the color change with position/label/shape cues so color-blind users (esp. red-green / deuteranopia) can play. Provide a `prefers-reduced-motion` alternative for every animation, and keep the "GO" transition a clean state change rather than a strobe/flash to respect photosensitivity. Sound is optional and user-toggleable.
