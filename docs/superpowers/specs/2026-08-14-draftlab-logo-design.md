# DraftLab logo (beaker + football)

Approved 2026-08-14 (brainstorming).

## Problem

DraftLab uses a placeholder “D” letter mark in the sidebar and has no cohesive
brand icon. The product name implies a lab/experiment metaphor applied to
fantasy football draft optimization.

## Decisions

- **Scope:** app icon mark + full lockup (icon + “DraftLab” wordmark) for
  in-app sidebar and broader brand use.
- **Concept:** Erlenmeyer flask (lab) with an American football half-submerged
  in liquid — “Contained experiment” direction **A2**.
- **Beaker style:** Erlenmeyer; liquid fill, bubbles, and rising vapor (strong
  lab cue).
- **Football:** American football with laces; **orange `#f97316`** (theme
  tier-C / accent-adjacent) for contrast against mint beaker.
- **Beaker / lab elements:** mint **`#00e5a0`** outline, liquid, bubbles,
  vapor.
- **Background:** transparent SVG (designed for dark **`#0a0e14`** surfaces).

## Assets

| File | Use |
| --- | --- |
| `apps/web/public/brand/logo-mark.svg` | Sidebar icon, favicon, compact UI |
| `apps/web/public/brand/logo-lockup.svg` | Marketing / export; horizontal icon + wordmark |

## Integration

- Replace sidebar and auth `.mark` “D” with `logo-mark.svg`.
- Add favicon link in `index.html` pointing at `logo-mark.svg`.
- Sidebar mark is 40×40; auth mark is 44×44 so flask, football, and vapor stay readable.
- Mark is a proper Erlenmeyer (rounded body, clipped liquid/football, mint glow) matching approved A2 — not the first geometric sketch.

## Color tokens

| Role | Hex |
| --- | --- |
| Beaker stroke / vapor / bubbles | `#00e5a0` |
| Liquid fill | `#00e5a029` |
| Football | `#f97316` |
| Football laces | `#0a0e14` |
| Lockup wordmark | `#e8edf5` |

## Out of scope

- Animated logo, light-theme variant, or PNG raster exports (SVG only for now).
