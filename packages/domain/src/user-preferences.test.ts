import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_PREFERENCES,
  mergeUserPreferences,
  type UserPreferences,
} from './user-preferences.js';

describe('mergeUserPreferences', () => {
  it('returns defaults when input is empty', () => {
    expect(mergeUserPreferences(undefined)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(mergeUserPreferences(null)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(mergeUserPreferences({})).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it('merges known fields and ignores unknown ones', () => {
    const merged = mergeUserPreferences({
      boardDensity: 'compact',
      landingScreen: 'board',
      adpNotation: 'overall',
      confirmBeforePick: false,
      autoScrollToPick: false,
      notifications: {
        draftStarting: false,
        draftLeadTimes: ['24h'],
        pickUp: false,
        positionRun: true,
      },
      nonsense: true,
    } as Partial<UserPreferences> & { nonsense: boolean });

    expect(merged.boardDensity).toBe('compact');
    expect(merged.landingScreen).toBe('board');
    expect(merged.adpNotation).toBe('overall');
    expect(merged.confirmBeforePick).toBe(false);
    expect(merged.autoScrollToPick).toBe(false);
    expect(merged.notifications).toEqual({
      draftStarting: false,
      draftLeadTimes: ['24h'],
      pickUp: false,
      positionRun: true,
    });
    expect(merged).not.toHaveProperty('nonsense');
  });

  it('keeps colour-blind shape marks locked on', () => {
    const merged = mergeUserPreferences({ colorBlindShapes: false } as unknown as Partial<UserPreferences>);
    expect(merged.colorBlindShapes).toBe(true);
  });

  it('rejects invalid enum values and falls back to defaults', () => {
    const merged = mergeUserPreferences({
      boardDensity: 'huge',
      landingScreen: 'settings',
      adpNotation: 'roman',
    } as unknown as Partial<UserPreferences>);
    expect(merged.boardDensity).toBe('default');
    expect(merged.landingScreen).toBe('dashboard');
    expect(merged.adpNotation).toBe('round.pick');
  });

  it('filters invalid draft lead times', () => {
    const merged = mergeUserPreferences({
      notifications: {
        draftStarting: true,
        draftLeadTimes: ['1h', '3d', '15m'] as unknown as UserPreferences['notifications']['draftLeadTimes'],
        pickUp: true,
        positionRun: true,
      },
    });
    expect(merged.notifications.draftLeadTimes).toEqual(['1h', '15m']);
  });
});
