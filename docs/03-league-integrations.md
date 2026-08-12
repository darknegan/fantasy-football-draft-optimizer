# League Integrations, Scoring Import, and League Types

Three related capabilities are specified here: connecting external fantasy accounts,
importing their scoring settings so that every projection the app shows is expressed in the
user's own points, and supporting the three league formats.

**Scope decision:** Sleeper is the only platform integration. ESPN is deferred indefinitely on
terms-of-service grounds (§2), and users in leagues on any other platform are served by manual
league setup, which is a first-class path rather than a fallback.

---

## 1. Sleeper Integration

Sleeper publishes a genuinely public, documented, token-free read-only HTTP API at
`https://api.sleeper.app/v1`. It is now the app's only platform integration, which makes the
polling constraints in §1.2 the single external dependency worth engineering carefully.

### 1.1 Endpoints used

| Purpose | Endpoint |
| --- | --- |
| Resolve username to user id | `GET /user/<username>` |
| All of a user's leagues for a season | `GET /user/<user_id>/leagues/nfl/<season>` |
| League detail, settings, scoring | `GET /league/<league_id>` |
| League rosters | `GET /league/<league_id>/rosters` |
| League members | `GET /league/<league_id>/users` |
| Drafts for a league | `GET /league/<league_id>/drafts` |
| Draft detail, order, slot mapping | `GET /draft/<draft_id>` |
| **All picks in a draft** | `GET /draft/<draft_id>/picks` |
| Traded picks (dynasty) | `GET /league/<league_id>/traded_picks` |
| Player dictionary | `GET /players/nfl` |

### 1.2 Constraints that shape the architecture

**There is no WebSocket and no push mechanism.** Sleeper's API is polling-only. This is the
single most important technical constraint in the entire project, because the flagship Live
Draft Team Builder feature depends on knowing about picks the moment they happen. The app
cannot subscribe to Sleeper; it must poll `/draft/<draft_id>/picks` and diff the result.

**The documented budget is under 1,000 API calls per minute**, above which Sleeper warns of
IP blocking. That is a per-IP limit, and it is a shared resource across every user of the
app, since all polling originates from the backend's IP addresses. A naive implementation
that polls every draft every second would support only a few hundred concurrent drafts
before risking a block that takes down live drafts for *all* users simultaneously — during
the one window in the year when the product must work. This deserves explicit design
attention rather than being discovered in production on the opening weekend of draft season.

Mitigations, in order of importance:

1. **Poll from the backend, never the browser.** One poller per active draft, fanned out to
   all subscribed clients over the app's own WebSocket. Ten users watching the same draft
   must produce one upstream request, not ten.
2. **Use `last_picked` for cheap change detection.** The draft object exposes a
   `last_picked` timestamp, so `GET /draft/<draft_id>` is a lighter check than pulling the
   full picks array, and the picks array is fetched only when that timestamp advances.
3. **Adaptive intervals.** Roughly 2 seconds while the user's pick is within three
   selections, 5 seconds during normal draft flow, 30 seconds when the draft is paused or
   between rounds in a slow draft, and stop entirely at `status: "complete"`.
4. **A distributed rate limiter** in front of all Sleeper egress, with a global budget well
   under the documented ceiling, plus circuit breaking and exponential backoff on `429`.
5. **Outbound IP pool** so that the blast radius of a block is one shard of drafts rather
   than all of them.
6. **Manual pick entry as a first-class fallback**, not an error state. If polling degrades,
   the user must still be able to run their draft by tapping players as they come off the
   board. This is the honest answer to an upstream dependency the app does not control, and
   it should be built early rather than bolted on after the first outage.

**`GET /players/nfl` returns roughly 5 MB** and the docs direct callers to fetch it at most
once per day. Cache it server-side as a daily job and serve a slimmed projection to clients.

### 1.3 Useful fields

`draft.type` is `snake`, `linear`, or `auction`, which lets the app select the correct draft
room UI automatically instead of asking. `draft.settings` carries `teams`, `rounds`,
`pick_timer`, and per-position slot counts (`slots_wr`, `slots_te`, …) — enough to derive
the full roster shape. `draft_order` maps user id to draft slot and `slot_to_roster_id` maps
slot to roster, which together give the pick numbers the user will hold. `league.status`
distinguishes `pre_draft` / `drafting` / `in_season` / `complete`, driving which mode the app
opens in. Each pick's `metadata` includes position, team, and `injury_status`, so the board
can be updated without a second lookup.

---

## 2. ESPN — Deferred, Not In Scope

**Decision: no ESPN integration will be built.** ESPN publishes no official public fantasy
API. Reaching a user's private league means sending their `espn_s2` and `SWID` session
cookies to undocumented endpoints under `https://fantasy.espn.com/apis/v3/games/ffl/`, and
those cookies cannot be obtained programmatically — the user has to copy them out of browser
developer tools. That is a terms-of-service question rather than a technical one, and rather
than resolve it, the project is not going there.

This is the right call and it removes the largest external risk in the plan. What was being
contemplated was an unofficial, unversioned dependency that could break without notice,
reached using full account session credentials, behind an onboarding flow that asks a
non-technical fantasy player to open DevTools. Every one of those is a liability. Cutting it
means the platform integration surface is exactly one well-documented, token-free, explicitly
public API.

### 2.1 What replaces it

Users who are in ESPN leagues are served by the **manual league setup path** (§2.2), which was
already required as the fallback for users who would not complete the cookie flow. Promoting it
from fallback to first-class is a small amount of extra design work and removes the entire
integration.

Nothing else in the plan depends on ESPN. Specifically worth being clear about, because the
naming invites confusion: the `ESPN Projections` column in the value model
(`01-player-evaluation-model.md` §4) is **not** affected. Those ranks come from the research
already collected by hand in `public/stats/`, not from any API call, so the FSE-versus-ESPN
arbitrage signal — one of the most useful things the app computes — is untouched by this
decision.

### 2.2 Manual league setup

For any league on a platform the app does not integrate with, the user configures it directly:

- **League shape** — team count, roster positions including flex and superflex, bench and IR
  slots, league format (redraft / dynasty / auction)
- **Scoring** — entered against the canonical `ScoringProfile` in §3.1, with presets for the
  common configurations (full PPR, half PPR, standard, TE premium, superflex) so most users
  adjust two or three fields rather than thirty
- **Draft** — type, date, and the user's slot
- **Live draft** — run entirely through manual pick entry, which is the same code path the
  Sleeper integration falls back to when polling degrades (see
  `04-live-draft-team-builder.md` §1 and §7)

Because manual entry is already a hard requirement for draft-night resilience on Sleeper, the
incremental cost of supporting manual leagues is the configuration UI, not the draft
experience. A manually configured league gets the full evaluation model, strategy engine and
Live Draft Team Builder — it simply does not auto-sync.

### 2.3 If this is revisited

Should the terms-of-service position change, the research is preserved in git history: the
relevant endpoints are the `seasons/{year}/segments/0/leagues/{id}` and
`leagueHistory/{id}` paths with `mSettings`, `mTeam`, `mRoster` and `mDraftDetail` views.
Two things would need to be true first — a resolved ToS position, and a credential story
better than pasting account session cookies, most plausibly a browser extension that reads
them with explicit user consent. Until both hold, this stays out.

---

## 3. Scoring Settings Import

Every number the app shows must be denominated in the user's league scoring, or the
recommendations are wrong in a way users will not notice. A full-point-PPR board shown to a
half-PPR league is subtly but consistently misleading, and pass-heavy scoring changes the QB
calculus entirely.

### 3.1 Canonical internal model

Sleeper import and manual setup both produce one internal `ScoringProfile`:

```ts
interface ScoringProfile {
  passing:  { yardsPerPoint: number; tdPoints: number; intPoints: number;
              bonus40Yd?: number; bonus300Yd?: number; twoPtPoints: number };
  rushing:  { yardsPerPoint: number; tdPoints: number; bonus100Yd?: number;
              twoPtPoints: number };
  receiving:{ pointsPerReception: number;      // 0 | 0.5 | 1 | custom
              pointsPerReceptionTe?: number;   // TE premium
              yardsPerPoint: number; tdPoints: number;
              bonus100Yd?: number; twoPtPoints: number };
  misc:     { fumbleLostPoints: number; twoPtPoints: number };
  kicking:  { fgByDistance: Record<string, number>; xpPoints: number; missPoints: number };
  defense:  { ... };
  idp?:     { ... };
}
```

Sleeper's `scoring_settings` object is already a flat map of scoring keys to values and maps
almost directly, so the adapter is thin. Manually configured leagues write the same structure
through the setup UI. Dropping ESPN also drops a maintained lookup table from ESPN's numeric
`statId` keys to these fields, which would have been a standing maintenance burden and a
likely source of silent scoring errors whenever ESPN added a stat id.

### 3.2 Deriving league-specific rankings

With a `ScoringProfile` and per-player projected volume, the app recomputes:

- **Projected points** per player under the user's exact rules
- **VORP** against the replacement level implied by the user's roster shape and team count,
  which is the correct comparison basis and differs meaningfully between a 10-team league
  with one flex and a 14-team league with three
- **Positional scarcity curves**, driving the tier breaks on the board

Two details that materially change recommendations and should be handled explicitly rather
than defaulted: **TE premium** scoring, which can move an elite TE up a full round and
directly interacts with the Elite TE strategy in `02-draft-strategy-engine.md`; and
**superflex / 2QB**, which changes QB from a round 3–4 target into a top-of-draft priority
and invalidates the round-by-round QB guidance in that document. The app must detect
superflex from the roster positions array and say clearly that the standard QB timing advice
does not apply.

### 3.3 Validation

Scoring import is high-stakes and silent when wrong, so it needs a verification step:
recompute last season's final standings from the imported profile and the actual box scores,
then compare against the platform's recorded results. A mismatch means the import is wrong,
and the user should see that before they trust a draft board built on it. Present the
imported settings for confirmation in plain language ("full PPR, 4-point passing TDs,
TE premium +0.5") rather than a raw settings dump.

This check only applies to imported leagues, since it validates the adapter rather than the
user. Manually configured leagues get the plain-language confirmation summary but no
recomputation, so the summary carries more weight there and should be hard to skip past.

---

## 4. League Type Support

### 4.1 Redraft

The baseline. Rosters reset annually, so player valuation is purely current-season, and the
evaluation model in `01-player-evaluation-model.md` applies unmodified. Age matters only
insofar as it predicts this season's production and injury risk.

### 4.2 Dynasty

Rosters persist, so the valuation horizon extends over multiple years and the archetype work
in `01-player-evaluation-model.md` becomes the dominant input rather than a modifier.

Additional requirements:

- **Multi-year value curves** per player, not a single number: a 23-year-old `ELITE` WR and a
  29-year-old with the same projection are not remotely the same asset
- **Rookie draft support**, a separate draft type with its own board and pick trading
- **Draft pick assets** — future first, second, and third round picks are tradeable and must
  be valued; Sleeper's `traded_picks` endpoint supplies the ledger
- **Roster age curve** as a first-class team view, showing the contending window
- **Contend vs rebuild mode**, which flips the recommender's weighting between current-season
  production and long-term asset value

The archetype tables cut differently here, and the app should say so. A Trusty Veteran WR is
the worst redraft bet in the dataset (8.33% boom, 30.56% injured) and is *worse still* in
dynasty, where the declining asset value compounds the poor current-season odds. Conversely
a Breakout Candidate WR's 29.55% redraft bust rate is far more tolerable in dynasty, where a
missed season costs a roster spot rather than the year.

### 4.3 Auction with multi-year contracts

The most complex format and the one requiring the most novel modelling. Requirements:

- **Team budget tracking** with live remaining dollars for every team, not just the user's
- **Dollar values per player**, derived from VORP rather than rank — `RB VORP Rankings.PNG`
  is the right input, since a 335-VORP player and a 294-VORP player differ by a knowable
  amount of value in a way that "rank 1 vs rank 2" does not express
- **Inflation tracking**, recomputed after every completed bid: when the room overspends
  early, every remaining player's fair price rises, and this is where auction drafts are
  actually won
- **Max-bid calculation** given remaining budget and unfilled roster slots
- **Nomination strategy** — which player to put up, and when, to drain rivals' budgets or
  land a target cheaply
- **Multi-year contracts**: contract length as a bid dimension alongside price, cap
  implications across seasons, dead cap on release, and franchise-tag style mechanics if the
  league uses them

Contracts change player valuation qualitatively rather than quantitatively, and the app's
recommendations must reflect it. Signing a 23-year-old `ELITE` WR to four years is a very
different transaction from signing a 30-year-old Trusty Veteran WR to the same deal, even at
an identical annual price — the archetype tables say the second player has a 30.56% chance
of missing time *this* year and a declining curve after it. The contract dimension is where
the age and archetype work in this repo pays off most directly, and the UI should show a
per-year value projection across the contract term rather than a single season number.

Because contract rules vary enormously between leagues and are frequently custom, the app
needs a **configurable contract rule set** (max length, cap structure, dead cap, extension
and tag rules, rollover) rather than one hard-coded implementation. This is the single
largest scope item in the project and a strong candidate for the last phase.

---

## 5. Multi-League Support

Users are typically in several leagues at once, and the same player is a different proposition
in each. The data model treats a `LeagueConnection` as a first-class entity keyed on platform,
external league id, and season, with its own scoring profile, roster shape, strategy selection,
and draft state. A player's `DraftScore` is therefore computed **per league**, never globally
cached, and the UI needs a persistent league switcher plus a cross-league view that flags
scheduling conflicts between drafts — a real problem for anyone in five leagues during draft
season, and a small feature that will be disproportionately appreciated.

Mixed Sleeper-and-manual portfolios are the expected case, not an edge case, so the two kinds
of league must be indistinguishable everywhere except the sync indicator. A manually
configured league should never look second-class on the dashboard, the board, or in the draft
room; it simply shows "manual" rather than a last-synced timestamp.
