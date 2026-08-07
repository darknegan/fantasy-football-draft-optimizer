import type { RoundTarget, StrategyDefinition, StrategyId } from '@draftlab/domain';

function rounds(defs: RoundTarget[]): RoundTarget[] {
  return defs;
}

const balancedRounds = rounds([
  { round: 1, primary: ['RB', 'WR'], secondary: [], avoid: ['QB', 'TE'], note: 'Best available of the RB/WR tier' },
  { round: 2, primary: ['RB', 'WR', 'TE'], secondary: [], avoid: ['QB'], note: 'Elite TE window opens (43% league-winner rate)' },
  { round: 3, primary: ['RB', 'QB'], secondary: ['WR'], avoid: [], note: 'QB sweet spot begins (38%); WR trough (5%)' },
  { round: 4, primary: ['RB', 'WR', 'QB'], secondary: [], avoid: ['TE'], note: 'TE is a 0% round — do not take one' },
  { round: 5, primary: ['RB', 'WR'], secondary: ['TE'], avoid: [], note: 'Balance the flex' },
  { round: 6, primary: ['RB', 'WR'], secondary: ['TE'], avoid: [], note: 'Balance the flex' },
  { round: 7, primary: ['QB', 'TE'], secondary: ['RB', 'WR'], avoid: [], note: 'Fade complete; fill positional gaps' },
  { round: 8, primary: ['QB', 'TE'], secondary: ['RB', 'WR'], avoid: [], note: 'Continue filling late positional value' },
  { round: 9, primary: ['QB', 'TE'], secondary: ['RB', 'WR'], avoid: [], note: 'Continue filling late positional value' },
  { round: 10, primary: ['TE', 'QB'], secondary: ['RB', 'WR'], avoid: [], note: 'TE secondary spike (20%)' },
]);

function extendBestAvailable(from: number, to: number): RoundTarget[] {
  const out: RoundTarget[] = [];
  for (let r = from; r <= to; r++) {
    out.push({ round: r, primary: ['RB', 'WR', 'TE', 'QB'], secondary: [], avoid: [], note: 'Best available / upside / handcuffs' });
  }
  return out;
}

export const STRATEGIES: Record<StrategyId, StrategyDefinition> = {
  balanced: {
    id: 'balanced',
    name: 'Balanced',
    definition:
      'You draft equal RBs/WRs early rounds 1-6+ and fade QB and TE till the later rounds of round 7-10+',
    tier: 'S',
    rounds: [...balancedRounds, ...extendBestAvailable(11, 17)],
  },
  hero_rb: {
    id: 'hero_rb',
    name: 'Hero RB',
    definition:
      'Anchoring with one early round RB1, drafting WRs through the flex, maybe taking an elite TE/QB, fading RB2',
    tier: 'B',
    rounds: [
      { round: 1, primary: ['RB'], secondary: ['WR'], avoid: ['QB', 'TE'], note: 'Secure your RB1 anchor' },
      { round: 2, primary: ['WR', 'TE'], secondary: ['RB'], avoid: ['QB'], note: 'Pivot to WR / elite TE' },
      { round: 3, primary: ['WR', 'QB'], secondary: ['TE'], avoid: [], note: 'WR depth or QB sweet spot' },
      { round: 4, primary: ['WR', 'QB'], secondary: ['RB'], avoid: ['TE'], note: 'Avoid TE dead zone; fade RB2' },
      { round: 5, primary: ['WR', 'TE'], secondary: ['QB'], avoid: [], note: 'Flex WR / late TE' },
      { round: 6, primary: ['WR', 'TE', 'QB'], secondary: ['RB'], avoid: [], note: 'Continue WR-heavy build' },
      ...balancedRounds.filter((r) => r.round >= 7).map((r) => ({ ...r })),
      ...extendBestAvailable(11, 17),
    ],
  },
  hero_wr: {
    id: 'hero_wr',
    name: 'Hero WR',
    definition:
      'Anchoring with 1 early round wide receiver, then filling out 2+ RBs, maybe an elite TE/QB before round 5-7 or so',
    tier: 'A',
    rounds: [
      { round: 1, primary: ['WR'], secondary: ['RB'], avoid: ['QB', 'TE'], note: 'Secure your WR1 anchor' },
      { round: 2, primary: ['RB', 'TE'], secondary: ['WR'], avoid: ['QB'], note: 'Start RB pair / elite TE window' },
      { round: 3, primary: ['RB', 'QB'], secondary: ['WR'], avoid: [], note: 'Second RB or QB sweet spot' },
      { round: 4, primary: ['RB', 'WR', 'QB'], secondary: [], avoid: ['TE'], note: 'Avoid TE dead zone' },
      { round: 5, primary: ['RB', 'TE', 'QB'], secondary: ['WR'], avoid: [], note: 'Elite TE/QB window closes' },
      { round: 6, primary: ['RB', 'WR'], secondary: ['TE', 'QB'], avoid: [], note: 'Balance remaining starters' },
      ...balancedRounds.filter((r) => r.round >= 7),
      ...extendBestAvailable(11, 17),
    ],
  },
  double_hero_rb: {
    id: 'double_hero_rb',
    name: 'Double Hero RB',
    definition: 'Anchoring with 2 early round RBs, then filling out WRs, maybe an elite TE/QB from rounds 4-8',
    tier: 'A',
    rounds: [
      { round: 1, primary: ['RB'], secondary: ['WR'], avoid: ['QB', 'TE'], note: 'RB1 of the double anchor' },
      { round: 2, primary: ['RB'], secondary: ['WR', 'TE'], avoid: ['QB'], note: 'RB2 of the double anchor' },
      { round: 3, primary: ['WR', 'QB'], secondary: ['TE'], avoid: [], note: 'Shift to WR / QB' },
      { round: 4, primary: ['WR', 'QB'], secondary: [], avoid: ['TE'], note: 'WR depth; avoid TE dead zone' },
      { round: 5, primary: ['WR', 'TE', 'QB'], secondary: [], avoid: [], note: 'Elite TE/QB from mid rounds' },
      { round: 6, primary: ['WR', 'TE', 'QB'], secondary: ['RB'], avoid: [], note: 'Continue WR fill' },
      ...balancedRounds.filter((r) => r.round >= 7),
      ...extendBestAvailable(11, 17),
    ],
  },
  double_hero_wr: {
    id: 'double_hero_wr',
    name: 'Double Hero WR',
    definition: '2 anchor WRs to start your draft, fading WR depth, hammering RBs in the mid rounds',
    tier: 'C',
    rounds: [
      { round: 1, primary: ['WR'], secondary: ['RB'], avoid: ['QB', 'TE'], note: 'WR1 anchor' },
      { round: 2, primary: ['WR'], secondary: ['RB', 'TE'], avoid: ['QB'], note: 'WR2 anchor' },
      { round: 3, primary: ['RB', 'QB'], secondary: [], avoid: [], note: 'Begin RB hammer' },
      { round: 4, primary: ['RB', 'QB'], secondary: [], avoid: ['TE'], note: 'Continue RBs; avoid TE' },
      { round: 5, primary: ['RB', 'TE', 'QB'], secondary: [], avoid: [], note: 'RB / positional scrapper' },
      { round: 6, primary: ['RB', 'TE', 'QB'], secondary: ['WR'], avoid: [], note: 'Fade WR depth' },
      ...balancedRounds.filter((r) => r.round >= 7),
      ...extendBestAvailable(11, 17),
    ],
  },
  robust_rb: {
    id: 'robust_rb',
    name: 'Robust RB',
    definition: 'Drafting as many RBs as you can start weekly (3 in the first 4 rounds or 4 in the first 6 rounds)',
    tier: 'C',
    rounds: [
      { round: 1, primary: ['RB'], secondary: [], avoid: ['QB', 'TE'], note: 'RB flood begins' },
      { round: 2, primary: ['RB'], secondary: ['TE'], avoid: ['QB'], note: 'Second early RB' },
      { round: 3, primary: ['RB', 'QB'], secondary: [], avoid: [], note: 'Third RB or QB' },
      { round: 4, primary: ['RB', 'WR'], secondary: ['QB'], avoid: ['TE'], note: 'Fourth RB target window' },
      { round: 5, primary: ['RB', 'WR'], secondary: ['TE', 'QB'], avoid: [], note: 'Keep RB pressure' },
      { round: 6, primary: ['RB', 'WR'], secondary: ['TE', 'QB'], avoid: [], note: 'Complete robust set' },
      ...balancedRounds.filter((r) => r.round >= 7),
      ...extendBestAvailable(11, 17),
    ],
  },
  zero_rb: {
    id: 'zero_rb',
    name: 'Zero RB',
    definition:
      'Fading RB entirely through round 7+ instead drafting WRs through the flex and an elite QB & TE, backfilling late',
    tier: 'unrated',
    rounds: [
      { round: 1, primary: ['WR'], secondary: [], avoid: ['RB', 'QB', 'TE'], note: 'Fade RB; take WR' },
      { round: 2, primary: ['WR', 'TE'], secondary: [], avoid: ['RB', 'QB'], note: 'WR / elite TE; still no RB' },
      { round: 3, primary: ['WR', 'QB', 'TE'], secondary: [], avoid: ['RB'], note: 'Elite QB window; still no RB' },
      { round: 4, primary: ['WR', 'QB'], secondary: [], avoid: ['RB', 'TE'], note: 'Avoid TE dead zone and RB' },
      { round: 5, primary: ['WR', 'TE', 'QB'], secondary: [], avoid: ['RB'], note: 'Continue zero-RB' },
      { round: 6, primary: ['WR', 'TE', 'QB'], secondary: [], avoid: ['RB'], note: 'Continue zero-RB' },
      { round: 7, primary: ['RB', 'WR'], secondary: ['TE', 'QB'], avoid: [], note: 'Begin late RB backfill' },
      { round: 8, primary: ['RB'], secondary: ['WR', 'TE', 'QB'], avoid: [], note: 'RB backfill' },
      { round: 9, primary: ['RB'], secondary: ['WR', 'TE', 'QB'], avoid: [], note: 'RB backfill' },
      { round: 10, primary: ['RB', 'TE'], secondary: ['WR', 'QB'], avoid: [], note: 'RB / late TE spike' },
      ...extendBestAvailable(11, 17),
    ],
  },
  elite_qb: {
    id: 'elite_qb',
    name: 'Elite QB',
    definition: 'Anchoring your team with a positional advantage at QB, banking on a VORP stud',
    tier: 'unrated',
    rounds: [
      { round: 1, primary: ['RB', 'WR'], secondary: [], avoid: ['QB', 'TE'], note: 'Do not reach for QB in round 1 (0% winners)' },
      { round: 2, primary: ['RB', 'WR', 'TE'], secondary: [], avoid: ['QB'], note: 'Round 2 QB is 0% — wait for sweet spot' },
      { round: 3, primary: ['QB'], secondary: ['RB', 'WR'], avoid: [], note: 'QB sweet spot (38%) — take your anchor' },
      { round: 4, primary: ['QB', 'RB', 'WR'], secondary: [], avoid: ['TE'], note: 'Backup QB window (30%) if missed round 3' },
      { round: 5, primary: ['RB', 'WR'], secondary: ['TE'], avoid: [], note: 'Resume skill-position build' },
      { round: 6, primary: ['RB', 'WR'], secondary: ['TE'], avoid: [], note: 'Resume skill-position build' },
      ...balancedRounds.filter((r) => r.round >= 7),
      ...extendBestAvailable(11, 17),
    ],
  },
  elite_te: {
    id: 'elite_te',
    name: 'Elite TE',
    definition:
      'Taking a top tight end anchor in rounds 2–3 to get a positional advantage (Bowers, McBride, Loveland, maybe Warren). Round 4 is a dead zone.',
    tier: 'B',
    rounds: [
      { round: 1, primary: ['RB', 'WR'], secondary: [], avoid: ['QB', 'TE'], note: 'Skill position first; TE window opens next' },
      { round: 2, primary: ['TE'], secondary: ['RB', 'WR'], avoid: ['QB'], note: 'Elite TE window peak (43%)' },
      { round: 3, primary: ['TE', 'RB', 'WR'], secondary: ['QB'], avoid: [], note: 'Last elite TE window (25%)' },
      { round: 4, primary: ['RB', 'WR', 'QB'], secondary: [], avoid: ['TE'], note: 'TE round-4 dead zone (0%) — do not take one' },
      { round: 5, primary: ['RB', 'WR'], secondary: ['QB'], avoid: [], note: 'Build around the TE anchor' },
      { round: 6, primary: ['RB', 'WR'], secondary: ['QB'], avoid: [], note: 'Build around the TE anchor' },
      ...balancedRounds.filter((r) => r.round >= 7),
      ...extendBestAvailable(11, 17),
    ],
  },
};

export function getStrategy(id: StrategyId): StrategyDefinition {
  return STRATEGIES[id];
}

export function listStrategies(): StrategyDefinition[] {
  // Default ordering: tier then name; Balanced first as product default.
  const tierOrder = { S: 0, A: 1, B: 2, C: 3, unrated: 4 } as const;
  return Object.values(STRATEGIES).sort((a, b) => {
    if (a.id === 'balanced') return -1;
    if (b.id === 'balanced') return 1;
    return tierOrder[a.tier] - tierOrder[b.tier] || a.name.localeCompare(b.name);
  });
}

export function getRoundTarget(strategyId: StrategyId, round: number): RoundTarget {
  const strategy = getStrategy(strategyId);
  return (
    strategy.rounds.find((r) => r.round === round) ?? {
      round,
      primary: ['RB', 'WR', 'TE', 'QB'],
      secondary: [],
      avoid: [],
      note: 'Best available',
    }
  );
}
