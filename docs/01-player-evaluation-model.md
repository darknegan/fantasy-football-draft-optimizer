# Player Evaluation Model

This document reverse-engineers the evaluation methodology already present in
`public/stats/` into a deterministic, implementable scoring engine. Every rule below
traces back to a specific artifact in that folder, cited inline.

The engine produces four independent outputs per player, which are then blended into a
single `DraftScore`:

| Output | Range | What it answers |
| --- | --- | --- |
| `CeilingScore` | position-specific | How good is this player's situation and volume profile? |
| `Archetype` | enum | What kind of career-stage bet am I making? |
| `RiskProfile` | 0 … 100 | How likely is this pick to be derailed by injury? |
| `ValueScore` | -100 … 100 | Is the market price a discount or a premium? |

Keeping them separate matters: two players can share a `CeilingScore` of 36 while one is a
23-year-old `ELITE` WR at a discount and the other is a 31-year-old Trusty Veteran going a
round early. The UI must always be able to show *why* a player ranks where they do.

---

## 1. The Factor Scoring Rubric

The source spreadsheets grade every player against a fixed set of factors, colour-coding
each factor and summing weighted points. DraftLab expands that source rubric to six
scored bands so genuine standouts and severe misses do not collapse into the same grade:

| Grade | Weight |
| --- | --- |
| Elite | +5 |
| Green | +3 |
| Yellow | +1 |
| Orange | −1 |
| Red | −3 |
| Critical | −5 |
| Unknown | 0 |

The sheets label the resulting total "Legendary" for QB/TE and "Ceiling" for WR/TE. It is
the same number; this project standardises on **`CeilingScore`**.

The original four-band formula was confirmed by three independent spot-checks against the
source images:

- **Josh Allen (QB1)** — 7 green, 3 yellow, 0 orange, 1 red → `35 + 9 + 0 - 3 = 41`,
  matching the 41 printed in `QBs Scoring Factors.PNG`.
- **Ja'Marr Chase (WR1)** — 9 green, 1 yellow, 0 orange, 2 red → `45 + 3 + 0 - 6 = 42`,
  matching `WR #1-9 Scoring Factors.PNG`.
- **Brock Bowers (TE1)** — 8 green, 1 yellow, 1 orange, 2 red → `40 + 3 - 1 - 6 = 36`,
  matching `TE Scoring Factors.PNG`. These are provenance checks for the source material,
  not expected scores under the shipped six-band rubric.

Positions do not all have the same number of configured or currently sourced factors.
The raw range is therefore position-specific:
`CEILING_RANGE[position] = knownFactorCount × [−5, +5]`. Current known coverage is QB
12/12 (−60…60), RB 16/16 (−80…80), WR 17/17 (−85…85), and TE 13/13 (−65…65).
Cross-position comparisons normalise against the applicable positional range.

```ts
type FactorGrade =
  | 'elite' | 'green' | 'yellow' | 'orange' | 'red' | 'critical' | 'unknown';

const GRADE_WEIGHTS: Record<FactorGrade, number> = {
  elite: 5,
  green: 3,
  yellow: 1,
  orange: -1,
  red: -3,
  critical: -5,
  unknown: 0,
};
```

`unknown` deserves explanation. The source sheets use `?` liberally — see the `?` cells for
Lamar Jackson's passing TDs in `QBs ADP #1-8.PNG` — for players whose situation has not
resolved yet (new offensive coordinator, unsettled depth chart, rookie with no NFL usage).
Scoring these as zero rather than guessing is the honest choice, but the UI must surface
the count of unknowns, because equal `CeilingScore` values can rest on very different
coverage. Each player therefore carries a **`ConfidenceScore`** =
`knownFactors / configuredFactorsForPosition`.

### 1.1 Grading a factor

Each factor is graded by comparing the player's value against a positional benchmark. The
benchmarks are not arbitrary — they are the **average profile of players who actually won
leagues at that position**, which is exactly what the "Average" and "Paced Average" columns
in `QB Stats Avg.PNG`, `WR Scoring Avgs.PNG`, and `TE Avg Scoring.PNG` contain.

Grading bands are expressed as a ratio of the player's value to the benchmark. Volume
and other `higherBetter` factors use `value / benchmark`; rank-based `lowerBetter`
factors use `benchmark / value`. They share all thresholds except the elite threshold:

| Grade | Volume ratio | Rank ratio |
| --- | ---: | ---: |
| Elite | ≥ 1.15 | ≥ 1.50 |
| Green | ≥ 1.05 | ≥ 1.05 |
| Yellow | ≥ 0.90 | ≥ 0.90 |
| Orange | ≥ 0.75 | ≥ 0.75 |
| Red | ≥ 0.50 | ≥ 0.50 |
| Critical | < 0.50 | < 0.50 |

Categorical factors retain their existing mappings and emit only green, yellow, orange,
red, or unknown; they do not emit elite or critical.

These cut-points are the one genuinely tunable part of the model, and they must live in
configuration rather than code so they can be recalibrated each season against the prior
year's outcomes.

### 1.2 Quarterback factors

Benchmarks from `QB Stats Avg.PNG`. The per-game and per-season (paced) figures are two
views of the same target, so the engine stores per-game and derives the season pace by
multiplying by 17.

**Volume factors** (4):

| Factor | Per-game benchmark | Paced (17 g) |
| --- | --- | --- |
| Pass attempts | 33.91 | 576.50 |
| Passing TDs | 2.63 | 44.63 |
| Rush attempts | 5.74 | 97.62 |
| Rushing TDs | 0.32 | 5.36 |

**Situational/profile factors** (8), all rank-based except deep-ball and red-zone volume:

| Factor | Benchmark | Direction |
| --- | --- | --- |
| Offensive rank in PPG | 6.35 | lower better |
| Offensive line rank in pass blocking (proxy) | 11.485 | lower better |
| Deep ball attempts per game | 4.397 | higher better |
| Rank in QBR | 6.90 | lower better |
| Red zone combined attempts | 6.848 | higher better |
| Rank in neutral pace | 12.697 | lower better |
| Pass EPA rank (proxy) | 5.03 | lower better |
| Injury concern | categorical | lower better |

The elite-QB archetype this encodes is worth stating plainly, because it should drive copy
in the UI: the profile that wins leagues at QB is a **rushing quarterback on a
fast-paced, efficient offense**. `QB 2025 League Winners.PNG` makes the point almost
comically well — Josh Allen posted *red* grades for both pass attempts (27.10) and passing
TDs (1.47), well below the benchmarks, yet finished as the year's best fantasy QB on the
strength of green rushing volume (6.59 attempts, 0.82 TDs per game). Rushing production is
the load-bearing factor, and the model should not let strong passing volume alone produce a
green-heavy QB profile.

The shipped factor list deliberately excludes `ADP`: market price belongs in the separate
`ValueScore`, not in `CeilingScore`. The twelfth QB factor is injury concern. Pass-offense
efficiency is sourced as team **pass EPA/play rank** (`pass_epa_rank`), a free nflverse
proxy — not opponent-adjusted DVOA. Current ceiling coverage is 12/12.

### 1.3 Wide receiver factors

Benchmarks from `WR Scoring Avgs.PNG`.

**Volume factors** (6):

| Factor | Per-game benchmark | Paced (17 g) |
| --- | --- | --- |
| Targets | 10.70 | 181.97 |
| Receptions | 7.21 | 122.49 |
| Yards per catch | 13.772 | — |
| YAC per reception | 4.773 | — |
| Target share | 29.9% | — |
| Touchdowns | 0.76 | 12.89 |

**Situational factors** (9):

| Factor | Benchmark | Direction |
| --- | --- | --- |
| Offensive rank in PPG | 8.94 | lower better |
| Quarterback QBR rank (proxy) | 21.545 | lower better |
| Team pass attempts | 594.94 | higher better |
| Route participation | 90.781% | higher better |
| Highest targeted secondary option | 103.31 | see below |
| Offensive line rank in pass blocking (proxy) | 13.697 | lower better |
| Rank in neutral pace | 15.727 | lower better |
| Yards per route run (proxy) | 2.739 | higher better |
| Catch percentage (NGS proxy) | 68.864% | higher better |

**Profile factors** (2): `Archetype` and `Injury/Suspension Concern`. These appear as graded
rows in `WR ADP #1-9.PNG` — the source images use legacy Prime WR1 / Trusty Veteran labels;
the shipped engine grades the archetype row per §2.2 (`ELITE` elite, Breakout orange,
Trusty Veteran green, etc.). Together these bring WR to 17 configured and known factors.

"Highest targeted secondary option" is the target volume of the *next* most-targeted
receiver on the team, and it is graded as `More` / `Same` / `Less` rather than by ratio —
`WR ADP #1-9.PNG` shows Ja'Marr Chase and Puka Nacua red with `More`, Jaxon Smith-Njigba
orange with `Less`. Lower competition for targets is better, so `Less` grades green and
`More` grades red. The engine needs this factor's comparator inverted relative to the
naive reading of the benchmark number.

### 1.4 Tight end factors

Benchmarks from `TE Avg Scoring.PNG`.

**Volume factors** (3): targets 8.10/g (137.67 paced), receptions 5.71/g (97.02),
touchdowns 0.56/g (9.49).

**Situational factors** (9):

| Factor | Benchmark | Direction |
| --- | --- | --- |
| Offensive rank in PPG | 11.78 | lower better |
| Quarterback's rank in QBR | 9.70 | lower better |
| Rank in team pass attempts | 11.81 | lower better |
| Rank in team targets | 1.43 | lower better |
| Rank in receiving touchdowns | 1.38 | lower better |
| Route participation | 79.8% | higher better |
| Yards per route run (proxy) | 1.956 | higher better |
| Offensive line rank in pass blocking (proxy) | 14.667 | lower better |
| Rank in neutral pace | 14.667 | lower better |

**Profile factor** (1): `Injury/Age Concern`, graded in `TE ADPs #1-8.PNG` as `Minimal
Concerns` / `Some Concern` / `Concerned`. YPRR is the same participation proxy as WR
(`yprr`, higher-better rate). In-line % is not a live factor (no honest free alignment
proxy). All 13 configured TE factors are currently sourced.

The TE position has the sharpest, most usable signal of any position, and the annotations in
`TE Avg Scoring.PNG` state it directly: of the 37 league-winning TE seasons studied, only
2 were not their team's first or second target, only 2 were not first or second in team
receiving TDs, and 29 of 37 lined up in-line on under 50% of their snaps. Route
participation averaged 79.8%.

That is close to a hard gate rather than a soft weighting. The engine should treat it as
one: a TE who is neither the first nor second target on their own team should be capped in
the rankings regardless of the rest of their profile, and the UI should say so
("fails the target-share gate") rather than silently ranking them low. Note the corollary
in the same annotation — the 4 TEs who cleared with sub-70% route participation were *all*
touchdown-dependent, which is the least stable production source in fantasy football, so
those profiles should carry a volatility flag.

The historical in-line finding is still worth stating in copy, even though `inline_pct` is
not a scored factor: a *lower* in-line rate meant the TE was deployed as a receiver in the
slot or out wide rather than as a blocker. `TE League Winners 2025-2024.PNG` shows Trey
McBride at 28.0% and Brock Bowers at 30.5% in-line, versus George Kittle at 57.0%.

### 1.5 Running back factors

RB is no longer provisional. DraftLab configures 16 factors from FSE's 40-league-winner
cohort and public nflverse-derived proxies.

**Volume factors** (5): touches per game (21.5), rush attempts per game (17.3), targets per
game (5.4), receptions per game (3.874), and touchdowns per game (0.98).

**Situational factors** (9): offensive PPG rank (9.5), OL run-block rank proxy (12.97),
yards per carry (4.859), yards per touch (5.606), team wins (9.848), red-zone touch share
(40.0%), snap share (71.7%), goal-line carry share (66.4%), and neutral run rate (43.5%).

**Profile factors** (2): `Archetype` and `Injury Concern`.

All 16 RB factors are currently sourced, so the raw range is −80…80.

### 1.5.1 Versioning future benchmark changes

Benchmarks remain configuration rather than scoring code so future seasons can be updated
without changing the grading pipeline. Three requirements follow:

**Benchmarks live in versioned configuration, not code.** A per-position, per-season table of
factor definitions with their benchmark values, comparison direction, and grading bands (the
cut-points in §1.1). Recalibrating any position next season means editing values rather than
shipping a scoring-code change.

**The factor set is position-parameterised.** The grading pipeline takes each position's
factor definitions as data and iterates, so neither the factor count nor names are hardcoded.

**Confidence is derived from each position's configured factor count.** This lets missing
inputs surface as unknown without special-casing a position or silently rewarding incomplete
coverage.

### 1.6 Board display

The player board shows **raw** `CeilingScore` with no `/60` (or any position-max denominator).
Green styling marks the **top 5 raw ceilings at that position** (ties at the cutoff included;
provisional rows excluded). A **SCORE** column shows `DraftScore` (or contextual score when
present). **CONF** is `known / configured` using that position's catalog size (QB 12, RB 16,
TE 13, WR 17), not a hardcoded 12.

---

## 2. Career-Stage Archetypes

Both the RB and WR studies bucket players by age and experience and then measure how each
bucket actually performed. DraftLab replaces the old positional top-12 breakout gate and the
WR1/RB1 vs WR2 label split with a shared **top-5 / top-8 / top-12 at-position finish ladder**.
Finish counts come from season-total fantasy points (full PPR) at the player's fantasy
position. Nested ranks: top-5 ⊆ top-8 ⊆ top-12 for the same season window.

```ts
type ArchetypeId =
  | 'BREAKOUT_CANDIDATE'
  | 'PROVEN_BREAKOUT_CANDIDATE' // UI may shorten to "Proven"
  | 'ELITE'
  | 'IN_THEIR_PRIME'
  | 'TRUSTY_VETERAN'
  | 'VETERAN';
```

**Removed:** `PRIME_WR1`, `PRIME_WR2`, `PRIME_RB1`, `PRIME_RB2` and any volume blend on
those labels.

Helper: `overHalf(count, seasons) => count > seasons / 2` (e.g. 8 seasons → need ≥5 finishes).

### 2.1 Classification rules

Evaluate **in order 1→7**; first match wins. RB / WR / TE share the same ladder; QB uses
rules 1–5 and 7 unchanged, with a narrower veteran gate (age ≥ 34 only — not
`seasonsInLeague ≥ 7`).

| # | Rule (RB / WR / TE) | Archetype |
| --- | --- | --- |
| 1 | `seasonsInLeague ≤ 3` **and** top-5 finishes `= 0` | `BREAKOUT_CANDIDATE` |
| 2 | `seasonsInLeague ≤ 3` **and** top-5 finishes `= 1` | `PROVEN_BREAKOUT_CANDIDATE` |
| 3 | `seasonsInLeague ≤ 4` **and** top-5 finishes `≥ 2` | `ELITE` |
| 4 | `seasonsInLeague > 4` **and** `overHalf(top8, seasons)` | `ELITE` |
| 5 | `seasonsInLeague > 4` **and** `overHalf(top12, seasons)` | `TRUSTY_VETERAN` |
| 6 | (`seasonsInLeague ≥ 7` **or** `age ≥ 28`) — missed 4 and 5 | `VETERAN` |
| 7 | Else | `IN_THEIR_PRIME` |

**QB rule 6:** `age ≥ 34` if rules 4–5 did not match → `VETERAN`. Rules 4–5 can keep mid-career
QBs `ELITE` / `TRUSTY_VETERAN` without waiting for age 34 (e.g. Allen with 7 top-8s in 8
seasons → `ELITE`).

Load-bearing gaps (do not relax without evidence):

- Year 5–6 with 2× top-5 but failing half-rates → usually `IN_THEIR_PRIME` (not `ELITE`).
- `ELITE` **can** persist past year 6/7 while the top-8 half-rate holds.
- Young players hit rules 1–2 before age-based veteran rules.

The source spreadsheets in `public/stats/` still show the older Prime WR1 / Prime WR2 labels
from the original study; the shipped engine uses this ladder instead.

### 2.2 Ceiling factor grades (archetype row)

The archetype row on the ceiling board maps categorically to the six-band weights. `ELITE` is
the deliberate exception to "categoricals never emit elite":

| Archetype | Factor grade | Weight |
| --- | --- | ---: |
| `ELITE` | elite | +5 |
| `PROVEN_BREAKOUT_CANDIDATE` | green | +3 |
| `TRUSTY_VETERAN` | green | +3 |
| `IN_THEIR_PRIME` | yellow | +1 |
| `BREAKOUT_CANDIDATE` | orange | −1 |
| `VETERAN` | red | −3 |

Aging cliff on the ceiling row: `ELITE` (+5) → `TRUSTY_VETERAN` (+3), not +5 → +1.

### 2.3 Historical outcome rates (interim)

Until a dedicated study exists for the new buckets, **ArchetypeEV reuses provisional rates**
mapped from the legacy tables below. Flag these as interim in UI copy where rates are cited.

| New bucket | Interim rates source |
| --- | --- |
| `ELITE` | WR: former Prime WR1 table; RB: former prime RB table; QB/TE: neutral |
| `PROVEN_BREAKOUT_CANDIDATE` | Existing breakout tables (same as prior "proven" interim) |
| `BREAKOUT_CANDIDATE` | Existing breakout tables (RB/WR); neutral for QB/TE |
| `IN_THEIR_PRIME` | WR: former Prime WR2; RB: former prime RB2; QB/TE: neutral |
| `TRUSTY_VETERAN` | Existing trusty veteran tables (RB/WR); neutral for QB/TE |
| `VETERAN` | Provisional: trusty rates with `injuryRate + 0.05`, `boomRate − 0.05` (clamped) |

**Running backs** — 220 RBs drafted in the top 20 of ADP since 2015, from
`RB Player Type Stats since 2015.PNG` (legacy bucket names):

| Bucket | Returned on ADP | Got injured | Boomed | Busted | Fine |
| --- | --- | --- | --- | --- | --- |
| Breakout Candidates | 42.86% | 17.86% | 19.64% | 19.64% | 19.64% |
| Trusty Veterans | 33.33% | 21.67% | 20.00% | 16.67% | 28.33% |
| RBs in their Prime | 46.15% | 15.38% | 27.88% | 20.19% | 18.27% |

**Wide receivers** — 180 WRs drafted in the top 36 WRs of ADP since 2020, from
`WR Top 36 of ADP since 2020.PNG` (legacy bucket names):

| Bucket | Returned on ADP | Got injured | Boomed | Busted | Fine |
| --- | --- | --- | --- | --- | --- |
| Breakout Candidates | 27.27% | 15.91% | 18.18% | 29.55% | 27.27% |
| Trusty Veterans | 27.78% | 30.56% | 8.33% | 16.67% | 25.00% |
| Prime WR1s (→ `ELITE` interim) | 53.52% | 11.27% | 33.80% | 12.68% | 22.54% |
| Prime WR2s (→ `IN_THEIR_PRIME` interim) | 37.90% | 13.80% | 31.00% | 31.00% | 17.20% |

Three conclusions the app should state outright (from the legacy WR/RB studies, mapped to
today's buckets):

**`ELITE` (interim Prime WR1 rates) is the most reliable asset class in fantasy football.**
53.52% return, 12.68% bust, 11.27% injured — no other legacy cell comes close.

**Trusty Veteran WRs are the worst bet in either table** (8.33% boom, 30.56% injured). Apply
the age penalty harder at WR than at RB.

**Breakout Candidate WRs bust more than they boom** (29.55% vs 18.18%); young RB upside is
stronger (42.86% return, break-even boom/bust).

### 2.4 Using the rates

```
ArchetypeEV = 2·P(boom) + 1·P(return) + 0·P(fine) − 1·P(bust) − 1.5·P(injury)
```

The injury coefficient exceeds the bust coefficient because an injured pick costs a roster
spot and the waiver capital to replace it, not just the points. Using interim `ELITE` WR
rates: roughly `0.676 + 0.535 − 0.127 − 0.169 = +0.915` vs Trusty Veteran WR
`0.167 + 0.278 − 0.167 − 0.458 = −0.180` — over a full point of EV, or roughly a round of
draft value, derived from finish history and age.

---

## 3. Injury Risk Model

`RB Avg Games Missed.PNG` provides an eleven-year base rate for the top 20 RBs in ADP:

| Year | Avg games missed | Serious injury chance |
| --- | --- | --- |
| 2025 | 1.45 | 15% |
| 2024 | 2.25 | 15% |
| 2023 | 3.00 | 20% |
| 2022 | 1.90 | 10% |
| 2021 | 3.75 | 20% |
| 2020 | 4.00 | 20% |
| 2019 | 1.90 | 10% |
| 2018 | 2.95 | 15% |
| 2017 | 2.35 | 15% |
| 2016 | 4.05 | 30% |
| 2015 | 3.85 | 35% |
| **Average** | **2.86** | **19.00%** |

Two things to take from this. First, the correct prior for an early-round RB is that he
misses about 3 games, not zero — so any projection the app displays should be a
games-adjusted total, and the default season length assumption for an RB1 should be roughly
14 games rather than 17. Second, the trend is real and downward: the 2015–2017 window
averaged 3.42 games missed and 26.7% serious injury risk, while 2023–2025 averaged 2.23 and
16.7%. Weighting recent seasons more heavily is defensible. The engine should expose the
weighting scheme rather than hard-coding a single blended number, and the "RB injury
apocalypse" framing common in fantasy content is not supported by the last three years of
this data.

`2025 RB Results.PNG` supplies the per-player ground truth that lets this be validated
rather than assumed — Bucky Irving missed 7 games, Omarion Hampton 8, Alvin Kamara 6, all
three bucketed `Injured`, against a top-20 average of 1.45. The distribution is heavily
skewed: most RBs miss almost nothing and a few miss half the year. A mean-based projection
will therefore mislead, and the UI should show a distribution or at minimum a
"games missed" range rather than a single expected value.

Composite risk score, 0 (safest) to 100 (riskiest):

```
RiskProfile = 100 · (
    0.40 · normalisedCareerGamesMissedRate
  + 0.25 · P(injury | archetype)          // from the §2.2 tables
  + 0.20 · ageCurvePenalty                // position-specific
  + 0.15 · recentSeriousInjuryFlag        // ACL, Achilles, Lisfranc, repeat soft-tissue
)
```

The age curve penalty must be position-specific and, per §2.2, should ramp *earlier and
harder for WRs* than the folklore suggests. Concrete starting points, to be recalibrated:
RB penalty begins at 26 and steepens past 28; WR penalty begins at 28 and steepens past 30;
TE begins at 30; QB begins at 34.

---

## 4. Market Value and Arbitrage

The four `FSE vs ESPN Rankings` images are the app's value engine. Each row carries a
`FSE Combined Rank`, an `ESPN Projections` rank, a signed `Difference (FSE vs ESPN)`, and a
`Multi Site Round by Round ADP` expressed in round.pick notation (`3.04` = round 3, pick 4).

A negative difference means FSE ranks the player better than ESPN does. The colour coding in
the source images treats large negative differences as green (opportunity) and large
positive differences as red (overpriced), which gives a clean definition:

```
ValueScore = clamp(-100, 100,  (adpOverallPick − blendedRank) · scalingFactor )
```

where `blendedRank` is a weighted combination of the available ranking sources and
`adpOverallPick` is the round.pick ADP converted to an absolute pick number
(`(round − 1) · teamCount + pick`). Note the conversion depends on league size, so a 10-team
league and a 14-team league produce genuinely different value calls from the same ADP — the
app must recompute rather than caching one number.

The largest disagreements in the current data are where the app earns its keep:

| Player | Pos | FSE rank | ESPN rank | Difference | ADP |
| --- | --- | --- | --- | --- | --- |
| Oronde Gadsden II | TE | 128 | 258 | -130 | 13.10 |
| Cam Ward | QB | 148.5 | 219 | -70.5 | 15.03 |
| Chig Okonkwo | TE | 151 | 216 | -65 | 14.05 |
| Sam Darnold | QB | 146.5 | 218 | -71.5 | 14.08 |
| Brenton Strange | TE | 150.5 | 194 | -43.5 | 12.12 |
| Jaylen Warren | RB | 66 | 96 | -30 | 7.04 |
| Mike Evans | WR | 47 | 76 | -29 | 6.01 |
| Jonathon Brooks | RB | 78 | 107 | -29 | 9.12 |
| Brian Thomas Jr. | WR | 55.5 | 81 | -25.5 | 6.09 |
| Tucker Kraft | TE | 77.5 | 103 | -25.5 | 7.10 |
| Hunter Henry | TE | 167 | 120 | +47 | 12.02 |
| Dallas Goedert | TE | 147.5 | 104 | +43.5 | 10.03 |
| T.J. Hockenson | TE | 175 | 112 | +63 | 14.06 |
| Matthew Golden | WR | 127 | 79 | +48 | 10.06 |
| Jakobi Meyers | WR | 128 | 88 | +40 | 8.08 |

A caution the UI should encode: a large negative difference is a *disagreement*, not
automatically a discount. ESPN being 130 spots lower on Oronde Gadsden II than FSE could
mean ESPN is stale, or it could mean FSE is wrong. What makes it actionable is the
combination of a favourable difference **and** a strong `CeilingScore` **and** an ADP that
lets you get him late. Gadsden's TE `CeilingScore` of 24 at a 13.10 ADP is the profile of a
genuine late-round swing; Hunter Henry's `CeilingScore` of 6 with a +47 difference at 12.02
is a player to avoid. The app should surface value and ceiling together, never value alone,
or it will happily recommend cheap bad players.

`RB VORP Rankings.PNG` supplies 2025 value-over-replacement figures (McCaffrey 335, Bijan
Robinson 294, Jonathan Taylor 286) with games played alongside, which is the right basis for
the auction-league dollar-value model in `03-league-integrations.md`, since VORP maps far
more naturally to auction dollars than rank does.

---

## 5. Composite Draft Score

```
DraftScore =
    0.40 · normalise(CeilingScore)     // situation and volume profile
  + 0.25 · normalise(ArchetypeEV)      // career-stage expected value
  + 0.20 · normalise(ValueScore)       // market arbitrage
  + 0.15 · (100 − RiskProfile)         // durability
```

Then, during a live draft, the score is modified by roster context (see
`04-live-draft-team-builder.md`) and by the user's chosen strategy (see
`02-draft-strategy-engine.md`). The base `DraftScore` is strategy-agnostic and cached; the
contextual adjustments are computed per pick.

The weights must be user-adjustable. A dynasty player should be able to push archetype
weight up and value weight down; a win-now redraft player does the reverse. Exposing the
four sliders and showing the board reorder live is both a better product and an honest
admission that these weights are a judgement call rather than a discovered truth.

---

## 6. Data Requirements

To compute the above, the ingest layer needs the following per player-season, and the
absence of any of these is what forces the `unknown` grade discussed in §1:

- **Volume**: attempts, targets, receptions, TDs, snap counts, route counts, red zone and
  goal-line usage
- **Efficiency**: yards per route run, QBR, DVOA, PFF grades, Reception Perception
  percentile
- **Team context**: offensive PPG rank, pace rank, pass/run rate, offensive line pass- and
  run-blocking ranks, team pass attempts, teammate target competition
- **Biographical**: age, seasons in league, draft year, positional finish history
- **Injury**: per-season games missed, injury type and severity, current designation
- **Market**: multi-site ADP by round and pick, ESPN projection rank, FSE combined rank,
  auction values

Candidate sources, all of which need licence review before the build starts: `nflverse` /
`nflfastR` public play-by-play and roster data for volume and biographical fields, Sleeper's
public API for ADP and player metadata, and manual or licensed feeds for PFF, DVOA, and
Reception Perception. The ESPN projection ranks in the value model come from the collected
research in `public/stats/` rather than any API, so they are unaffected by the decision not to
integrate with ESPN. The
proprietary efficiency metrics are the hard dependency, and the plan should assume they
start as a manually maintained seasonal CSV import rather than a live feed.
