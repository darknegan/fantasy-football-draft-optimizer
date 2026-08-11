# Artifact provenance chip in app shell

Approved 2026-08-11 (brainstorming).

## Problem

During active development it is hard to tell whether DraftLab is grading
from R2-published sleeperMCP artifacts or the bundled bootstrap JSON, and
when those documents were built. That information only exists in Worker
logs today.

## Decisions

- **Placement:** global sidebar foot (option C) — data drives the whole app,
  not only the player board.
- **Detail:** two lines — factors and benchmarks separately (option C).
- **API:** extend `GET /api/health` (approach 1); do not wrap board payloads.
- **Timestamp:** display in the **user’s local timezone** via the browser
  locale (`Date` + `toLocaleString` / `Intl`), never hardcode UTC in the
  label. Wire still stores/sends ISO `generatedAt` from the artifact.
  **Omit the year** in the chip (artifacts refresh weekly; month/day + time
  is enough). Use `month: 'short'`, `day: 'numeric'`, `hour`/`minute` —
  no `year` field.

## Design

### Backend

After `loadArtifacts` (Worker `refreshStoreFromArtifacts` and Node
`create-store`), retain module-level metadata:

```ts
type ArtifactSource = 'cache' | 'stale_cache' | 'bootstrap';

interface ArtifactDocMeta {
  source: ArtifactSource;
  generatedAt: string | null; // ISO from JSON generated_at
}

interface ArtifactsHealthMeta {
  factors: ArtifactDocMeta;
  benchmarks: ArtifactDocMeta;
}
```

- `generatedAt` = artifact document `generated_at` (build time of that JSON),
  **not** Worker `deployedAt` and **not** R2 `fetchedAt` / upload time.
- Until async R2 refresh completes, report bootstrap meta matching the
  synchronous bootstrap store (same docs already imported).

`GET /api/health` response gains:

```json
"artifacts": {
  "factors": { "source": "cache", "generatedAt": "2026-08-11T14:30:05+00:00" },
  "benchmarks": { "source": "bootstrap", "generatedAt": "2026-08-11T03:45:49+00:00" }
}
```

Node API health should expose the same shape when using the shared store
path.

### Frontend

- Widen `ApiService.health()` return type to include optional `artifacts`.
- `ShellComponent` loads health once (after auth/session is ready, or on
  shell init for logged-in routes).
- Under the existing `.sync-chip` in `.side-foot`, render a muted
  `.artifact-chip` block with two lines when `artifacts` is present:

```text
Factors · R2 · Aug 11, 9:30 AM
Benchmarks · Bootstrap · Aug 10, 10:47 PM
```

(Example times are **local**; `toLocaleString` with month/day + short time,
**no year**, no forced `timeZone: 'UTC'`.)

| `source` | Label |
|----------|--------|
| `cache` | `R2` |
| `stale_cache` | `R2 (stale)` |
| `bootstrap` | `Bootstrap` |

- If health fails or `artifacts` is missing: hide the block (no invented
  times).
- Invalid / unparsable `generatedAt`: show source label only (omit the
  date segment).

### Out of scope

- Board filter-bar / header subtitle placement
- Wrapping board or other domain responses with meta
- Showing R2 upload/`fetchedAt` time
- Changing artifact publish pipeline

## Test plan

1. Worker/Node: after bootstrap-only load, health `artifacts.*.source` is
   `bootstrap` and `generatedAt` matches bundled JSON `generated_at`.
2. With R2 present: sources `cache` (or `stale_cache`) and `generatedAt`
   matches R2 document `generated_at`.
3. Shell renders two lines; dates format in local TZ **without year**
   (unit-test the formatter with a fixed ISO + mocked locale/TZ if practical).
4. Health error → chip hidden.
