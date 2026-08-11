# Artifact Provenance Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show in the app sidebar whether factors/benchmarks came from R2 or bootstrap, and when each document was built (local time, no year).

**Architecture:** Persist artifact meta after `loadArtifacts` on Worker and Node; expose via `GET /api/health`; Shell fetches health and renders two muted lines under the sync chip.

**Tech Stack:** TypeScript, Hono Worker, Angular signals, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-artifact-provenance-chip-design.md`
- Placement: sidebar `.side-foot` under `.sync-chip` (global)
- Two lines: factors + benchmarks
- Labels: `cache`→`R2`, `stale_cache`→`R2 (stale)`, `bootstrap`→`Bootstrap`
- `generatedAt` = JSON `generated_at` (not `deployedAt`, not R2 upload time)
- Display local TZ; **omit year** (`month: 'short'`, `day: 'numeric'`, hour/minute)
- Hide chip if health fails or `artifacts` missing
- Invalid date → show source only
- Do not wrap board responses

## File map

| File | Responsibility |
|------|----------------|
| `apps/api/src/data/artifact-meta.ts` (new) | Shared types + `metaFromLoaded` helper |
| `apps/worker/src/index.ts` | Module-level meta; health payload |
| `apps/api/src/create-store.ts` + `apps/api/src/index.ts` | Node store meta export; health |
| `apps/web/src/app/core/api.service.ts` | Widen `health()` type |
| `apps/web/src/app/core/artifact-provenance.ts` (new) | Format lines (pure, testable) |
| `apps/web/src/app/layout/shell.component.ts` + `.css` | Fetch + render chip |

---

### Task 1: Shared meta + Worker/Node health

**Files:**
- Create: `apps/api/src/data/artifact-meta.ts`
- Create: `apps/api/src/data/__tests__/artifact-meta.test.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/api/src/create-store.ts`
- Modify: `apps/api/src/index.ts` (health handler)

**Interfaces:**
- Produces: `ArtifactsHealthMeta`, `artifactMetaFromLoaded(loaded: LoadedArtifacts): ArtifactsHealthMeta`
- Produces: Worker/Node health includes `artifacts?: ArtifactsHealthMeta`

- [ ] **Step 1: Write failing tests for meta helper**

```ts
// apps/api/src/data/__tests__/artifact-meta.test.ts
import { describe, expect, it } from 'vitest';
import { artifactMetaFromLoaded } from '../artifact-meta.js';

describe('artifactMetaFromLoaded', () => {
  it('maps sources and generated_at', () => {
    const meta = artifactMetaFromLoaded({
      factors: { schema_version: 4, generated_at: '2026-08-11T14:30:05+00:00', players: [] },
      benchmarks: { schema_version: 2, generated_at: '2026-08-11T03:45:49+00:00' },
      factorsSource: 'cache',
      benchmarksSource: 'bootstrap',
    } as any);
    expect(meta).toEqual({
      factors: { source: 'cache', generatedAt: '2026-08-11T14:30:05+00:00' },
      benchmarks: { source: 'bootstrap', generatedAt: '2026-08-11T03:45:49+00:00' },
    });
  });

  it('uses null generatedAt when missing', () => {
    const meta = artifactMetaFromLoaded({
      factors: { schema_version: 4, generated_at: '', players: [] },
      benchmarks: { schema_version: 2 },
      factorsSource: 'bootstrap',
      benchmarksSource: 'bootstrap',
    } as any);
    expect(meta.factors.generatedAt).toBeNull();
    expect(meta.benchmarks.generatedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

`npx vitest run apps/api/src/data/__tests__/artifact-meta.test.ts`

- [ ] **Step 3: Implement helper**

```ts
// apps/api/src/data/artifact-meta.ts
import type { LoadedArtifacts } from './artifact-provider.js';

export type ArtifactSource = 'cache' | 'stale_cache' | 'bootstrap';

export interface ArtifactDocMeta {
  source: ArtifactSource;
  generatedAt: string | null;
}

export interface ArtifactsHealthMeta {
  factors: ArtifactDocMeta;
  benchmarks: ArtifactDocMeta;
}

function generatedAtOf(doc: { generated_at?: string | null }): string | null {
  const v = doc.generated_at;
  if (!v || !Number.isFinite(Date.parse(v))) return null;
  return v;
}

export function artifactMetaFromLoaded(loaded: LoadedArtifacts): ArtifactsHealthMeta {
  return {
    factors: {
      source: loaded.factorsSource,
      generatedAt: generatedAtOf(loaded.factors),
    },
    benchmarks: {
      source: loaded.benchmarksSource,
      generatedAt: generatedAtOf(loaded.benchmarks),
    },
  };
}

export function bootstrapArtifactMeta(
  factors: { generated_at?: string | null },
  benchmarks: { generated_at?: string | null },
): ArtifactsHealthMeta {
  return {
    factors: { source: 'bootstrap', generatedAt: generatedAtOf(factors) },
    benchmarks: { source: 'bootstrap', generatedAt: generatedAtOf(benchmarks) },
  };
}
```

- [ ] **Step 4: Wire Worker**

In `apps/worker/src/index.ts`:

```ts
import {
  artifactMetaFromLoaded,
  bootstrapArtifactMeta,
  type ArtifactsHealthMeta,
} from '../../api/src/data/artifact-meta.js';

let artifactMeta: ArtifactsHealthMeta = bootstrapArtifactMeta(
  playerFactors as { generated_at?: string },
  benchmarksBootstrap as { generated_at?: string },
);

// inside refreshStoreFromArtifacts, after loadArtifacts:
artifactMeta = artifactMetaFromLoaded(loaded);

// in /api/health json:
artifacts: artifactMeta,
```

Ensure `await ensureStore(c.env)` runs before health reads meta (already on `*` middleware — health is covered).

- [ ] **Step 5: Wire Node API**

`createAppStore` should return `{ store, artifacts }` or set a module-level `lastArtifactMeta` export that health reads. Prefer:

```ts
// create-store.ts
let lastArtifactMeta: ArtifactsHealthMeta | null = null;
export function getArtifactMeta(): ArtifactsHealthMeta | null {
  return lastArtifactMeta;
}
```

Set from `loadArtifacts` path and bootstrap/seed fallbacks (seed → null meta so chip hides, or bootstrap meta when bundled JSON used).

Health in `apps/api/src/index.ts`:

```ts
artifacts: getArtifactMeta() ?? undefined,
```

- [ ] **Step 6: Tests green + commit**

```bash
npx vitest run apps/api/src/data/__tests__/artifact-meta.test.ts
git add apps/api/src/data/artifact-meta.ts apps/api/src/data/__tests__/artifact-meta.test.ts \
  apps/worker/src/index.ts apps/api/src/create-store.ts apps/api/src/index.ts
git commit -m "feat: expose artifact provenance on /api/health"
```

---

### Task 2: Shell chip + local date formatter

**Files:**
- Create: `apps/web/src/app/core/artifact-provenance.ts`
- Create: `apps/web/src/app/core/artifact-provenance.spec.ts` (or `__tests__/`)
- Modify: `apps/web/src/app/core/api.service.ts`
- Modify: `apps/web/src/app/layout/shell.component.ts`
- Modify: `apps/web/src/app/layout/shell.component.css`

**Interfaces:**
- Produces: `formatArtifactLine(kind, meta): string | null`
- Produces: shell signals for two lines

- [ ] **Step 1: Failing formatter tests**

```ts
import { describe, expect, it } from 'vitest';
import { formatArtifactGeneratedAt, formatArtifactLine, sourceLabel } from './artifact-provenance';

describe('artifact provenance formatting', () => {
  it('maps sources', () => {
    expect(sourceLabel('cache')).toBe('R2');
    expect(sourceLabel('stale_cache')).toBe('R2 (stale)');
    expect(sourceLabel('bootstrap')).toBe('Bootstrap');
  });

  it('formats local time without year', () => {
    // Fixed Instant; assert options omit year — spy Intl or parse with known TZ
    const s = formatArtifactGeneratedAt('2026-08-11T14:30:05+00:00', 'en-US');
    expect(s).toMatch(/Aug/);
    expect(s).toMatch(/11/);
    expect(s).not.toMatch(/2026/);
  });

  it('builds Factors line', () => {
    expect(
      formatArtifactLine('Factors', {
        source: 'cache',
        generatedAt: '2026-08-11T14:30:05+00:00',
      }, 'en-US'),
    ).toMatch(/^Factors · R2 · /);
  });

  it('omits date when generatedAt null', () => {
    expect(
      formatArtifactLine('Benchmarks', { source: 'bootstrap', generatedAt: null }, 'en-US'),
    ).toBe('Benchmarks · Bootstrap');
  });
});
```

Implement `formatArtifactGeneratedAt` with:

```ts
new Date(iso).toLocaleString(locale, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
// no year, no timeZone: 'UTC'
```

- [ ] **Step 2: Run tests — FAIL then implement — PASS**

- [ ] **Step 3: Widen ApiService.health**

```ts
health() {
  return this.http.get<{
    ok: boolean;
    artifacts?: {
      factors: { source: 'cache' | 'stale_cache' | 'bootstrap'; generatedAt: string | null };
      benchmarks: { source: 'cache' | 'stale_cache' | 'bootstrap'; generatedAt: string | null };
    };
  }>('/api/health');
}
```

- [ ] **Step 4: Shell UI**

In `ShellComponent`:
- `artifactLines = signal<string[]>([])`
- On init (or when auth user present), `api.health().subscribe({ next: (h) => { ... set lines from formatArtifactLine }, error: () => artifactLines.set([]) })`
- Template under sync-chip:

```html
@if (artifactLines().length) {
  <div class="artifact-chip" role="status" aria-label="Artifact data source">
    @for (line of artifactLines(); track line) {
      <div class="artifact-line">{{ line }}</div>
    }
  </div>
}
```

CSS: muted, smaller than sync-chip (`font-size` ~0.7–0.75rem, `color: var(--dl-text-secondary)` or quieter token), stacked, no loud badge.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/core/artifact-provenance.ts apps/web/src/app/core/artifact-provenance.spec.ts \
  apps/web/src/app/core/api.service.ts apps/web/src/app/layout/shell.component.ts \
  apps/web/src/app/layout/shell.component.css
git commit -m "feat: show artifact R2/bootstrap provenance in sidebar"
```

---

### Task 3: Verify + deploy

**Files:** none required beyond prior tasks

- [ ] **Step 1: Manual check**

```bash
# Worker health (after deploy or wrangler dev)
curl -s https://draftlab-api.drakedavisdev.workers.dev/api/health | jq .artifacts
```

Expect `source` + `generatedAt` for both docs.

- [ ] **Step 2: Deploy worker + web**

```bash
$env:CLOUDFLARE_API_TOKEN=...
$env:CLOUDFLARE_ACCOUNT_ID=247649a81d4e45d2f6dc4fe1ea615e75
$env:NODE_OPTIONS=--use-system-ca
npm run deploy -w @draftlab/worker
npm run deploy -w @draftlab/web
```

- [ ] **Step 3: Confirm sidebar shows two lines in local time without year**

- [ ] **Step 4: Open PR**

```bash
git push -u origin HEAD
gh pr create --title "Show artifact R2/bootstrap provenance in sidebar" --body "..."
```

---

## Self-review (plan vs spec)

| Spec | Task |
|------|------|
| Health `artifacts` shape | Task 1 |
| Bootstrap until R2 refresh | Task 1 (`bootstrapArtifactMeta` init) |
| Two sidebar lines | Task 2 |
| Local TZ, no year | Task 2 formatter |
| Hide on failure | Task 2 |
| Source labels | Task 2 |
| Deploy verification | Task 3 |
