import type {
  AuctionBid,
  AuctionTeamBudget,
  ContractRules,
  LeagueFormatState,
  Player,
  Position,
  RosterShape,
} from '@draftlab/domain';
import { dropPenaltyAmount } from '@draftlab/auction-engine';
import { SCORING_PRESETS } from '@draftlab/integrations';
import history from './wffl-history.json' with { type: 'json' };

export const WFFL_EXTERNAL_ID = 'global:wffl';
export const WFFL_LEAGUE_NAME = 'WFFL Auction Keepers';
export const WFFL_SEASON = 2026;
export const WFFL_BUDGET = 200;

export const WFFL_ROSTER: RosterShape = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 2,
  superflex: 0,
  k: 1,
  def: 1,
  bench: 5,
  totalStarters: 10,
};

export const WFFL_DEFAULT_TEAM_CODE = 'PRP';

export const WFFL_CONTRACT_RULES: ContractRules = {
  maxLength: 5,
  salaryCap: 200,
  deadCapPctOnRelease: 0.5,
  allowExtensions: true,
  franchiseTag: false,
  rolloverUnusedCap: false,
  salaryGrowth: [1.5, 1.25, 1.15, 1.15],
  dropPenaltyPctByYear: { 2: 0.5, 3: 0.25, 4: 0.15 },
};

export const WFFL_SCORING = SCORING_PRESETS[0]!;

export interface WfflTeamTemplate {
  code: string;
  location: string;
  name: string;
  owner: string;
  conference: string;
}

export const WFFL_TEAMS: WfflTeamTemplate[] = [
  { code: 'MAN', location: 'Manhattan', name: 'Empire', owner: 'Luke Rapert', conference: 'Citadel' },
  { code: 'YKY', location: 'Yukon', name: 'Yetis', owner: 'Josh Belford', conference: 'Wildlands' },
  { code: 'JPH', location: 'Japton', name: 'Hilltoppers', owner: 'Scott Davis', conference: 'Stonebelt' },
  { code: 'WLH', location: 'Waikiki', name: 'Lavahawks', owner: 'Ty Langston', conference: 'Wildlands' },
  { code: 'FRI', location: 'Frisco', name: 'Fighters', owner: 'Andrew Moore/Noah Johnson', conference: 'Ironrock' },
  { code: 'FLY', location: 'Frederick', name: 'Flyers', owner: 'Jack Porter', conference: 'Citadel' },
  { code: 'RRR', location: 'Raleigh', name: 'Rough Riders', owner: 'Cade Walker', conference: 'Stonebelt' },
  { code: 'SCS', location: 'Skamania County', name: 'Sasquach', owner: 'Brian Walker', conference: 'Wildlands' },
  { code: 'LIT', location: 'Little Italy', name: 'Holy Cannolis', owner: 'John Mark Otten', conference: 'Citadel' },
  { code: 'RAP', location: 'Rogers', name: 'Raptors', owner: 'Trey Langston', conference: 'Ironrock' },
  { code: 'PRP', location: 'Plano', name: 'Red Pandas', owner: 'Drake Davis', conference: 'Ironrock' },
  { code: 'MUD', location: 'River City', name: 'Mud Cats', owner: 'Cole Walker', conference: 'Stonebelt' },
];

interface WfflContractTemplate {
  teamCode: string;
  label: string;
  canonicalName: string;
  position: Position;
  originalYears: number;
  expiresSeason: number;
  schedule: Record<number, number>;
  kind: 'keeper' | 'penalty';
}

const CONTRACTS: WfflContractTemplate[] = [
  { teamCode: 'MAN', label: 'P. Nacua', canonicalName: 'Puka Nacua', position: 'WR', originalYears: 5, expiresSeason: 2027, schedule: { 2026: 15, 2027: 17 }, kind: 'keeper' },
  { teamCode: 'MAN', label: 'P. Washington', canonicalName: 'Parker Washington', position: 'WR', originalYears: 2, expiresSeason: 2026, schedule: { 2026: 8 }, kind: 'keeper' },
  { teamCode: 'MAN', label: 'M. Wilson', canonicalName: 'Michael Wilson', position: 'WR', originalYears: 2, expiresSeason: 2026, schedule: { 2026: 8 }, kind: 'keeper' },
  { teamCode: 'YKY', label: 'J. Smith-Njigba', canonicalName: 'Jaxon Smith-Njigba', position: 'WR', originalYears: 5, expiresSeason: 2027, schedule: { 2026: 8, 2027: 9 }, kind: 'keeper' },
  { teamCode: 'YKY', label: 'S. LaPorta', canonicalName: 'Sam LaPorta', position: 'TE', originalYears: 5, expiresSeason: 2027, schedule: { 2026: 5, 2027: 5 }, kind: 'keeper' },
  { teamCode: 'YKY', label: 'C. Olave', canonicalName: 'Chris Olave', position: 'WR', originalYears: 4, expiresSeason: 2028, schedule: { 2026: 12, 2027: 15, 2028: 18 }, kind: 'keeper' },
  { teamCode: 'JPH', label: 'R. Stevenson', canonicalName: 'Rhamondre Stevenson', position: 'RB', originalYears: 2, expiresSeason: 2026, schedule: { 2026: 8 }, kind: 'keeper' },
  { teamCode: 'JPH', label: 'C. Hubbard', canonicalName: 'Chuba Hubbard', position: 'RB', originalYears: 2, expiresSeason: 2026, schedule: { 2026: 8 }, kind: 'keeper' },
  { teamCode: 'WLH', label: 'B. Bowers', canonicalName: 'Brock Bowers', position: 'TE', originalYears: 4, expiresSeason: 2027, schedule: { 2026: 12, 2027: 14 }, kind: 'keeper' },
  { teamCode: 'WLH', label: 'D. Maye', canonicalName: 'Drake Maye', position: 'QB', originalYears: 4, expiresSeason: 2028, schedule: { 2026: 2, 2027: 3, 2028: 4 }, kind: 'keeper' },
  { teamCode: 'WLH', label: 'R. Rice', canonicalName: 'Rashee Rice', position: 'WR', originalYears: 2, expiresSeason: 2026, schedule: { 2026: 17 }, kind: 'keeper' },
  { teamCode: 'FRI', label: 'A. St. Brown', canonicalName: 'Amon-Ra St. Brown', position: 'WR', originalYears: 5, expiresSeason: 2026, schedule: { 2026: 29 }, kind: 'keeper' },
  { teamCode: 'FRI', label: 'C. Brown', canonicalName: 'Chase Brown', position: 'RB', originalYears: 3, expiresSeason: 2026, schedule: { 2026: 18 }, kind: 'keeper' },
  { teamCode: 'FLY', label: 'J. Williams', canonicalName: 'Javonte Williams', position: 'RB', originalYears: 4, expiresSeason: 2028, schedule: { 2026: 9, 2027: 12, 2028: 14 }, kind: 'keeper' },
  { teamCode: 'FLY', label: 'Z. Flowers', canonicalName: 'Zay Flowers', position: 'WR', originalYears: 2, expiresSeason: 2026, schedule: { 2026: 23 }, kind: 'keeper' },
  { teamCode: 'RRR', label: 'C. Williams', canonicalName: 'Caleb Williams', position: 'QB', originalYears: 4, expiresSeason: 2028, schedule: { 2026: 2, 2027: 3, 2028: 4 }, kind: 'keeper' },
  { teamCode: 'SCS', label: 'G. Pickens', canonicalName: 'George Pickens', position: 'WR', originalYears: 5, expiresSeason: 2026, schedule: { 2026: 7 }, kind: 'keeper' },
  { teamCode: 'LIT', label: 'J. Daniels', canonicalName: 'Jayden Daniels', position: 'QB', originalYears: 4, expiresSeason: 2027, schedule: { 2026: 15, 2027: 18 }, kind: 'keeper' },
  { teamCode: 'LIT', label: 'C. Skattebo', canonicalName: 'Cam Skattebo', position: 'RB', originalYears: 4, expiresSeason: 2028, schedule: { 2026: 12, 2027: 15, 2028: 18 }, kind: 'keeper' },
  { teamCode: 'LIT', label: 'R. Dowdle', canonicalName: 'Rico Dowdle', position: 'RB', originalYears: 2, expiresSeason: 2026, schedule: { 2026: 3 }, kind: 'keeper' },
  { teamCode: 'RAP', label: 'G. Wilson', canonicalName: 'Garrett Wilson', position: 'WR', originalYears: 5, expiresSeason: 2026, schedule: { 2026: 7 }, kind: 'keeper' },
  { teamCode: 'RAP', label: 'C. Loveland', canonicalName: 'Colston Loveland', position: 'TE', originalYears: 4, expiresSeason: 2028, schedule: { 2026: 9, 2027: 12, 2028: 14 }, kind: 'keeper' },
  { teamCode: 'RAP', label: 'J. McMillan', canonicalName: 'Jalen McMillan', position: 'WR', originalYears: 2, expiresSeason: 2026, schedule: { 2026: 2 }, kind: 'keeper' },
  { teamCode: 'PRP', label: 'B. Irving', canonicalName: 'Bucky Irving', position: 'RB', originalYears: 4, expiresSeason: 2027, schedule: { 2026: 8, 2027: 10 }, kind: 'keeper' },
  { teamCode: 'PRP', label: 'Q. Judkins', canonicalName: 'Quinshon Judkins', position: 'RB', originalYears: 4, expiresSeason: 2028, schedule: { 2026: 12, 2027: 15, 2028: 18 }, kind: 'keeper' },
  { teamCode: 'PRP', label: 'M. Pittman', canonicalName: 'Michael Pittman', position: 'WR', originalYears: 2, expiresSeason: 2026, schedule: { 2026: 6 }, kind: 'keeper' },
  { teamCode: 'MUD', label: 'K. Walker', canonicalName: 'Kenneth Walker', position: 'RB', originalYears: 5, expiresSeason: 2026, schedule: { 2026: 10 }, kind: 'keeper' },
  { teamCode: 'MUD', label: 'L. Burden', canonicalName: 'Luther Burden', position: 'WR', originalYears: 4, expiresSeason: 2028, schedule: { 2026: 5, 2027: 7, 2028: 9 }, kind: 'keeper' },
  { teamCode: 'MUD', label: 'J. Waddle', canonicalName: 'Jaylen Waddle', position: 'WR', originalYears: 2, expiresSeason: 2026, schedule: { 2026: 30 }, kind: 'keeper' },
  { teamCode: 'JPH', label: 'X. Worthy', canonicalName: 'Xavier Worthy', position: 'WR', originalYears: 3, expiresSeason: 2027, schedule: { 2026: 5 }, kind: 'penalty' },
  { teamCode: 'WLH', label: 'J. Jeudy', canonicalName: 'Jerry Jeudy', position: 'WR', originalYears: 3, expiresSeason: 2026, schedule: { 2026: 1 }, kind: 'penalty' },
  { teamCode: 'FRI', label: 'J. Fields', canonicalName: 'Justin Fields', position: 'QB', originalYears: 5, expiresSeason: 2026, schedule: { 2026: 1 }, kind: 'penalty' },
  { teamCode: 'SCS', label: 'B. Thomas', canonicalName: 'Brian Thomas', position: 'WR', originalYears: 4, expiresSeason: 2027, schedule: { 2026: 4, 2027: 3 }, kind: 'penalty' },
  { teamCode: 'LIT', label: 'C. Olave', canonicalName: 'Chris Olave', position: 'WR', originalYears: 5, expiresSeason: 2026, schedule: { 2026: 2 }, kind: 'penalty' },
  { teamCode: 'LIT', label: 'T. Pollard', canonicalName: 'Tony Pollard', position: 'RB', originalYears: 5, expiresSeason: 2026, schedule: { 2026: 2 }, kind: 'penalty' },
  { teamCode: 'RAP', label: 'B. Aiyuk', canonicalName: 'Brandon Aiyuk', position: 'WR', originalYears: 5, expiresSeason: 2026, schedule: { 2026: 1 }, kind: 'penalty' },
  { teamCode: 'PRP', label: 'K. Coleman', canonicalName: 'Keon Coleman', position: 'WR', originalYears: 3, expiresSeason: 2026, schedule: { 2026: 3 }, kind: 'penalty' },
  { teamCode: 'MUD', label: 'C. Okonkwo', canonicalName: 'Chigoziem Okonkwo', position: 'TE', originalYears: 5, expiresSeason: 2027, schedule: { 2026: 1, 2027: 1 }, kind: 'penalty' },
  { teamCode: 'MUD', label: 'J. Downs', canonicalName: 'Josh Downs', position: 'WR', originalYears: 4, expiresSeason: 2027, schedule: { 2026: 1, 2027: 1 }, kind: 'penalty' },
];

const NAME_ALIASES: Record<string, string> = {
  'puka nacua': 'puka nacua',
  'p. nacua': 'puka nacua',
  'parker washington': 'parker washington',
  'p. washington': 'parker washington',
  'michael wilson': 'michael wilson',
  'm. wilson': 'michael wilson',
  'jaxon smith-njigba': 'jaxon smith-njigba',
  'j. smith-njigba': 'jaxon smith-njigba',
  'sam laporta': 'sam laporta',
  's. laporta': 'sam laporta',
  'chris olave': 'chris olave',
  'c. olave': 'chris olave',
  'rhamondre stevenson': 'rhamondre stevenson',
  'r. stevenson': 'rhamondre stevenson',
  'chuba hubbard': 'chuba hubbard',
  'c. hubbard': 'chuba hubbard',
  'brock bowers': 'brock bowers',
  'b. bowers': 'brock bowers',
  'drake maye': 'drake maye',
  'd. maye': 'drake maye',
  'rashee rice': 'rashee rice',
  'r. rice': 'rashee rice',
  'amon-ra st. brown': 'amon-ra st. brown',
  'a. st. brown': 'amon-ra st. brown',
  'chase brown': 'chase brown',
  'c. brown': 'chase brown',
  'javonte williams': 'javonte williams',
  'j. williams': 'javonte williams',
  'zay flowers': 'zay flowers',
  'z. flowers': 'zay flowers',
  'caleb williams': 'caleb williams',
  'c. williams': 'caleb williams',
  'george pickens': 'george pickens',
  'g. pickens': 'george pickens',
  'jayden daniels': 'jayden daniels',
  'j. daniels': 'jayden daniels',
  'cam skattebo': 'cam skattebo',
  'c. skattebo': 'cam skattebo',
  'rico dowdle': 'rico dowdle',
  'r. dowdle': 'rico dowdle',
  'garrett wilson': 'garrett wilson',
  'g. wilson': 'garrett wilson',
  'colston loveland': 'colston loveland',
  'c. loveland': 'colston loveland',
  'jalen mcmillan': 'jalen mcmillan',
  'j. mcmillan': 'jalen mcmillan',
  'bucky irving': 'bucky irving',
  'b. irving': 'bucky irving',
  'quinshon judkins': 'quinshon judkins',
  'q. judkins': 'quinshon judkins',
  'michael pittman': 'michael pittman',
  'm. pittman': 'michael pittman',
  'kenneth walker': 'kenneth walker',
  'k. walker': 'kenneth walker',
  'luther burden': 'luther burden',
  'l. burden': 'luther burden',
  'jaylen waddle': 'jaylen waddle',
  'j. waddle': 'jaylen waddle',
  'xavier worthy': 'xavier worthy',
  'x. worthy': 'xavier worthy',
  'jerry jeudy': 'jerry jeudy',
  'j. jeudy': 'jerry jeudy',
  'justin fields': 'justin fields',
  'j. fields': 'justin fields',
  'brian thomas': 'brian thomas',
  'brian thomas jr': 'brian thomas',
  'brian thomas jr.': 'brian thomas',
  'b. thomas': 'brian thomas',
  'tony pollard': 'tony pollard',
  't. pollard': 'tony pollard',
  'brandon aiyuk': 'brandon aiyuk',
  'b. aiyuk': 'brandon aiyuk',
  'keon coleman': 'keon coleman',
  'k. coleman': 'keon coleman',
  'chigoziem okonkwo': 'chigoziem okonkwo',
  'c. okonkwo': 'chigoziem okonkwo',
  'josh downs': 'josh downs',
  'j. downs': 'josh downs',
  'y koo': 'younghoe koo',
  'younghoe koo': 'younghoe koo',
  '49ers dst': '49ers',
  'ravens defense': 'ravens',
  'jags': 'jaguars',
};

export function slugifyPlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bjr\b/g, '')
    .trim();
}

const NORMALIZED_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_ALIASES).map(([key, value]) => [normalizeName(key), normalizeName(value)]),
);

export function matchPlayerId(name: string, players: Player[]): string | null {
  const wanted = NORMALIZED_ALIASES[normalizeName(name)] ?? normalizeName(name);
  const wantedSlug = slugifyPlayerName(wanted);
  for (const p of players) {
    if (slugifyPlayerName(p.name) === wantedSlug) return p.id;
    if (normalizeName(p.name) === wanted) return p.id;
  }
  const parts = wanted.split(' ');
  const last = parts[parts.length - 1];
  if (last && parts.length >= 2) {
    const first = parts[0]![0];
    const lastHits = players.filter((p) => {
      const n = normalizeName(p.name).split(' ');
      return n[n.length - 1] === last && n[0]?.[0] === first;
    });
    if (lastHits.length === 1) return lastHits[0]!.id;
  }
  return null;
}

export function wfflDisplayName(team: WfflTeamTemplate): string {
  return `${team.location} ${team.name}`;
}

export function wfflRosterId(code: string, userTeamCode: string): string {
  return code === userTeamCode ? 'roster-user' : `roster-${code.toLowerCase()}`;
}

export function contractYearNow(originalYears: number, expiresSeason: number, season = WFFL_SEASON): number {
  const remaining = Math.max(1, expiresSeason - season + 1);
  return Math.max(1, originalYears - remaining + 1);
}

export interface WfflHistoryPayload {
  leagueName: string;
  draft2025: Array<{
    pickNumber: number;
    playerName: string;
    position: string;
    amount: number;
    owner: string;
    teamCode: string;
  }>;
  rosters2025: Record<
    string,
    Array<{ slot: string; name: string; position: string; amount: number | null }>
  >;
  records: Array<{
    teamCode: string;
    owner: string;
    championships: number;
    playoffAppearances: number;
    totalWins: number;
    totalLosses: number;
    averageStanding: number;
    seasons: Array<{ season: number; wins: number; losses: number; standing: number }>;
  }>;
}

export function wfflHistory(): WfflHistoryPayload {
  return history as WfflHistoryPayload;
}

export function lastYearCostByPlayerName(): Map<string, number> {
  const map = new Map<string, number>();
  const add = (name: string, amount: number) => {
    const normalized = normalizeName(name);
    map.set(normalized, amount);
    map.set(slugifyPlayerName(name), amount);
    const stripped = normalized.replace(/\s+(dst|defense|def)$/g, '');
    if (stripped && stripped !== normalized) {
      map.set(stripped, amount);
      map.set(slugifyPlayerName(stripped), amount);
    }
    const alias = NORMALIZED_ALIASES[normalized] ?? NORMALIZED_ALIASES[stripped];
    if (alias) {
      map.set(alias, amount);
      map.set(slugifyPlayerName(alias), amount);
    }
  };
  for (const pick of wfflHistory().draft2025) {
    add(pick.playerName, pick.amount);
  }
  return map;
}

export function lookupLastYearCost(playerName: string, byName = lastYearCostByPlayerName()): number | null {
  const wanted = NORMALIZED_ALIASES[normalizeName(playerName)] ?? normalizeName(playerName);
  return (
    byName.get(wanted) ??
    byName.get(slugifyPlayerName(wanted)) ??
    byName.get(normalizeName(playerName)) ??
    byName.get(slugifyPlayerName(playerName)) ??
    null
  );
}

export interface ResolvedWfflAuction {
  teams: AuctionTeamBudget[];
  bids: AuctionBid[];
  contractRules: ContractRules;
  userTeamCode: string;
}

export function buildWfflAuction(opts: {
  players: Player[];
  userTeamCode?: string;
  rosterSlots: number;
}): ResolvedWfflAuction {
  const userTeamCode = opts.userTeamCode ?? WFFL_DEFAULT_TEAM_CODE;
  const teams: AuctionTeamBudget[] = WFFL_TEAMS.map((team) => ({
    rosterId: wfflRosterId(team.code, userTeamCode),
    name: wfflDisplayName(team),
    startingBudget: WFFL_BUDGET,
    spent: 0,
    remaining: WFFL_BUDGET,
    rosterSlotsFilled: 0,
    rosterSlotsTotal: opts.rosterSlots,
    deadCap: 0,
    code: team.code,
    owner: team.owner,
    conference: team.conference,
  }));

  const bids: AuctionBid[] = [];
  for (const row of CONTRACTS) {
    const team = teams.find((t) => t.code === row.teamCode);
    if (!team) continue;
    const salarySchedule = Object.entries(row.schedule)
      .map(([year, amount]) => ({ year: Number(year), amount }))
      .sort((a, b) => a.year - b.year);
    const current = salarySchedule.find((s) => s.year === WFFL_SEASON) ?? salarySchedule[0];
    if (!current) continue;
    const remainingYears = salarySchedule.filter((s) => s.year >= WFFL_SEASON).map((s) => s.amount);
    const matchedId = matchPlayerId(row.canonicalName, opts.players);
    const playerId = matchedId ?? `wffl:${slugifyPlayerName(row.canonicalName)}`;
    const year = contractYearNow(row.originalYears, row.expiresSeason);
    bids.push({
      playerId,
      rosterId: team.rosterId,
      amount: current.amount,
      contractYears: remainingYears.length,
      nominatedAt: `${WFFL_SEASON - 1}-09-01T00:00:00.000Z`,
      playerName: row.canonicalName,
      position: row.position,
      contractYear: year,
      salarySchedule: remainingYears,
      isKeeper: row.kind === 'keeper',
      isPenalty: row.kind === 'penalty',
      expiresSeason: row.expiresSeason,
    });
    if (row.kind === 'penalty') {
      team.deadCap = (team.deadCap ?? 0) + current.amount;
    } else {
      team.spent += current.amount;
      team.rosterSlotsFilled += 1;
    }
    team.remaining = Math.max(0, team.startingBudget - team.spent - (team.deadCap ?? 0));
  }

  return { teams, bids, contractRules: { ...WFFL_CONTRACT_RULES }, userTeamCode };
}

export function wfflDraftSlot(teamCode: string): number {
  const idx = WFFL_TEAMS.findIndex((t) => t.code === teamCode);
  return idx >= 0 ? idx + 1 : 1;
}

export function wfflFormatSnapshot(
  auction: ResolvedWfflAuction,
): LeagueFormatState {
  return {
    auctionTeams: auction.teams,
    auctionBids: auction.bids,
    contractRules: auction.contractRules,
    userTeamCode: auction.userTeamCode,
  };
}

export function previewDropPenalty(bid: AuctionBid, rules: ContractRules = WFFL_CONTRACT_RULES): number {
  return dropPenaltyAmount({
    currentSalary: bid.amount,
    contractYear: bid.contractYear ?? 1,
    rules,
  });
}

export function isWfflLeague(externalId: string | undefined): boolean {
  return externalId === WFFL_EXTERNAL_ID;
}
