import type { Position } from '@draftlab/domain';

/** Historical league-winner rates by round and position (Round League Winners.PNG). */
export const ROUND_WINNER_RATES: Record<number, Partial<Record<Position, number>>> = {
  1: { RB: 0.22, WR: 0.18, TE: 0 },
  2: { QB: 0, RB: 0.26, WR: 0.25, TE: 0.43 },
  3: { QB: 0.38, RB: 0.18, WR: 0.05, TE: 0.25 },
  4: { QB: 0.3, RB: 0.19, WR: 0.15, TE: 0 },
  5: { QB: 0.07, RB: 0.1, WR: 0.08, TE: 0.06 },
  6: { QB: 0, RB: 0.07, WR: 0.05, TE: 0.15 },
  7: { QB: 0.1, RB: 0, WR: 0.03, TE: 0 },
  8: { QB: 0, RB: 0, WR: 0.03, TE: 0 },
  9: { QB: 0, RB: 0, WR: 0.03, TE: 0 },
  10: { QB: 0, RB: 0.04, WR: 0, TE: 0.2 },
  11: { QB: 0.1, RB: 0, WR: 0.03, TE: 0 },
  12: { QB: 0.08, RB: 0.06, WR: 0, TE: 0.08 },
  13: { QB: 0.13, RB: 0.07, WR: 0, TE: 0 },
  14: { QB: 0, RB: 0.06, WR: 0, TE: 0.09 },
  15: { QB: 0, RB: 0, WR: 0, TE: 0 },
  16: { QB: 0, RB: 0, WR: 0, TE: 0.05 },
  17: { QB: 0, RB: 0, WR: 0, TE: 0.08 },
};

export function winnerRate(round: number, position: Position): number {
  return ROUND_WINNER_RATES[round]?.[position] ?? 0;
}

/** Elite TE window is rounds 2–3; round 4 is an explicit avoid (0%). */
export function isEliteTeWindow(round: number): boolean {
  return round === 2 || round === 3;
}

export function isTeDeadZone(round: number): boolean {
  return round === 4;
}

export function isQbSweetSpot(round: number): boolean {
  return round === 3 || round === 4;
}
