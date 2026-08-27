import type { Position } from '../../core/api.types';

export const POSITION_CATALOG_COUNT: Record<Position, number> = {
  QB: 12,
  RB: 16,
  TE: 13,
  WR: 17,
  K: 0,
  DEF: 0,
};

export interface CeilingDisplayRow {
  player: { id: string; position: Position };
  evaluation: {
    ceiling: {
      factors?: { length: number } | null;
      ceilingScore: number | null;
      provisional: boolean;
    };
  };
}

export function configuredFactorCount(row: CeilingDisplayRow): number {
  const n = row.evaluation.ceiling.factors?.length ?? 0;
  return n > 0 ? n : POSITION_CATALOG_COUNT[row.player.position];
}

export function top5CeilingIdsByPosition(rows: CeilingDisplayRow[]): Set<string> {
  const byPos = new Map<Position, CeilingDisplayRow[]>();
  for (const r of rows) {
    const c = r.evaluation.ceiling;
    if (c.provisional || c.ceilingScore == null) continue;
    const list = byPos.get(r.player.position) ?? [];
    list.push(r);
    byPos.set(r.player.position, list);
  }
  const ids = new Set<string>();
  for (const list of byPos.values()) {
    list.sort(
      (a, b) => (b.evaluation.ceiling.ceilingScore ?? 0) - (a.evaluation.ceiling.ceilingScore ?? 0),
    );
    if (list.length === 0) continue;
    const cutoff = list[Math.min(4, list.length - 1)]!.evaluation.ceiling.ceilingScore!;
    for (const r of list) {
      if ((r.evaluation.ceiling.ceilingScore ?? -Infinity) >= cutoff) ids.add(r.player.id);
    }
  }
  return ids;
}

export function isTop5Ceiling(row: CeilingDisplayRow, top5Ids: Set<string>): boolean {
  return top5Ids.has(row.player.id);
}
