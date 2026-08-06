# Fantasy Football Draft Optimizer — Design Plan

A real-time fantasy football draft tool that helps you plan a draft strategy in advance,
ranks the best available players at every position using age, experience, injury history, and
past performance, syncs your real leagues from Sleeper and ESPN, and then guides you pick by
pick during the draft itself.

---

## Documents

| Document | Contents |
| --- | --- |
| [`01-player-evaluation-model.md`](./01-player-evaluation-model.md) | The scoring engine, reverse-engineered from the research in `public/stats/`: factor grading, career-stage archetypes, injury risk, market value, composite `DraftScore` |
| [`02-draft-strategy-engine.md`](./02-draft-strategy-engine.md) | The nine draft strategies, their tier grades, draft slot values, round-by-round positional targets, adherence and pivot logic |
| [`03-league-integrations.md`](./03-league-integrations.md) | Sleeper and ESPN integration, scoring settings import, and support for redraft / dynasty / auction-with-contracts |
| [`04-live-draft-team-builder.md`](./04-live-draft-team-builder.md) | The flagship real-time feature: data flow, contextual re-ranking, draft room modes, failure modes |
| [`05-architecture.md`](./05-architecture.md) | Angular + PrimeNG + Node.js system design, data model, API surface, delivery phases, risks |
| [`06-design-system-and-screens.md`](./06-design-system-and-screens.md) | Design tokens, core components, and the ten-screen inventory that the Figma mocks follow |

---

## What the research in this repo already establishes

The 45 images in `public/stats/` are not loose reference material — they contain a complete,
internally consistent evaluation methodology. The most important discovery during planning was
that this methodology is fully implementable as a deterministic algorithm, with no guesswork
required for QB, WR, or TE.

**The factor scoring rubric is explicit and verifiable.** Green +5, yellow +3, orange -1,
red -3, summed across exactly twelve factors per position for a -36…60 scale. The formula was
confirmed against three independent players from three different source images: Josh Allen 41,
Ja'Marr Chase 42, Brock Bowers 36. Because every position grades twelve factors, scores are
directly comparable across positions with no normalisation.

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

**Prime WR1s are the single most reliable asset in fantasy football** — 53.52% return on ADP,
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

**Comprehensive positional rankings.** Every QB, RB, WR, and TE graded on twelve factors
covering volume, team situation, and career-stage profile, producing a ceiling score, a
career-stage archetype with its historical outcome rates, an injury risk profile, and a market
value delta — all expressed in your league's own scoring.

**League sync.** Connect Sleeper by username, ESPN by session cookie with a guided flow, and
import as many leagues as you are in across both. Scoring settings are parsed into a canonical
profile, validated by recomputing last season's standings, and shown back in plain language.
Every projection, VORP figure, and ranking is then denominated in your league's rules.

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

## Constraints and risks worth knowing before build

**Running back benchmarks are missing.** QB, WR, and TE each have a full twelve-factor
benchmark set in `public/stats/`. RB does not — it has archetype rates, VORP, and injury base
rates instead. RB is arguably the most important position in a draft tool, so either those
benchmarks get sourced or RB ceiling scores ship explicitly marked provisional. Inventing
benchmarks and presenting them with the same authority as the verified ones is the fastest way
to make the tool untrustworthy.

**Sleeper has no WebSocket.** Its API is polling-only with a documented budget under 1,000
calls per minute per IP — a resource shared across every user of the app, load-bearing for the
flagship feature, concentrated into a few weeks a year. Backend-only polling, `last_picked`
change detection, adaptive intervals, a distributed rate limiter, and manual pick entry as a
genuine equal path are all required in the same phase as the draft room, not afterwards.

**ESPN has no official API.** Private leagues need `espn_s2` and `SWID` cookies that cannot be
obtained programmatically, so onboarding requires the user to open developer tools. Those
cookies are full account session credentials and must be encrypted per-user and never logged.
Terms-of-service review is a prerequisite. Ship Sleeper first and completely; ESPN as labelled
beta with a manual fallback.

**Some efficiency metrics are licensed.** PFF grades, DVOA, and Reception Perception
percentiles are load-bearing in the WR and TE factor sets and are not freely redistributable.
The realistic starting point is a manually maintained seasonal import, which is why every
player carries a confidence score reflecting how many of their twelve factors are actually
known.

**Two source images are cropped.** Zero RB and Elite QB have definitions but no visible tier
grade, and draft slot 1.05 is missing. The app shows these as unrated rather than guessing.

**Two artifacts disagree about Elite TE timing.** The strategy definition says a "top 4-5 round
tight end anchor"; the round-by-round data says round 4 TEs have a 0% league-winner rate. This
plan resolves it in favour of the outcome data, but the conflict is real and should be
confirmed rather than silently decided in code.

---

## Next step

The Figma mocks for the ten screens in
[`06-design-system-and-screens.md`](./06-design-system-and-screens.md) §6, built on the tokens
and components defined in that document, then the Angular + PrimeNG implementation against
the phase sequence in [`05-architecture.md`](./05-architecture.md) §5.
