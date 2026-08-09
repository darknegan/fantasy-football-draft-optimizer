import type { FactorGrade } from '@draftlab/domain';

export const GRADE_WEIGHTS: Record<FactorGrade, number> = {
  green: 5,
  yellow: 3,
  orange: -1,
  red: -3,
  unknown: 0,
};

export const CEILING_MAX = 60;
export const CEILING_MIN = -36;

export const DEFAULT_GRADING_BANDS = {
  greenMin: 1.05,
  yellowMin: 0.9,
  orangeMin: 0.75,
} as const;
