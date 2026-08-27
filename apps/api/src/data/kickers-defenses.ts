import type { Player, Position } from '@draftlab/domain';
import type { SeedPlayer } from './seed-players.js';

interface SpecialistSeed {
  id: string;
  name: string;
  team: string;
  position: Position;
  age?: number;
}

const KICKERS: SpecialistSeed[] = [
  { id: 'brandon-aubrey', name: 'Brandon Aubrey', team: 'DAL', position: 'K', age: 31 },
  { id: 'cam-little', name: 'Cam Little', team: 'JAX', position: 'K', age: 23 },
  { id: 'cameron-dicker', name: 'Cameron Dicker', team: 'LAC', position: 'K', age: 26 },
  { id: 'chase-mclaughlin', name: 'Chase McLaughlin', team: 'TB', position: 'K', age: 30 },
  { id: 'chris-boswell', name: 'Chris Boswell', team: 'PIT', position: 'K', age: 35 },
  { id: 'harrison-butker', name: 'Harrison Butker', team: 'KC', position: 'K', age: 30 },
  { id: 'jake-bates', name: 'Jake Bates', team: 'DET', position: 'K', age: 26 },
  { id: 'jake-elliott', name: 'Jake Elliott', team: 'PHI', position: 'K', age: 31 },
  { id: 'matt-gay', name: 'Matt Gay', team: 'WAS', position: 'K', age: 32 },
  { id: 'tyler-bass', name: 'Tyler Bass', team: 'BUF', position: 'K', age: 29 },
  { id: 'wil-lutz', name: 'Wil Lutz', team: 'DEN', position: 'K', age: 32 },
  { id: 'will-reichard', name: 'Will Reichard', team: 'MIN', position: 'K', age: 25 },
  { id: 'younghoe-koo', name: 'Younghoe Koo', team: 'ATL', position: 'K', age: 32 },
  { id: 'kaimi-fairbairn', name: "Ka'imi Fairbairn", team: 'HOU', position: 'K', age: 32 },
  { id: 'jason-myers', name: 'Jason Myers', team: 'SEA', position: 'K', age: 35 },
  { id: 'daniel-carlson', name: 'Daniel Carlson', team: 'LV', position: 'K', age: 31 },
  { id: 'blake-grupe', name: 'Blake Grupe', team: 'NO', position: 'K', age: 27 },
  { id: 'jake-moody', name: 'Jake Moody', team: 'SF', position: 'K', age: 26 },
  { id: 'evan-mcpherson', name: 'Evan McPherson', team: 'CIN', position: 'K', age: 27 },
  { id: 'justin-tucker', name: 'Justin Tucker', team: 'BAL', position: 'K', age: 36 },
  { id: 'harrison-mevis', name: 'Harrison Mevis', team: 'LAR', position: 'K', age: 24 },
  { id: 'chad-ryland', name: 'Chad Ryland', team: 'ARI', position: 'K', age: 26 },
];

const DEFENSES: SpecialistSeed[] = [
  { id: 'ari-def', name: 'Cardinals', team: 'ARI', position: 'DEF' },
  { id: 'atl-def', name: 'Falcons', team: 'ATL', position: 'DEF' },
  { id: 'bal-def', name: 'Ravens', team: 'BAL', position: 'DEF' },
  { id: 'buf-def', name: 'Bills', team: 'BUF', position: 'DEF' },
  { id: 'car-def', name: 'Panthers', team: 'CAR', position: 'DEF' },
  { id: 'chi-def', name: 'Bears', team: 'CHI', position: 'DEF' },
  { id: 'cin-def', name: 'Bengals', team: 'CIN', position: 'DEF' },
  { id: 'cle-def', name: 'Browns', team: 'CLE', position: 'DEF' },
  { id: 'dal-def', name: 'Cowboys', team: 'DAL', position: 'DEF' },
  { id: 'den-def', name: 'Broncos', team: 'DEN', position: 'DEF' },
  { id: 'det-def', name: 'Lions', team: 'DET', position: 'DEF' },
  { id: 'gb-def', name: 'Packers', team: 'GB', position: 'DEF' },
  { id: 'hou-def', name: 'Texans', team: 'HOU', position: 'DEF' },
  { id: 'ind-def', name: 'Colts', team: 'IND', position: 'DEF' },
  { id: 'jax-def', name: 'Jaguars', team: 'JAX', position: 'DEF' },
  { id: 'kc-def', name: 'Chiefs', team: 'KC', position: 'DEF' },
  { id: 'lv-def', name: 'Raiders', team: 'LV', position: 'DEF' },
  { id: 'lac-def', name: 'Chargers', team: 'LAC', position: 'DEF' },
  { id: 'lar-def', name: 'Rams', team: 'LAR', position: 'DEF' },
  { id: 'mia-def', name: 'Dolphins', team: 'MIA', position: 'DEF' },
  { id: 'min-def', name: 'Vikings', team: 'MIN', position: 'DEF' },
  { id: 'ne-def', name: 'Patriots', team: 'NE', position: 'DEF' },
  { id: 'no-def', name: 'Saints', team: 'NO', position: 'DEF' },
  { id: 'nyg-def', name: 'Giants', team: 'NYG', position: 'DEF' },
  { id: 'nyj-def', name: 'Jets', team: 'NYJ', position: 'DEF' },
  { id: 'phi-def', name: 'Eagles', team: 'PHI', position: 'DEF' },
  { id: 'pit-def', name: 'Steelers', team: 'PIT', position: 'DEF' },
  { id: 'sf-def', name: '49ers', team: 'SF', position: 'DEF' },
  { id: 'sea-def', name: 'Seahawks', team: 'SEA', position: 'DEF' },
  { id: 'tb-def', name: 'Buccaneers', team: 'TB', position: 'DEF' },
  { id: 'ten-def', name: 'Titans', team: 'TEN', position: 'DEF' },
  { id: 'was-def', name: 'Commanders', team: 'WAS', position: 'DEF' },
];

function toSeed(row: SpecialistSeed): SeedPlayer {
  const player: Player = {
    id: row.id,
    externalIds: {},
    name: row.name,
    team: row.team,
    position: row.position,
    age: row.age ?? 28,
    seasonsInLeague: 5,
    draftYear: 2018,
    draftRound: null,
    status: 'active',
    positionalTop5FinishCount: 0,
    positionalTop8FinishCount: 0,
    positionalTop12FinishCount: 0,
  };
  return {
    player,
    factors: [],
    market: {
      adpRoundPick: '15.01',
      fseRank: null,
      espnProjectionRank: null,
      projectedRank: 200,
      projectedPoints: 8,
    },
  };
}

export const KICKER_DEFENSE_SEEDS: SeedPlayer[] = [...KICKERS, ...DEFENSES].map(toSeed);

export function mergeKickerDefenseSeeds(seeds: SeedPlayer[]): SeedPlayer[] {
  const ids = new Set(seeds.map((s) => s.player.id));
  const extra = KICKER_DEFENSE_SEEDS.filter((s) => !ids.has(s.player.id));
  return extra.length ? [...seeds, ...extra] : seeds;
}
