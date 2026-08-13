import type { DraftSlotInfo, DraftSlotTier } from '@draftlab/domain';
import { snakePickNumbers } from '@draftlab/tiers';

export { snakePickNumbers } from '@draftlab/tiers';

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

export function getDraftSlotInfo(slot: number, teamCount = 12, rounds = 15): DraftSlotInfo {
  return {
    slot,
    tier: slotTier(slot),
    pickNumbers: snakePickNumbers(slot, teamCount, rounds),
  };
}
