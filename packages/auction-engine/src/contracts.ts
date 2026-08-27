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
  salarySchedule?: number[];
}): ContractValuation {
  const rules = opts.rules ?? DEFAULT_CONTRACT_RULES;
  const years = Math.min(Math.max(1, opts.years), rules.maxLength);
  const annual = opts.annualSalary;
  const salaries = salarySchedule(annual, years, rules, opts.salarySchedule);

  const yearProjections = [];
  for (let y = 0; y < years; y++) {
    const point = opts.curve.points[y] ?? opts.curve.points[opts.curve.points.length - 1]!;
    // Map curve value (~draft score scale) into a dollar-ish comparable via /1.1 heuristic.
    const projectedValue = Math.round(point.value / 1.1);
    const salary = salaries[y] ?? annual;
    yearProjections.push({
      yearOffset: y,
      projectedValue,
      salary,
      surplus: projectedValue - salary,
    });
  }

  const totalSalary = yearProjections.reduce((s, y) => s + y.salary, 0);
  const totalSurplus = yearProjections.reduce((s, y) => s + y.surplus, 0);
  const deadCapOnRelease = dropPenaltyAmount({
    currentSalary: annual,
    contractYear: 1,
    rules,
  });

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

/** Remaining yearly salaries for a new deal, applying league escalators. */
export function salarySchedule(
  year1Salary: number,
  years: number,
  rules: ContractRules = DEFAULT_CONTRACT_RULES,
  explicit?: number[],
): number[] {
  if (explicit && explicit.length) return explicit.slice(0, years);
  const growth = rules.salaryGrowth ?? [];
  const out: number[] = [];
  let salary = year1Salary;
  for (let y = 0; y < years; y++) {
    out.push(Math.max(1, Math.ceil(salary)));
    const factor = growth[y];
    if (factor != null) salary *= factor;
  }
  return out;
}

/**
 * Dead-cap dollars charged this season when a contracted player is dropped.
 * WFFL: Y2 = 50% of that year's salary, Y3 = 25%, Y4 = 15%, all rounded up.
 */
export function dropPenaltyAmount(opts: {
  currentSalary: number;
  contractYear: number;
  rules?: ContractRules;
}): number {
  const rules = opts.rules ?? DEFAULT_CONTRACT_RULES;
  const year = Math.max(1, Math.round(opts.contractYear));
  const mapped = rules.dropPenaltyPctByYear?.[year];
  const pct =
    mapped ??
    (rules.dropPenaltyPctByYear ? 0 : rules.deadCapPctOnRelease);
  if (pct <= 0) return 0;
  return Math.ceil(opts.currentSalary * pct);
}
