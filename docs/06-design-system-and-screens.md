# Design System and Screen Inventory

This document is the contract between the Figma mocks and the Angular implementation. Tokens
defined here are created as Figma variables and as CSS custom properties layered over the
PrimeNG Aura preset already configured in `src/app/app.config.ts`.

---

## 1. Design Direction

A dark, dense, data-forward analytics interface. The reference points are modern trading and
observability dashboards rather than the loud, ad-heavy aesthetic of most fantasy football
sites. Three reasons this is the right direction rather than just a stylistic preference:

**Drafts happen at night, often for hours.** A dark surface is the comfortable choice for
sustained use, and it makes coloured data signals read far more strongly than they do on
white.

**The grade colours are load-bearing, not decorative.** The entire evaluation model in
`01-player-evaluation-model.md` is expressed as green/yellow/orange/red factor grades. Those
four colours must be the most legible thing on screen, which means the rest of the palette
has to stay quiet. A colourful brand palette would compete with the data and make the product
harder to read.

**Information density is a feature.** A draft board showing 400 players, twelve factors each,
under a 60-second clock cannot afford generous whitespace. The design uses tight vertical
rhythm, small-but-legible type, and tabular numerals so columns of numbers align and scan
cleanly.

---

## 2. Colour Tokens

### 2.1 Surfaces

| Token | Hex | Use |
| --- | --- | --- |
| `surface-base` | `#0A0E14` | App background |
| `surface-raised` | `#111722` | Cards, panels |
| `surface-overlay` | `#1A2130` | Dialogs, popovers, hover rows |
| `surface-sunken` | `#070A0F` | Table headers, wells |
| `border-subtle` | `#1E2635` | Dividers, table gridlines |
| `border-strong` | `#2E3A4D` | Card and input borders |

### 2.2 Text

| Token | Hex | Use |
| --- | --- | --- |
| `text-primary` | `#E8EDF5` | Headings, player names, key numbers |
| `text-secondary` | `#96A3B8` | Labels, supporting copy |
| `text-tertiary` | `#5D6B80` | Metadata, disabled |
| `text-inverse` | `#0A0E14` | On accent fills |

### 2.3 Grade scale

The spreadsheet semantics, retuned for accessible contrast on a dark surface. Each grade has
a solid colour for text and icons plus a translucent fill for cell backgrounds.

| Token | Hex | Fill | Weight |
| --- | --- | --- | --- |
| `grade-green` | `#22C55E` | `#22C55E1F` | +5 |
| `grade-yellow` | `#EAB308` | `#EAB3081F` | +3 |
| `grade-orange` | `#F97316` | `#F973161F` | -1 |
| `grade-red` | `#EF4444` | `#EF44441F` | -3 |
| `grade-unknown` | `#5D6B80` | `#5D6B801F` | 0 |

`grade-unknown` exists because unresolved factors are a real and frequent state in the source
data (the `?` cells) and must be visually distinct from a bad grade. Rendering an unknown as
grey-neutral rather than red is the difference between "we don't know yet" and "this is bad",
and conflating them would misrepresent the model.

Colour is never the sole carrier of meaning: every grade cell also shows its numeric value,
and factor rows carry a shape indicator (▲ ▬ ▼) so the interface remains usable for
colour-blind users. Given that four-colour coding is the core visual language of this
product, this is a functional requirement rather than a compliance checkbox.

### 2.4 Accent and semantic

| Token | Hex | Use |
| --- | --- | --- |
| `accent-primary` | `#00E5A0` | Primary actions, active state, live indicator |
| `accent-primary-dim` | `#00E5A029` | Accent fills, selected rows |
| `accent-secondary` | `#6366F1` | Secondary emphasis, strategy accents |
| `info` | `#38BDF8` | Informational callouts |
| `warning` | `#FBBF24` | Drift warnings, risk flags |
| `danger` | `#F43F5E` | Destructive actions, critical alerts |
| `live` | `#00E5A0` | Pulsing live-sync indicator |

### 2.5 Tier scale

Reused for both strategy tiers and draft slot tiers so the grading language stays consistent
with `Best Draft Strategy Archetype.PNG` and `Best Spot To Draft From.PNG`, whose original
tier colours are preserved:

| Token | Hex |
| --- | --- |
| `tier-s` | `#8B8BFF` |
| `tier-a` | `#5DE895` |
| `tier-b` | `#F5E663` |
| `tier-c` | `#F5C563` |
| `tier-d` | `#F58A63` |
| `tier-f` | `#F56363` |
| `tier-unrated` | `#5D6B80` |

`tier-unrated` covers Zero RB, Elite QB, and draft slot 1.05, which are cropped out of the
source images (see `05-architecture.md` §6). The UI shows them as explicitly unrated rather
than guessing a grade.

### 2.6 Position colours

| Token | Hex |
| --- | --- |
| `pos-qb` | `#F472B6` |
| `pos-rb` | `#4ADE80` |
| `pos-wr` | `#60A5FA` |
| `pos-te` | `#FB923C` |
| `pos-flex` | `#A78BFA` |
| `pos-k` / `pos-dst` | `#94A3B8` |

Position colours are deliberately distinct in hue from the grade scale so a green RB badge is
never confused with a green factor grade.

---

## 3. Typography

| Token | Family | Size / Line | Weight | Use |
| --- | --- | --- | --- | --- |
| `display` | Inter | 32 / 40 | 700 | Page titles |
| `h1` | Inter | 24 / 32 | 700 | Section headers |
| `h2` | Inter | 18 / 26 | 600 | Card titles |
| `h3` | Inter | 15 / 22 | 600 | Subsection labels |
| `body` | Inter | 14 / 20 | 400 | Default copy |
| `body-strong` | Inter | 14 / 20 | 600 | Player names |
| `small` | Inter | 12 / 18 | 400 | Metadata |
| `label` | Inter | 11 / 16 | 600, 0.06em tracking, uppercase | Column headers, tags |
| `mono-lg` | JetBrains Mono | 22 / 28 | 600, tabular | Composite scores |
| `mono` | JetBrains Mono | 13 / 18 | 500, tabular | All table numerics |

Tabular monospace numerals for every number in a column is not a stylistic flourish — with
twelve factor values per player row, proportional digits make columns fail to align and the
board becomes materially harder to scan.

---

## 4. Spacing, Radius, Elevation

Spacing on a 4px base: `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-5` 24,
`space-6` 32, `space-7` 48, `space-8` 64.

Radius: `radius-sm` 4 (tags, cells), `radius-md` 8 (buttons, inputs), `radius-lg` 12 (cards),
`radius-xl` 16 (dialogs), `radius-full` 999 (pills, avatars).

Elevation, kept restrained because on dark surfaces layering reads better through background
steps than through shadow: `elev-1` `0 1px 2px #00000052`, `elev-2` `0 4px 12px #00000066`,
`elev-3` `0 12px 32px #00000080`.

Draft-room density overrides: table row height 36px (compact) or 44px (default), header 32px,
and a 12px cell gutter.

---

## 5. Core Components

Components that carry the model's semantics and must be built once and reused everywhere:

**`FactorGradeCell`** — a single graded factor: value, grade fill, shape indicator, tooltip
naming the factor, its benchmark, and the player's actual figure. The atom of the whole
system.

**`FactorGrid`** — the 12-factor breakdown for a player, grouped into Volume / Situational /
Profile, with the weighted subtotal and an unknown count.

**`CeilingScoreDial`** — the -36…60 composite as a radial gauge with the grade-count
breakdown (`7G 3Y 0O 1R`) beneath, plus a confidence ring showing known-factor coverage.

**`ArchetypeBadge`** — the career-stage bucket with its historical outcome rates on hover
(return / boom / bust / injury), which is what makes the badge informative rather than
decorative.

**`RiskMeter`** — 0–100 risk with contributing factors itemised and, for RBs, the projected
games-missed range rather than a single mean, per `01-player-evaluation-model.md` §3.

**`ValueDelta`** — the FSE-versus-ESPN rank difference as a signed, coloured chip with the ADP
in round.pick notation alongside, since value is meaningless without the price.

**`PlayerRow`** — the board's primary row: position badge, name, team, ADP, ceiling score,
archetype, risk, value, projected points, and a target/avoid marker.

**`TierBreak`** — the explicit horizontal rule between board tiers with a remaining-count and
survival estimate, so cliffs are visible rather than described.

**`StrategyCard`** — a strategy with its tier grade, verbatim definition, round shape preview,
and fit-for-your-slot indicator.

**`RoundPlanTimeline`** — the round-by-round plan with primary / secondary / avoid positions
per round and the league-winner percentage from `Round League Winners.PNG` shown inline. The
percentages are what make the `avoid` guidance persuasive.

**`RecommendationCard`** — a ranked recommendation with its ordered reason strings, need
match, survival probability, and risk flags.

**`NeedsPanel`** — roster slots filled versus open with urgency, driven by quality gap rather
than slot count.

**`AdherenceMeter`** — on plan / drifting / pivot recommended, with the specific mismatch
named.

**`SyncStatusChip`** — platform, last-synced timestamp, and source (live poll versus manual).
Always visible during a draft; per `04-live-draft-team-builder.md` §1.1 the app shows sync
age honestly rather than implying real-time.

**`BudgetBar`** and **`MaxBidCallout`** — auction budget, dollars per remaining slot,
inflation rate, and the max-bid figure that is the auction room's most valuable number.

---

## 6. Screen Inventory

Ten screens for the mocks, ordered by the flow a new user follows:

| # | Screen | Purpose | Key components |
| --- | --- | --- | --- |
| 1 | **Dashboard** | Multi-league hub, upcoming drafts, draft-time conflict warnings, quick resume | League cards, draft countdown, `SyncStatusChip` |
| 2 | **Connect Leagues** | Sleeper username flow and ESPN cookie flow with guided instructions, discovered-league selection | Platform cards, guided steps, league picker |
| 3 | **Scoring Settings** | Imported scoring in plain language, validation result, manual override | Scoring summary, validation banner, override form |
| 4 | **Strategy Planner** | Choose from the nine strategies with tier grades, set draft slot, see the round plan | `StrategyCard` grid, slot tier map, `RoundPlanTimeline` |
| 5 | **Strategy Simulator** | Monte Carlo outcome distribution and side-by-side strategy comparison | Distribution chart, comparison table |
| 6 | **Player Board** | The ranked big board with tiers, filters, and full factor columns | `PlayerRow`, `TierBreak`, filters, virtual scroll |
| 7 | **Player Detail** | Full 12-factor breakdown, archetype rates, injury history, season log, market value | `FactorGrid`, `CeilingScoreDial`, `RiskMeter`, `ValueDelta` |
| 8 | **Live Draft Room (snake)** | The flagship: board grid, roster, recommendations, needs, adherence | `RecommendationCard`, `NeedsPanel`, `AdherenceMeter`, board grid |
| 9 | **Auction Draft Room** | Nomination, bidding, budgets, inflation, max bid, contract terms | `BudgetBar`, `MaxBidCallout`, budget grid, contract selector |
| 10 | **Dynasty Roster** | Multi-year value curves, roster age distribution, pick assets, contend/rebuild toggle | Age curve chart, value curves, pick asset list |

A post-draft recap screen (`05-architecture.md` §4, `/leagues/:id/recap`) is specified but
deferred out of the first mock set, since its content depends on decisions made in the live
draft room design.

### 6.1 Layout frame

All mocks at **1600 × 1000** desktop. Persistent left navigation 240px wide with a league
switcher pinned at its top, since league context governs every number on screen and switching
must never be more than one click. Content area at 1360px with a 12-column grid, 24px gutter.

The draft room breaks this pattern deliberately: navigation collapses to a 64px icon rail to
maximise board width, because on draft night the user has one job and every pixel of board
matters more than navigating elsewhere.

Responsive behaviour is specified but not mocked in this first set. It needs its own pass —
the draft room in particular is a genuinely hard mobile problem, and plenty of people draft
from a phone, so it deserves dedicated design work rather than a naive column stack.
