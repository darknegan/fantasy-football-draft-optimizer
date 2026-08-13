import type { Position } from '@draftlab/domain';

/** Minimum a row must expose to be tiered, graded, or banded. */
export interface TierRow {
  id: string;
  position: Position;
  draftScore: number;
  /** How many ceiling factors are actually measured. 0 = no real signal. */
  ceilingKnownFactors: number;
  /** ADP in "round.pick" notation, e.g. "2.09". */
  adpRoundPick: string;
}

export type QualityBand = 'S' | 'A' | 'B' | 'C' | 'D';

/** A detected gap between two adjacent players in a descending score list. */
export interface CliffMarker {
  /** The cliff falls AFTER this index in the input array. */
  afterIndex: number;
  /** Absolute score gap, rounded to 1dp. */
  gap: number;
  /** How many times the baseline gap this is, rounded to 1dp. */
  multiple: number;
}

export type SurvivalBandId = 'gone' | 'coin-flip' | 'available' | 'adp-unknown';

export interface SurvivalBand<T extends TierRow = TierRow> {
  id: SurvivalBandId;
  label: string;
  rows: T[];
}

export interface SurvivalCuts {
  /** Below this probability → 'gone'. */
  gone: number;
  /** Below this probability → 'coin-flip'; at or above → 'available'. */
  coinFlip: number;
}

export interface ReplacementBand {
  /** 'RB1' | 'RB2' | 'FLEX' | 'BENCH' etc. */
  id: string;
  label: string;
}
