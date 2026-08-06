# Draft Strategy Engine

The strategy engine is what separates this tool from a ranked list. It encodes nine named
draft strategies, each with a round-by-round positional plan, and evaluates every available
player against the plan the user selected. Sources are the artifacts in
`public/stats/league-stats/`.

---

## 1. The Nine Strategies

All nine definitions are transcribed verbatim from
`public/stats/league-stats/definitions/`:

| Strategy | Definition |
| --- | --- |
| **Balanced** | You draft equal RBs/WRs early rounds 1-6+ and fade QB and TE till the later rounds of round 7-10+ |
| **Hero RB** | Anchoring with one early round RB1, drafting WRs through the flex, maybe taking an elite TE/QB, fading RB2 |
| **Hero WR** | Anchoring with 1 early round wide receiver, then filling out 2+ RBs, maybe an elite TE/QB before round 5-7 or so |
| **Double Hero RB** | Anchoring with 2 early round RBs, then filling out WRs, maybe an elite TE/QB from rounds 4-8 |
| **Double Hero WR** | 2 anchor WRs to start your draft, fading WR depth, hammering RBs in the mid rounds |
| **Robust RB** | Drafting as many RBs as you can start weekly (3 in the first 4 rounds or 4 in the first 6 rounds) |
| **Zero RB** | Fading RB entirely through round 7+ instead drafting WRs through the flex and an elite QB & TE, backfilling late |
| **Elite QB** | Anchoring your team with a positional advantage at QB, banking on a VORP stud |
| **Elite TE** | Taking a top 4-5 round tight end anchor to get a positional advantage (Bowers, McBride, Loveland, maybe Warren) |

### 1.1 Strategy tiers

`Best Draft Strategy Archetype.PNG` ranks these as a tier list:

| Tier | Strategies |
| --- | --- |
| **S** | Balanced |
| **A** | Hero WR, Double Hero RB |
| **B** | Elite TE, Hero RB |
| **C** | Robust RB, Double Hero WR |

Two important caveats about this image, which the app must handle honestly rather than
presenting the tier list as complete:

**Zero RB and Elite QB have definitions but do not appear in the visible tiers.** The
screenshot is cropped below the C row — a partial red row is visible at the bottom edge —
so those two strategies are presumably in a D or F tier, but I am inferring that from
position on a cropped image rather than reading it. The app should either mark them
"unrated" until the full tier list is captured, or the source image should be re-cropped.
Guessing at an F grade and then telling users to avoid Zero RB would be asserting something
the data in this repo does not actually show.

**The Balanced S-tier ranking is the single most actionable insight here**, and it is
counter-programming against most fantasy content, which sells the named contrarian
strategies. The tier list says the boring answer wins: take the best players available at RB
and WR through the first six rounds and stop trying to be clever at QB and TE until round 7
or later. Committing hard to a positional gimmick — Robust RB, Double Hero WR — lands you in
C tier. The app should default new users to Balanced and require an explicit opt-in to the
sharper strategies, with the tier grade shown next to each option.

### 1.2 Draft slot value

`Best Spot To Draft From.PNG` tiers the twelve first-round draft slots:

| Tier | Slots |
| --- | --- |
| **S** | 1.01, 1.02 |
| **A** | 1.03, 1.04, 1.08, 1.09 |
| **B** | 1.10, 1.11 |
| **C** | 1.12, 1.06, 1.07 |

Slot 1.05 is not visible in the crop, same caveat as above. The shape is interesting and
should be explained in the UI rather than just displayed: the top four picks are strong as
expected, the *back* of the round (1.08–1.11) grades better than the middle (1.06–1.07),
because turn picks let you take two players from the same tier while mid-round slots leave
you waiting through two full rounds of runs with no leverage. The middle of the first round
is the worst place to draft from, which surprises most users.

The engine consumes this in two ways: it warns when a chosen strategy fits the user's slot
poorly (Double Hero RB from 1.12 is far more executable than from 1.06), and it seeds the
round-by-round plan with the actual pick numbers the user will hold.

---

## 2. Round-by-Round Positional Targets

`Round League Winners.PNG` gives the percentage of players drafted in each round who went on
to become league-winners, split by position. This is the backbone of the round-by-round
planner:

| Round | QB | RB | WR | TE |
| --- | --- | --- | --- | --- |
| 1 | — | 22% | 18% | 0% |
| 2 | 0% | 26% | 25% | 43% |
| 3 | 38% | 18% | 5% | 25% |
| 4 | 30% | 19% | 15% | 0% |
| 5 | 7% | 10% | 8% | 6% |
| 6 | 0% | 7% | 5% | 15% |
| 7 | 10% | 0% | 3% | 0% |
| 8 | 0% | 0% | 3% | 0% |
| 9 | 0% | 0% | 3% | 0% |
| 10 | 0% | 4% | 0% | 20% |
| 11 | 10% | 0% | 3% | 0% |
| 12 | 8% | 6% | 0% | 8% |
| 13 | 13% | 7% | 0% | 0% |
| 14 | 0% | 6% | 0% | 9% |
| 15 | 0% | 0% | 0% | 0% |
| 16 | 0% | 0% | 0% | 5% |
| 17 | 0% | 0% | 0% | 8% |

Read as a heat map, this table produces several concrete rules the engine can act on:

**QB has a hard sweet spot in rounds 3–4** (38% and 30%), and 0% in round 2. Nothing before
round 3 has ever won a league at QB in this sample, and the round-2 figure is zero. This is
strong evidence against reaching for a QB early, and it complicates the Elite QB strategy —
the strategy's premise is a VORP advantage, but the round data says the advantage is
available in round 3, not round 1. The app should nudge Elite QB adherents toward the round
3–4 window rather than the first two rounds.

**TE is bimodal**: 43% in round 2, 25% in round 3, then a collapse to 0% in round 4, and a
secondary 20% spike in round 10. This is the clearest tactical instruction in the dataset —
either pay for a top TE in rounds 2–3 or wait until round 10, and specifically do *not* take
a TE in round 4, where the historical league-winner rate is zero. It also validates the
Elite TE strategy while narrowing it: the definition says "top 4-5 round tight end anchor",
but the data says rounds 2–3, with round 4 as the worst possible TE round. That is a genuine
tension between two artifacts in this repo, and I would resolve it in favour of the
round-by-round data, which is outcome-based.

**RB is the most consistently productive early position**, 22%/26%/18%/19% across the first
four rounds with no dead round. WR peaks in round 2 at 25% but has a striking round-3 trough
at 5% before recovering to 15% in round 4.

**Rounds 15+ are almost entirely dead** except TE (5% and 8% in rounds 16–17), which is the
tail of the wait-on-TE approach paying off.

### 2.1 Encoding a strategy as a plan

Each strategy compiles to a per-round positional weighting, seeded from its definition and
modulated by the league-winner rates above:

```ts
interface RoundTarget {
  round: number;
  primary: Position[];        // strongly prefer
  secondary: Position[];      // acceptable
  avoid: Position[];          // penalise heavily
  note: string;               // shown in the UI
}
```

Worked example, Balanced in a 12-team PPR league:

| Round | Primary | Secondary | Avoid | Note |
| --- | --- | --- | --- | --- |
| 1 | RB, WR | — | QB, TE | Best available of the RB/WR tier |
| 2 | RB, WR, TE | — | QB | Elite TE window opens (43%) |
| 3 | RB, QB | WR | — | QB sweet spot begins (38%); WR trough (5%) |
| 4 | RB, WR, QB | — | TE | TE is a 0% round — do not take one |
| 5–6 | RB, WR | TE | — | Balance the flex |
| 7–10 | QB, TE | RB, WR | — | Fade complete; TE spike in round 10 (20%) |
| 11+ | Best available | — | — | Upside swings and handcuffs |

The `avoid` list is doing real work here and is the part users will find most surprising, so
it needs prominent, explained UI treatment rather than a quiet deprioritisation. Telling
someone "do not draft a TE in round 4" is only persuasive if you show them the 0% next to it.

---

## 3. Strategy Adherence Scoring

During a live draft the engine reports how closely the user's roster tracks their declared
plan, which is what lets it recommend a pivot rather than silently drifting:

```
AdherenceScore = weightedMatch(actualPicksByRound, planTargetsByRound)
```

Three states drive the UI:

- **On plan** — recommendations follow the plan's primary positions
- **Drifting** — two or more picks off-plan; the app surfaces a "get back on plan" nudge and
  names the specific position gap
- **Pivot recommended** — the roster now fits a different strategy better than the declared
  one, so the app names that strategy, shows its tier grade, and offers a one-tap switch

The pivot case is the most valuable and the most likely to be got wrong. Drafts do not
survive contact with other drafters: a user who declared Double Hero RB and watched the top
six RBs go in the first eight picks is now, in practice, running Zero RB whether they meant
to or not. Recognising that and re-planning the remaining rounds beats stubbornly
recommending the fourth-best RB. Equally, the app should not thrash — a pivot should require
a sustained mismatch across multiple picks, not a single surprising selection, or users will
be offered a new strategy every round and trust none of them.

---

## 4. Pre-Draft Planning Mode

Before the draft, the user should be able to:

1. **Pick a strategy** from the nine, with tier grades shown and the definition text inline
2. **Set their draft slot**, seeing the slot tier and the exact pick numbers they will hold
3. **Simulate** — Monte Carlo the draft using ADP with realistic variance, showing the
   distribution of rosters the strategy produces from that slot
4. **Compare strategies** side by side on projected roster strength from the same slot
5. **Build a tier-based cheat sheet** — the board grouped into tiers with personal
   overrides, exportable
6. **Flag targets and avoids** — persisted into the live draft as visual markers

The simulator is where a plan becomes convincing. Telling a user that Double Hero RB is
A-tier is an assertion; showing them that from pick 1.09 it produces a top-three roster 34%
of the time versus 21% for Robust RB is an argument. It is also the feature most likely to
be quietly wrong, since the output depends entirely on how ADP variance is modelled — too
little variance and every simulation returns the same roster, too much and the results are
noise. The variance model should be fit to observed draft data and its assumptions shown to
the user, not buried.

---

## 5. Positional Notes the Engine Should Encode

Drawn from the position-specific findings in `01-player-evaluation-model.md`, these are the
guardrails the recommender applies regardless of strategy:

- **QB**: prefer rushing quarterbacks on fast-paced offenses; target rounds 3–4; never
  round 1–2
- **RB**: prime-age RBs (under 27, or with an RB1 finish) hit 46.15% and crush 27.88%,
  both bucket-bests; assume roughly 3 games missed for any early-round RB
- **WR**: Prime WR1s are the most reliable asset in the game (53.52% return, 12.68% bust);
  Trusty Veteran WRs are the worst (8.33% boom, 30.56% injured) and should be actively
  downgraded
- **TE**: must be first or second in team targets; sub-50% in-line rate strongly preferred;
  take in rounds 2–3 or wait for round 10; round 4 is a 0% dead zone
