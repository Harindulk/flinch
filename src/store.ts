/** Playtests live in this browser's IndexedDB: session records in one store, the two video files in another. */
import type { Session, Videos } from "./types";

/** A storage failure with a sentence the screen can show as is. `full` means the disk quota ran out. */
export class StorageError extends Error {
  constructor(message: string, readonly full = false) {
    super(message);
    this.name = "StorageError";
  }
}

/** Turns whatever IndexedDB threw into a StorageError with a plain message. Pure: unit-tested. */
export function storageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as { name?: string } | null)?.name ?? "";
  if (name === "QuotaExceededError" || /quota/i.test(String((e as Error | null)?.message)))
    return new StorageError("This browser's storage for Flinch is full. Download the recording so it isn't lost, then delete old playtests.", true);
  if (name === "InvalidStateError" || name === "SecurityError" || name === "UnknownError" || name === "ReferenceError")
    return new StorageError("This browser won't let Flinch store playtests (a private window, or site data blocked). Download each one before closing.");
  return new StorageError(`Browser storage failed${(e as Error | null)?.message ? `: ${(e as Error).message}` : ""}. Download the recording so it isn't lost.`);
}

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("flinch", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("sessions", { keyPath: "id" });
      req.result.createObjectStore("videos");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open browser storage"));
  }).catch((e) => {
    db = null; // let a later call try again
    throw storageError(e);
  });
  return db;
}

async function run<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  const t = await open().then((d) => d.transaction(stores, mode)).catch((e) => Promise.reject(storageError(e)));
  let req: IDBRequest<T> | void;
  try {
    req = fn(t);
  } catch (e) {
    // A throw mid-way (e.g. a blob that can't be stored) must not commit half a playtest.
    try { t.abort(); } catch { /* already finished */ }
    throw storageError(e);
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    t.onerror = t.onabort = () => reject(storageError(t.error ?? new Error("Storage failed")));
  });
}

/** Rejects with a StorageError (check `.full` for a quota problem); nothing is half-saved. */
export function saveSession(session: Session, videos: Videos): Promise<void> {
  return run(["sessions", "videos"], "readwrite", (t) => {
    t.objectStore("sessions").put(session);
    t.objectStore("videos").put(videos, session.id);
  });
}

/** Saves edits (notes, dismissals). A playtest deleted meanwhile stays deleted instead of coming back without its videos. */
export function updateSession(session: Session): Promise<void> {
  return run(["sessions"], "readwrite", (t) => {
    const store = t.objectStore("sessions");
    const has = store.getKey(session.id);
    has.onsuccess = () => has.result !== undefined && store.put(session);
  });
}

/** Newest first. Only playtests whose videos are there; video files left without a playtest are removed. */
export async function listSessions(): Promise<Session[]> {
  let s!: IDBRequest<Session[]>, k!: IDBRequest<IDBValidKey[]>;
  await run(["sessions", "videos"], "readonly", (t) => {
    s = t.objectStore("sessions").getAll();
    k = t.objectStore("videos").getAllKeys();
  });
  const ids = new Set(s.result.map((x) => x.id));
  const orphans = k.result.filter((key) => !ids.has(key as string));
  if (orphans.length) run(["videos"], "readwrite", (t) => orphans.forEach((key) => t.objectStore("videos").delete(key))).catch(() => {});
  const withVideos = new Set(k.result);
  return s.result.filter((x) => withVideos.has(x.id)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSession(id: string): Promise<{ session: Session; videos: Videos } | null> {
  let s!: IDBRequest<Session | undefined>, v!: IDBRequest<Videos | undefined>;
  await run(["sessions", "videos"], "readonly", (t) => {
    s = t.objectStore("sessions").get(id) as IDBRequest<Session | undefined>;
    v = t.objectStore("videos").get(id) as IDBRequest<Videos | undefined>;
  });
  return s.result && v.result ? { session: s.result, videos: v.result } : null;
}

/** Removes the playtest record and both video files in one transaction. */
export function deleteSession(id: string): Promise<void> {
  return run(["sessions", "videos"], "readwrite", (t) => {
    t.objectStore("sessions").delete(id);
    t.objectStore("videos").delete(id);
  });
}
