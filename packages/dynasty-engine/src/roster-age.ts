import type { Player, RosterAgeCurve } from '@draftlab/domain';

const BUCKETS = [
  { label: '21–23', minAge: 21, maxAge: 23 },
  { label: '24–26', minAge: 24, maxAge: 26 },
  { label: '27–29', minAge: 27, maxAge: 29 },
  { label: '30–32', minAge: 30, maxAge: 32 },
  { label: '33+', minAge: 33, maxAge: 99 },
] as const;

export function buildRosterAgeCurve(roster: Player[]): RosterAgeCurve {
  if (!roster.length) {
    return {
      meanAge: 0,
      medianAge: 0,
      buckets: BUCKETS.map((b) => ({ ...b, count: 0, playerIds: [] })),
      contendScore: 50,
      rebuildScore: 50,
    };
  }

  const ages = roster.map((p) => p.age).sort((a, b) => a - b);
  const meanAge = Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10;
  const mid = Math.floor(ages.length / 2);
  const medianAge =
    ages.length % 2 === 0 ? Math.round(((ages[mid - 1]! + ages[mid]!) / 2) * 10) / 10 : ages[mid]!;

  const buckets = BUCKETS.map((b) => {
    const players = roster.filter((p) => p.age >= b.minAge && p.age <= b.maxAge);
    return {
      label: b.label,
      minAge: b.minAge,
      maxAge: b.maxAge,
      count: players.length,
      playerIds: players.map((p) => p.id),
    };
  });

  // Contend when mean age is in the prime window (~25–28) with enough 27–29 talent.
  const primeShare = roster.filter((p) => p.age >= 24 && p.age <= 29).length / roster.length;
  const youngShare = roster.filter((p) => p.age <= 24).length / roster.length;
  const oldShare = roster.filter((p) => p.age >= 30).length / roster.length;

  const contendScore = Math.round(
    clamp(40 + primeShare * 50 - oldShare * 25 + (meanAge >= 25 && meanAge <= 28 ? 10 : 0), 0, 100),
  );
  const rebuildScore = Math.round(clamp(35 + youngShare * 55 - primeShare * 15 + oldShare * 10, 0, 100));

  return { meanAge, medianAge, buckets, contendScore, rebuildScore };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
