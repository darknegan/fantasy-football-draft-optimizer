import type {
  FactorDefinition,
  FactorGrade,
  FactorInput,
  GradedFactor,
  GradingBands,
  InjurySeverity,
  SecondaryTargetCompetition,
  ArchetypeId,
} from '@draftlab/domain';
import { GRADE_WEIGHTS } from './config/grade-weights.js';

export function gradeByRatio(
  value: number,
  benchmark: number,
  direction: FactorDefinition['direction'],
  bands: GradingBands,
): FactorGrade {
  if (benchmark === 0) return 'unknown';
  const ratio = direction === 'higherBetter' ? value / benchmark : benchmark / value;
  if (ratio >= bands.greenMin) return 'green';
  if (ratio >= bands.yellowMin) return 'yellow';
  if (ratio >= bands.orangeMin) return 'orange';
  return 'red';
}

export function gradeSecondaryCompetition(label: SecondaryTargetCompetition): FactorGrade {
  switch (label) {
    case 'less':
      return 'green';
    case 'same':
      return 'yellow';
    case 'more':
      return 'red';
    default:
      return 'unknown';
  }
}

export function gradeInjuryConcern(level: InjurySeverity): FactorGrade {
  switch (level) {
    case 'minimal':
      return 'green';
    case 'some':
      return 'yellow';
    case 'concerned':
      return 'orange';
    case 'serious':
      return 'red';
    default:
      return 'unknown';
  }
}

export function gradeArchetypeFactor(archetype: ArchetypeId): FactorGrade {
  switch (archetype) {
    case 'PRIME_WR1':
    case 'PRIME_RB1':
    case 'IN_THEIR_PRIME':
      return 'green';
    case 'PRIME_WR2':
    case 'PRIME_RB2':
      return 'yellow';
    case 'PROVEN_BREAKOUT_CANDIDATE':
      return 'yellow';
    case 'BREAKOUT_CANDIDATE':
      return 'orange';
    case 'TRUSTY_VETERAN':
      return 'red';
    default:
      return 'unknown';
  }
}

export function gradeFactor(
  def: FactorDefinition,
  input: FactorInput | undefined,
  bands: GradingBands,
): GradedFactor {
  if (
    !input ||
    (input.value === null && (input.categorical === null || input.categorical === undefined))
  ) {
    return {
      factorId: def.id,
      label: def.label,
      value: null,
      grade: 'unknown',
      weight: GRADE_WEIGHTS.unknown,
      benchmark: def.benchmark,
      category: def.category,
    };
  }

  let grade: FactorGrade = 'unknown';

  if (def.categorical === 'secondaryTargetCompetition') {
    grade = gradeSecondaryCompetition(
      (input.categorical as SecondaryTargetCompetition) ?? 'unknown',
    );
  } else if (def.categorical === 'injuryConcern') {
    grade = gradeInjuryConcern((input.categorical as InjurySeverity) ?? 'some');
  } else if (def.categorical === 'archetypeGrade') {
    grade = gradeArchetypeFactor(input.categorical as ArchetypeId);
  } else if (input.value !== null && input.value !== undefined) {
    grade = gradeByRatio(input.value, def.benchmark, def.direction, bands);
  }

  return {
    factorId: def.id,
    label: def.label,
    value: input.value,
    grade,
    weight: GRADE_WEIGHTS[grade],
    benchmark: def.benchmark,
    category: def.category,
  };
}
