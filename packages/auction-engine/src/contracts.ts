import type {
  ContractRules,
  ContractValuation,
  MultiYearCurve,
} from '@draftlab/domain';

export const DEFAULT_CONTRACT_RULES: ContractRules = {
  maxLength: 4,
  salaryCap: null,
  deadCapPctOnRelease: 0.5,
  allowExtensions: true,
  franchiseTag: false,
  rolloverUnusedCap: false,
};

/**
 * Project per-year surplus of a multi-year contract against the player's value curve.
 * Annual salary is treated as flat unless the league rules say otherwise.
 */
export function valueContract(opts: {
  playerId: string;
  annualSalary: number;
  years: number;
  curve: MultiYearCurve;
  rules?: ContractRules;
}): ContractValuation {
  const rules = opts.rules ?? DEFAULT_CONTRACT_RULES;
  const years = Math.min(Math.max(1, opts.years), rules.maxLength);
  const annual = opts.annualSalary;

  const yearProjections = [];
  for (let y = 0; y < years; y++) {
    const point = opts.curve.points[y] ?? opts.curve.points[opts.curve.points.length - 1]!;
    // Map curve value (~draft score scale) into a dollar-ish comparable via /1.1 heuristic.
    const projectedValue = Math.round(point.value / 1.1);
    yearProjections.push({
      yearOffset: y,
      projectedValue,
      salary: annual,
      surplus: projectedValue - annual,
    });
  }

  const totalSalary = annual * years;
  const totalSurplus = yearProjections.reduce((s, y) => s + y.surplus, 0);
  const deadCapOnRelease = Math.round(annual * rules.deadCapPctOnRelease);

  let note = `${years}-year deal at $${annual}/yr`;
  if (totalSurplus > 20) note += ' — strong surplus vs projected value';
  else if (totalSurplus < -20) note += ' — overpay risk vs declining curve';
  else note += ' — roughly fair vs multi-year projection';

  if (!rules.allowExtensions && years === rules.maxLength) {
    note += '; at max length (no extensions)';
  }

  return {
    playerId: opts.playerId,
    years,
    annualSalary: annual,
    totalSalary,
    yearProjections,
    totalSurplus,
    deadCapOnRelease,
    note,
  };
}
