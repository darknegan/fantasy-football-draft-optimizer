# Fantasy Football Draft Optimizer — Design Plan

A real-time fantasy football draft tool that helps you plan a draft strategy in advance,
ranks the best available players at every position using age, experience, injury history, and
past performance, syncs your real leagues from Sleeper, and then guides you pick by
pick during the draft itself.

---

## Documents

| Document | Contents |
| --- | --- |
| [`01-player-evaluation-model.md`](./01-player-evaluation-model.md) | The scoring engine, reverse-engineered from the research in `public/stats/`: factor grading, career-stage archetypes, injury risk, market value, composite `DraftScore` |
| [`02-draft-strategy-engine.md`](./02-draft-strategy-engine.md) | The nine draft strategies, their tier grades, draft slot values, round-by-round positional targets, adherence and pivot logic |
| [`03-league-integrations.md`](./03-league-integrations.md) | Sleeper integration, manual league setup, scoring settings import, and support for redraft / dynasty / auction-with-contracts |
| [`04-live-draft-team-builder.md`](./04-live-draft-team-builder.md) | The flagship real-time feature: data flow, contextual re-ranking, draft room modes, failure modes |
| [`05-architecture.md`](./05-architecture.md) | Angular + PrimeNG + Node.js system design, data model, API surface, delivery phases, risks |
| [`06-design-system-and-screens.md`](./06-design-system-and-screens.md) | Design tokens, core components, and the ten-screen inventory that the Figma mocks follow |

---

## What the research in this repo already establishes

The 45 images in `public/stats/` are not loose reference material — they contain a complete,
internally consistent evaluation methodology. The most important discovery during planning was
that this methodology is fully implementable as a deterministic algorithm, with no guesswork
required for QB, WR, or TE.

**The factor scoring rubric is explicit and verifiable.** DraftLab extends the source
four-band rubric to elite +5, green +3, yellow +1, orange −1, red −3, and critical −5
(unknown 0). The original formula was confirmed against three independent players from three
different source images: Josh Allen 41, Ja'Marr Chase 42, Brock Bowers 36. Shipped scores use
position-specific known-factor ranges (`knownFactors × [−5, +5]`) and are normalised for
cross-position comparison.

**The benchmarks are outcome-derived, not opinion.** The "Average" columns are the average
profile of players who actually won leagues at each position, which is why grading against
them is meaningful rather than arbitrary.

**Career-stage archetypes convert age into probability.** The RB study (220 top-20-ADP RBs
since 2015) and WR study (180 top-36-ADP WRs since 2020) bucket players by age and experience
and report real hit, boom, bust, and injury rates per bucket. This turns "is he too old?" into
an expected-value calculation.

**Round-by-round league-winner rates give exact positional timing.** `Round League Winners.PNG`
converts strategy from preference into scheduling.

## The findings that should shape the product

Several conclusions in this data run against conventional fantasy wisdom, and they are the
most valuable things the app can tell a user. They should be surfaced prominently with their
supporting numbers rather than buried in a ranking:

**The boring strategy wins.** Balanced is the only S-tier strategy. Every committed positional
gimmick grades A or lower, and Robust RB and Double Hero WR land in C. The app should default
to Balanced and make the sharper strategies an explicit opt-in.

**`ELITE` wide receivers (interim Prime WR1 rates) are the single most reliable asset in fantasy football** — 53.52% return on ADP,
33.80% boom rate, only 12.68% bust, and the lowest injury rate in either study at 11.27%. No
other bucket at any position comes close.

**Veteran wide receivers are the worst bet in the dataset**, not veteran running backs. Trusty
Veteran WRs boom just 8.33% of the time and get injured 30.56% of the time, versus 21.67% for
veteran RBs. The age penalty should therefore be applied *harder at WR than at RB*, which
inverts the standard advice about running backs aging out first.

**The RB injury apocalypse is not in the recent data.** Top-20 RBs averaged 3.42 games missed
across 2015–2017 but only 2.23 across 2023–2025, with serious-injury rates falling from 26.7%
to 16.7%. The correct prior for an early-round RB is still about three games missed — not zero
— but the trend is clearly improving.

**Tight end is bimodal and round 4 is a dead zone.** Round 2 TEs became league-winners 43% of
the time and round 3 TEs 25%, but round 4 TEs 0%, with a second 20% spike in round 10. Either
pay early or wait; never take a TE in round 4.

**Quarterback has a hard window in rounds 3–4** (38% and 30%) and 0% in round 2. Elite
quarterback production is available in the middle rounds, so reaching earlier costs value with
no historical payoff. And per `QB 2025 League Winners.PNG`, rushing volume — not passing
volume — is the load-bearing factor: Josh Allen graded red on both pass attempts and passing
TDs in the season he finished as the best fantasy QB.

**Tight end has a near-hard qualification gate.** Of 37 league-winning TE seasons, only 2 were
not their team's first or second target and 29 of 37 lined up in-line under 50% of the time.
This is close to a filter rather than a weighting, and the engine treats it as one.

**The middle of the first round is the worst place to draft from.** Slots 1.06 and 1.07 grade
C, below the 1.08–1.11 turn picks, because turn picks let you take two players from one tier.

---

## Feature summary

**Pre-draft planning.** Choose from nine strategies with tier grades and verbatim definitions,
set your draft slot and see its tier, get a round-by-round plan annotated with historical
league-winner rates, Monte Carlo the outcome distribution, compare strategies side by side, and
build a tier cheat sheet with personal target and avoid markers.

**Comprehensive positional rankings.** Every QB, RB, WR, and TE graded on position-configured
factors covering volume, team situation, and career-stage profile, on a six-band rubric
(elite/green/yellow/orange/red/critical), producing a ceiling score, a career-stage archetype
with its historical outcome rates, an injury risk profile, and a market value delta — all
expressed in your league's own scoring.

**League sync.** Connect Sleeper with just your username and import as many of your leagues as
you like — no password, no cookies, nothing to copy. Scoring settings are parsed into a
canonical profile, validated by recomputing last season's standings, and shown back in plain
language. Leagues on other platforms are configured manually and then behave identically.
Either way, every projection, VORP figure, and ranking is denominated in your league's rules.

**All three league formats.** Redraft on the base model; dynasty with multi-year value curves,
rookie drafts, tradeable pick assets, roster age curves, and a contend/rebuild toggle; auction
with live budget tracking, VORP-derived dollar values, inflation recomputed after every bid,
max-bid calculation, nomination strategy, and configurable multi-year contract rules.

**Live Draft Team Builder.** Picks stream in during the draft, your roster updates in real
time, and recommendations continuously re-rank against your strategy plan, your actual roster
needs measured by quality gap rather than slot count, and live scarcity including in-draft
position runs. Every recommendation states its reasoning with the data behind it. When your
roster drifts far enough from your plan, the app names the strategy you are actually running
and offers to switch.

---

## Decisions made

**No ESPN integration.** ESPN publishes no official fantasy API, and reaching a user's private
league would mean sending their full account session cookies to undocumented endpoints —
cookies the user has to copy out of browser developer tools by hand. Rather than resolve the
terms-of-service question, the project is not going there. This removes the largest external
risk in the plan: an unversioned dependency that could break without notice, reached with
over-scoped credentials, behind an onboarding flow that would have lost most non-technical
users anyway. Users in ESPN leagues are served by **manual league setup**, promoted from
fallback to a first-class path. Manual leagues get the full evaluation model, strategy engine
and Live Draft Team Builder — they just do not auto-sync.

One thing this does *not* affect, since the naming invites confusion: the ESPN projection ranks
in the value model come from the research already collected by hand in `public/stats/`, not from
any API call. The FSE-versus-ESPN arbitrage signal is untouched.

**Running back ceiling scores are shipped.** Per `01-player-evaluation-model.md` §1.5, RB is
no longer provisional: DraftLab configures 16 factors from FSE's 40-league-winner cohort and
public nflverse-derived proxies, and all 16 are currently sourced (raw range −80…80).
Benchmarks remain versioned configuration, so future seasons are a config change rather than a
code change.

**Elite TE timing follows the outcome data.** The strategy definition says a "top 4-5 round
tight end anchor"; the round-by-round table says round 4 tight ends have a 0% league-winner
rate. The measurement wins over the description — the definition's "4-5 round" reads as a
characterisation of "early-ish" rather than a measured claim, while the table is an outcome
count. **The Elite TE window is rounds 2–3, and round 4 is an explicit avoid.** Two caveats the
app carries rather than hides: a 0% cell is a finite sample rather than a law, and a collapse
from 25% to 0% and back to 20% is a sharp discontinuity that is consistent with a real effect
but also with noise. Both readings give the same recommendation, so the engine applies a heavy
penalty rather than a hard block and always shows the percentage next to the warning.

## Constraints still open

**Sleeper has no WebSocket, and is now the only integration.** Its API is polling-only with a
documented budget under 1,000 calls per minute per IP — a resource shared across every user of
the app, load-bearing for the flagship feature, concentrated into a few weeks a year.
Backend-only polling, `last_picked` change detection, adaptive intervals, and a distributed rate
limiter are all required in the same phase as the draft room. With no second platform to fall
back on, manual pick entry is the only thing between a Sleeper outage and a user with no working
draft tool on draft night, so it is a requirement rather than a nicety.

**Some efficiency metrics are licensed.** PFF grades, DVOA, and Reception Perception
percentiles are load-bearing in the WR and TE factor sets and are not freely redistributable.
The realistic starting point is a manually maintained seasonal import, which is why every
player carries a confidence score reflecting how many of their position-configured factors are
actually known.

**Two source images are cropped.** Zero RB and Elite QB have definitions but no visible tier
grade, and draft slot 1.05 is missing. The app shows these as unrated rather than guessing.

---

## Mocks

All ten screens are built in Figma:
[Fantasy Football Draft Optimizer — Mocks](https://www.figma.com/design/nNpEDXUHuMGap5CL9kXT4Z).
Per-screen links are in [`06-design-system-and-screens.md`](./06-design-system-and-screens.md) §6.

The file is structured to be read as an implementation spec rather than just a picture. Colours,
spacing and radii are bound Figma variables matching the token names in that document,
typography uses named text styles, and the repeated elements that carry the model's semantics —
the factor grade cell, position badge, tier chip, archetype badge, value delta chip, player row,
sidebar and top bar — exist as variant component sets with descriptions explaining what they
encode.

## Next step

The Angular + PrimeNG implementation, following the phase sequence in
[`05-architecture.md`](./05-architecture.md) §5. Phase 1 ends with unit tests that reproduce the
three verified ceiling scores (Allen 41, Chase 42, Bowers 36) from the source spreadsheets,
which is the proof the evaluation model is faithfully implemented before anything is built on
top of it.

No open decisions block the start of that work.
