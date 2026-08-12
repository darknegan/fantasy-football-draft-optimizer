# Archetype Top-5 / Top-8 Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace positional top-12 + WR1/RB1 archetype splits with a shared top-5 / top-8 career-stage ladder (`ELITE` / `PROVEN` / `IN_THEIR_PRIME` / `TRUSTY_VETERAN` / `VETERAN` / `BREAKOUT`), including sleeperMCP finish counts, DraftLab classification/grades/EV, UI labels, docs, artifact publish, and deploy.

**Architecture:** sleeperMCP generalizes season fantasy-point finish ranks to K∈{5,8} and emits bio counts. DraftLab maps those onto `Player`, replaces `classify*` with the ordered 1→7 ladder (QB age-34 veteran gate), drops `PRIME_*` + volume blend, and updates categorical archetype weights (ELITE→factor-grade elite +5).

**Tech Stack:** Python (sleeperMCP `build_factors.py`), TypeScript / Vitest / Angular (DraftLab), Cloudflare R2 publish + Worker/web deploy.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-archetype-top5-ladder-design.md`
- Finish bars: **top-5** (breakout/proven/young elite), **top-8** (late elite / aging pedigree); at-position; full PPR season totals (same as today’s top-12 builder)
- Top-5 finishes count toward top-8 history (same seasonal ranks)
- Classification order **1→7**, first match wins; do not reorder
- Remove live `PRIME_WR1` / `PRIME_WR2` / `PRIME_RB1` / `PRIME_RB2` and volume blend
- Ceiling grades: ELITE=`elite`(+5), PROVEN=`green`(+3), TRUSTY=`green`(+3), IN_THEIR_PRIME=`yellow`(+1), BREAKOUT=`orange`(−1), VETERAN=`red`(−3)
- Only archetype `ELITE` may emit factor-grade `elite`; injury/secondary-target still never do
- Interim EV rates per spec table; VETERAN = trusty with injury+0.05, boom−0.05 clamped
- Future knob (do **not** implement): widen rule 3 to ≤6 seasons + ≥2 top-5 — document only
- Out of scope: ceiling board raw/top-N green UI; new empirical rate study
- TDD; commit after each green task
- Repos: `c:\Code\sleeperMCP` then `c:\Code\fantasy-football-draft-optimizer\fantasy-football-draft-optimizer`
- Deploy uses Drake `CLOUDFLARE_API_TOKEN` + account `247649a81d4e45d2f6dc4fe1ea615e75` (user env)

---

## File map

| File | Responsibility |
|------|----------------|
| `sleeperMCP/tools/build_factors.py` | Finish ranks for K=5,8; bio fields; coverage histograms |
| `packages/domain/src/index.ts` | `ArchetypeId`, `positionalTop5/8FinishCount` |
| `packages/evaluation-engine/src/archetype.ts` | Ladder classifiers, interim rates, no volume blend |
| `packages/evaluation-engine/src/grade-factor.ts` | Archetype → FactorGrade map |
| `apps/api/src/data/load-artifact.ts` (or mapper) | Bio → Player finish counts |
| `apps/api/src/data/seed-*.ts` | Fixture players use new fields / archetypes |
| `apps/web/.../board|draft|dynasty` | Labels / tones for ELITE & VETERAN |
| `docs/01-player-evaluation-model.md` §2 | Doc rewrite |
| Canvas (optional) | Archetype list if present |

---

### Task 1: sleeperMCP top-5 / top-8 finish history

**Files:**
- Modify: `c:\Code\sleeperMCP\tools\build_factors.py`
- Modify: any sleeperMCP tests covering `top12_finish_*` if present
- Modify: coverage / schema comments in the same file

**Interfaces:**
- Consumes: existing `load_player_seasons`, `fantasy_points`, `name_keys`, `FINISH_MIN_GAMES`
- Produces: per-player bio `top5_finish_count`, `top5_finish_seasons`, `top8_finish_count`, `top8_finish_seasons` (optional keep `top12_*` for migration diffs)

- [ ] **Step 1: Refactor finish helpers to take `top_n`**

Replace hard-coded `TOP_N_FINISH = 12` usage with a parameterized helper, e.g.:

```python
def finishers_by_season(seasons: list[int], top_n: int) -> dict[tuple[int, str], set[str]]:
    ...
    for r in pool[:top_n]:
        keys.update(name_keys(r["name"]))

def finish_history(name, position, finishers, seasons) -> dict:
    # unchanged logic
```

- [ ] **Step 2: Emit top-5 and top-8 on each player bio**

When building bio (near current `top12_finish_history` call):

```python
f5 = finish_history(name, pos, finishers_5, finish_seasons)
f8 = finish_history(name, pos, finishers_8, finish_seasons)
bio["top5_finish_count"] = f5["count"]
bio["top5_finish_seasons"] = f5["seasons"]
bio["top8_finish_count"] = f8["count"]
bio["top8_finish_seasons"] = f8["seasons"]
# optional: keep top12_* for one release
```

Assert invariant in a small unit test or assert: for each player `top5_finish_count <= top8_finish_count` (same window).

- [ ] **Step 3: Update coverage report histograms** for top5/top8 counts

- [ ] **Step 4: Run a local factors build (or focused test) and sanity-check a known player**

- [ ] **Step 5: Commit in sleeperMCP**

```powershell
git add tools/build_factors.py
git commit -m "feat: emit positional top-5 and top-8 finish counts"
```

---

### Task 2: DraftLab domain types

**Files:**
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces:

```typescript
export type ArchetypeId =
  | 'BREAKOUT_CANDIDATE'
  | 'PROVEN_BREAKOUT_CANDIDATE'
  | 'ELITE'
  | 'IN_THEIR_PRIME'
  | 'TRUSTY_VETERAN'
  | 'VETERAN';

// on Player:
positionalTop5FinishCount: number; // default 0
positionalTop8FinishCount: number; // default 0
// remove hasPositionalTop12Finish + positionalTop12FinishCount after call sites updated (Task 4–5 may delete)
```

- [ ] **Step 1: Update `ArchetypeId` and Player fields**

Keep old top-12 fields temporarily as optional deprecated if needed to compile mid-migration; prefer delete once Task 4 updates ingest.

- [ ] **Step 2: Build domain package**

```powershell
npm run build -w @draftlab/domain
```

- [ ] **Step 3: Commit**

```powershell
git commit -am "feat: archetype ladder ids and top-5/top-8 finish fields"
```

---

### Task 3: Classifiers, rates, and categorical grades (TDD)

**Files:**
- Modify: `packages/evaluation-engine/src/archetype.ts`
- Modify: `packages/evaluation-engine/src/grade-factor.ts`
- Create or modify: `packages/evaluation-engine/src/__tests__/archetype-ladder.test.ts`
- Modify: `packages/evaluation-engine/src/__tests__/six-band-grades.test.ts`

**Interfaces:**
- Consumes: `Player.positionalTop5FinishCount`, `positionalTop8FinishCount`, age, seasonsInLeague, position
- Produces: `classifyArchetype` / `classifyRb|Wr|Te|Qb` per spec; `evaluateArchetype` without volume blend; `gradeArchetypeFactor` per weight table

- [ ] **Step 1: Write failing ladder tests**

```typescript
describe('skill ladder (RB/WR/TE)', () => {
  it('rule1: ≤3 seasons + 0 top-5 → BREAKOUT', () => {
    expect(classifyWr(p({ seasonsInLeague: 2, age: 23, positionalTop5FinishCount: 0, positionalTop8FinishCount: 0 }))).toBe('BREAKOUT_CANDIDATE');
  });
  it('rule2: ≤3 seasons + 1 top-5 → PROVEN', () => { /* ... */ });
  it('rule3: ≤4 seasons + ≥2 top-5 → ELITE', () => { /* ... */ });
  it('rule4: ≤6 seasons + ≥3 top-8 → ELITE', () => { /* ... */ });
  it('year 5–6 + 2 top-5 but <3 top-8 → IN_THEIR_PRIME', () => { /* ... */ });
  it('rule5: age≥28 + ≥3 top-8 → TRUSTY_VETERAN', () => { /* ... */ });
  it('rule6: age≥28 + <3 top-8 → VETERAN', () => { /* ... */ });
  it('young breakout beats age≥28 veteran gate', () => {
    expect(classifyWr(p({ seasonsInLeague: 2, age: 28, positionalTop5FinishCount: 0, positionalTop8FinishCount: 0 }))).toBe('BREAKOUT_CANDIDATE');
  });
});

describe('QB ladder', () => {
  it('age≥34 + ≥3 top-8 → TRUSTY_VETERAN', () => { /* ... */ });
  it('age≥34 + <3 top-8 → VETERAN', () => { /* ... */ });
  it('age 32 year 10 with pedigree stays IN_THEIR_PRIME or ELITE via rules 1–4 only', () => { /* ... */ });
});

describe('gradeArchetypeFactor', () => {
  it('maps ELITE to elite', () => expect(gradeArchetypeFactor('ELITE')).toBe('elite'));
  it('maps PROVEN and TRUSTY to green', () => { /* ... */ });
  // ... full table
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
npx vitest run packages/evaluation-engine/src/__tests__/archetype-ladder.test.ts
```

- [ ] **Step 3: Implement classifiers + rates + grades**

Shared skill helper:

```typescript
function classifySkillPosition(player: Player): ArchetypeId {
  const t5 = player.positionalTop5FinishCount ?? 0;
  const t8 = player.positionalTop8FinishCount ?? 0;
  const y = player.seasonsInLeague;
  if (y <= 3 && t5 === 0) return 'BREAKOUT_CANDIDATE';
  if (y <= 3 && t5 === 1) return 'PROVEN_BREAKOUT_CANDIDATE';
  if (y <= 4 && t5 >= 2) return 'ELITE';
  if (y <= 6 && t8 >= 3) return 'ELITE';
  if ((y >= 7 || player.age >= 28) && t8 >= 3) return 'TRUSTY_VETERAN';
  if ((y >= 7 || player.age >= 28) && t8 < 3) return 'VETERAN';
  return 'IN_THEIR_PRIME';
}
```

QB: same 1–4 and 7; rules 5–6 use `age >= 34` only (no year≥7).

Delete `volumeRatio` / `blendRates` / PRIME rate keys. Wire interim rates per spec.

`gradeArchetypeFactor`: ELITE→elite, PROVEN→green, TRUSTY→green, IN_THEIR_PRIME→yellow, BREAKOUT→orange, VETERAN→red.

- [ ] **Step 4: Run evaluation-engine tests; fix six-band archetype assert**

- [ ] **Step 5: Commit**

```powershell
git commit -am "feat: top-5/top-8 archetype ladder and grades"
```

---

### Task 4: Artifact ingest + seeds

**Files:**
- Modify: `apps/api/src/data/load-artifact.ts` (and types)
- Modify: `apps/api/src/data/__tests__/load-artifact.test.ts`
- Modify: `apps/api/src/data/seed-players.ts`, `seed-depth.ts`
- Grep/fix remaining `hasPositionalTop12` / `PRIME_WR` in `apps/api`

**Interfaces:**
- Consumes: bio `top5_finish_count`, `top8_finish_count`
- Produces: `Player.positionalTop5FinishCount`, `positionalTop8FinishCount`
- When mapping ceiling `archetype` categorical from classify (if seeds hardcode categoricals, update strings to new ids)

- [ ] **Step 1: Update load-artifact mapping + tests**

```typescript
positionalTop5FinishCount: bio.top5_finish_count ?? 0,
positionalTop8FinishCount: bio.top8_finish_count ?? 0,
```

- [ ] **Step 2: Update seeds** — plausible top5/top8 counts; archetype categoricals use new ids (`ELITE`, etc.)

- [ ] **Step 3: Run api data tests + domain/engine build**

- [ ] **Step 4: Commit**

```powershell
git commit -am "feat: map top-5/top-8 finish counts from artifacts"
```

---

### Task 5: Spot-checks + web labels

**Files:**
- Modify: `packages/evaluation-engine/src/__tests__/spot-checks.test.ts`
- Modify: `apps/web/src/app/features/board/board.component.ts` (`formatArchetype`, `archTone`, filter options)
- Modify: `apps/web/src/app/features/draft/draft.component.ts`, `dynasty/dynasty.component.ts` (same helpers)
- Modify: `apps/web/src/app/core/api.types.ts` if `ArchetypeId` duplicated

**Interfaces:**
- Consumes: new archetype ids
- Produces: UI “Elite”, “Proven”, “Veteran”, “Trusty Veteran”, “In Their Prime”, “Breakout”; tones: ELITE/PROVEN/TRUSTY → good; PRIME → mid; BREAKOUT → mid/warn; VETERAN → bad

- [ ] **Step 1: Rewrite spot-check classify expectations** for Chase/Bijan/Gibbs/etc. using top5/top8 fields (compute expected bucket from rules; do not preserve PRIME_*)

- [ ] **Step 2: Update web format/tone maps; remove WR1/RB1 copy**

- [ ] **Step 3: Run `npx vitest run packages/evaluation-engine` and web build/types as available**

- [ ] **Step 4: Commit**

```powershell
git commit -am "feat: rebaseline archetype spot-checks and UI labels"
```

---

### Task 6: Docs

**Files:**
- Modify: `docs/01-player-evaluation-model.md` §2 (classification + grades + interim rates)
- Modify: canvas `C:\Users\Jarrod\.cursor\projects\c-Code\canvases\draftlab-scoring-model.canvas.tsx` if it lists archetypes / PRIME_*
- Grep docs for `PRIME_WR1`, `top-12`, `hasPositionalTop12` and fix in-scope stale copy

- [ ] **Step 1: Rewrite §2 to match spec ladder + grade table**

- [ ] **Step 2: Sync canvas if needed**

- [ ] **Step 3: Commit docs**

```powershell
git commit -am "docs: top-5/top-8 archetype ladder"
```

---

### Task 7: Publish artifacts + deploy

**Files:** none required beyond ops

- [ ] **Step 1: Rebuild sleeperMCP factors and publish to R2** (workflow or local wrangler put — same path as prior ITEM deploys)

- [ ] **Step 2: `npm run build:packages` then `npm run deploy:worker` and `npm run deploy:web`** from DraftLab (Drake token via user env)

- [ ] **Step 3: Smoke** — sample players’ archetypes look sane (e.g. young zero top-5 → Breakout; aging with résumé → Trusty; aging without → Veteran)

- [ ] **Step 4: Commit only if scripts/docs notes changed**

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| sleeperMCP top-5/top-8 bio | 1 |
| Domain ArchetypeId + finish fields | 2 |
| Ladder 1–7 + QB age 34 | 3 |
| Grades incl. ELITE→elite | 3 |
| Interim rates; no volume blend | 3 |
| Ingest + seeds | 4 |
| Spot-checks + UI | 5 |
| Eval doc | 6 |
| R2 + deploy | 7 |

## Self-review notes

- Ship sleeperMCP (Task 1) before relying on live R2 for Task 7; engine tests use fixture counts and do not block on R2.
- Do not implement rule-3 widen-to-≤6 unless spot-checks after real counts demand it.
- Ceiling board `/60` / top-N green remains a separate follow-up.
