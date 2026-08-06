# League Integrations, Scoring Import, and League Types

Three related capabilities are specified here: connecting external fantasy accounts,
importing their scoring settings so that every projection the app shows is expressed in the
user's own points, and supporting the three league formats.

---

## 1. Sleeper Integration

Sleeper publishes a genuinely public, documented, token-free read-only HTTP API at
`https://api.sleeper.app/v1`. This is the easy integration and should ship first.

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

## 2. ESPN Integration

ESPN has **no official public fantasy API**. The endpoints under
`https://fantasy.espn.com/apis/v3/games/ffl/` are undocumented, unversioned in practice, and
subject to change without notice. This needs to be stated plainly in planning because it
carries real product risk, and the plan should not present ESPN support as equivalent in
reliability to Sleeper.

### 2.1 Endpoints

Current season:

```
GET /apis/v3/games/ffl/seasons/2026/segments/0/leagues/{leagueId}
    ?view=mSettings&view=mTeam&view=mRoster&view=mDraftDetail
```

Historical seasons use a different path shape:

```
GET /apis/v3/games/ffl/leagueHistory/{leagueId}?seasonId={year}&view=mSettings
```

Useful views: `mSettings` (scoring, roster, league config), `mTeam`, `mRoster`,
`mDraftDetail` (draft picks), `mMatchup`, `mStandings`, `kona_player_info` (player data and
projections, filtered via the `x-fantasy-filter` request header).

### 2.2 The authentication problem

Private ESPN leagues — which is most leagues — require two cookies, `espn_s2` (often 250+
characters) and `SWID` (~38 characters including braces). There is no OAuth flow and no
programmatic login. As the `ffscrapr` documentation states directly, this "cannot be done
programmatically at this time"; the user must open developer tools, find the cookies for
`fantasy.espn.com`, and copy them.

This has consequences worth confronting up front:

**The onboarding is genuinely bad and cannot be fully fixed.** Asking a non-technical
fantasy player to open Chrome DevTools and copy a cookie value is a serious funnel problem.
It should be mitigated with a very carefully designed guided flow — annotated screenshots,
platform-specific instructions, paste validation that immediately confirms the connection by
naming the leagues found — and the app should support a **manual league setup path** for
users who will not or cannot do it. A browser extension that reads the cookies with user
consent is the better long-term answer and should be scoped as a follow-on.

**These credentials are session cookies for the user's entire ESPN account**, not
scoped fantasy tokens. They must be encrypted at rest with a per-user data key, never
logged, never returned to the client after storage, and never included in error reports.
They also expire, so the app needs clean re-auth prompting that detects a `401` and asks for
fresh values without losing the user's league configuration.

**Terms of service require review before build.** Scraping undocumented ESPN endpoints with
a user's session cookie is a legal and policy question, not just a technical one, and it
should be resolved before engineering time goes into it.

### 2.3 Recommended sequencing

Ship Sleeper first and completely. Add ESPN as a clearly-labelled beta with the manual
fallback available from day one. Treat any ESPN breakage as expected rather than
exceptional, with monitoring on schema drift and a user-facing status indicator per
connected platform.

---

## 3. Scoring Settings Import

Every number the app shows must be denominated in the user's league scoring, or the
recommendations are wrong in a way users will not notice. A full-point-PPR board shown to a
half-PPR league is subtly but consistently misleading, and pass-heavy scoring changes the QB
calculus entirely.

### 3.1 Canonical internal model

Both platforms map onto one internal `ScoringProfile`:

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
almost directly. ESPN uses numeric `statId` keys in `mSettings.scoringSettings.scoringItems`,
which requires a maintained lookup table from ESPN stat id to the canonical field — a known
maintenance burden and a likely source of silent errors when ESPN adds a stat id.

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

- **Multi-year value curves** per player, not a single number: a 23-year-old Prime WR1 and a
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
recommendations must reflect it. Signing a 23-year-old Prime WR1 to four years is a very
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

Users are typically in several leagues across both platforms simultaneously, and the same
player is a different proposition in each. The data model treats a `LeagueConnection` as a
first-class entity keyed on platform, external league id, and season, with its own scoring
profile, roster shape, strategy selection, and draft state. A player's `DraftScore` is
therefore computed **per league**, never globally cached, and the UI needs a persistent
league switcher plus a cross-league view that flags scheduling conflicts between drafts —
which is a real problem for anyone in five leagues during draft season, and a small feature
that will be disproportionately appreciated.
