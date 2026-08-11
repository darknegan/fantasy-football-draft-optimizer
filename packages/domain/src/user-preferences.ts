export type BoardDensity = 'compact' | 'default';
export type LandingScreen = 'dashboard' | 'board' | 'draft';
export type AdpNotation = 'round.pick' | 'overall';
export type DraftLeadTime = '24h' | '1h' | '15m';
export type InitialsColor =
  | 'accent'
  | 'pos-qb'
  | 'pos-rb'
  | 'pos-wr'
  | 'pos-te'
  | 'accent-secondary';

export interface NotificationPreferences {
  draftStarting: boolean;
  draftLeadTimes: DraftLeadTime[];
  pickUp: boolean;
  positionRun: boolean;
}

export interface UserPreferences {
  boardDensity: BoardDensity;
  landingScreen: LandingScreen;
  adpNotation: AdpNotation;
  confirmBeforePick: boolean;
  autoScrollToPick: boolean;
  /** Always true — grades carry shape marks alongside colour. */
  colorBlindShapes: true;
  notifications: NotificationPreferences;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  boardDensity: 'default',
  landingScreen: 'dashboard',
  adpNotation: 'round.pick',
  confirmBeforePick: true,
  autoScrollToPick: true,
  colorBlindShapes: true,
  notifications: {
    draftStarting: true,
    draftLeadTimes: ['1h', '15m'],
    pickUp: true,
    positionRun: true,
  },
};

const BOARD_DENSITIES = new Set<BoardDensity>(['compact', 'default']);
const LANDING_SCREENS = new Set<LandingScreen>(['dashboard', 'board', 'draft']);
const ADP_NOTATIONS = new Set<AdpNotation>(['round.pick', 'overall']);
const LEAD_TIMES = new Set<DraftLeadTime>(['24h', '1h', '15m']);
const INITIALS_COLORS = new Set<InitialsColor>([
  'accent',
  'pos-qb',
  'pos-rb',
  'pos-wr',
  'pos-te',
  'accent-secondary',
]);

function asEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function mergeNotifications(
  input: Partial<NotificationPreferences> | undefined,
  base: NotificationPreferences,
): NotificationPreferences {
  const leadTimes = Array.isArray(input?.draftLeadTimes)
    ? input.draftLeadTimes.filter((t): t is DraftLeadTime => LEAD_TIMES.has(t as DraftLeadTime))
    : base.draftLeadTimes;
  return {
    draftStarting: asBool(input?.draftStarting, base.draftStarting),
    draftLeadTimes: leadTimes.length ? leadTimes : base.draftLeadTimes,
    pickUp: asBool(input?.pickUp, base.pickUp),
    positionRun: asBool(input?.positionRun, base.positionRun),
  };
}

export function mergeUserPreferences(
  input: Partial<UserPreferences> | null | undefined,
  base: UserPreferences = DEFAULT_USER_PREFERENCES,
): UserPreferences {
  const patch = input ?? {};
  return {
    boardDensity: asEnum(patch.boardDensity, BOARD_DENSITIES, base.boardDensity),
    landingScreen: asEnum(patch.landingScreen, LANDING_SCREENS, base.landingScreen),
    adpNotation: asEnum(patch.adpNotation, ADP_NOTATIONS, base.adpNotation),
    confirmBeforePick: asBool(patch.confirmBeforePick, base.confirmBeforePick),
    autoScrollToPick: asBool(patch.autoScrollToPick, base.autoScrollToPick),
    colorBlindShapes: true,
    notifications: mergeNotifications(patch.notifications, base.notifications),
  };
}

export function normalizeInitialsColor(value: unknown, fallback: InitialsColor = 'accent'): InitialsColor {
  return asEnum(value, INITIALS_COLORS, fallback);
}

export function isValidTimeZone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
