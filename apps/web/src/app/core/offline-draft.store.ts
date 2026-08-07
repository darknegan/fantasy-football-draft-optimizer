/**
 * IndexedDB-backed offline durability for draft night (plan §7).
 * Queues manual picks when offline and reconciles on reconnect.
 */

const DB_NAME = 'draftlab';
const STORE = 'queued_picks';

export interface QueuedPick {
  leagueId: string;
  pickNumber: number;
  round: number;
  slot: number;
  playerId: string;
  queuedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'queuedAt' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queuePick(pick: QueuedPick): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(pick);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueuedPicks(leagueId: string): Promise<QueuedPick[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as QueuedPick[]) ?? [];
      resolve(all.filter((p) => p.leagueId === leagueId));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearQueuedPick(queuedAt: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(queuedAt);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
