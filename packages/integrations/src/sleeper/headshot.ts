/**
 * Sleeper CDN headshots are keyed by Sleeper player id.
 * These URLs are stable public assets — no API call required.
 */

const CDN = 'https://sleepercdn.com/content/nfl/players';

export function sleeperHeadshotUrl(sleeperPlayerId: string): string {
  return `${CDN}/${encodeURIComponent(sleeperPlayerId)}.jpg`;
}

export function sleeperHeadshotThumbUrl(sleeperPlayerId: string): string {
  return `${CDN}/thumb/${encodeURIComponent(sleeperPlayerId)}.jpg`;
}
