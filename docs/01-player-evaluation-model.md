# Player Evaluation Model

This document reverse-engineers the evaluation methodology already present in
`public/stats/` into a deterministic, implementable scoring engine. Every rule below
traces back to a specific artifact in that folder, cited inline.

The engine produces four independent outputs per player, which are then blended into a
single `DraftScore`:

| Output | Range | What it answers |
| --- | --- | --- |
| `CeilingScore` | -36 … 60 | How good is this player's situation and volume profile? |
| `Archetype` | enum | What kind of career-stage bet am I making? |
| `RiskProfile` | 0 … 100 | How likely is this pick to be derailed by injury? |
| `ValueScore` | -100 … 100 | Is the market price a discount or a premium? |

Keeping them separate matters: two players can share a `CeilingScore` of 36 while one is a
23-year-old Prime WR1 at a discount and the other is a 31-year-old Trusty Veteran going a
round early. The UI must always be able to show *why* a player ranks where they do.

---

## 1. The Factor Scoring Rubric

The spreadsheets grade every player against a fixed set of factors, colour-coding each
factor and summing weighted points. From `QBs Scoring Factors.PNG`,
`WR #1-9 Scoring Factors.PNG`, and `TE Scoring Factors.PNG`, the legend is explicit:

| Grade | Weight |
| --- | --- |
| Green | +5 |
| Yellow | +3 |
| Orange | -1 |
| Red | -3 |

The sheets label the resulting total "Legendary" for QB/TE and "Ceiling" for WR/TE. It is
the same number; this project standardises on **`CeilingScore`**.

The formula is confirmed by three independent spot-checks against the source images:

- **Josh Allen (QB1)** — 7 green, 3 yellow, 0 orange, 1 red → `35 + 9 + 0 - 3 = 41`,
  matching the 41 printed in `QBs Scoring Factors.PNG`.
- **Ja'Marr Chase (WR1)** — 9 green, 1 yellow, 0 orange, 2 red → `45 + 3 + 0 - 6 = 42`,
  matching `WR #1-9 Scoring Factors.PNG`.
- **Brock Bowers (TE1)** — 8 green, 1 yellow, 1 orange, 2 red → `40 + 3 - 1 - 6 = 36`,
  matching `TE Scoring Factors.PNG`.

Every position grades exactly **12 factors**, so the scale is directly comparable across
positions without normalisation: a perfect score is **60**, a floor is **-36**.

```ts
type FactorGrade = 'green' | 'yellow' | 'orange' | 'red' | 'unknown';

const GRADE_WEIGHTS: Record<FactorGrade, number> = {
  green: 5,
  yellow: 3,
  orange: -1,
  red: -3,
  unknown: 0,
};
```

`unknown` deserves explanation. The source sheets use `?` liberally — see the `?` cells for
Lamar Jackson's passing TDs in `QBs ADP #1-8.PNG` — for players whose situation has not
resolved yet (new offensive coordinator, unsettled depth chart, rookie with no NFL usage).
Scoring these as zero rather than guessing is the honest choice, but the UI must surface
the count of unknowns, because a `CeilingScore` of 30 built on 12 known factors is a much
firmer projection than a 30 built on 7 known factors and 5 unknowns. Each player therefore
carries a **`ConfidenceScore`** = `knownFactors / 12`.

### 1.1 Grading a factor

Each factor is graded by comparing the player's value against a positional benchmark. The
benchmarks are not arbitrary — they are the **average profile of players who actually won
leagues at that position**, which is exactly what the "Average" and "Paced Average" columns
in `QB Stats Avg.PNG`, `WR Scoring Avgs.PNG`, and `TE Avg Scoring.PNG` contain.

Grading bands, expressed as a ratio of the player's value to the benchmark (inverted for
rank-type factors, where lower is better):

| Band | Ratio to benchmark | Grade |
| --- | --- | --- |
| Clears the elite bar comfortably | ≥ 1.05 | green |
| Meets the bar | 0.90 – 1.05 | yellow |
| Slightly short | 0.75 – 0.90 | orange |
| Well short | < 0.75 | red |

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

**Situational factors** (8), all rank-based except deep-ball and red-zone volume:

| Factor | Benchmark | Direction |
| --- | --- | --- |
| Offensive rank in PPG | 6.35 | lower better |
| Offensive line rank in pass blocking | 11.54 | lower better |
| Deep ball attempts per game | 4.31 | higher better |
| Rank in QBR | 6.90 | lower better |
| Red zone combined attempts | 6.30 | higher better |
| ADP | 8.22 | lower better |
| Rank in neutral pace | 12.86 | lower better |
| Rank in pass offense DVOA | 7.01 | lower better |

The elite-QB archetype this encodes is worth stating plainly, because it should drive copy
in the UI: the profile that wins leagues at QB is a **rushing quarterback on a
fast-paced, efficient offense**. `QB 2025 League Winners.PNG` makes the point almost
comically well — Josh Allen posted *red* grades for both pass attempts (27.10) and passing
TDs (1.47), well below the benchmarks, yet finished as the year's best fantasy QB on the
strength of green rushing volume (6.59 attempts, 0.82 TDs per game). Rushing production is
the load-bearing factor, and the model should not let strong passing volume alone produce a
green-heavy QB profile.

Note also that `ADP` is itself one of the twelve factors. This is deliberate in the source
sheets but creates a subtle coupling: `CeilingScore` is not fully independent of market
price. Section 4 keeps a separate, cleaner `ValueScore`, and the UI should offer a toggle to
compute `CeilingScore` with ADP excluded (an 11-factor, max-55 variant) for users who want
pure talent-and-situation ranking.

### 1.3 Wide receiver factors

Benchmarks from `WR Scoring Avgs.PNG`.

**Volume factors** (3):

| Factor | Per-game benchmark | Paced (17 g) |
| --- | --- | --- |
| Targets | 10.70 | 181.97 |
| Receptions | 7.21 | 122.49 |
| Touchdowns | 0.76 | 12.89 |

**Situational factors** (7):

| Factor | Benchmark | Direction |
| --- | --- | --- |
| Offensive rank in PPG | 8.94 | lower better |
| Quarterback's rank in PFF passing grade | 10.36 | lower better |
| Team pass attempts | 594.94 | higher better |
| Highest targeted secondary option | 103.31 | see below |
| Offensive line rank in pass blocking | 10.75 | lower better |
| Yards per route run | 4.81 | higher better |
| Highest percentile achieved in Reception Perception | 90th | higher better |

**Profile factors** (2): `Archetype` and `Injury/Suspension Concern`. These appear as graded
rows in `WR ADP #1-9.PNG` — archetype cells are green for Prime WR1 and red for Trusty
Veteran, and the concern row is graded `Minimal Concern` (green) / `Some Concern` (yellow) /
worse. This is what brings WR to 12 factors.

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

**Situational factors** (8):

| Factor | Benchmark | Direction |
| --- | --- | --- |
| Offensive rank in PPG | 11.78 | lower better |
| Quarterback's rank in QBR | 9.70 | lower better |
| Rank in team pass attempts | 11.81 | lower better |
| Rank in team targets | 1.43 | lower better |
| Rank in receiving touchdowns | 1.38 | lower better |
| Route participation | 79.8% | higher better |
| In-line % | 39.0% | lower better |
| Rank in yards per route run | 5.14 | lower better |

**Profile factor** (1): `Injury/Age Concern`, graded in `TE ADPs #1-8.PNG` as `Minimal
Concerns` / `Some Concern` / `Concerned`.

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

The in-line percentage direction is counterintuitive and worth a tooltip: a *lower* in-line
rate is better because it means the TE is being deployed as a receiver in the slot or out
wide rather than as a blocker. `TE League Winners 2025-2024.PNG` shows Trey McBride at 28.0%
and Brock Bowers at 30.5% in-line, versus George Kittle at 57.0%.

### 1.5 Running back factors — a gap to close

The RB artifacts take a different analytical route than the other three positions. There is
no `RB Scoring Factors.PNG`; instead the RB folder supplies archetype bucket hit-rates
(`RB Player Type Stats since 2015.PNG`), a VORP leaderboard (`RB VORP Rankings.PNG`),
injury base rates (`RB Avg Games Missed.PNG`), and a season-outcome audit
(`2025 RB Results.PNG`).

This is a real inconsistency in the source material rather than an oversight on my part to
paper over.

**Decision: running backs ship provisional.** The RB benchmarks do not exist yet and will be
supplied later. Until they arrive, the RB board runs on `ArchetypeEV` + VORP + `RiskProfile`,
and RB rows display **no `CeilingScore` at all** rather than a computed-looking number — a
dash and a `provisional` marker, as in the
[player board mock](https://www.figma.com/design/nNpEDXUHuMGap5CL9kXT4Z?node-id=20-341).

Showing a number that looks as authoritative as Ja'Marr Chase's verified 42 while resting on
invented benchmarks would be the fastest possible way to make this tool untrustworthy, and it
would be undetectable to the user. A visible gap is the honest representation, and it has a
useful side effect: it makes the missing data obvious to whoever is looking at the board,
rather than letting a placeholder quietly harden into an assumption.

### 1.5.1 Designing for the benchmarks arriving later

Because the benchmarks are expected rather than hypothetical, the engine should be built so
that adding them is a configuration change and not a code change. Three requirements follow:

**Benchmarks live in versioned configuration, not code.** A per-position, per-season table of
factor definitions with their benchmark values, comparison direction, and grading bands (the
cut-points in §1.1). Adding RB means adding one entry, and recalibrating QB/WR/TE next season
means editing values rather than shipping a release.

**The factor set is position-parameterised from the start.** The grading pipeline should take
the twelve factors as data and iterate, so nothing about the number twelve or the specific
factor names is hardcoded. The QB, WR and TE tables prove the shape; RB slots into it.

**RB carries `ConfidenceScore` 0 until it lands.** The confidence mechanism in §1 already
expresses exactly this state — factors whose values are not known — so RB needs no special
case in the model, only in the UI copy that explains why.

Proposed RB factor set, for when the data is available, mirroring the volume + situational +
profile structure of the other three positions: touches per game, rush attempts per game,
targets per game and total touchdowns per game for volume; offensive rank in PPG, offensive
line rank in run blocking, red zone touch share, snap share, goal-line carry share and team
neutral-situation run rate for situational; archetype and injury concern for profile. That is
twelve, keeping the -36…60 scale directly comparable across all four positions. It is a
proposal to check against the research rather than a specification — the benchmark values are
what matter, and they should come from the same outcome-derived method as the others: the
average profile of running backs who actually won leagues.

---

## 2. Career-Stage Archetypes

Both the RB and WR studies bucket players by age and experience and then measure how each
bucket actually performed. This is the most decision-relevant data in the entire folder,
because it converts "is this player old?" into a probability distribution over outcomes.

### 2.1 Classification rules

From `Player Type Breakdown.PNG`, verbatim for RBs:

| Archetype | Rule |
| --- | --- |
| Breakout Candidate | Year 3 or younger without any RB1 finishes (can happen multiple times) |
| Trusty Veteran | Either in Year 7+ **or** 27+ years old |
| RB in their Prime | Under age 27 **and/or** has an RB1 finish already |

These rules overlap, which the source acknowledges with "and/or". Precedence must be fixed
in code to make classification deterministic; evaluate in this order:

```ts
function classifyRb(p: Player): RbArchetype {
  if (p.seasonsInLeague <= 3 && !p.hasPositionalTop12Finish) return 'BREAKOUT_CANDIDATE';
  if (p.seasonsInLeague >= 7 || p.age >= 27)                 return 'TRUSTY_VETERAN';
  return 'IN_THEIR_PRIME';
}
```

Breakout-candidate status is checked first because the rule explicitly permits a player to
re-enter that bucket in consecutive seasons, and a Year-3 RB with no RB1 finish is a
different bet than a Year-3 RB who already broke out.

The WR study uses four buckets — `Breakout Candidate`, `Trusty Veteran`, `Prime WR1`, and
`Prime WR2` — splitting "prime" by whether the player is his team's clear number one
target. `WR #28-36 Scoring Factors.PNG` shows the split in use (Christian Watson as Prime
WR2, Brian Thomas as Prime WR1). The archetype rows across the WR factor images also show
this bucket being graded as a factor: Prime WR1 green, Breakout Candidate yellow/orange,
Trusty Veteran red.

### 2.2 Historical outcome rates

**Running backs** — 220 RBs drafted in the top 20 of ADP since 2015, from
`RB Player Type Stats since 2015.PNG`:

| Bucket | Returned on ADP | Got injured | Boomed (18+ PPG or beat ADP by 10) | Busted (lost 10+) | Fine (lost 1–9) |
| --- | --- | --- | --- | --- | --- |
| Breakout Candidates | 42.86% | 17.86% | 19.64% | 19.64% | 19.64% |
| Trusty Veterans | 33.33% | 21.67% | 20.00% | 16.67% | 28.33% |
| RBs in their Prime | 46.15% | 15.38% | 27.88% | 20.19% | 18.27% |
| All RBs | 41.82% | 17.73% | 24.09% | 19.09% | 21.36% |

`RB Simplified Player Stats since 2015.PNG` collapses this to Crushed / Hit / Missed and is
the cleaner version for a UI summary: Prime RBs crushed 27.88% and hit 46.15%, versus
Trusty Veterans at 20.00% crushed and 33.33% hit.

**Wide receivers** — 180 WRs drafted in the top 36 WRs of ADP since 2020, from
`WR Top 36 of ADP since 2020.PNG`:

| Bucket | Returned on ADP (17+ PPR PPG) | Got injured | Boomed (18+ or beat ADP by 10) | Busted (lost 12+) | Fine (lost 1–11) |
| --- | --- | --- | --- | --- | --- |
| Breakout Candidates | 27.27% | 15.91% | 18.18% | 29.55% | 27.27% |
| Trusty Veterans | 27.78% | 30.56% | 8.33% | 16.67% | 25.00% |
| Prime WR1s | 53.52% | 11.27% | 33.80% | 12.68% | 22.54% |
| Prime WR2s | 37.90% | 13.80% | 31.00% | 31.00% | 17.20% |
| Averages | 39.44% | 16.67% | 23.33% | 20.56% | 23.33% |

Three conclusions the app should state outright rather than leaving the user to infer:

**Prime WR1s are the most reliable asset class in fantasy football.** A 53.52% return rate
with only a 12.68% bust rate and the lowest injury rate of any bucket (11.27%) is not close
to any other cell in either table. The best RB bucket returns 46.15%.

**Trusty Veteran WRs are the worst bet in either table.** An 8.33% boom rate paired with a
30.56% injury rate means you are paying an early-round price for a player who almost never
wins you the position and misses time nearly a third of the time. The gap between veteran
WRs (30.56% injured) and veteran RBs (21.67%) is large enough that the app should apply the
age penalty more aggressively at WR than at RB — which is the opposite of conventional
fantasy wisdom about running backs aging faster, and is therefore exactly the sort of
finding worth featuring prominently in the UI.

**Breakout Candidate WRs bust more than they boom** (29.55% vs 18.18%), whereas Breakout
Candidate RBs are roughly break-even (19.64% each) with a strong 42.86% return rate. Young
RB upside is real; young WR upside is a coin flip weighted against you.

### 2.3 Using the rates

Archetype rates give a genuine expected value rather than a vibes-based adjustment:

```
ArchetypeEV = 2·P(boom) + 1·P(return) + 0·P(fine) − 1·P(bust) − 1.5·P(injury)
```

The injury coefficient exceeds the bust coefficient because an injured pick costs a roster
spot and the waiver capital to replace it, not just the points. Applying this to the WR
table produces a Prime WR1 EV of roughly `0.676 + 0.535 − 0.127 − 0.169 = +0.915` against
a Trusty Veteran WR EV of roughly `0.167 + 0.278 − 0.167 − 0.458 = −0.180`, a spread of
over a full point of EV. That is a full round or more of draft value, and it is derived
entirely from age and experience.

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
