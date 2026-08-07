import type { DraftSlotInfo, DraftSlotTier } from '@draftlab/domain';

/** Draft slot tiers from Best Spot To Draft From.PNG. Slot 1.05 is unrated (cropped). */
const SLOT_TIERS: Record<number, DraftSlotTier> = {
  1: 'S',
  2: 'S',
  3: 'A',
  4: 'A',
  5: 'unrated',
  6: 'C',
  7: 'C',
  8: 'A',
  9: 'A',
  10: 'B',
  11: 'B',
  12: 'C',
};

export function slotTier(slot: number): DraftSlotTier {
  return SLOT_TIERS[slot] ?? 'unrated';
}

/** Snake draft pick numbers for a given slot. */
export function snakePickNumbers(slot: number, teamCount: number, rounds: number): number[] {
  const picks: number[] = [];
  for (let round = 1; round <= rounds; round++) {
    const pickInRound = round % 2 === 1 ? slot : teamCount - slot + 1;
    picks.push((round - 1) * teamCount + pickInRound);
  }
  return picks;
}

export function getDraftSlotInfo(slot: number, teamCount = 12, rounds = 15): DraftSlotInfo {
  return {
    slot,
    tier: slotTier(slot),
    pickNumbers: snakePickNumbers(slot, teamCount, rounds),
  };
}
