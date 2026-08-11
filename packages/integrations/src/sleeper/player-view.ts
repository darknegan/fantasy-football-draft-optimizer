import type { Player } from '@draftlab/domain';
import { sleeperHeadshotThumbUrl, sleeperHeadshotUrl } from './headshot.js';

/** API/board projection: domain player plus derived Sleeper CDN headshot URLs. */
export type PlayerWithHeadshot = Player & {
  headshotUrl: string | null;
  headshotThumbUrl: string | null;
};

export function withHeadshot(player: Player): PlayerWithHeadshot {
  const sleeperId = player.externalIds?.sleeper;
  if (!sleeperId) {
    return { ...player, headshotUrl: null, headshotThumbUrl: null };
  }
  return {
    ...player,
    headshotUrl: sleeperHeadshotUrl(sleeperId),
    headshotThumbUrl: sleeperHeadshotThumbUrl(sleeperId),
  };
}
