/**
 * Snake-draft pick projection shared by the board survival bands and the
 * recommendation engine. Kept in @draftlab/tiers so the Angular app never has
 * to import strategy-engine (and its simulate bundle) for a single helper.
 */

/** Rounds to plan when projecting remaining snake picks. */
export const PLANNING_ROUNDS = 30;

export interface UserPickProgress {
  /** Overall pick number (1-based) of the user's next selection. */
  nextOverall: number;
  /** Picks remaining before that selection (0 = on the clock). */
  picksUntilNext: number;
}

/** Snake draft overall pick numbers for a given slot. */
export function snakePickNumbers(
  slot: number,
  teamCount: number,
  rounds: number = PLANNING_ROUNDS,
): number[] {
  const picks: number[] = [];
  for (let round = 1; round <= rounds; round++) {
    const pickInRound = round % 2 === 1 ? slot : teamCount - slot + 1;
    picks.push((round - 1) * teamCount + pickInRound);
  }
  return picks;
}

/**
 * Project the user's next snake pick from live draft clock state.
 *
 * Returns null when the planning window is exhausted (no pick number at or
 * after `currentPick` within `rounds`).
 */
export function projectUserPickProgress(
  draftSlot: number,
  teamCount: number,
  currentPick: number,
  picksUntilUser?: number | null,
  rounds: number = PLANNING_ROUNDS,
): UserPickProgress | null {
  const picks = snakePickNumbers(draftSlot, teamCount, rounds);
  const nextOverall = picks.find((n) => n >= currentPick);
  if (nextOverall === undefined) return null;
  const picksUntilNext =
    picksUntilUser != null ? picksUntilUser : Math.max(0, nextOverall - currentPick);
  return { nextOverall, picksUntilNext };
}
